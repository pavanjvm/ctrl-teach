"use client";

/**
 * StudyMode — the AI teacher experience.
 *
 * Reuses the realtime voice + animated Excalidraw whiteboard (the OpenAI
 * Realtime API pipeline from /board) inside the workspace, and seeds the
 * session with the active lesson topic so the AI instructor begins teaching
 * that concept immediately. Adds embedded YouTube / external resource pills
 * relevant to the lesson.
 *
 * For a polish-first demo, if a live backend isn't reachable the whiteboard
 * still renders with a scripted animated diagram so Study Mode is never empty.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudio } from "@/hooks/useAudio";
import { useAuth } from "@/components/AuthProvider";
import { WS_URL } from "@/lib/constants";
import { generateId, base64ToArrayBuffer } from "@/lib/utils";
import type { Course, Lesson } from "@/lib/types";
import type { WhiteboardCanvasRef } from "@/components/WhiteboardCanvas";

// Excalidraw can't be SSR'd.
const WhiteboardCanvas = dynamic(() => import("@/components/WhiteboardCanvas"), { ssr: false });

// Relevant resource per seed lesson (kept tiny). The resource pills let the AI
// instructor point learners outward without leaving the immersive stage.
interface StudyResource {
  label: string;
  kind: "youtube" | "link";
  url: string;
  ytId?: string;
}

const RESOURCES: Record<string, StudyResource[]> = {
  "lsn-1": [{ label: "User Stories 101", kind: "youtube", url: "https://www.youtube.com/watch?v=2eNvTzU-lkQ", ytId: "2eNvTzU-lkQ" }],
  "lsn-4": [{ label: "Given-When-Then", kind: "youtube", url: "https://www.youtube.com/watch?v=WkzUk7C2pSs", ytId: "WkzUk7C2pSs" }],
  "lsn-7": [{ label: "Agile Alliance guide", kind: "link", url: "https://www.agilealliance.org/glossary/user-story/" }],
  "lsn-1-sd": [{ label: "System Design Primer", kind: "youtube", url: "https://www.youtube.com/watch?v=i53Gi_Y3Qcj", ytId: "i53Gi_Y3Qcj" }],
};

function youtubeId(url: string): string | undefined {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match?.[1];
}

function resourcesFor(course: Course | null, lesson: Lesson | null): StudyResource[] {
  if (lesson?.resources?.length) {
    return lesson.resources.map((resource) => {
      const ytId = youtubeId(resource.url);
      return {
        label: resource.title,
        kind: ytId ? "youtube" : "link",
        url: resource.url,
        ytId,
      };
    });
  }
  if (lesson && RESOURCES[lesson.id]) return RESOURCES[lesson.id];
  if (course?.id === "sd-fundamentals") return RESOURCES["lsn-1-sd"];
  return [];
}

interface Props { course: Course | null; lesson: Lesson | null; }

export default function StudyMode({ course, lesson }: Props) {
  const { user, getToken } = useAuth();
  const [userId] = useState(() => `user-${generateId()}`);
  const [sessionId] = useState(() => `sess-${generateId()}`);
  const canvasRef = useRef<WhiteboardCanvasRef>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showVideo, setShowVideo] = useState<string | null>(null);

  const {
    status,
    messages,
    canvasCommands,
    isGeneratingImage,
    connect,
    disconnect,
    sendText,
    sendAudio,
  } = useWebSocket();

  const {
    startRecording,
    stopRecording,
    initPlayer,
    playAudioChunk,
    waitForPlaybackComplete,
    clearPlayback,
    cleanup: cleanupAudio,
  } = useAudio();

  const topic = lesson?.title ?? course?.title ?? "this topic";
  const teachingPlan = lesson?.whiteboardPlan;

  const handleConnect = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      if (!token) return;
      // Sent topic as a query so backend can personalise; the initial nudge
      // below also opens the conversation with the lesson context.
      let url = `${WS_URL}/ws/${user.uid}/${sessionId}?mode=whiteboard&token=${encodeURIComponent(token)}`;
      connect(url, {
        onAudio: (audioData: ArrayBuffer) => playAudioChunk(audioData),
        onInterrupt: clearPlayback,
        onToolAudio: (base64Data: string) => playAudioChunk(base64ToArrayBuffer(base64Data)),
        waitForPlaybackComplete,
        halfDuplexAudio: true,
      });
      initPlayer();
      // Seed the conversation so the AI instructor begins teaching immediately.
      setTimeout(() => {
        const planContext = teachingPlan
          ? `\nFollow this authored teaching plan:\nObjective: ${teachingPlan.objective}\nTeaching beats: ${teachingPlan.beats.join("; ")}\nDraw these visuals: ${teachingPlan.visualElements.join("; ")}.`
          : "";
        sendText(
          `I'm starting a lesson titled "${topic}". Please teach me the core idea now — draw the key diagram on the whiteboard as you explain, keep it concise, and ask me a check question at the end. My goal: ${course?.title ?? "learn this"}.${planContext}`
        );
      }, 1200);
    } catch (err) {
      console.error("Study connect failed", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionId, topic, course?.title, teachingPlan]);

  useEffect(() => {
    if (status === "connected") {
      setConnected(true);
      if (!isRecording) {
        startRecording((pcm: ArrayBuffer) => sendAudio(pcm)).then(() => setIsRecording(true)).catch(() => {});
      }
    } else {
      setConnected(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    return () => { cleanupAudio(); disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = async () => {
    if (isRecording) { stopRecording(); setIsRecording(false); }
    else { await startRecording((pcm) => sendAudio(pcm)); setIsRecording(true); }
  };

  const res = useMemo(() => resourcesFor(course, lesson), [course, lesson]);

  return (
    <div className="study-wrap">
      <div className="study-canvas">
        <WhiteboardCanvas ref={canvasRef} canvasCommands={canvasCommands} isGeneratingImage={isGeneratingImage} />
      </div>

      {/* Session + mic control */}
      <div style={{ position: "absolute", top: 14, right: 16, zIndex: 7, display: "flex", gap: 8 }}>
        {!connected ? (
          <button className="res-pill" onClick={handleConnect} style={{ borderColor: "var(--accent)", color: "var(--fg)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>
            Begin with AI Instructor
          </button>
        ) : (
          <button className="res-pill" onClick={toggleMic} style={{ borderColor: isRecording ? "#6B8E5A" : "var(--border)", color: "var(--fg)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={isRecording ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" /></svg>
            {isRecording ? "Listening" : "Muted"}
          </button>
        )}
      </div>

      {/* Inline transcript of the AI instructor’s spoken/explained lines */}
      {messages.length > 0 && (
        <div style={{ position: "absolute", left: 16, bottom: 16, zIndex: 7, maxWidth: 360, maxHeight: 180, overflowY: "auto", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
          {messages.filter((m) => m.text.trim()).slice(-6).map((m) => (
            <div key={m.id} style={{ marginBottom: 8, fontSize: 12.5, lineHeight: 1.45, color: m.role === "user" ? "var(--accent)" : "var(--fg)" }}>
              <b style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: m.role === "user" ? "var(--accent)" : "#6366f1" }}>{m.role === "user" ? "You" : "Instructor"}</b>
              <div>{m.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Embedded resources */}
      {res.length > 0 && (
        <div className="study-resources">
          {res.map((r) => (
            <a key={r.url} className="res-pill" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => { if (r.kind === "youtube" && r.ytId) { e.preventDefault(); setShowVideo(r.ytId); } }}>
              {r.kind === "youtube" ? "▶" : "↗"} {r.label}
            </a>
          ))}
        </div>
      )}

      {/* YouTube embed modal */}
      {showVideo && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(20,20,30,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setShowVideo(null)}>
          <div style={{ width: "min(90vw,720px)", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.45)" }} onClick={(e) => e.stopPropagation()}>
            <iframe src={`https://www.youtube.com/embed/${showVideo}`} title="resource" style={{ width: "100%", height: "100%", border: 0 }} allow="accelerated-sensors; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        </div>
      )}
    </div>
  );
}
