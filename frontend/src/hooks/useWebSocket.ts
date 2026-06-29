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
import type { ClickyDrawCommand } from "@/lib/clickyBoardBridge";
import type {
  TranscriptEntry,
  CanvasCommand,
  AnimationGroup,
  ConnectionStatus,
  ConnectOptions,
} from "@/types/whiteboard";

// Re-export types for consumers that import from this hook
export type { TranscriptEntry, CanvasCommand, AnimationGroup, ConnectionStatus };

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [canvasCommands, setCanvasCommands] = useState<CanvasCommand[]>([]);
  const [clickyPoint, setClickyPoint] = useState<{
    x: number;
    y: number;
    label?: string;
    id: string;
  } | null>(null);
  // Clicky-agent pointing events (from `?agent=clicky` sessions). Payload is
  // either `{targetId}` for DOM-exact pointing or `{x,y}` for vision fallback.
  const [clickyAgentPoint, setClickyAgentPoint] = useState<{
    targetId?: string | null;
    x?: number | null;
    y?: number | null;
    label?: string;
    action?: "none" | "click";
    id: string;
  } | null>(null);
  const [clickyAgentDraws, setClickyAgentDraws] = useState<ClickyDrawCommand[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);

  // Refs for mutable input/output transcription tracking
  const currentInputIdRef = useRef<string | null>(null);
  const currentOutputIdRef = useRef<string | null>(null);
  const audioSuppressedRef = useRef(false);

  // Store callbacks in refs so the message handler always sees the latest
  const onAudioRef = useRef<((pcm: ArrayBuffer) => void) | undefined>(undefined);
  const onInterruptRef = useRef<(() => void) | undefined>(undefined);
  const onErrorRef = useRef<((message: string) => void) | undefined>(undefined);
  const onToolAudioRef = useRef<((base64: string, mimeType: string) => void) | undefined>(undefined);

  // ── Connect ──────────────────────────────────────────────────────────────

  const connect = useCallback((url: string, opts?: ConnectOptions) => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return;
    setStatus("connecting");
    setRealtimeReady(false);
    audioSuppressedRef.current = false;

    onAudioRef.current = opts?.onAudio;
    onInterruptRef.current = opts?.onInterrupt;
    onErrorRef.current = opts?.onError;
    onToolAudioRef.current = opts?.onToolAudio;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
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
      audioSuppressedRef.current = false;
      if (event.code !== 1000 && event.code !== 1005) {
        onErrorRef.current?.(event.reason || "Realtime backend unavailable.");
      }
      console.log("[WS] Realtime connection closed", event.code);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus("disconnected");
      setRealtimeReady(false);
      onErrorRef.current?.("Realtime backend unavailable.");
      // Browser WebSocket error events intentionally contain no useful detail.
      // Keep this recoverable condition out of Next.js' console-error overlay.
      console.warn("[WS] Realtime backend unavailable");
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary audio from server
        if (!audioSuppressedRef.current) onAudioRef.current?.(event.data);
        return;
      }

      try {
        const adkEvent = JSON.parse(event.data as string);
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
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
    setRealtimeReady(false);
  }, []);

  // ── Send helpers ─────────────────────────────────────────────────────────

  const interruptResponse = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;

    // Stop already-scheduled browser audio synchronously. The backend signal
    // prevents any additional audio chunks from the old response arriving.
    audioSuppressedRef.current = true;
    onInterruptRef.current?.();
    ws.send(JSON.stringify({ type: "interrupt" }));
  }, []);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      interruptResponse();
      ws.send(JSON.stringify({ type: "text", text }));

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
  }, [interruptResponse]);

  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(pcmData);
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
      meta?: { width: number; height: number; intentText?: string }
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
            intentText: meta?.intentText,
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

  // Clicky-only: push a current-tab screenshot + lightweight DOM inventory as
  // a side-channel message. The backend forwards this to the Realtime session
  // as a conversation message the model can reason about when it decides
  // whether to call `point_at(target_id=...)` (DOM-exact) or `point_at(x,y)`
  // (vision fallback).
  const sendClickyScreen = useCallback(
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
      }
    ) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "clicky_screen",
            data: base64Data,
            mimeType,
            width: meta.width,
            height: meta.height,
            elements: meta.elements ?? [],
            intentText: meta.intentText,
            calibrated: meta.calibrated ?? false,
          })
        );
      }
    },
    []
  );

  const sendClickyCommitAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "clicky_commit_audio" }));
    }
  }, []);

  const sendClickyCancelAudio = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "clicky_cancel_audio" }));
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

      // ─ Clicky `point_at` envelope from clicky_agent ─
      //   Shape: {type:"clicky_point", tool:"point_at", response:{targetId,x,y,label,action}}
      if (event.type === "clicky_point" && event.response) {
        const resp = event.response;
        setClickyAgentPoint({
          targetId: resp.targetId ?? null,
          x: typeof resp.x === "number" ? resp.x : null,
          y: typeof resp.y === "number" ? resp.y : null,
          label: typeof resp.label === "string" ? resp.label : "right here",
          action: resp.action === "click" ? "click" : "none",
          id: crypto.randomUUID(),
        });
        console.log("[WS] Clicky point_at:", JSON.stringify(resp));
        return;
      }

      if (event.type === "clicky_draw" && event.response) {
        const response = event.response;
        const allowedShapes = new Set(["circle", "rectangle", "highlight", "underline", "arrow", "line"]);
        const allowedColors = new Set(["blue", "teal", "red", "amber", "purple"]);
        const drawEvent = {
          tool: event.tool === "clear_screen_drawings" ? "clear_screen_drawings" : "draw_on_screen",
          shape: allowedShapes.has(response.shape) ? response.shape : undefined,
          targetId: response.target_id ?? null,
          fromTargetId: response.from_target_id ?? null,
          toTargetId: response.to_target_id ?? null,
          x: typeof response.x === "number" ? response.x : null,
          y: typeof response.y === "number" ? response.y : null,
          endX: typeof response.end_x === "number" ? response.end_x : null,
          endY: typeof response.end_y === "number" ? response.end_y : null,
          label: typeof response.label === "string" ? response.label : "",
          color: allowedColors.has(response.color) ? response.color : "blue",
          id: crypto.randomUUID(),
        } as const;
        setClickyAgentDraws((current) => [...current.slice(-31), drawEvent]);
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
            // Final event — just mark complete, don't touch text
            // (the accumulated deltas already have the full content;
            //  appending the final cumulative payload would double it)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId ? { ...m, partial: false } : m
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
        } else if (!finished) {
          const id = crypto.randomUUID();
          currentInputIdRef.current = id;
          setMessages((prev) => [
            ...prev,
            { id, role: "user", text, partial: true, timestamp: Date.now() },
          ]);
        }
      }

      // ─ Output transcription (model speech → text) ─
      if (event.outputTranscription?.text) {
        const text = event.outputTranscription.text;
        const finished = event.outputTranscription.finished;

        // Finalize any open input transcription when output begins
        if (currentInputIdRef.current && !currentOutputIdRef.current) {
          const inputId = currentInputIdRef.current;
          currentInputIdRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === inputId ? { ...m, partial: false } : m
            )
          );
        }

        if (currentOutputIdRef.current) {
          const curId = currentOutputIdRef.current;
          if (finished) {
            // Final event — just mark complete, don't touch text
            setMessages((prev) =>
              prev.map((m) =>
                m.id === curId ? { ...m, partial: false } : m
              )
            );
            currentOutputIdRef.current = null;
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
              onAudioRef.current?.(base64ToArrayBuffer(audioB64));
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
                tool: resp.tool || fnResp.name || "unknown",
                action: resp.action || "add",
                elements: resp.elements,
                files: resp.files,
                animation: Array.isArray(resp.animation) ? resp.animation : undefined,
              };
              console.log("[Canvas CMD]", cmd.tool, cmd.action, cmd.elements.length, "elements");
              setCanvasCommands((prev) => [...prev, cmd]);
            }
            if (resp?.tool === "point_at_whiteboard" && resp?.clickyPoint) {
              const p = resp.clickyPoint;
              const x = Number(p.x);
              const y = Number(p.y);
              if (Number.isFinite(x) && Number.isFinite(y)) {
                setClickyPoint({
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
              const mime = (resp.audio_mime as string) || "audio/pcm;rate=16000";
              onToolAudioRef.current?.(resp.audio_b64, mime);
            }
          }
        }
      }

      // ─ Turn complete / interrupted ─
      if (event.turnComplete || event.interrupted) {
        // Finalize any still-open partial messages before clearing refs
        setMessages((prev) => {
          let updated = prev;
          if (currentOutputIdRef.current) {
            const oid = currentOutputIdRef.current;
            updated = updated.map((m) =>
              m.id === oid ? { ...m, partial: false } : m
            );
          }
          if (currentInputIdRef.current) {
            const iid = currentInputIdRef.current;
            updated = updated.map((m) =>
              m.id === iid ? { ...m, partial: false } : m
            );
          }
          return updated;
        });
        currentOutputIdRef.current = null;
        currentInputIdRef.current = null;

        if (event.interrupted) {
          console.log("[ADK] User interrupted agent!");
          onInterruptRef.current?.();
          audioSuppressedRef.current = false;
        }
      }
    },
    []
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
    clickyPoint,
    clickyAgentPoint,
    clickyAgentDraws,
    isGeneratingImage,
    isSavingProgress,
    realtimeReady,
    connect,
    disconnect,
    interruptResponse,
    sendText,
    sendAudio,
    sendImage,
    sendCanvasSnapshot,
    sendCanvasElements,
    sendClickyScreen,
    sendClickyCommitAudio,
    sendClickyCancelAudio,
  };
}

// base64ToArrayBuffer is imported from @/lib/utils
