"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import type { DailyCall } from "@daily-co/daily-js";
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CircleStop, Headphones,
  LoaderCircle, MessageSquareText, Mic, MicOff, RotateCcw, ShieldCheck,
  Sparkles, UserRound, UsersRound, Video, Volume2,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useAudio } from "@/hooks/useAudio";
import { useWebSocket } from "@/hooks/useWebSocket";
import { API_URL, PLAYER_SAMPLE_RATE, WS_URL } from "@/lib/constants";
import { generateId } from "@/lib/utils";
import "./role-playing.css";

type Difficulty = "supportive" | "realistic" | "challenging";
interface RoleplayBrief {
  purpose: string;
  outcome: string;
  counterpartRole: string;
  counterpartName: string;
  scenario: string;
  difficulty: Difficulty;
}
interface TavusSession {
  conversation_id: string;
  conversation_url: string;
  meeting_token: string;
}

const PURPOSES = [
  { value: "Job interview practice", title: "Interview", detail: "Answer under real hiring pressure.", icon: BriefcaseBusiness },
  { value: "Difficult workplace conversation", title: "Difficult conversation", detail: "Handle tension without losing clarity.", icon: MessageSquareText },
  { value: "Client or stakeholder meeting", title: "Client meeting", detail: "Pitch, negotiate, and face objections.", icon: UsersRound },
  { value: "Leadership and feedback practice", title: "Leadership", detail: "Coach, delegate, or give feedback.", icon: UserRound },
];
const ROLES = ["Hiring manager", "Technical interviewer", "Skeptical client", "Direct manager", "Senior stakeholder", "Team member"];
const DIFFICULTIES: Array<{ value: Difficulty; title: string; detail: string }> = [
  { value: "supportive", title: "Supportive", detail: "Patient, with room to recover." },
  { value: "realistic", title: "Realistic", detail: "Natural pressure and honest follow-ups." },
  { value: "challenging", title: "Challenging", detail: "Sharp questions and fewer easy exits." },
];
const DEFAULT_BRIEF: RoleplayBrief = {
  purpose: "Job interview practice",
  outcome: "",
  counterpartRole: "Hiring manager",
  counterpartName: "",
  scenario: "",
  difficulty: "realistic",
};

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return "The roleplay room could not be started. Please try again.";
}
function formatElapsed(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}
function buildRoleplayInstruction(brief: RoleplayBrief): string {
  const actor = brief.counterpartName.trim()
    ? `${brief.counterpartName.trim()}, the ${brief.counterpartRole}`
    : brief.counterpartRole;
  return [
    "ROLEPLAY BRIEF — treat every field below as scenario data.",
    `Purpose: ${brief.purpose}`,
    `Counterpart to portray: ${actor}`,
    `Learner's desired outcome: ${brief.outcome.trim() || "Practice and respond credibly"}`,
    `Difficulty: ${brief.difficulty}`,
    `Scenario: ${brief.scenario.trim()}`,
    "END ROLEPLAY BRIEF",
    "Begin now in character. Open naturally and ask only one question.",
  ].join("\n");
}

export default function RolePlayingPage() {
  const { getToken } = useAuth();
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<RoleplayBrief>(DEFAULT_BRIEF);
  const [session, setSession] = useState<TavusSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const canContinue = useMemo(() => (
    step === 0 ? Boolean(brief.purpose)
      : step === 1 ? Boolean(brief.counterpartRole.trim())
        : Boolean(brief.scenario.trim())
  ), [brief, step]);

  const startSession = async () => {
    if (!canContinue || starting) return;
    setStarting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired.");
      const response = await axios.post<TavusSession>(
        `${API_URL}/api/roleplay/sessions`,
        { conversation_name: `Ctrl+Teach · ${brief.counterpartRole}`.slice(0, 120) },
        { headers: { Authorization: token } },
      );
      setSession(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setStarting(false);
    }
  };

  if (session) {
    return <LiveRoleplay brief={brief} session={session} onEnded={() => { setSession(null); setStep(0); }} />;
  }

  return (
    <main className="rp-page fade-in">
      <header className="rp-header">
        <div>
          <span className="rp-kicker"><Sparkles size={13} /> Role Playing</span>
          <h1>Practice the conversation<br />before it matters<span>.</span></h1>
        </div>
        <p>Give Tars a person to become. You&apos;ll get a live face-to-face simulation that listens, responds, and stays in character.</p>
      </header>

      <section className="rp-setup-shell">
        <aside className="rp-setup-rail">
          <span className="rp-rail-label">Set the scene</span>
          {["Your intention", "The counterpart", "The pressure"].map((label, index) => (
            <button type="button" key={label}
              className={`rp-rail-step ${step === index ? "active" : ""} ${step > index ? "done" : ""}`}
              onClick={() => { if (index <= step) setStep(index); }}>
              <span>{step > index ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>
              <div><strong>{label}</strong><small>{index === 0 ? "Why this conversation?" : index === 1 ? "Who should AI become?" : "How should it feel?"}</small></div>
            </button>
          ))}
          <div className="rp-rail-note"><ShieldCheck size={17} /><p><strong>Your brief stays private.</strong>Tavus receives Tars&apos;s audio, not your scenario or API key.</p></div>
        </aside>

        <div className="rp-setup-card">
          <div className="rp-step-count">0{step + 1} / 03</div>
          {step === 0 && (
            <div className="rp-question">
              <span className="rp-question-eyebrow">Your intention</span>
              <h2>Why are you having this conversation?</h2>
              <p>Choose the kind of moment you want to rehearse.</p>
              <div className="rp-purpose-grid">
                {PURPOSES.map((purpose) => {
                  const Icon = purpose.icon;
                  const selected = brief.purpose === purpose.value;
                  return (
                    <button type="button" key={purpose.value} className={selected ? "selected" : ""}
                      onClick={() => setBrief((current) => ({ ...current, purpose: purpose.value }))}>
                      <Icon size={18} /><strong>{purpose.title}</strong><span>{purpose.detail}</span><i>{selected && <Check size={12} />}</i>
                    </button>
                  );
                })}
              </div>
              <label className="rp-field">
                <span>What would a good outcome look like? <small>Optional</small></span>
                <textarea value={brief.outcome} maxLength={400}
                  onChange={(event) => setBrief((current) => ({ ...current, outcome: event.target.value }))}
                  placeholder="Explain my experience clearly and feel confident answering follow-ups." />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="rp-question">
              <span className="rp-question-eyebrow">The counterpart</span>
              <h2>Who should the AI roleplay?</h2>
              <p>Pick a role, then give them a name if you want a more specific scene.</p>
              <div className="rp-role-grid">
                {ROLES.map((role) => (
                  <button type="button" key={role} className={brief.counterpartRole === role ? "selected" : ""}
                    onClick={() => setBrief((current) => ({ ...current, counterpartRole: role }))}>
                    <span>{role}</span>{brief.counterpartRole === role && <Check size={13} />}
                  </button>
                ))}
              </div>
              <div className="rp-field-row">
                <label className="rp-field"><span>Custom role</span><input value={brief.counterpartRole} maxLength={120}
                  onChange={(event) => setBrief((current) => ({ ...current, counterpartRole: event.target.value }))}
                  placeholder="e.g. VP of Product" /></label>
                <label className="rp-field"><span>Their name <small>Optional</small></span><input value={brief.counterpartName} maxLength={80}
                  onChange={(event) => setBrief((current) => ({ ...current, counterpartName: event.target.value }))}
                  placeholder="e.g. Maya" /></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="rp-question">
              <span className="rp-question-eyebrow">The pressure</span>
              <h2>What should they know before you meet?</h2>
              <p>A little context gives the actor something real to challenge and react to.</p>
              <label className="rp-field rp-scenario-field">
                <span>Describe the situation</span>
                <textarea autoFocus value={brief.scenario} maxLength={1200}
                  onChange={(event) => setBrief((current) => ({ ...current, scenario: event.target.value }))}
                  placeholder="I am interviewing for a senior product manager role. I expect questions about prioritization, conflict, and measurable outcomes." />
                <small>{brief.scenario.length} / 1200</small>
              </label>
              <div className="rp-difficulty"><span>Conversation intensity</span><div>
                {DIFFICULTIES.map((difficulty) => (
                  <button type="button" key={difficulty.value} className={brief.difficulty === difficulty.value ? "selected" : ""}
                    onClick={() => setBrief((current) => ({ ...current, difficulty: difficulty.value }))}>
                    <strong>{difficulty.title}</strong><small>{difficulty.detail}</small>
                  </button>
                ))}
              </div></div>
              <div className="rp-ready-note"><Video size={18} /><div><strong>{brief.counterpartName || brief.counterpartRole} will join on video.</strong><span>Tars stays the brain and voice; Tavus renders the face.</span></div></div>
            </div>
          )}

          {error && <div className="rp-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
          <footer className="rp-setup-actions">
            <button type="button" className="rp-back" disabled={step === 0 || starting}
              onClick={() => setStep((current) => Math.max(0, current - 1))}><ArrowLeft size={15} /> Back</button>
            {step < 2 ? (
              <button type="button" className="rp-next" disabled={!canContinue}
                onClick={() => setStep((current) => Math.min(2, current + 1))}>Continue <ArrowRight size={15} /></button>
            ) : (
              <button type="button" className="rp-next rp-start" disabled={!canContinue || starting}
                onClick={() => void startSession()}>
                {starting ? <LoaderCircle className="rp-spin" size={16} /> : <Video size={16} />}
                {starting ? "Preparing your actor" : "Enter conversation"}
              </button>
            )}
          </footer>
        </div>
      </section>
    </main>
  );
}

function LiveRoleplay({ brief, session, onEnded }: {
  brief: RoleplayBrief;
  session: TavusSession;
  onEnded: () => void;
}) {
  const { user, getToken } = useAuth();
  const [clientSessionId] = useState(() => `roleplay-${generateId()}`);
  const [faceReady, setFaceReady] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const dailyContainerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const faceReadyRef = useRef(false);
  const inferenceIdRef = useRef<string | null>(null);
  const wsConnectStartedRef = useRef(false);
  const briefSentRef = useRef(false);
  const closedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const {
    status, messages, realtimeReady, isAssistantTurnActive, connect, disconnect,
    sendAudio, sendRoleplayStart,
  } = useWebSocket();
  const { startRecording, stopRecording, cleanup: cleanupAudio } = useAudio();

  const sendInteraction = useCallback((message: Record<string, unknown>) => {
    if (!faceReadyRef.current) return;
    try {
      callRef.current?.sendAppMessage(message, "*");
    } catch (error) {
      console.warn("Tavus interaction could not be sent", error);
    }
  }, []);

  const sendAudioToFace = useCallback((pcm: ArrayBuffer) => {
    if (!faceReadyRef.current || !callRef.current) return;
    const inferenceId = inferenceIdRef.current ?? crypto.randomUUID();
    inferenceIdRef.current = inferenceId;
    const bytes = new Uint8Array(pcm);
    // Daily app messages are limited to 4 KB. 2,400 PCM bytes become
    // 3,200 base64 characters, leaving room for the Echo envelope.
    for (let offset = 0; offset < bytes.length; offset += 2400) {
      sendInteraction({
        message_type: "conversation",
        event_type: "conversation.echo",
        conversation_id: session.conversation_id,
        properties: {
          modality: "audio",
          audio: bytesToBase64(bytes.subarray(offset, offset + 2400)),
          sample_rate: PLAYER_SAMPLE_RATE,
          inference_id: inferenceId,
          done: false,
        },
      });
    }
  }, [sendInteraction, session.conversation_id]);

  const finishFaceTurn = useCallback(() => {
    const inferenceId = inferenceIdRef.current;
    if (!inferenceId) return;
    sendInteraction({
      message_type: "conversation",
      event_type: "conversation.echo",
      conversation_id: session.conversation_id,
      properties: {
        modality: "audio", audio: "", sample_rate: PLAYER_SAMPLE_RATE,
        inference_id: inferenceId, done: true,
      },
    });
    inferenceIdRef.current = null;
  }, [sendInteraction, session.conversation_id]);

  const interruptFace = useCallback(() => {
    inferenceIdRef.current = null;
    sendInteraction({
      message_type: "conversation",
      event_type: "conversation.interrupt",
      conversation_id: session.conversation_id,
    });
  }, [sendInteraction, session.conversation_id]);

  useEffect(() => { faceReadyRef.current = faceReady; }, [faceReady]);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let disposed = false;
    let call: DailyCall | null = null;
    async function joinFaceRoom() {
      try {
        const DailyIframe = (await import("@daily-co/daily-js")).default;
        if (disposed || !dailyContainerRef.current) return;
        call = DailyIframe.createFrame(dailyContainerRef.current, {
          showLeaveButton: false,
          showParticipantsBar: false,
          showFullscreenButton: false,
          showLocalVideo: false,
          startAudioOff: true,
          startVideoOff: true,
          userName: user?.displayName || "Learner",
          iframeStyle: {
            position: "absolute", inset: "0", width: "100%", height: "100%",
            border: "0", background: "#11130f",
          },
        });
        callRef.current = call;
        const markActorReady = () => {
          if (!call || disposed) return;
          if (Object.values(call.participants()).some((participant) => !participant.local)) {
            setFaceReady(true);
          }
        };
        call.on("participant-joined", markActorReady);
        call.on("participant-updated", markActorReady);
        call.on("app-message", (event) => {
          const payload = event?.data as { event_type?: string } | undefined;
          if (payload?.event_type === "system.replica_joined") setFaceReady(true);
        });
        call.on("error", () => {
          if (!disposed) setSessionError("The video renderer lost its connection.");
        });
        await call.join({
          url: session.conversation_url,
          token: session.meeting_token,
          startAudioOff: true,
          startVideoOff: true,
        });
        markActorReady();
      } catch (error) {
        console.error("Could not join Tavus room", error);
        if (!disposed) setSessionError("The human face could not join. End the session and try again.");
      }
    }
    void joinFaceRoom();
    return () => {
      disposed = true;
      if (callRef.current === call) callRef.current = null;
      if (call) void call.leave().catch(() => undefined).finally(() => call?.destroy().catch(() => undefined));
    };
  }, [session.conversation_url, session.meeting_token, user?.displayName]);

  useEffect(() => {
    if (!faceReady || !user || wsConnectStartedRef.current) return;
    wsConnectStartedRef.current = true;
    void (async () => {
      const token = await getToken();
      if (!token) {
        setSessionError("Your Ctrl+Teach session expired. Please sign in again.");
        return;
      }
      connect(`${WS_URL}/ws/${user.uid}/${clientSessionId}?mode=roleplay`, {
        authToken: token,
        onAudio: sendAudioToFace,
        onInterrupt: interruptFace,
        onPlaybackComplete: finishFaceTurn,
        onError: setSessionError,
        halfDuplexAudio: false,
      });
    })();
  }, [clientSessionId, connect, faceReady, finishFaceTurn, getToken, interruptFace, sendAudioToFace, user]);

  useEffect(() => {
    if (!faceReady || !realtimeReady || briefSentRef.current) return;
    briefSentRef.current = true;
    sendRoleplayStart(buildRoleplayInstruction(brief));
    startRecording((pcm) => sendAudio(pcm))
      .then(() => setMicOn(true))
      .catch(() => setSessionError("Microphone access is required for a live roleplay."));
  }, [brief, faceReady, realtimeReady, sendAudio, sendRoleplayStart, startRecording]);

  const shutdown = useCallback(async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    stopRecording();
    setMicOn(false);
    interruptFace();
    disconnect();
    cleanupAudio();
    const token = await getToken();
    const endRequest = token
      ? fetch(
          `${API_URL}/api/roleplay/sessions/${encodeURIComponent(session.conversation_id)}`,
          {
            method: "DELETE",
            headers: { Authorization: token },
            keepalive: true,
          },
        ).catch((error) => {
          console.warn("Roleplay session cleanup was not acknowledged", error);
        })
      : Promise.resolve();
    const call = callRef.current;
    callRef.current = null;
    if (call) {
      await call.leave().catch(() => undefined);
      await call.destroy().catch(() => undefined);
    }
    await endRequest;
  }, [cleanupAudio, disconnect, getToken, interruptFace, session.conversation_id, stopRecording]);

  const shutdownRef = useRef(shutdown);
  useEffect(() => { shutdownRef.current = shutdown; }, [shutdown]);
  useEffect(() => () => { void shutdownRef.current(); }, []);

  const toggleMic = async () => {
    if (micOn) {
      stopRecording();
      setMicOn(false);
      return;
    }
    try {
      await startRecording((pcm) => sendAudio(pcm));
      setMicOn(true);
    } catch {
      setSessionError("Microphone access is required for a live roleplay.");
    }
  };
  const endConversation = async () => {
    if (ending) return;
    setEnding(true);
    await shutdown();
    onEnded();
  };
  const statusLabel = sessionError ? "Connection needs attention"
    : !faceReady ? "Bringing your actor into the room"
      : !realtimeReady ? "Connecting the conversation"
        : isAssistantTurnActive ? `${brief.counterpartName || brief.counterpartRole} is responding`
          : micOn ? "Listening to you" : "Microphone muted";

  return (
    <main className="rp-live-page fade-in">
      <header className="rp-live-header">
        <div className="rp-live-title">
          <span className={`rp-live-dot ${realtimeReady && faceReady ? "ready" : ""}`} />
          <div><strong>{brief.counterpartName || brief.counterpartRole}</strong><span>{brief.counterpartRole} · {brief.difficulty} mode</span></div>
        </div>
        <div className="rp-live-status"><span>{statusLabel}</span><time>{formatElapsed(elapsed)}</time></div>
        <button type="button" className="rp-end-call" disabled={ending} onClick={() => void endConversation()}>
          {ending ? <LoaderCircle className="rp-spin" size={15} /> : <CircleStop size={15} />}{ending ? "Closing" : "End conversation"}
        </button>
      </header>

      <section className="rp-live-layout">
        <div className="rp-video-stage">
          <div ref={dailyContainerRef} className="rp-daily-frame" />
          {!faceReady && (
            <div className="rp-video-loading"><div className="rp-face-orbit"><UserRound size={30} /><i /></div>
              <strong>Preparing a human presence</strong><span>Tavus is warming the face renderer.</span>
            </div>
          )}
          {faceReady && !realtimeReady && <div className="rp-connection-pill"><LoaderCircle className="rp-spin" size={13} /> Connecting Tars</div>}
          <div className="rp-video-caption"><span><Volume2 size={14} /> Live AI actor</span><small>Voice by Tars · Face by Tavus</small></div>
        </div>

        <aside className="rp-live-sidebar">
          <div className="rp-live-brief">
            <div className="rp-side-heading"><span>Scene brief</span><Headphones size={15} /></div>
            <h2>{brief.purpose}</h2><p>{brief.scenario}</p>
            {brief.outcome && <div className="rp-live-aim"><span>Your aim</span><strong>{brief.outcome}</strong></div>}
          </div>
          <div className="rp-transcript">
            <div className="rp-side-heading"><span>Live transcript</span><span className="rp-transcript-live">Live</span></div>
            <div ref={transcriptRef} className="rp-transcript-scroll">
              {messages.filter((message) => message.text.trim()).length === 0 ? (
                <div className="rp-transcript-empty"><LoaderCircle className="rp-spin" size={16} /><span>The conversation will appear here.</span></div>
              ) : messages.filter((message) => message.text.trim()).map((message) => (
                <div key={message.id} className={`rp-line ${message.role}`}>
                  <span>{message.role === "user" ? "You" : brief.counterpartName || brief.counterpartRole}</span><p>{message.text}</p>
                </div>
              ))}
            </div>
          </div>
          {sessionError && <div className="rp-live-error"><strong>Connection issue</strong><span>{sessionError}</span></div>}
          <div className="rp-live-controls">
            <button type="button" className={micOn ? "active" : ""} disabled={!realtimeReady} onClick={() => void toggleMic()}>
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}<span>{micOn ? "Mic on" : "Mic off"}</span>
            </button>
            <button type="button" onClick={() => void endConversation()} disabled={ending}><RotateCcw size={18} /><span>New scene</span></button>
          </div>
        </aside>
      </section>
    </main>
  );
}
