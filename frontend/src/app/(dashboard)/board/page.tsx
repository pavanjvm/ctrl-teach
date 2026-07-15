"use client";

/**
 * Main page — composes Toolbar, WhiteboardCanvas, and TranscriptPanel.
 *
 * Wires the useWebSocket and useAudio hooks together so that:
 *  - Mic audio → WebSocket → ADK
 *  - ADK audio → speaker
 *  - ADK canvas commands → Excalidraw
 *  - Transcript messages rendered in side panel
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import TranscriptPanel from "@/components/TranscriptPanel";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudio } from "@/hooks/useAudio";
import { useAuth } from "@/components/AuthProvider";
import type { WhiteboardCanvasRef } from "@/components/WhiteboardCanvas";
import { WS_URL, API_URL } from "@/lib/constants";
import { generateId, base64ToArrayBuffer } from "@/lib/utils";
import { dispatchBoardTarsDraw } from "@/lib/tarsBoardBridge";

// Dynamic import — Excalidraw cannot be SSR'd
const WhiteboardCanvas = dynamic(
  () => import("@/components/WhiteboardCanvas"),
  { ssr: false }
);

// WS_URL and generateId are imported from @/lib/constants and @/lib/utils

function needsWhiteboardVision(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;

  // Explicit visual/deictic requests: these need the current board image.
  const visualPhrases = [
    "look at", "look on", "see this", "see that", "what is this", "what's this",
    "what did i draw", "what have i drawn", "what do you see", "read this",
    "explain this", "explain that", "this diagram", "this drawing", "this shape",
    "my drawing", "my diagram", "on the board", "whiteboard", "board", "canvas",
    "point to", "point at", "where is", "where's", "highlight this", "circle this",
    "draw over", "draw on top", "annotate", "underline", "connect these", "draw an arrow",
    "this part", "that part", "over here", "right here", "here", "there",
  ];
  if (visualPhrases.some((p) => t.includes(p))) return true;

  // Single-word/short deictic prompts like "this?" or "here?".
  if (/^(this|that|here|there|these|those)\??$/.test(t)) return true;

  return false;
}

export default function Page() {
  // Stable session identifiers
  const [userId] = useState(() => `user-${generateId()}`);
  const [sessionId] = useState(() => `sess-${generateId()}`);

  const canvasRef = useRef<WhiteboardCanvasRef>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [tarsPointTarget, setTarsPointTarget] = useState<{
    x: number;
    y: number;
    label?: string;
    id: string;
  } | null>(null);
  const lastCanvasSnapshotMetaRef = useRef<{
    imageWidth: number;
    imageHeight: number;
    viewWidth: number;
    viewHeight: number;
  } | null>(null);
  const visualContextHandledRef = useRef<{ text: string; at: number } | null>(null);
  const bridgedDrawIdsRef = useRef<Set<string>>(new Set());

  // Tutor personalisation — read from ?tutor=<id> query param
  const searchParams = useSearchParams();
  const tutorId = searchParams.get("tutor");
  const [tutorConfig, setTutorConfig] = useState<Record<string, any> | null>(null);

  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // ── WebSocket hook ──────────────────────────────────────────────────────

  const {
    status,
    messages,
    canvasCommands,
    tarsPoint,
    tarsAgentDraws,
    isGeneratingImage,
    isSavingProgress,
    connect,
    disconnect,
    interruptResponse,
    sendText,
    sendAudio,
    sendImage,
    sendCanvasSnapshot,
  } = useWebSocket();

  const connected = status === "connected";

  // ── Auth hook ───────────────────────────────────────────────────────────
  const { user, getToken } = useAuth();

  // ── Audio hook ──────────────────────────────────────────────────────────

  const {
    startRecording,
    stopRecording,
    initPlayer,
    playAudioChunk,
    waitForPlaybackComplete,
    clearPlayback,
    cleanup: cleanupAudio,
  } = useAudio();

  // ── Apply canvas commands from the AI ───────────────────────────────────
  // Canvas commands are now passed as props to WhiteboardCanvas
  // (bypasses the dynamic import ref-forwarding issue)

  // ── Forward audio events received from WebSocket to the player ─────────

  // The useWebSocket hook exposes audio via the onAudio callback
  // registered at connect-time (see handleConnect).

  // ── Connect handler ─────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    if (!user) return; // Wait for auth

    try {
      const token = await getToken();
      if (!token) {
        console.error("Missing auth token, cannot connect.");
        return;
      }

      // Fetch tutor config for local display if a tutor ID is present
      if (tutorId && !tutorConfig) {
        try {
          const res = await fetch(`${API_URL}/api/tutors/${tutorId}`, {
            headers: { Authorization: token },
          });
          if (res.ok) {
            setTutorConfig(await res.json());
          }
        } catch (err) {
          console.warn("Could not fetch tutor config for display:", err);
        }
      }

      // Build WS URL — include tutor_id so backend builds a dynamic prompt
      let url = `${WS_URL}/ws/${user.uid}/${sessionId}?mode=whiteboard`;
      if (tutorId) url += `&tutor_id=${tutorId}`;

      connect(url, {
        authToken: token,
        onAudio: (audioData: ArrayBuffer) => {
          playAudioChunk(audioData);
        },
        onInterrupt: clearPlayback,
        waitForPlaybackComplete,
        onToolAudio: (base64Data: string) => {
          const pcm = base64ToArrayBuffer(base64Data);
          playAudioChunk(pcm);
        },
      });
      initPlayer();
    } catch (err) {
      console.error("Failed to acquire token or connect:", err);
    }
  }, [connect, user, sessionId, getToken, initPlayer, playAudioChunk, waitForPlaybackComplete, clearPlayback, tutorId, tutorConfig]);

  // ── Camera handlers ─────────────────────────────────────────────────────

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      cameraStreamRef.current = stream;
      // Don't set srcObject here — the <video> element doesn't exist yet.
      // The useEffect below will attach it after the element mounts.
      setIsCameraOpen(true);
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  }, []);

  // Attach the camera stream to the <video> element AFTER it mounts.
  // This fixes the black-screen bug: the video element only exists when
  // isCameraOpen is true, so we can't assign srcObject before that.
  useEffect(() => {
    if (isCameraOpen && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [isCameraOpen]);

  const captureAndSend = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    sendImage(base64, "image/jpeg");
    // Flash effect for user feedback
    if (videoRef.current) {
      videoRef.current.style.opacity = "0.3";
      setTimeout(() => {
        if (videoRef.current) videoRef.current.style.opacity = "1";
      }, 150);
    }
  }, [sendImage]);

  // ── Disconnect handler ──────────────────────────────────────────────────

  const handleDisconnect = useCallback(() => {
    // Stop mic
    if (isRecording) {
      stopRecording();
      setIsRecording(false);
    }
    // Stop camera
    closeCamera();
    disconnect();
    clearPlayback();
  }, [disconnect, isRecording, stopRecording, clearPlayback, closeCamera]);

  // ── Mic toggle ──────────────────────────────────────────────────────────

  const handleToggleMic = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      setIsRecording(false);
    } else {
      await startRecording((pcmData: ArrayBuffer) => {
        sendAudio(pcmData);
      });
      setIsRecording(true);
    }
  }, [isRecording, startRecording, stopRecording, sendAudio]);

  // ── Send canvas snapshot ────────────────────────────────────────────────

  const handleSendSnapshot = useCallback(async () => {
    const shot = await canvasRef.current?.getViewportSnapshot();
    if (!shot) return;
    lastCanvasSnapshotMetaRef.current = {
      imageWidth: shot.imageWidth,
      imageHeight: shot.imageHeight,
      viewWidth: shot.viewWidth,
      viewHeight: shot.viewHeight,
    };
    sendCanvasSnapshot(shot.base64, "image/jpeg", {
      width: shot.imageWidth,
      height: shot.imageHeight,
    });
  }, [sendCanvasSnapshot]);

  const sendWhiteboardVisionTurn = useCallback(async (text: string) => {
    const shot = await canvasRef.current?.getViewportSnapshot();
    if (!shot) {
      sendText(text);
      return false;
    }
    lastCanvasSnapshotMetaRef.current = {
      imageWidth: shot.imageWidth,
      imageHeight: shot.imageHeight,
      viewWidth: shot.viewWidth,
      viewHeight: shot.viewHeight,
    };
    sendCanvasSnapshot(shot.base64, "image/jpeg", {
      width: shot.imageWidth,
      height: shot.imageHeight,
      intentText: text,
    });
    return true;
  }, [sendCanvasSnapshot, sendText]);

  const maybeSendVisualContext = useCallback(async (text: string) => {
    if (!connected || !needsWhiteboardVision(text)) return false;
    const key = text.trim().toLowerCase();
    const recent = visualContextHandledRef.current;
    if (recent && recent.text === key && Date.now() - recent.at < 6000) {
      return false;
    }
    visualContextHandledRef.current = { text: key, at: Date.now() };
    await sendWhiteboardVisionTurn(text);
    return true;
  }, [connected, sendWhiteboardVisionTurn]);

  const handleSendText = useCallback((text: string) => {
    // Snapshot-backed questions bypass sendText, so interrupt here as well.
    // This also clears locally queued audio before the async capture begins.
    interruptResponse();
    void (async () => {
      const sentVisionTurn = await maybeSendVisualContext(text);
      if (!sentVisionTurn) sendText(text);
    })();
  }, [interruptResponse, maybeSendVisualContext, sendText]);

  // ── Auto-start mic when session connects ─────────────────────────────────

  useEffect(() => {
    if (status === "connected" && !isRecording) {
      startRecording((pcmData: ArrayBuffer) => {
        sendAudio(pcmData);
      }).then(() => {
        setIsRecording(true);
      }).catch((err) => {
        console.error("Failed to auto-start microphone:", err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Important: do NOT auto-send screenshots to the model. A screenshot is a
  // user message in the realtime session, so background sends make the tutor
  // talk repeatedly. Snapshots are sent only when the user presses Snapshot or
  // when a user utterance explicitly needs visual context.

  useEffect(() => {
    if (!connected) return;
    const latestUser = [...messages].reverse().find((m) => m.role === "user" && !m.partial);
    if (!latestUser) return;
    void maybeSendVisualContext(latestUser.text);
  }, [connected, messages, maybeSendVisualContext]);

  // Accurate path: structured point_at_whiteboard tool response.
  useEffect(() => {
    const meta = lastCanvasSnapshotMetaRef.current;
    if (!meta || !tarsPoint) return;
    const x = Math.max(0, Math.min(meta.viewWidth, (tarsPoint.x / meta.imageWidth) * meta.viewWidth));
    const y = Math.max(0, Math.min(meta.viewHeight, (tarsPoint.y / meta.imageHeight) * meta.viewHeight));
    setTarsPointTarget({ x, y, label: tarsPoint.label, id: tarsPoint.id });
  }, [tarsPoint]);

  // The board owns the only active Realtime session. Forward its temporary
  // drawing tools to Global Tars's visual overlay after converting the
  // whiteboard screenshot coordinates into browser viewport coordinates.
  useEffect(() => {
    for (const draw of tarsAgentDraws) {
      if (bridgedDrawIdsRef.current.has(draw.id)) continue;

      if (draw.tool === "clear_screen_drawings") {
        bridgedDrawIdsRef.current.add(draw.id);
        dispatchBoardTarsDraw({ ...draw, coordinateSpace: "viewport" });
        continue;
      }

      const meta = lastCanvasSnapshotMetaRef.current;
      const viewportRect = canvasRef.current?.getViewportRect();
      if (!meta || !viewportRect) continue;
      const convertPoint = (x?: number | null, y?: number | null) => {
        if (typeof x !== "number" || typeof y !== "number") return null;
        return {
          x: viewportRect.left + (x / meta.imageWidth) * viewportRect.width,
          y: viewportRect.top + (y / meta.imageHeight) * viewportRect.height,
        };
      };
      const start = convertPoint(draw.x, draw.y);
      const end = convertPoint(draw.endX, draw.endY);
      if (!start) continue;
      bridgedDrawIdsRef.current.add(draw.id);
      dispatchBoardTarsDraw({
        ...draw,
        x: start.x,
        y: start.y,
        endX: end?.x ?? null,
        endY: end?.y ?? null,
        coordinateSpace: "viewport",
      });
    }
  }, [tarsAgentDraws]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="app-layout">
      {/* Floating session controls — replaces the old full-width Toolbar */}
      <div className="session-bar">
        <div className={`status-pill ${status}`}>
          <span className="status-dot-inner" />
          <span>
            {status === "connected"
              ? "Live Session"
              : status === "connecting"
              ? "Connecting…"
              : "No Session"}
          </span>
        </div>

        {/* Tutor identity badge */}
        {tutorConfig && (
          <div className="tutor-badge" title={tutorConfig.desc || tutorConfig.title}>
            <span className="tutor-badge-name">{tutorConfig.name}</span>
            {tutorConfig.subjects?.[0] && (
              <span className="tutor-badge-subject">{tutorConfig.subjects[0]}</span>
            )}
          </div>
        )}

        {!connected ? (
          <button
            className="btn btn-start"
            onClick={handleConnect}
            disabled={status === "connecting"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {status === "connecting" ? "Connecting…" : "Start Session"}
          </button>
        ) : (
          <div className="session-bar-actions">
            <button
              className="toolbar-action-btn"
              onClick={handleSendSnapshot}
              title="Send canvas snapshot to tutor"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Snapshot</span>
            </button>

            <button
              className={`toolbar-action-btn ${isCameraOpen ? "camera-active" : ""}`}
              onClick={isCameraOpen ? closeCamera : openCamera}
              title={isCameraOpen ? "Close camera" : "Show your homework to the tutor"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isCameraOpen ? (
                  <><path d="M16.5 9.4l-2-1.3a2 2 0 0 0-3 1.7v4.4a2 2 0 0 0 3 1.7l2-1.3"/><rect x="2" y="6" width="12" height="12" rx="2"/><line x1="1" y1="1" x2="23" y2="23"/></>
                ) : (
                  <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>
                )}
              </svg>
              <span>{isCameraOpen ? "Close" : "Camera"}</span>
            </button>

            <button
              className={`toolbar-mic-btn ${isRecording ? "active" : ""}`}
              onClick={handleToggleMic}
              title={isRecording ? "Mute microphone" : "Unmute microphone"}
            >
              {isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
              <span>{isRecording ? "Listening" : "Muted"}</span>
            </button>

            <button className="toolbar-action-btn danger" onClick={handleDisconnect}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
              <span>End</span>
            </button>
          </div>
        )}
      </div>

      <div className="content-area">
        {/* Camera preview overlay */}
        {isCameraOpen && (
          <div className="camera-preview">
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
            <div className="camera-controls">
              <button className="camera-capture-btn" onClick={captureAndSend} title="Send to tutor">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                Send to Tutor
              </button>
              <button className="camera-close-btn" onClick={closeCamera}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Canvas panel */}
        <div className="canvas-panel">
          <WhiteboardCanvas
            ref={canvasRef}
            canvasCommands={canvasCommands}
            isGeneratingImage={isGeneratingImage}
            tarsActive={connected}
            tarsPointTarget={tarsPointTarget}
          />
        </div>

        {/* Side panel — transcript */}
        <div className="side-panel">
          <TranscriptPanel messages={messages} onSendText={handleSendText} userPhotoURL={user?.photoURL || undefined} />
        </div>
      </div>
    </main>
  );
}
