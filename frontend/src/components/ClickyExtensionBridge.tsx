"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useClicky } from "@/lib/clicky";
import { API_URL, WS_URL } from "@/lib/constants";

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

export default function ClickyExtensionBridge() {
  const pathname = usePathname();
  const { user, getToken } = useAuth();
  const {
    enabled,
    extensionAvailable,
    setExtensionAvailable,
    setStatus,
  } = useClicky();
  const sessionRef = useRef<ExtensionSession | null>(null);
  const extensionInstanceRef = useRef("");
  const [extensionRevision, setExtensionRevision] = useState(0);

  useEffect(() => {
    let resolved = false;
    const pendingRequestIds = new Set<string>();
    const probe = () => {
      const requestId = crypto.randomUUID();
      pendingRequestIds.add(requestId);
      window.postMessage(
        { type: "CTRLTEACH_CLICKY_PROBE", requestId },
        window.location.origin,
      );
    };
    const onMessage = (event: MessageEvent) => {
      const isAttached = event.data?.type === "CTRLTEACH_CLICKY_EXTENSION_ATTACHED";
      const isProbeReply = event.data?.type === "CTRLTEACH_CLICKY_EXTENSION_READY"
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
      const suspended = pathname === "/board"
        || pathname === "/learn"
        || /^\/learn\/generated-[^/]+\/classroom$/.test(pathname);
      if (!enabled || !user) {
        sessionRef.current = null;
        postBridgeMessage("CTRLTEACH_CLICKY_CONFIG", {
          config: { enabled: false, suspended, userId: "", wsUrl: WS_URL },
        });
        return;
      }

      try {
        const basicToken = await getToken();
        if (!basicToken) throw new Error("missing app authentication");
        const now = Math.floor(Date.now() / 1000);
        let session = sessionRef.current;
        if (!session || session.expires_at - now < 600) {
          const response = await fetch(`${API_URL}/api/clicky/extension-session`, {
            method: "POST",
            headers: { Authorization: basicToken },
          });
          if (!response.ok) throw new Error(`extension session failed (${response.status})`);
          session = await response.json() as ExtensionSession;
          sessionRef.current = session;
        }
        if (cancelled) return;
        postBridgeMessage("CTRLTEACH_CLICKY_CONFIG", {
          config: {
            enabled: true,
            suspended,
            userId: session.user_id,
            accessToken: session.access_token,
            wsUrl: WS_URL,
          },
        });
        setStatus(suspended
          ? "Clicky is controlled by the whiteboard tutor"
          : "Clicky ready across browser tabs");
        const refreshIn = Math.max(60_000, (session.expires_at * 1000) - Date.now() - 5 * 60_000);
        refreshTimer = window.setTimeout(() => {
          sessionRef.current = null;
          void configure();
        }, refreshIn);
      } catch (error) {
        console.warn("[ClickyExtension] Falling back to in-app Clicky", error);
        sessionRef.current = null;
        postBridgeMessage("CTRLTEACH_CLICKY_CONFIG", {
          config: { enabled: false, suspended: false, userId: "", wsUrl: WS_URL },
        });
        setExtensionAvailable(false);
        setStatus("Clicky extension unavailable — using this tab only");
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
