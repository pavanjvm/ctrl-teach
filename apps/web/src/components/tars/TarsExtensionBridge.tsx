"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTars } from "@/lib/tars/provider";
import { API_URL, WS_URL } from "@/lib/constants";
import { TEACHING_PROFILE_CHANGED_EVENT } from "@/lib/tars/teachingProfiles";
import { isEmbeddedTarsRoute } from "@/lib/tars/routes";

const PROBE_TIMEOUT_MS = 900;
const BRIDGE_RESPONSE_TIMEOUT_MS = 3_000;

type ExtensionSession = {
  access_token: string;
  token_type: "bearer";
  user_id: string;
  expires_at: number;
};

type ExtensionConfigAck = {
  ok?: boolean;
  extensionActive?: boolean;
  error?: string;
};

function postBridgeRequest<T>(
  type: string,
  responseType: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== window
        || event.origin !== window.location.origin
        || event.data?.type !== responseType
        || event.data?.requestId !== requestId
      ) return;
      cleanup();
      resolve(event.data.response as T);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${type} timed out`));
    }, BRIDGE_RESPONSE_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    window.postMessage({ type, requestId, ...payload }, window.location.origin);
  });
}

export default function TarsExtensionBridge() {
  const pathname = usePathname();
  const { user, getToken } = useAuth();
  const {
    enabled,
    extensionAvailable,
    setExtensionAvailable,
    setStatus,
  } = useTars();
  const sessionRef = useRef<ExtensionSession | null>(null);
  const extensionInstanceRef = useRef("");
  const [extensionRevision, setExtensionRevision] = useState(0);

  useEffect(() => {
    const handleTeachingProfileChange = () => {
      // A fresh extension token changes the extension's realtime identity,
      // forcing its long-lived socket to reconnect with the selected profile.
      sessionRef.current = null;
      setExtensionRevision((revision) => revision + 1);
    };
    window.addEventListener(TEACHING_PROFILE_CHANGED_EVENT, handleTeachingProfileChange);
    return () => {
      window.removeEventListener(TEACHING_PROFILE_CHANGED_EVENT, handleTeachingProfileChange);
    };
  }, []);

  useEffect(() => {
    let resolved = false;
    const pendingRequestIds = new Set<string>();
    const probe = () => {
      const requestId = crypto.randomUUID();
      pendingRequestIds.add(requestId);
      window.postMessage(
        { type: "CTRLTEACH_TARS_PROBE", requestId },
        window.location.origin,
      );
    };
    const onMessage = (event: MessageEvent) => {
      const isAttached = event.data?.type === "CTRLTEACH_TARS_EXTENSION_ATTACHED";
      const isProbeReply = event.data?.type === "CTRLTEACH_TARS_EXTENSION_READY"
        && pendingRequestIds.has(event.data?.requestId);
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        (!isAttached && !isProbeReply)
      ) return;
      if (isProbeReply) pendingRequestIds.delete(event.data.requestId);
      resolved = true;
      const instanceId = String(event.data?.instanceId || "");
      if (instanceId && extensionInstanceRef.current !== instanceId) {
        extensionInstanceRef.current = instanceId;
        setExtensionRevision((revision) => revision + 1);
      }
      setExtensionAvailable(true);
    };
    window.addEventListener("message", onMessage);
    probe();
    const retryTimer = window.setInterval(probe, 5_000);
    const timer = window.setTimeout(() => {
      if (!resolved) setExtensionAvailable(false);
    }, PROBE_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(retryTimer);
      window.removeEventListener("message", onMessage);
    };
  }, [setExtensionAvailable]);

  useEffect(() => {
    if (extensionAvailable !== true) return;
    let cancelled = false;
    let refreshTimer = 0;

    const configure = async () => {
      const suspended = pathname.startsWith("/admin") || isEmbeddedTarsRoute(pathname);
      const sendConfig = async (config: Record<string, unknown>) => {
        const acknowledgement = await postBridgeRequest<ExtensionConfigAck>(
          "CTRLTEACH_TARS_CONFIG",
          "CTRLTEACH_TARS_CONFIG_ACK",
          { config },
        );
        if (!acknowledgement?.ok) {
          throw new Error(`extension rejected configuration (${acknowledgement?.error || "unknown error"})`);
        }
        return acknowledgement;
      };
      if (!enabled || !user) {
        sessionRef.current = null;
        try {
          await sendConfig({ enabled: false, suspended, userId: "", apiUrl: API_URL, wsUrl: WS_URL });
          if (!cancelled) setStatus(enabled ? "Sign in to use Tars" : "Tars asleep");
        } catch (error) {
          console.warn("[TarsExtension] Could not disable extension session", error);
        }
        return;
      }

      try {
        const appToken = await getToken();
        if (!appToken) throw new Error("missing app authentication");
        const now = Math.floor(Date.now() / 1000);
        let session = sessionRef.current;
        if (!session || session.expires_at - now < 600) {
          const response = await fetch(`${API_URL}/api/tars/extension-session`, {
            method: "POST",
            headers: { Authorization: appToken },
          });
          if (!response.ok) throw new Error(`extension session failed (${response.status})`);
          session = await response.json() as ExtensionSession;
          sessionRef.current = session;
        }
        if (cancelled) return;
        const acknowledgement = await sendConfig({
          enabled: true,
          suspended,
          userId: session.user_id,
          accessToken: session.access_token,
          apiUrl: API_URL,
          wsUrl: WS_URL,
        });
        if (!acknowledgement.extensionActive) throw new Error("extension did not activate");
        if (cancelled) return;
        setStatus(suspended
          ? "Tars paused in this tab — ready in other browser tabs"
          : "Tars ready across browser tabs");
        const refreshIn = Math.max(60_000, (session.expires_at * 1000) - Date.now() - 5 * 60_000);
        refreshTimer = window.setTimeout(() => {
          sessionRef.current = null;
          void configure();
        }, refreshIn);
      } catch (error) {
        console.warn("[TarsExtension] Falling back to in-app Tars", error);
        sessionRef.current = null;
        void sendConfig({ enabled: false, suspended: false, userId: "", apiUrl: API_URL, wsUrl: WS_URL })
          .catch(() => undefined);
        setExtensionAvailable(false);
        setStatus("Tars extension unavailable — using this tab only");
      }
    };

    void configure();
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
    };
  }, [enabled, extensionAvailable, extensionRevision, getToken, pathname, setExtensionAvailable, setStatus, user]);

  return null;
}
