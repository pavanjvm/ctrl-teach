/**
 * useWebSocket — manages the WebSocket connection to the ADK backend.
 *
 * Handles:
 * - Text messages (JSON) and binary audio frames
 * - ADK event parsing and dispatch
 * - Canvas command extraction from tool-call events
 *
 * Usage:
 *   const { status, messages, canvasCommands, connect, ... } = useWebSocket();
 *   connect(url, { onAudio });
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { base64ToArrayBuffer } from "@/lib/utils";
import type { TarsDrawCommand } from "@/lib/tars/boardBridge";
import type {
  TranscriptEntry,
  CanvasCommand,
  AnimationGroup,
  ConnectionStatus,
  ConnectOptions,
} from "@/types/whiteboard";

// Re-export types for consumers that import from this hook
export type { TranscriptEntry, CanvasCommand, AnimationGroup, ConnectionStatus };

const VISUAL_SYNC_TIMEOUT_MS = 10_000;
const VISUAL_AUDIO_RENDEZVOUS_TIMEOUT_MS = 2_500;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [canvasCommands, setCanvasCommands] = useState<CanvasCommand[]>([]);
  const [tarsPoint, setTarsPoint] = useState<{
    x: number;
    y: number;
    label?: string;
    id: string;
  } | null>(null);
  const [tarsPointPending, setTarsPointPending] = useState<{
    status: "started" | "completed" | "failed" | "cancelled";
    label: string;
    id: string;
  } | null>(null);
  // Page-mode Tars pointing events. Payload is
  // either `{targetId}` for DOM-exact pointing or `{x,y}` for vision fallback.
  const [tarsAgentPoint, setTarsAgentPoint] = useState<{
    targetId?: string | null;
    x?: number | null;
    y?: number | null;
    label?: string;
    action?: "none" | "click";
    id: string;
  } | null>(null);
  const [tarsAgentDraws, setTarsAgentDraws] = useState<TarsDrawCommand[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [isAssistantTurnActive, setIsAssistantTurnActive] = useState(false);
  const [isVisualSyncing, setIsVisualSyncing] = useState(false);

  // Refs for mutable input/output transcription tracking
  const currentInputIdRef = useRef<string | null>(null);
  const currentOutputIdRef = useRef<string | null>(null);
  const audioSuppressedRef = useRef(false);
  const assistantTurnActiveRef = useRef(false);
  const assistantTurnIdRef = useRef(0);
  const halfDuplexAudioRef = useRef(false);
  const deferredPlaybackEventsRef = useRef<Record<string, any>[]>([]);
  const visualBarriersRef = useRef<Map<string, { timer: number; tool: string }>>(new Map());
  const deferredAudioRef = useRef<ArrayBuffer[]>([]);
  const visualWaitersRef = useRef<Set<() => void>>(new Set());
  const pendingCanvasCommandsRef = useRef<Map<
    string,
    { command: CanvasCommand; timer: number }
  >>(new Map());
  const endedVisualSyncIdsRef = useRef<Set<string>>(new Set());

  // Store callbacks in refs so the message handler always sees the latest
  const onAudioRef = useRef<((pcm: ArrayBuffer) => void) | undefined>(undefined);
  const onInterruptRef = useRef<(() => void) | undefined>(undefined);
  const onErrorRef = useRef<((message: string) => void) | undefined>(undefined);
  const onToolAudioRef = useRef<((base64: string, mimeType: string) => void) | undefined>(undefined);
  const onEventRef = useRef<((event: Record<string, any>) => void) | undefined>(undefined);
  const waitForPlaybackCompleteRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const onPlaybackCompleteRef = useRef<((turnId: number) => void) | undefined>(undefined);

  const beginAssistantTurn = useCallback(() => {
    if (!assistantTurnActiveRef.current) {
      assistantTurnIdRef.current += 1;
      assistantTurnActiveRef.current = true;
      setIsAssistantTurnActive(true);
    }
    return assistantTurnIdRef.current;
  }, []);

  const flushDeferredAudio = useCallback(() => {
    if (visualBarriersRef.current.size > 0 || deferredAudioRef.current.length === 0) return;
    const chunks = deferredAudioRef.current.splice(0);
    chunks.forEach((chunk) => onAudioRef.current?.(chunk));
  }, []);

  const rememberVisualSyncEnd = useCallback((syncId: string) => {
    if (!syncId) return;
    const ended = endedVisualSyncIdsRef.current;
    ended.add(syncId);
    if (ended.size > 256) {
      const oldest = ended.values().next().value;
      if (typeof oldest === "string") ended.delete(oldest);
    }
  }, []);

  const acknowledgeVisualSync = useCallback((syncId: string) => {
    const barrier = visualBarriersRef.current.get(syncId);
    if (!barrier) return;
    rememberVisualSyncEnd(syncId);
    window.clearTimeout(barrier.timer);
    visualBarriersRef.current.delete(syncId);

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "visual_sync_complete",
        syncId,
        tool: barrier.tool,
      }));
    }

    if (visualBarriersRef.current.size === 0) {
      setIsVisualSyncing(false);
      flushDeferredAudio();
      const waiters = [...visualWaitersRef.current];
      visualWaitersRef.current.clear();
      waiters.forEach((resolve) => resolve());
    }
  }, [flushDeferredAudio, rememberVisualSyncEnd]);

  const registerVisualSync = useCallback((syncId: string, tool: string) => {
    if (
      !syncId
      || endedVisualSyncIdsRef.current.has(syncId)
      || visualBarriersRef.current.has(syncId)
    ) return;
    const timer = window.setTimeout(() => {
      console.warn(`[WS] Visual sync timed out for ${tool}; releasing queued audio.`);
      acknowledgeVisualSync(syncId);
    }, VISUAL_SYNC_TIMEOUT_MS);
    visualBarriersRef.current.set(syncId, { timer, tool });
    setIsVisualSyncing(true);
  }, [acknowledgeVisualSync]);

  const commitPendingCanvasCommand = useCallback((syncId: string) => {
    const pending = pendingCanvasCommandsRef.current.get(syncId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingCanvasCommandsRef.current.delete(syncId);
    if (endedVisualSyncIdsRef.current.has(syncId)) return;
    setCanvasCommands((current) => [...current, pending.command]);

    // Let React commit the command and Excalidraw begin its first paint before
    // releasing queued PCM. This starts the visual and voice together without
    // waiting for the complete drawing animation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => acknowledgeVisualSync(syncId));
    });
  }, [acknowledgeVisualSync]);

  const stageCanvasCommand = useCallback((syncId: string, command: CanvasCommand) => {
    if (endedVisualSyncIdsRef.current.has(syncId)) return;
    const existing = pendingCanvasCommandsRef.current.get(syncId);
    if (existing) window.clearTimeout(existing.timer);
    const timer = window.setTimeout(() => {
      console.warn(`[WS] No voice audio reached visual ${syncId}; rendering it without audio.`);
      commitPendingCanvasCommand(syncId);
    }, VISUAL_AUDIO_RENDEZVOUS_TIMEOUT_MS);
    pendingCanvasCommandsRef.current.set(syncId, { command, timer });

    // Audio can arrive just before the function-response envelope. If it is
    // already waiting at the barrier, complete the rendezvous now.
    if (deferredAudioRef.current.length > 0) {
      commitPendingCanvasCommand(syncId);
    }
  }, [commitPendingCanvasCommand]);

  const clearVisualSync = useCallback((dropAudio: boolean) => {
    for (const [syncId, barrier] of visualBarriersRef.current) {
      rememberVisualSyncEnd(syncId);
      window.clearTimeout(barrier.timer);
    }
    visualBarriersRef.current.clear();
    for (const [syncId, pending] of pendingCanvasCommandsRef.current) {
      rememberVisualSyncEnd(syncId);
      window.clearTimeout(pending.timer);
    }
    pendingCanvasCommandsRef.current.clear();
    setIsVisualSyncing(false);
    if (dropAudio) deferredAudioRef.current = [];
    else flushDeferredAudio();
    const waiters = [...visualWaitersRef.current];
    visualWaitersRef.current.clear();
    waiters.forEach((resolve) => resolve());
  }, [flushDeferredAudio, rememberVisualSyncEnd]);

  const waitForVisualSync = useCallback((): Promise<void> => {
    if (visualBarriersRef.current.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => visualWaitersRef.current.add(resolve));
  }, []);

  const routeAudioChunk = useCallback((chunk: ArrayBuffer) => {
    beginAssistantTurn();
    if (visualBarriersRef.current.size > 0) {
      deferredAudioRef.current.push(chunk);
      for (const syncId of pendingCanvasCommandsRef.current.keys()) {
        commitPendingCanvasCommand(syncId);
      }
      return;
    }
    onAudioRef.current?.(chunk);
  }, [beginAssistantTurn, commitPendingCanvasCommand]);

  // ── Connect ──────────────────────────────────────────────────────────────

  const connect = useCallback((url: string, opts?: ConnectOptions) => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return;
    setStatus("connecting");
    setRealtimeReady(false);
    setIsAssistantTurnActive(false);
    clearVisualSync(true);
    endedVisualSyncIdsRef.current.clear();
    audioSuppressedRef.current = false;
    assistantTurnActiveRef.current = false;
    assistantTurnIdRef.current = 0;
    deferredPlaybackEventsRef.current = [];

    onAudioRef.current = opts?.onAudio;
    onInterruptRef.current = opts?.onInterrupt;
    onErrorRef.current = opts?.onError;
    onToolAudioRef.current = opts?.onToolAudio;
    onEventRef.current = opts?.onEvent;
    waitForPlaybackCompleteRef.current = opts?.waitForPlaybackComplete;
    onPlaybackCompleteRef.current = opts?.onPlaybackComplete;
    halfDuplexAudioRef.current = Boolean(opts?.halfDuplexAudio);

    let ws: WebSocket;
    try {
      const sessionToken = opts?.authToken?.replace(/^Bearer\s+/i, "").trim();
      const protocols = sessionToken
        ? [`ctrlteach-auth.${sessionToken}`]
        : undefined;
      ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch {
      setStatus("disconnected");
      onErrorRef.current?.("Could not open the realtime connection.");
      console.warn("[WS] Could not create the realtime connection");
      return;
    }
    wsRef.current = ws;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (wsRef.current !== ws) {
        ws.close();
        return;
      }
      setStatus("connected");
      console.log("[WS] Realtime connection established");
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setStatus("disconnected");
      setRealtimeReady(false);
      setIsAssistantTurnActive(false);
      clearVisualSync(true);
      audioSuppressedRef.current = false;
      assistantTurnActiveRef.current = false;
      deferredPlaybackEventsRef.current = [];
      if (event.code !== 1000 && event.code !== 1005) {
        onErrorRef.current?.(event.reason || "Realtime backend unavailable.");
      }
      console.log("[WS] Realtime connection closed", event.code);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus("disconnected");
      setRealtimeReady(false);
      setIsAssistantTurnActive(false);
      clearVisualSync(true);
      assistantTurnActiveRef.current = false;
      onErrorRef.current?.("Realtime backend unavailable.");
      // Browser WebSocket error events intentionally contain no useful detail.
      // Keep this recoverable condition out of Next.js' console-error overlay.
      console.warn("[WS] Realtime backend unavailable");
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary audio from server
        if (!audioSuppressedRef.current) {
          routeAudioChunk(event.data);
        }
        return;
      }

      try {
        const adkEvent = JSON.parse(event.data as string);
        // Completion mutates durable learner progress. Keep it behind the
        // actual browser playback boundary so the UI cannot finish a lesson
        // before the teacher's final spoken sentence has been heard.
        if (adkEvent.type === "course_lesson_completed") {
          deferredPlaybackEventsRef.current.push(adkEvent);
        } else {
          onEventRef.current?.(adkEvent);
        }
        // Debug: log all non-audio events
        if (adkEvent.content?.parts) {
          for (const p of adkEvent.content.parts) {
            if (p.functionCall || p.function_call) {
              console.log("[WS] FunctionCall event:", JSON.stringify(adkEvent).substring(0, 500));
            }
            if (p.functionResponse || p.function_response) {
              console.log("[WS] FunctionResponse event:", JSON.stringify(adkEvent).substring(0, 500));
            }
          }
        }
        handleADKEvent(adkEvent);
      } catch (err) {
        console.warn("[WS] Non-JSON message", err);
      }
    };
  }, [clearVisualSync, routeAudioChunk]);

  // ── Disconnect ───────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
    setRealtimeReady(false);
    setIsAssistantTurnActive(false);
    clearVisualSync(true);
    assistantTurnActiveRef.current = false;
    deferredPlaybackEventsRef.current = [];
  }, [clearVisualSync]);

  // ── Send helpers ─────────────────────────────────────────────────────────

  const interruptResponse = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;

    // Stop already-scheduled browser audio synchronously. The backend signal
    // prevents any additional audio chunks from the old response arriving.
    audioSuppressedRef.current = true;
    assistantTurnIdRef.current += 1;
    assistantTurnActiveRef.current = false;
    setIsAssistantTurnActive(false);
    deferredPlaybackEventsRef.current = [];
    clearVisualSync(true);
    onInterruptRef.current?.();
    ws.send(JSON.stringify({ type: "interrupt" }));
  }, [clearVisualSync]);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      if (assistantTurnActiveRef.current) {
        interruptResponse();
      } else {
        audioSuppressedRef.current = false;
      }
      ws.send(JSON.stringify({ type: "text", text }));
      beginAssistantTurn();

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          text,
          partial: false,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [beginAssistantTurn, interruptResponse]);

  const sendClassroomStart = useCallback((instruction: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      // Bootstrap the teacher without rendering an artificial learner message
      // in the transcript.
      beginAssistantTurn();
      ws.send(JSON.stringify({ type: "classroom_start", instruction }));
    }
  }, [beginAssistantTurn]);

  const sendRoleplayStart = useCallback((instruction: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      // Start the actor without showing the configuration packet as a learner
      // transcript message.
      beginAssistantTurn();
      ws.send(JSON.stringify({ type: "roleplay_start", instruction }));
    }
  }, [beginAssistantTurn]);

  const sendCompanionContext = useCallback((page: {
    route: string;
    url?: string;
    title?: string;
    courseId?: string | null;
    lessonId?: string | null;
  }) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "companion_context", page }));
    }
  }, []);

  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    const ws = wsRef.current;
    if (
      ws?.readyState === WebSocket.OPEN
      && !(halfDuplexAudioRef.current && assistantTurnActiveRef.current)
    ) {
      ws.send(pcmData);
    }
  }, []);

  const clearInputAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "clear_input_audio" }));
    }
  }, []);

  const sendImage = useCallback(
    (base64Data: string, mimeType = "image/jpeg") => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "image", data: base64Data, mimeType })
        );
      }
    },
    []
  );

  const sendCanvasSnapshot = useCallback(
    (
      base64Data: string,
      mimeType = "image/jpeg",
      meta?: {
        width: number;
        height: number;
        viewWidth?: number;
        viewHeight?: number;
        intentText?: string;
        silent?: boolean;
        generatedImageBounds?: {
          fileId: string;
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
      }
    ) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "canvas",
            data: base64Data,
            mimeType,
            width: meta?.width,
            height: meta?.height,
            viewWidth: meta?.viewWidth,
            viewHeight: meta?.viewHeight,
            intentText: meta?.intentText,
            silent: meta?.silent,
            generatedImageBounds: meta?.generatedImageBounds,
          })
        );
      }
    },
    []
  );

  const sendCanvasElements = useCallback(
    (elements: { y: number; height: number; points?: number[][] }[]) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "canvas_elements", elements })
        );
      }
    },
    []
  );

  // Tars-only: push a current-tab screenshot + lightweight DOM inventory as
  // a side-channel message. The backend forwards this to the Realtime session
  // as a conversation message the model can reason about when it decides
  // whether to call `point_at(target_id=...)` (DOM-exact) or `point_at(x,y)`
  // (vision fallback).
  const sendTarsScreen = useCallback(
    (
      base64Data: string,
      mimeType: string,
      meta: {
        width: number;
        height: number;
        elements?: Array<{
          id: string;
          role: string;
          text: string;
          actionable: boolean;
          rect: { x: number; y: number; width: number; height: number };
        }>;
        intentText?: string;
        calibrated?: boolean;
        page?: {
          route: string;
          url?: string;
          title?: string;
          courseId?: string | null;
          lessonId?: string | null;
        };
      }
    ) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "tars_screen",
            data: base64Data,
            mimeType,
            width: meta.width,
            height: meta.height,
            elements: meta.elements ?? [],
            intentText: meta.intentText,
            calibrated: meta.calibrated ?? false,
            page: meta.page ?? {},
          })
        );
      }
    },
    []
  );

  const sendTarsCommitAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "tars_commit_audio" }));
    }
  }, []);

  const sendTarsCancelAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "tars_cancel_audio" }));
    }
  }, []);

  // ── ADK Event handler ───────────────────────────────────────────────────

  const handleADKEvent = useCallback(
    (event: any) => {
      // Debug: log event keys
      const keys = Object.keys(event).filter(k => event[k] != null);
      if (!keys.every(k => ["id", "timestamp", "author", "invocationId", "actions", "liveSessionResumptionUpdate"].includes(k))) {
        console.log("[ADK Event] keys:", keys.join(", "));
      }

      // ─ Error events ─
      if (event.type === "error") {
        console.warn("[ADK Error]", event);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            text: `⚠️ ${event.message}`,
            partial: false,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      if (event.type === "realtime_ready") {
        setRealtimeReady(true);
        console.log("[WS] Realtime ready", event.agent);
        return;
      }

      if (event.type === "tars_point_pending") {
        const pendingStatus = ["started", "completed", "failed", "cancelled"].includes(event.status)
          ? event.status
          : "failed";
        setTarsPointPending({
          status: pendingStatus,
          label: typeof event.label === "string" ? event.label : "that target",
          id: typeof event.pendingId === "string" ? event.pendingId : crypto.randomUUID(),
        });
        return;
      }

      if (event.type === "visual_sync_start") {
        const syncId = typeof event.syncId === "string" ? event.syncId : "";
        const tool = typeof event.tool === "string" ? event.tool : "visual";
        registerVisualSync(syncId, tool);
        return;
      }

      if (event.type === "visual_sync_end") {
        const syncId = typeof event.syncId === "string" ? event.syncId : "";
        rememberVisualSyncEnd(syncId);
        const pending = pendingCanvasCommandsRef.current.get(syncId);
        if (pending) {
          window.clearTimeout(pending.timer);
          pendingCanvasCommandsRef.current.delete(syncId);
        }
        acknowledgeVisualSync(syncId);
        return;
      }

      // ─ Early image-generation signal from backend ─
      // Sent by media_tools.py the instant generate_and_show_image is called —
      // before the Gemini image API call even starts.
      if (event.type === "generating_image") {
        if (event.status === "started") {
          setIsGeneratingImage(true);
          console.log("[WS] Image generation started (early signal from tool)");
        } else {
          // "error" or any other status → clear the spinner
          setIsGeneratingImage(false);
          console.log("[WS] Image generation signal:", event.status);
        }
        return;
      }

      // ─ Save progress signal from backend ─
      if (event.type === "saving_progress") {
        if (event.status === "started") {
          setIsSavingProgress(true);
          console.log("[WS] Saving progress started:", event.topic);
        } else {
          // "done" or "error" → clear after a brief delay so user sees it
          setTimeout(() => setIsSavingProgress(false), 2000);
          console.log("[WS] Saving progress:", event.status);
        }
        return;
      }

      // ─ Tars `point_at` envelope from tars_agent ─
      //   Shape: {type:"tars_point", tool:"point_at", response:{targetId,x,y,label,action}}
      if (event.type === "tars_point" && event.response) {
        const resp = event.response;
        setTarsAgentPoint({
          targetId: resp.targetId ?? null,
          x: typeof resp.x === "number" ? resp.x : null,
          y: typeof resp.y === "number" ? resp.y : null,
          label: typeof resp.label === "string" ? resp.label : "right here",
          action: resp.action === "click" ? "click" : "none",
          id: crypto.randomUUID(),
        });
        console.log("[WS] Tars point_at:", JSON.stringify(resp));
        return;
      }

      // Live Classroom points are grounded by GPT-5.6 Sol against the current
      // viewport (and, when applicable, the exact Excalidraw image crop).
      if (event.type === "classroom_point" && event.response) {
        if (
          typeof event.visualSyncId === "string"
          && endedVisualSyncIdsRef.current.has(event.visualSyncId)
        ) return;
        const resp = event.response;
        const x = Number(resp.x);
        const y = Number(resp.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          setTarsPoint({
            x,
            y,
            label: typeof resp.label === "string" ? resp.label : undefined,
            id: typeof event.visualSyncId === "string"
              ? event.visualSyncId
              : crypto.randomUUID(),
          });
        }
        console.log("[WS] Grounded classroom point:", JSON.stringify(resp));
        return;
      }

      if (
        (event.type === "tars_draw" && event.response) ||
        (event.type === "tars_draw_batch" && Array.isArray(event.responses))
      ) {
        if (
          typeof event.visualSyncId === "string"
          && endedVisualSyncIdsRef.current.has(event.visualSyncId)
        ) return;
        const allowedShapes = new Set(["circle", "rectangle", "triangle", "highlight", "underline", "arrow", "line", "text"]);
        const allowedColors = new Set(["blue", "teal", "red", "amber", "purple"]);
        const allowedStyles = new Set(["solid", "dashed", "dotted"]);
        const responses = event.type === "tars_draw_batch" ? event.responses : [event.response];
        const drawEvents = responses.map((response: Record<string, unknown>) => {
          const annotationId = typeof response.annotation_id === "string"
            ? response.annotation_id
            : crypto.randomUUID();
          const provisional = response.provisional === true;
          return ({
            tool: event.tool === "clear_screen_drawings" ? "clear_screen_drawings" : "draw_on_screen",
            shape: typeof response.shape === "string" && allowedShapes.has(response.shape)
              ? response.shape
              : undefined,
            style: typeof response.style === "string" && allowedStyles.has(response.style)
              ? response.style
              : "solid",
            targetId: typeof response.target_id === "string" ? response.target_id : null,
            fromTargetId: typeof response.from_target_id === "string" ? response.from_target_id : null,
            toTargetId: typeof response.to_target_id === "string" ? response.to_target_id : null,
            x: typeof response.x === "number" ? response.x : null,
            y: typeof response.y === "number" ? response.y : null,
            endX: typeof response.end_x === "number" ? response.end_x : null,
            endY: typeof response.end_y === "number" ? response.end_y : null,
            label: typeof response.label === "string" ? response.label : "",
            color: typeof response.color === "string" && allowedColors.has(response.color)
              ? response.color
              : "blue",
            id: `${annotationId}:${provisional ? "provisional" : "grounded"}:${crypto.randomUUID()}`,
            visualSyncId: typeof event.visualSyncId === "string" ? event.visualSyncId : undefined,
            annotationId,
            provisional,
            replace: response.replace === true,
            remove: response.remove === true,
            coordinateSource: response.coordinate_source === "dom"
              ? "dom"
              : response.coordinate_source === "sol"
                ? "sol"
                : response.coordinate_source === "sol_missing"
                  ? "sol_missing"
                  : undefined,
            groundingFailure: typeof response.grounding_failure === "string"
              ? response.grounding_failure
              : undefined,
          } as TarsDrawCommand);
        });
        setTarsAgentDraws((current) => [...current, ...drawEvents].slice(-32));
        return;
      }

      // ─ Input transcription (user speech → text) ─
      if (event.inputTranscription?.text) {
        const text = event.inputTranscription.text;
        const finished = event.inputTranscription.finished;
        console.info("[WS] User transcript", { text, finished });

        if (currentInputIdRef.current) {
          const curId = currentInputIdRef.current;
          if (finished) {
            // The completed payload is authoritative and can correct words
            // from provisional transcript deltas.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId ? { ...m, text, partial: false } : m
              )
            );
            currentInputIdRef.current = null;
          } else {
            // Streaming delta — append to the running message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId
                  ? { ...m, text: m.text + text, partial: true }
                  : m
              )
            );
          }
        } else {
          const id = crypto.randomUUID();
          currentInputIdRef.current = finished ? null : id;
          setMessages((prev) => [
            ...prev,
            { id, role: "user", text, partial: !finished, timestamp: Date.now() },
          ]);
        }
      }

      // ─ Output transcription (model speech → text) ─
      if (event.outputTranscription?.text) {
        beginAssistantTurn();
        const text = event.outputTranscription.text;
        const finished = event.outputTranscription.finished;

        if (currentOutputIdRef.current) {
          const curId = currentOutputIdRef.current;
          if (finished) {
            // The transcript can finish while browser-scheduled PCM is still
            // playing. Keep it partial until the queue-drained boundary below.
          } else {
            // Streaming delta — append to the running message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId
                  ? { ...m, text: m.text + text, partial: true }
                  : m
              )
            );
          }
        } else if (!finished) {
          const id = crypto.randomUUID();
          currentOutputIdRef.current = id;
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: "agent",
              text,
              agentName: event.author,
              partial: true,
              timestamp: Date.now(),
            },
          ]);
        }
      }

      // ─ Audio content (inline PCM) ─
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
            const audioB64 = part.inlineData.data;
            if (audioB64 && !audioSuppressedRef.current) {
              routeAudioChunk(base64ToArrayBuffer(audioB64));
            }
          }
        }
      }

      // ─ Extract canvas commands from function response events ─
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          // Detect image-generation tool calls → show loading indicator
          const fnCall = part.functionCall ?? part.function_call;
          if (fnCall?.name === "generate_and_show_image") {
            setIsGeneratingImage(true);
            console.log("[WS] Image generation started");
          }

          // Handle both camelCase (by_alias=True) and snake_case keys
          const fnResp = part.functionResponse ?? part.function_response;
          if (fnResp) {
            const resp = fnResp.response;
            console.log(
              "[ADK FnResponse]",
              fnResp.name,
              JSON.stringify(resp)?.substring(0, 300)
            );
            // Clear image-generation loading indicator
            if (fnResp.name === "generate_and_show_image") {
              setIsGeneratingImage(false);
              console.log("[WS] Image generation complete");
            }
            // Extract canvas command if it has elements
            if (resp && Array.isArray(resp.elements)) {
              const cmd: CanvasCommand = {
                visualSyncId: typeof resp.visualSyncId === "string" ? resp.visualSyncId : undefined,
                tool: resp.tool || fnResp.name || "unknown",
                action: resp.action || "add",
                elements: resp.elements,
                files: resp.files,
                animation: Array.isArray(resp.animation) ? resp.animation : undefined,
              };
              console.log("[Canvas CMD]", cmd.tool, cmd.action, cmd.elements.length, "elements");
              if (cmd.visualSyncId) {
                stageCanvasCommand(cmd.visualSyncId, cmd);
              } else {
                setCanvasCommands((prev) => [...prev, cmd]);
              }
            } else if (typeof resp?.visualSyncId === "string") {
              // A failed/no-op visual tool has nothing for the board to render;
              // release its barrier instead of waiting for the watchdog.
              acknowledgeVisualSync(resp.visualSyncId);
            }
            if (resp?.tool === "point_at_whiteboard" && resp?.tarsPoint) {
              const p = resp.tarsPoint;
              const x = Number(p.x);
              const y = Number(p.y);
              if (Number.isFinite(x) && Number.isFinite(y)) {
                setTarsPoint({
                  x,
                  y,
                  label: typeof p.label === "string" ? p.label : undefined,
                  id: crypto.randomUUID(),
                });
              }
            }
            // Play optional tool-supplied audio (e.g. "image generated successfully")
            if (
              resp?.audio_b64 &&
              typeof resp.audio_b64 === "string" &&
              !audioSuppressedRef.current
            ) {
              beginAssistantTurn();
              const mime = (resp.audio_mime as string) || "audio/pcm;rate=16000";
              onToolAudioRef.current?.(resp.audio_b64, mime);
            }
          }
        }
      }

      // ─ Turn complete / interrupted ─
      if (event.turnComplete) {
        const localTurnId = assistantTurnIdRef.current;
        const serverTurnId = Number(event.turnId);
        const acknowledgedTurnId = Number.isFinite(serverTurnId) && serverTurnId > 0
          ? serverTurnId
          : localTurnId;
        const outputId = currentOutputIdRef.current;
        const inputId = currentInputIdRef.current;
        const waitForPlayback = waitForPlaybackCompleteRef.current;

        void (async () => {
          await waitForVisualSync();
          if (waitForPlayback) await waitForPlayback();
          // A typed barge-in can begin a newer turn while the old audio queue
          // is being cleared. Never let the old completion unlock that turn.
          if (assistantTurnIdRef.current !== localTurnId) return;

          setMessages((prev) => prev.map((message) => {
            if (message.id === outputId || message.id === inputId) {
              return { ...message, partial: false };
            }
            return message;
          }));
          if (currentOutputIdRef.current === outputId) currentOutputIdRef.current = null;
          if (currentInputIdRef.current === inputId) currentInputIdRef.current = null;

          assistantTurnActiveRef.current = false;
          setIsAssistantTurnActive(false);
          audioSuppressedRef.current = false;

          const deferred = deferredPlaybackEventsRef.current;
          deferredPlaybackEventsRef.current = [];
          deferred.forEach((pendingEvent) => onEventRef.current?.(pendingEvent));

          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "playback_complete",
              turnId: acknowledgedTurnId,
              playedAt: Date.now(),
            }));
          }
          onPlaybackCompleteRef.current?.(acknowledgedTurnId);
        })();
      } else if (event.interrupted) {
        console.log("[ADK] User interrupted agent!");
        deferredPlaybackEventsRef.current = [];
        clearVisualSync(true);
        onInterruptRef.current?.();
        audioSuppressedRef.current = false;
        assistantTurnActiveRef.current = false;
        setIsAssistantTurnActive(false);

        const outputId = currentOutputIdRef.current;
        const inputId = currentInputIdRef.current;
        setMessages((prev) => prev.map((message) => {
          if (message.id === outputId || message.id === inputId) {
            return { ...message, partial: false };
          }
          return message;
        }));
        currentOutputIdRef.current = null;
        currentInputIdRef.current = null;
      }
    },
    [acknowledgeVisualSync, beginAssistantTurn, clearVisualSync, registerVisualSync, rememberVisualSyncEnd, routeAudioChunk, stageCanvasCommand, waitForVisualSync]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    status,
    messages,
    canvasCommands,
    tarsPoint,
    tarsAgentPoint,
    tarsPointPending,
    tarsAgentDraws,
    isGeneratingImage,
    isSavingProgress,
    realtimeReady,
    isAssistantTurnActive,
    isVisualSyncing,
    connect,
    disconnect,
    interruptResponse,
    acknowledgeVisualSync,
    sendText,
    sendClassroomStart,
    sendRoleplayStart,
    sendCompanionContext,
    sendAudio,
    clearInputAudio,
    sendImage,
    sendCanvasSnapshot,
    sendCanvasElements,
    sendTarsScreen,
    sendTarsCommitAudio,
    sendTarsCancelAudio,
  };
}

// base64ToArrayBuffer is imported from @/lib/utils
