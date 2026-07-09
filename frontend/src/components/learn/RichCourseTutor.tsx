"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mic, MicOff, Send, Sparkles, Volume2 } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { useAudio } from "@/hooks/useAudio";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WS_URL } from "@/lib/constants";
import { base64ToArrayBuffer, generateId } from "@/lib/utils";

export default function RichCourseTutor({
  courseId,
  lessonId,
  lessonTitle,
}: {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
}) {
  const { user, getToken } = useAuth();
  const [sessionId] = useState(() => `rich-${generateId()}`);
  const [isRecording, setIsRecording] = useState(false);
  const [started, setStarted] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const {
    status,
    messages,
    connect,
    disconnect,
    sendText,
    sendAudio,
    interruptResponse,
  } = useWebSocket();
  const {
    startRecording,
    stopRecording,
    initPlayer,
    playAudioChunk,
    waitForPlaybackComplete,
    clearPlayback,
    cleanup,
  } = useAudio();

  const startTutor = useCallback(async () => {
    if (!user) return;
    setError(null);
    setStarted(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again to start the tutor.");
      const query = new URLSearchParams({
        token,
        course_id: courseId,
        lesson_id: lessonId,
        mode: "course_reader",
      });
      connect(`${WS_URL}/ws/${user.uid}/${sessionId}?${query.toString()}`, {
        onAudio: (audio) => playAudioChunk(audio),
        onInterrupt: clearPlayback,
        onToolAudio: (encoded) => playAudioChunk(base64ToArrayBuffer(encoded)),
        waitForPlaybackComplete,
        halfDuplexAudio: true,
        onError: (message) => setError(message),
      });
      initPlayer();
    } catch (startError) {
      setStarted(false);
      setError(startError instanceof Error ? startError.message : "The realtime tutor could not start.");
    }
  }, [clearPlayback, connect, courseId, getToken, initPlayer, lessonId, playAudioChunk, sessionId, user, waitForPlaybackComplete]);

  useEffect(() => {
    if (status !== "connected" || isRecording) return;
    startRecording((pcm) => sendAudio(pcm))
      .then(() => setIsRecording(true))
      .catch(() => setError("Microphone access is unavailable. You can still type to the tutor."));
  }, [isRecording, sendAudio, startRecording, status]);

  useEffect(() => {
    return () => {
      stopRecording();
      cleanup();
      disconnect();
    };
  }, [cleanup, disconnect, stopRecording]);

  async function toggleMic() {
    if (isRecording) {
      stopRecording();
      setIsRecording(false);
      return;
    }
    try {
      await startRecording((pcm) => sendAudio(pcm));
      setIsRecording(true);
    } catch {
      setError("Microphone access is unavailable.");
    }
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    interruptResponse();
    sendText(text);
    setDraft("");
  }

  return (
    <aside className="rich-tutor">
      <div className="rich-tutor-head">
        <span><Sparkles size={13} /> GPT-Realtime-2 tutor</span>
        <strong>{lessonTitle}</strong>
      </div>

      {!started ? (
        <div className="rich-tutor-intro">
          <Volume2 size={25} />
          <h3>Talk through this lesson.</h3>
          <p>The tutor is grounded in this course’s generated content and cited sources.</p>
          <button type="button" onClick={startTutor}><Mic size={14} /> Start voice tutor</button>
        </div>
      ) : (
        <>
          <div className="rich-tutor-status">
            {status === "connecting" ? <><Loader2 className="rich-spin" size={13} /> Connecting</> :
              status === "connected" ? <><i /> Live and lesson-grounded</> : "Disconnected"}
          </div>
          <div className="rich-tutor-messages">
            {messages.filter((message) => message.text.trim() && (!message.partial || message.role === "user")).length === 0 ? (
              <p className="rich-tutor-empty">Ask for an explanation, an example, or a quick knowledge check.</p>
            ) : messages.filter((message) => message.text.trim() && (!message.partial || message.role === "user")).slice(-12).map((message) => (
              <div key={message.id} className={`rich-tutor-message ${message.role}`}>
                <span>{message.role === "user" ? "You" : "Tutor"}</span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <div className="rich-tutor-compose">
            <button type="button" onClick={toggleMic} aria-label={isRecording ? "Mute microphone" : "Enable microphone"}>
              {isRecording ? <Mic size={15} /> : <MicOff size={15} />}
            </button>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
              placeholder="Ask about this lesson…"
            />
            <button type="button" onClick={submit} aria-label="Send message"><Send size={15} /></button>
          </div>
        </>
      )}
      {error && <div className="rich-tutor-error">{error}</div>}
    </aside>
  );
}
