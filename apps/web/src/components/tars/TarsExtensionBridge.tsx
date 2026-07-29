"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTars } from "@/lib/tars/provider";
import { API_URL, WS_URL } from "@/lib/constants";
import { TEACHING_PROFILE_CHANGED_EVENT } from "@/lib/tars/teachingProfiles";
import { isEmbeddedTarsRoute } from "@/lib/tars/routes";

const PROBE_TIMEOUT_MS = 900;

type ExtensionSession = {
  access_token: string;
  token_type: "bearer";
  user_id: string;
  expires_at: number;
};

function postBridgeMessage(type: string, payload: Record<string, unknown> = {}) {
  window.postMessage(
    {
      type,
      requestId: crypto.randomUUID(),
      ...payload,
    },
    window.location.origin,
  );
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
      if (!enabled || !user) {
        sessionRef.current = null;
        postBridgeMessage("CTRLTEACH_TARS_CONFIG", {
          config: { enabled: false, suspended, userId: "", learnerName: "", apiUrl: API_URL, wsUrl: WS_URL },
        });
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
        postBridgeMessage("CTRLTEACH_TARS_CONFIG", {
          config: {
            enabled: true,
            suspended,
            userId: session.user_id,
            learnerName: user.displayName || user.username,
            accessToken: session.access_token,
            apiUrl: API_URL,
            wsUrl: WS_URL,
          },
        });
        setStatus(suspended
          ? "Tars is controlled by the whiteboard tutor"
          : "Tars ready across browser tabs");
        const refreshIn = Math.max(60_000, (session.expires_at * 1000) - Date.now() - 5 * 60_000);
        refreshTimer = window.setTimeout(() => {
          sessionRef.current = null;
          void configure();
        }, refreshIn);
      } catch (error) {
        console.warn("[TarsExtension] Falling back to in-app Tars", error);
        sessionRef.current = null;
        postBridgeMessage("CTRLTEACH_TARS_CONFIG", {
          config: { enabled: false, suspended: false, userId: "", learnerName: "", apiUrl: API_URL, wsUrl: WS_URL },
        });
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
