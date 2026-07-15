"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import type { DailyCall } from "@daily-co/daily-js";
import {
  DailyAudio,
  DailyProvider,
  DailyVideo,
  useDaily,
  useDailyEvent,
  useParticipantIds,
} from "@daily-co/daily-react";
import type { DailyAudioHandle } from "@daily-co/daily-react/dist/components/DailyAudio";
import {
  ArrowLeft, ArrowRight, AudioLines, BriefcaseBusiness, Check, CircleStop, Headphones,
  LoaderCircle, MessageSquareText, Mic, MicOff, Play, RotateCcw, ShieldCheck, Square,
  Sparkles, UserRound, UsersRound, Video, Volume2,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useAudio } from "@/hooks/useAudio";
import { useWebSocket } from "@/hooks/useWebSocket";
import { API_URL, PLAYER_SAMPLE_RATE, WS_URL } from "@/lib/constants";
import { generateId } from "@/lib/utils";
import "./role-playing.css";

type Difficulty = "supportive" | "realistic" | "challenging";
type OpenAIVoice = "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | "marin" | "cedar";
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
interface TavusSessionStatus {
  status: string;
  actor_ready: boolean;
  shutdown_reason: string;
}
interface TavusFace {
  face_id: string;
  face_name: string;
  thumbnail_video_url: string;
  face_type: string;
  model_name: string;
  is_default: boolean;
}
interface TavusFaceList {
  faces: TavusFace[];
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
const OPENAI_VOICES: Array<{ value: OpenAIVoice; label: string }> = [
  { value: "alloy", label: "Alloy" },
  { value: "ash", label: "Ash" },
  { value: "ballad", label: "Ballad" },
  { value: "coral", label: "Coral" },
  { value: "echo", label: "Echo" },
  { value: "sage", label: "Sage" },
  { value: "shimmer", label: "Shimmer" },
  { value: "verse", label: "Verse" },
  { value: "marin", label: "Marin" },
  { value: "cedar", label: "Cedar" },
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
function faceErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return "The available Tavus faces could not be loaded.";
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
  const [sessionAuthToken, setSessionAuthToken] = useState("");
  const [faces, setFaces] = useState<TavusFace[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<OpenAIVoice>("coral");
  const [previewingVoice, setPreviewingVoice] = useState<OpenAIVoice | null>(null);
  const [facesLoading, setFacesLoading] = useState(true);
  const [facesError, setFacesError] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);
  const selectedFace = useMemo(
    () => faces.find((face) => face.face_id === selectedFaceId) ?? null,
    [faces, selectedFaceId],
  );
  const selectedVoiceLabel = OPENAI_VOICES.find((voice) => voice.value === selectedVoice)?.label ?? "Coral";
  const canContinue = useMemo(() => (
    step === 0 ? Boolean(brief.purpose)
      : step === 1 ? Boolean(brief.counterpartRole.trim()) && Boolean(selectedFaceId)
        : Boolean(brief.scenario.trim()) && Boolean(selectedFaceId)
  ), [brief, selectedFaceId, step]);

  const stopVoicePreview = useCallback(() => {
    const preview = voicePreviewRef.current;
    if (preview) {
      preview.pause();
      preview.currentTime = 0;
      preview.onended = null;
      preview.onerror = null;
    }
    voicePreviewRef.current = null;
    setPreviewingVoice(null);
  }, []);

  const previewVoice = useCallback(() => {
    if (previewingVoice === selectedVoice) {
      stopVoicePreview();
      return;
    }

    stopVoicePreview();
    const preview = new Audio(`/audio/roleplay-voices/${selectedVoice}.wav`);
    voicePreviewRef.current = preview;
    preview.onended = stopVoicePreview;
    preview.onerror = () => {
      stopVoicePreview();
      setError("The voice preview could not be played.");
    };
    setPreviewingVoice(selectedVoice);
    void preview.play().catch(() => {
      stopVoicePreview();
      setError("The voice preview could not be played.");
    });
  }, [previewingVoice, selectedVoice, stopVoicePreview]);

  const loadFaces = useCallback(async () => {
    setFacesLoading(true);
    setFacesError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired.");
      const response = await axios.get<TavusFaceList>(`${API_URL}/api/roleplay/faces`, {
        headers: { Authorization: token },
      });
      const availableFaces = Array.isArray(response.data.faces) ? response.data.faces : [];
      setFaces(availableFaces);
      setSelectedFaceId((current) => {
        if (availableFaces.some((face) => face.face_id === current)) return current;
        return (availableFaces.find((face) => face.is_default) ?? availableFaces[0])?.face_id ?? "";
      });
    } catch (requestError) {
      setFaces([]);
      setSelectedFaceId("");
      setFacesError(faceErrorMessage(requestError));
    } finally {
      setFacesLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadFaces();
  }, [loadFaces]);

  useEffect(() => stopVoicePreview, [stopVoicePreview]);

  const startSession = async () => {
    if (!canContinue || starting) return;
    stopVoicePreview();
    setStarting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired.");
      const response = await axios.post<TavusSession>(
        `${API_URL}/api/roleplay/sessions`,
        {
          conversation_name: `Ctrl+Teach · ${brief.counterpartRole}`.slice(0, 120),
          face_id: selectedFaceId,
        },
        { headers: { Authorization: token } },
      );
      setSessionAuthToken(token);
      setSession(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setStarting(false);
    }
  };

  if (session) {
    return (
      <LiveRoleplay
        authToken={sessionAuthToken}
        brief={brief}
        session={session}
        voice={selectedVoice}
        onEnded={() => {
          setSession(null);
          setSessionAuthToken("");
          setStep(0);
        }}
      />
    );
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
              <div className="rp-face-picker">
                <div className="rp-face-picker-heading">
                  <div><strong>Choose the actor and voice</strong><span>Tavus renders the face; OpenAI supplies the live voice.</span></div>
                  {!facesLoading && !facesError && <small>{faces.length} ready</small>}
                </div>
                {facesLoading ? (
                  <div className="rp-face-loading" aria-label="Loading Tavus faces">
                    <i /><div><span /><span /></div>
                  </div>
                ) : facesError ? (
                  <div className="rp-face-state" role="alert">
                    <UserRound size={18} />
                    <span>{facesError}</span>
                    <button type="button" onClick={() => void loadFaces()}><RotateCcw size={13} /> Retry</button>
                  </div>
                ) : faces.length === 0 ? (
                  <div className="rp-face-state">
                    <UserRound size={18} />
                    <span>No ready faces were found in this Tavus account.</span>
                  </div>
                ) : (
                  <div className="rp-face-selection">
                    <div className="rp-face-preview" aria-hidden="true">
                      <UserRound size={25} />
                      {selectedFace?.thumbnail_video_url && (
                        <video key={selectedFace.face_id} src={selectedFace.thumbnail_video_url}
                          muted playsInline preload="metadata"
                          onError={(event) => { event.currentTarget.hidden = true; }} />
                      )}
                    </div>
                    <div className="rp-actor-selectors">
                      <label className="rp-face-select">
                        <span>Video actor</span>
                        <select value={selectedFaceId} onChange={(event) => setSelectedFaceId(event.target.value)}>
                          {faces.map((face) => (
                            <option key={face.face_id} value={face.face_id}>
                              {face.face_name}{face.is_default ? " (Default)" : ""}
                            </option>
                          ))}
                        </select>
                        <small>{selectedFace?.model_name || "Tavus Phoenix face"}</small>
                      </label>
                      <div className="rp-face-select rp-voice-select">
                        <label htmlFor="rp-openai-voice"><AudioLines size={12} /> OpenAI voice</label>
                        <div className="rp-voice-control">
                          <select id="rp-openai-voice" value={selectedVoice}
                            onChange={(event) => {
                              stopVoicePreview();
                              setSelectedVoice(event.target.value as OpenAIVoice);
                            }}>
                            {OPENAI_VOICES.map((voice) => (
                              <option key={voice.value} value={voice.value}>{voice.label}</option>
                            ))}
                          </select>
                          <button type="button" className={previewingVoice === selectedVoice ? "rp-voice-preview playing" : "rp-voice-preview"}
                            onClick={previewVoice}
                            aria-label={previewingVoice === selectedVoice ? `Stop ${selectedVoiceLabel} preview` : `Preview ${selectedVoiceLabel} voice`}
                            title={previewingVoice === selectedVoice ? "Stop preview" : "Preview voice"}>
                            {previewingVoice === selectedVoice ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                          </button>
                        </div>
                        <small>Realtime audio through Tavus Echo</small>
                      </div>
                    </div>
                  </div>
                )}
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
              <div className="rp-ready-note"><Video size={18} /><div><strong>{brief.counterpartName || brief.counterpartRole} will use {selectedFace?.face_name || "your selected actor"} with the {selectedVoiceLabel} voice.</strong><span>OpenAI stays the brain and voice; Tavus renders the face.</span></div></div>
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

function LiveRoleplay(props: {
  authToken: string;
  brief: RoleplayBrief;
  session: TavusSession;
  voice: OpenAIVoice;
  onEnded: () => void;
}) {
  return (
    <DailyProvider
      audioSource={false}
      videoSource={false}
      startAudioOff
      startVideoOff
      showLocalVideo={false}
      subscribeToTracksAutomatically
      strictMode
      aboutClient={{ integration: "ctrl-teach-roleplay" }}
    >
      <LiveRoleplayCall {...props} />
    </DailyProvider>
  );
}

function LiveRoleplayCall({ authToken, brief, session, voice, onEnded }: {
  authToken: string;
  brief: RoleplayBrief;
  session: TavusSession;
  voice: OpenAIVoice;
  onEnded: () => void;
}) {
  const { user, getToken } = useAuth();
  const call = useDaily();
  const remoteParticipantIds = useParticipantIds({ filter: "remote" });
  const remoteParticipantId = remoteParticipantIds[0] ?? "";
  const [clientSessionId] = useState(() => `roleplay-${generateId()}`);
  const [faceReady, setFaceReady] = useState(false);
  const [dailyJoined, setDailyJoined] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [remoteVideoType, setRemoteVideoType] = useState<"video" | "rmpVideo">("video");
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const callRef = useRef<DailyCall | null>(null);
  const dailyAudioRef = useRef<DailyAudioHandle | null>(null);
  const authTokenRef = useRef(authToken);
  const faceReadyRef = useRef(false);
  const dailyJoinedRef = useRef(false);
  const tavusActorReadyRef = useRef(false);
  const joinStartedRef = useRef(false);
  const joinTimeoutRef = useRef<number | null>(null);
  const lastParticipantCountRef = useRef(-1);
  const inferenceIdRef = useRef<string | null>(null);
  const wsConnectStartedRef = useRef(false);
  const briefSentRef = useRef(false);
  const closedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const {
    status, messages, realtimeReady, isAssistantTurnActive, connect, disconnect,
    sendAudio, sendRoleplayStart,
  } = useWebSocket();
  const { startRecording, stopRecording, cleanup: cleanupAudio } = useAudio();

  const reportClientEvent = useCallback((stage: string, detail = "", participantCount = 0) => {
    console.info("[Roleplay]", stage, { conversationId: session.conversation_id, detail, participantCount });
    void getToken().then((token) => {
      if (!token) return;
      return fetch(
        `${API_URL}/api/roleplay/sessions/${encodeURIComponent(session.conversation_id)}/events`,
        {
          method: "POST",
          headers: { Authorization: token, "Content-Type": "application/json" },
          body: JSON.stringify({ stage, detail, participant_count: participantCount }),
        },
      );
    }).catch((eventError) => {
      console.warn("Roleplay diagnostics could not be recorded", eventError);
    });
  }, [getToken, session.conversation_id]);

  const confirmActorReady = useCallback((source: string, participantCount = 0) => {
    tavusActorReadyRef.current = true;
    if (faceReadyRef.current) return;
    faceReadyRef.current = true;
    setFaceReady(true);
    reportClientEvent("actor_ready", source, participantCount);
  }, [reportClientEvent]);

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

  const getParticipantCount = useCallback(() => {
    const currentCall = callRef.current;
    if (!currentCall || currentCall.isDestroyed()) return 0;
    return Object.keys(currentCall.participants()).length;
  }, []);

  const markDailyRoomJoined = useCallback((source: string) => {
    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    const participantCount = getParticipantCount();
    if (!dailyJoinedRef.current) {
      dailyJoinedRef.current = true;
      setDailyJoined(true);
      reportClientEvent("daily_room_joined", source, participantCount);
    }
    if (tavusActorReadyRef.current && participantCount > 1) {
      confirmActorReady("tavus-api-event", participantCount);
    }
  }, [confirmActorReady, getParticipantCount, reportClientEvent]);

  const inspectParticipants = useCallback((source: string) => {
    const currentCall = callRef.current;
    if (!currentCall || currentCall.isDestroyed()) return;
    const participants = Object.values(currentCall.participants());
    const hasRemoteParticipant = participants.some((participant) => !participant.local);
    if (source !== "participant-updated" || participants.length !== lastParticipantCountRef.current) {
      lastParticipantCountRef.current = participants.length;
      reportClientEvent(
        `daily_${source.replaceAll("-", "_")}`,
        hasRemoteParticipant ? "remote Tavus participant detected" : "no remote participant yet",
        participants.length,
      );
    }
    if (hasRemoteParticipant) confirmActorReady(source, participants.length);
  }, [confirmActorReady, reportClientEvent]);

  useEffect(() => { faceReadyRef.current = faceReady; }, [faceReady]);
  useEffect(() => { authTokenRef.current = authToken; }, [authToken]);
  useEffect(() => {
    if (call && !call.isDestroyed()) callRef.current = call;
  }, [call]);
  useEffect(() => {
    if (!remoteParticipantId || !dailyJoined) return;
    confirmActorReady("daily-react-remote-participant", getParticipantCount());
  }, [confirmActorReady, dailyJoined, getParticipantCount, remoteParticipantId]);
  useEffect(() => { setVideoPlaying(false); }, [remoteParticipantId]);

  useEffect(() => {
    if (faceReady) return;
    let cancelled = false;
    let timer: number | undefined;

    const pollTavusStatus = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const response = await axios.get<TavusSessionStatus>(
          `${API_URL}/api/roleplay/sessions/${encodeURIComponent(session.conversation_id)}`,
          { headers: { Authorization: token } },
        );
        if (cancelled) return;
        if (response.data.actor_ready) {
          tavusActorReadyRef.current = true;
          const participantCount = getParticipantCount();
          if (dailyJoinedRef.current && participantCount > 1) {
            confirmActorReady("tavus-api-event", participantCount);
            return;
          }
        }
        if (response.data.status === "ended") {
          const reason = response.data.shutdown_reason || "the Tavus room ended before the actor connected";
          reportClientEvent("tavus_shutdown", reason);
          setSessionError(`Tavus ended the video room: ${reason}.`);
          return;
        }
      } catch (statusError) {
        console.warn("Tavus readiness status could not be read", statusError);
      }
      if (!cancelled) timer = window.setTimeout(pollTavusStatus, 1_500);
    };

    timer = window.setTimeout(pollTavusStatus, 750);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [confirmActorReady, faceReady, getParticipantCount, getToken, reportClientEvent, session.conversation_id]);

  useEffect(() => {
    if (faceReady || !dailyJoined) return;
    const timer = window.setTimeout(() => {
      const participantCount = getParticipantCount();
      const detail = "The video room connected, but no remote Tavus participant appeared";
      reportClientEvent("actor_join_timeout", detail, participantCount);
      setSessionError(`${detail}. End this session and try another face.`);
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [dailyJoined, faceReady, getParticipantCount, reportClientEvent]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleDailyLoading = useCallback(() => {
    reportClientEvent("daily_call_object_loading");
  }, [reportClientEvent]);
  const handleDailyLoaded = useCallback(() => {
    reportClientEvent("daily_call_object_loaded");
  }, [reportClientEvent]);
  const handleDailyJoining = useCallback(() => {
    reportClientEvent("daily_joining_meeting", callRef.current?.meetingState() ?? "unknown");
  }, [reportClientEvent]);
  const handleDailyJoined = useCallback(() => {
    markDailyRoomJoined("joined-meeting");
    inspectParticipants("joined-meeting");
  }, [inspectParticipants, markDailyRoomJoined]);
  const handleParticipantJoined = useCallback(() => {
    inspectParticipants("participant-joined");
  }, [inspectParticipants]);
  const handleParticipantUpdated = useCallback(() => {
    inspectParticipants("participant-updated");
  }, [inspectParticipants]);
  const handleTrackStarted = useCallback((event: {
    participant: { local: boolean } | null;
    type: string;
  }) => {
    if (!event.participant || event.participant.local) return;
    reportClientEvent("daily_remote_track_started", event.type, getParticipantCount());
    if (event.type === "video" || event.type === "rmpVideo") {
      setRemoteVideoType(event.type);
      confirmActorReady(`track-started:${event.type}`, getParticipantCount());
    }
  }, [confirmActorReady, getParticipantCount, reportClientEvent]);
  const handleAppMessage = useCallback((event: { data?: unknown }) => {
    const payload = event.data as {
      event_type?: string;
      properties?: { reason?: string; shutdown_reason?: string };
    } | undefined;
    const eventType = payload?.event_type ?? "";
    if (eventType.startsWith("system.")) {
      reportClientEvent("daily_app_message", eventType, getParticipantCount());
    }
    if (["system.pal_joined", "system.replica_joined"].includes(eventType)) {
      tavusActorReadyRef.current = true;
      confirmActorReady(eventType, getParticipantCount());
    } else if (eventType === "system.shutdown" && !closedRef.current) {
      const reason = payload?.properties?.shutdown_reason || payload?.properties?.reason || "unknown reason";
      reportClientEvent("tavus_shutdown", reason, getParticipantCount());
      setSessionError(`Tavus ended the video room: ${reason}.`);
    }
  }, [confirmActorReady, getParticipantCount, reportClientEvent]);
  const handleDailyError = useCallback((event: { errorMsg: string }) => {
    const detail = event.errorMsg || "Unknown Daily call error";
    reportClientEvent("daily_error", detail, getParticipantCount());
    if (!closedRef.current) setSessionError(`Daily could not maintain the video room: ${detail}`);
  }, [getParticipantCount, reportClientEvent]);
  const handleDailyNonfatalError = useCallback((event: { type: string; errorMsg: string }) => {
    reportClientEvent("daily_nonfatal_error", `${event.type}: ${event.errorMsg}`, getParticipantCount());
  }, [getParticipantCount, reportClientEvent]);
  const handleCameraError = useCallback((event: {
    error?: { type?: string; msg?: string };
    errorMsg?: { errorMsg?: string };
  }) => {
    const detail = event.error?.msg || event.errorMsg?.errorMsg || event.error?.type || "local device error";
    reportClientEvent("daily_local_device_notice", detail, getParticipantCount());
  }, [getParticipantCount, reportClientEvent]);
  const handleLeftMeeting = useCallback(() => {
    if (!closedRef.current && dailyJoinedRef.current) {
      reportClientEvent("daily_left_meeting", "Daily left before the roleplay ended", getParticipantCount());
      setSessionError("The video room disconnected. Start a new scene to reconnect.");
    }
  }, [getParticipantCount, reportClientEvent]);

  useDailyEvent("loading", handleDailyLoading);
  useDailyEvent("loaded", handleDailyLoaded);
  useDailyEvent("joining-meeting", handleDailyJoining);
  useDailyEvent("joined-meeting", handleDailyJoined);
  useDailyEvent("participant-joined", handleParticipantJoined);
  useDailyEvent("participant-updated", handleParticipantUpdated);
  useDailyEvent("track-started", handleTrackStarted);
  useDailyEvent("app-message", handleAppMessage);
  useDailyEvent("error", handleDailyError);
  useDailyEvent("nonfatal-error", handleDailyNonfatalError);
  useDailyEvent("camera-error", handleCameraError);
  useDailyEvent("left-meeting", handleLeftMeeting);

  useEffect(() => {
    if (!call || call.isDestroyed() || joinStartedRef.current) return;
    joinStartedRef.current = true;
    callRef.current = call;
    reportClientEvent("daily_call_object_created", "local audio and video inputs disabled");
    reportClientEvent("daily_join_started", call.meetingState());

    joinTimeoutRef.current = window.setTimeout(() => {
      if (closedRef.current || dailyJoinedRef.current) return;
      const state = call.meetingState();
      const detail = `Daily call-object timed out while ${state}`;
      reportClientEvent("daily_join_timeout", detail, getParticipantCount());
      setSessionError(`The secure video room could not connect (state: ${state}). Start a new scene to retry.`);
      void call.leave().catch(() => undefined);
    }, 25_000);

    void call.join({
      url: session.conversation_url,
      token: session.meeting_token,
      userName: user?.displayName || "Learner",
      audioSource: false,
      videoSource: false,
      startAudioOff: true,
      startVideoOff: true,
    }).then(() => {
      if (closedRef.current) return;
      markDailyRoomJoined("join-resolved");
      inspectParticipants("join-resolved");
    }).catch((error: unknown) => {
      if (joinTimeoutRef.current !== null) {
        window.clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Could not join Tavus room", error);
      reportClientEvent("daily_join_error", detail, getParticipantCount());
      if (!closedRef.current) setSessionError(`Daily could not join the secure video room: ${detail}`);
    });
    // Teardown is intentionally handled by the final lifecycle effect below.
    // React Strict Mode probes this effect with an immediate cleanup; leaving
    // here would destroy the call while join() is still in flight.
  }, [call, getParticipantCount, inspectParticipants, markDailyRoomJoined, reportClientEvent, session.conversation_url, session.meeting_token, user?.displayName]);

  useEffect(() => {
    if (!faceReady || !user || wsConnectStartedRef.current) return;
    wsConnectStartedRef.current = true;
    void (async () => {
      const token = await getToken();
      if (!token) {
        setSessionError("Your Ctrl+Teach session expired. Please sign in again.");
        return;
      }
      const query = new URLSearchParams({ mode: "roleplay", voice });
      connect(`${WS_URL}/ws/${user.uid}/${clientSessionId}?${query.toString()}`, {
        authToken: token,
        onAudio: sendAudioToFace,
        onInterrupt: interruptFace,
        onPlaybackComplete: finishFaceTurn,
        onError: setSessionError,
        halfDuplexAudio: false,
      });
    })();
  }, [clientSessionId, connect, faceReady, finishFaceTurn, getToken, interruptFace, sendAudioToFace, user, voice]);

  useEffect(() => {
    if (!faceReady || !realtimeReady || briefSentRef.current) return;
    briefSentRef.current = true;
    sendRoleplayStart(buildRoleplayInstruction(brief));
    startRecording((pcm) => sendAudio(pcm))
      .then(() => setMicOn(true))
      .catch(() => setSessionError("Microphone access is required for a live roleplay."));
  }, [brief, faceReady, realtimeReady, sendAudio, sendRoleplayStart, startRecording]);

  const requestConversationEnd = useCallback((token: string, keepalive: boolean) => {
    if (!token) return Promise.resolve();
    return fetch(
      `${API_URL}/api/roleplay/sessions/${encodeURIComponent(session.conversation_id)}`,
      {
        method: "DELETE",
        headers: { Authorization: token },
        keepalive,
      },
    ).then(() => undefined);
  }, [session.conversation_id]);

  const queueEmergencyConversationEnd = useCallback((token: string) => {
    if (!token) return;
    const url = `${API_URL}/api/roleplay/sessions/${encodeURIComponent(session.conversation_id)}/end-beacon`;
    const body = new URLSearchParams({ token });
    if (navigator.sendBeacon(url, body)) return;
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
    }).catch((error) => {
      console.warn("Emergency roleplay cleanup was not queued", error);
    });
  }, [session.conversation_id]);

  const shutdown = useCallback(async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    stopRecording();
    setMicOn(false);
    interruptFace();
    disconnect();
    cleanupAudio();
    const token = authTokenRef.current || await getToken() || "";
    authTokenRef.current = token;
    const endRequest = requestConversationEnd(token, true).catch((error) => {
      console.warn("Roleplay session cleanup was not acknowledged", error);
    });
    const call = callRef.current;
    callRef.current = null;
    if (call) {
      await call.leave().catch(() => undefined);
      await call.destroy().catch(() => undefined);
    }
    await endRequest;
  }, [cleanupAudio, disconnect, getToken, interruptFace, requestConversationEnd, stopRecording]);

  const emergencyShutdown = useCallback((reason: "beforeunload" | "pagehide") => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    stopRecording();
    disconnect();
    cleanupAudio();

    const currentCall = callRef.current;
    callRef.current = null;
    if (currentCall && !currentCall.isDestroyed()) {
      void currentCall.leave()
        .catch(() => undefined)
        .finally(() => currentCall.destroy().catch(() => undefined));
    }

    const token = authTokenRef.current;
    queueEmergencyConversationEnd(token);
    console.info("[Roleplay] emergency_shutdown", {
      conversationId: session.conversation_id,
      reason,
    });
  }, [cleanupAudio, disconnect, queueEmergencyConversationEnd, session.conversation_id, stopRecording]);

  useEffect(() => {
    const handleBeforeUnload = () => emergencyShutdown("beforeunload");
    const handlePageHide = () => emergencyShutdown("pagehide");
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && closedRef.current) onEnded();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [emergencyShutdown, onEnded]);

  const shutdownRef = useRef(shutdown);
  useEffect(() => { shutdownRef.current = shutdown; }, [shutdown]);
  useEffect(() => {
    const lifecycle = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycle;
    return () => {
      window.queueMicrotask(() => {
        if (lifecycleRef.current === lifecycle) void shutdownRef.current();
      });
    };
  }, []);

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
  const enableSound = async () => {
    const audioElements = dailyAudioRef.current?.getAllAudio() ?? [];
    try {
      await Promise.all(audioElements.map((element) => element.play()));
      setSoundBlocked(false);
      reportClientEvent("daily_audio_enabled", "remote audio playback resumed", getParticipantCount());
    } catch (playbackError) {
      const detail = playbackError instanceof Error ? playbackError.message : String(playbackError);
      reportClientEvent("daily_audio_play_failed", detail, getParticipantCount());
      setSessionError("Your browser blocked the actor's audio. Allow autoplay, then enable sound again.");
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
          <div><strong>{brief.counterpartName || brief.counterpartRole}</strong><span>{brief.counterpartRole} · {brief.difficulty} mode · {voice} voice</span></div>
        </div>
        <div className="rp-live-status"><span>{statusLabel}</span><time>{formatElapsed(elapsed)}</time></div>
        <button type="button" className="rp-end-call" disabled={ending} onClick={() => void endConversation()}>
          {ending ? <LoaderCircle className="rp-spin" size={15} /> : <CircleStop size={15} />}{ending ? "Closing" : "End conversation"}
        </button>
      </header>

      <section className="rp-live-layout">
        <div className="rp-video-stage">
          {remoteParticipantId && (
            <DailyVideo
              key={`${remoteParticipantId}:${remoteVideoType}`}
              className="rp-remote-video"
              sessionId={remoteParticipantId}
              type={remoteVideoType}
              fit="cover"
              autoPlay
              muted
              playsInline
              onPlaying={() => {
                if (videoPlaying) return;
                setVideoPlaying(true);
                reportClientEvent("daily_video_playing", remoteVideoType, getParticipantCount());
              }}
            />
          )}
          <DailyAudio
            ref={dailyAudioRef}
            onPlayFailed={(playbackError) => {
              setSoundBlocked(true);
              reportClientEvent("daily_audio_blocked", playbackError.message, getParticipantCount());
            }}
          />
          {(!faceReady || !videoPlaying) && (
            <div className="rp-video-loading"><div className="rp-face-orbit"><UserRound size={30} /><i /></div>
              <strong>{sessionError ? "The actor could not join" : "Preparing a human presence"}</strong>
              <span>{sessionError
                ? "End this session and try another face."
                : faceReady ? "The actor connected. Starting the video stream."
                  : dailyJoined ? "Video room connected. Waiting for the Tavus actor." : "Joining the secure video room."}</span>
            </div>
          )}
          {faceReady && !realtimeReady && <div className="rp-connection-pill"><LoaderCircle className="rp-spin" size={13} /> Connecting Tars</div>}
          {soundBlocked && (
            <button type="button" className="rp-enable-sound" onClick={() => void enableSound()}>
              <Volume2 size={14} /> Enable sound
            </button>
          )}
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
