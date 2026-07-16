"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  Mic,
  MicOff,
  Play,
  Square,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import TranscriptPanel from "@/components/TranscriptPanel";
import type { WhiteboardCanvasRef } from "@/components/WhiteboardCanvas";
import { useAudio } from "@/hooks/useAudio";
import { useWebSocket } from "@/hooks/useWebSocket";
import { API_URL, WS_URL } from "@/lib/constants";
import { dispatchBoardTarsDraw } from "@/lib/tarsBoardBridge";
import { assetUrl, type GeneratedCourseJob } from "@/lib/generatedCourses";
import { useLearner } from "@/lib/learner";
import type { Course, GeneratedImageAsset, Lesson, Module } from "@/lib/types";
import type { CanvasCommand } from "@/types/whiteboard";
import { base64ToArrayBuffer, generateId } from "@/lib/utils";

import "../rich-course.css";
import "../../../board/board.css";
import "./classroom.css";

const WhiteboardCanvas = dynamic(
  () => import("@/components/WhiteboardCanvas"),
  { ssr: false },
);

type LessonEntry = { lesson: Lesson; module: Module; index: number };
type ClassroomQuiz = {
  id: string;
  question: string;
  choices: string[];
  selected?: string;
  answered?: boolean;
  correct?: boolean;
};

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function lessonImage(lesson: Lesson): GeneratedImageAsset | null {
  const image = lesson.contentBlocks?.find((block) => block.type === "image");
  return image?.type === "image" ? image.asset : null;
}

function wrapBoardText(text: string, maxCharacters: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

async function presentationCommand(lesson: Lesson, module: Module): Promise<CanvasCommand> {
  const image = lessonImage(lesson);
  const moduleTitle = wrapBoardText(module.title.toUpperCase(), 64);
  const lessonTitle = wrapBoardText(lesson.title, 42);
  const moduleLineCount = moduleTitle.split("\n").length;
  const lessonLineCount = lessonTitle.split("\n").length;
  const lessonY = 52 + moduleLineCount * 24 + 12;
  const contentY = lessonY + lessonLineCount * 44 + 28;
  const elements: CanvasCommand["elements"] = [
    {
      type: "text",
      x: 70,
      y: 52,
      text: moduleTitle,
      fontSize: 16,
      strokeColor: "#b27a43",
    },
    {
      type: "text",
      x: 70,
      y: lessonY,
      text: lessonTitle,
      fontSize: 30,
      strokeColor: "#252522",
    },
  ];
  const files: NonNullable<CanvasCommand["files"]> = {};

  if (image?.url) {
    try {
      const response = await fetch(assetUrl(image.url));
      if (!response.ok) throw new Error(`Image request failed (${response.status})`);
      const blob = await response.blob();
      const fileId = `course-visual-${image.id}`;
      const maxWidth = 720;
      const maxHeight = 500;
      const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1.5;
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      files[fileId] = {
        id: fileId,
        dataURL: await readAsDataUrl(blob),
        mimeType: blob.type || image.contentType || "image/webp",
        created: Date.now(),
      };
      elements.push({ type: "image", x: 70, y: contentY, width, height, fileId, status: "saved" });
      elements.push({
        type: "text",
        x: 70,
        y: contentY + height + 22,
        text: wrapBoardText(image.caption, 76),
        fontSize: 15,
        strokeColor: "#66645f",
      });
    } catch {
      // The lesson remains teachable; the tutor can draw a visual on demand.
    }
  } else {
    elements.push({
      type: "text",
      x: 70,
      y: contentY,
      text: wrapBoardText(lesson.summary, 58),
      fontSize: 20,
      strokeColor: "#565550",
    });
  }

  return { tool: "course_lesson_visual", action: "replace", elements, files };
}

export default function LiveClassroomPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { addCourse, setActiveCourse, isLessonComplete } = useLearner();
  const [course, setCourse] = useState<Course | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await axios.get<GeneratedCourseJob>(
          `${API_URL}/api/generated-courses/${params.courseId}`,
          { headers: token ? { Authorization: token } : undefined },
        );
        if (response.data.status !== "ready" || !response.data.course) {
          router.replace(`/discover?generation=${params.courseId}`);
          return;
        }
        if (cancelled) return;
        const nextCourse = response.data.course;
        const lessons = nextCourse.modules.flatMap((module) => module.lessons);
        const requestedLessonId = new URLSearchParams(window.location.search).get("lesson");
        const nextLesson = lessons.find((lesson) => lesson.id === requestedLessonId)
          ?? lessons.find((lesson) => !isLessonComplete(nextCourse.id, lesson.id))
          ?? lessons[0];
        setCourse(nextCourse);
        setSelectedId(nextLesson?.id ?? "");
        addCourse(nextCourse);
        if (nextLesson) setActiveCourse(nextCourse.id, nextLesson.id);
      } catch (loadError) {
        if (!cancelled) {
          setError(axios.isAxiosError(loadError)
            ? String(loadError.response?.data?.detail || "Live Classroom could not be loaded.")
            : "Live Classroom could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Course id is the request boundary. LearnerProvider recreates action
    // functions after state writes, which must not cancel an in-flight load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.courseId]);

  const entries = useMemo<LessonEntry[]>(() => {
    if (!course) return [];
    let index = 0;
    return course.modules.flatMap((module) => module.lessons.map((lesson) => ({
      lesson,
      module,
      index: index++,
    })));
  }, [course]);
  const selected = entries.find((entry) => entry.lesson.id === selectedId) ?? entries[0];

  if (loading) return <div className="rich-load"><Loader2 className="rich-spin" size={24} /> Preparing Live Classroom…</div>;
  if (error || !course || !selected) return <div className="rich-load rich-load-error"><CircleAlert size={22} /> {error || "No lesson is available."}</div>;

  return (
    <main className="live-classroom-shell">
      <aside className="classroom-path">
        <div className="classroom-course-title">
          <span>{course.difficulty} · {course.duration}</span>
          <strong>{course.title}</strong>
        </div>
        <nav aria-label="Live Classroom lessons">
          {course.modules.map((module, moduleIndex) => (
            <section key={module.id}>
              <span>
                {String(moduleIndex + 1).padStart(2, "0")} / {module.title}
                {module.lessons.every((lesson) => isLessonComplete(course.id, lesson.id)) && <Check size={10} />}
              </span>
              {module.lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  className={lesson.id === selected.lesson.id ? "active" : ""}
                  onClick={() => setSelectedId(lesson.id)}
                >
                  <i>{isLessonComplete(course.id, lesson.id) ? <Check size={10} /> : null}</i>
                  <b>{lesson.title}</b>
                  <small>{lesson.duration}</small>
                </button>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <ClassroomSession
        key={selected.lesson.id}
        course={course}
        entry={selected}
        entries={entries}
        onSelect={setSelectedId}
      />
    </main>
  );
}

function ClassroomSession({
  course,
  entry,
  entries,
  onSelect,
}: {
  course: Course;
  entry: LessonEntry;
  entries: LessonEntry[];
  onSelect: (lessonId: string) => void;
}) {
  const { user, getToken } = useAuth();
  const { completeLesson, isLessonComplete, setActiveLesson } = useLearner();
  const [sessionId] = useState(() => `classroom-${generateId()}`);
  const [presentation, setPresentation] = useState<CanvasCommand[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedNow, setCompletedNow] = useState(false);
  const [activeSection, setActiveSection] = useState<{ number: number; title: string } | null>(null);
  const [quizProgress, setQuizProgress] = useState<{ answered: number; total: number } | null>(null);
  const [visibleQuiz, setVisibleQuiz] = useState<ClassroomQuiz | null>(null);
  const canvasRef = useRef<WhiteboardCanvasRef>(null);
  const lastSnapshotRef = useRef<{
    imageWidth: number;
    imageHeight: number;
    viewWidth: number;
    viewHeight: number;
    generatedImageBounds: {
      fileId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
  } | null>(null);
  const bridgedDrawsRef = useRef(new Set<string>());
  const startedRef = useRef(false);
  const snapshotTimerRef = useRef<number | null>(null);

  const {
    status,
    messages,
    canvasCommands,
    tarsPoint,
    tarsAgentDraws,
    isGeneratingImage,
    isSavingProgress,
    realtimeReady,
    isAssistantTurnActive,
    isVisualSyncing,
    connect,
    disconnect,
    sendText,
    sendClassroomStart,
    sendAudio,
    sendCanvasSnapshot,
    acknowledgeVisualSync,
  } = useWebSocket();
  const {
    isPlaying,
    startRecording,
    stopRecording,
    initPlayer,
    playAudioChunk,
    waitForPlaybackComplete,
    clearPlayback,
    cleanup,
  } = useAudio();
  const [tarsPointTarget, setTarsPointTarget] = useState<{ x: number; y: number; label?: string; id: string } | null>(null);

  const combinedCommands = useMemo(
    () => [...presentation, ...canvasCommands],
    [canvasCommands, presentation],
  );
  const lessonPosition = entries.findIndex((item) => item.lesson.id === entry.lesson.id);
  const previous = lessonPosition > 0 ? entries[lessonPosition - 1] : null;
  const next = lessonPosition < entries.length - 1 ? entries[lessonPosition + 1] : null;
  const isComplete = completedNow || isLessonComplete(course.id, entry.lesson.id);

  useEffect(() => {
    let cancelled = false;
    presentationCommand(entry.lesson, entry.module).then((command) => {
      if (!cancelled) setPresentation([command]);
    });
    setActiveLesson(entry.lesson.id);
    return () => { cancelled = true; };
    // LearnerProvider recreates action functions after each state update; the
    // lesson id is the actual lifecycle boundary for this setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.lesson, entry.module]);

  const startClassroom = useCallback(async () => {
    if (!user || status !== "disconnected") return;
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again to start Live Classroom.");
      const query = new URLSearchParams({
        course_id: course.id,
        lesson_id: entry.lesson.id,
        mode: "classroom",
        classroom: "1",
      });
      connect(`${WS_URL}/ws/${user.uid}/${sessionId}?${query.toString()}`, {
        authToken: token,
        onAudio: playAudioChunk,
        onInterrupt: clearPlayback,
        onToolAudio: (encoded) => playAudioChunk(base64ToArrayBuffer(encoded)),
        waitForPlaybackComplete,
        halfDuplexAudio: true,
        onError: setError,
        onEvent: (event) => {
          if (
            event.type === "course_section_changed"
            && event.courseId === course.id
            && event.lessonId === entry.lesson.id
          ) {
            setActiveSection({
              number: Number(event.sectionNumber) || 1,
              title: String(event.sectionTitle || ""),
            });
            return;
          }
          if (
            event.type === "course_quiz_question"
            && event.courseId === course.id
            && event.lessonId === entry.lesson.id
          ) {
            const nextQuestion = event.question as Partial<ClassroomQuiz> | undefined;
            if (
              nextQuestion
              && typeof nextQuestion.id === "string"
              && typeof nextQuestion.question === "string"
              && Array.isArray(nextQuestion.choices)
            ) {
              setVisibleQuiz({
                id: nextQuestion.id,
                question: nextQuestion.question,
                choices: nextQuestion.choices.map(String),
              });
            }
            return;
          }
          if (
            event.type === "course_quiz_progress"
            && event.courseId === course.id
            && event.lessonId === entry.lesson.id
          ) {
            setQuizProgress({
              answered: Number(event.answered) || 0,
              total: Number(event.total) || 0,
            });
            setVisibleQuiz((current) => current ? {
              ...current,
              answered: true,
              correct: Boolean(event.correct),
            } : current);
            return;
          }
          if (event.type !== "course_lesson_completed") return;
          if (event.courseId !== course.id || event.lessonId !== entry.lesson.id) return;
          completeLesson(entry.lesson.id);
          setCompletedNow(true);
        },
      });
      initPlayer();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Live Classroom could not start.");
    }
  }, [clearPlayback, completeLesson, connect, course.id, entry.lesson.id, getToken, initPlayer, playAudioChunk, sessionId, status, user, waitForPlaybackComplete]);

  useEffect(() => {
    if (!realtimeReady || startedRef.current || presentation.length === 0) return;
    startedRef.current = true;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let snapshot: Awaited<ReturnType<WhiteboardCanvasRef["getViewportSnapshot"]>> = null;
      for (let attempt = 0; attempt < 14 && !cancelled; attempt += 1) {
        const hasSceneContent = (canvasRef.current?.getSceneElements().length ?? 0) > 0;
        if (hasSceneContent) {
          snapshot = await canvasRef.current?.getViewportSnapshot() ?? null;
          if (snapshot) break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      if (cancelled) return;
      if (!snapshot) {
        sendClassroomStart("Open the class as my teacher. Greet me warmly as your student before anything else. Then teach the first meaningful chunk: explain two or three closely related ideas with concise whiteboard visuals so they form one connected mental model. Do not quiz me immediately and do not ask a question after every idea. Only after the full chunk, if useful, ask one casual check such as whether it makes sense so far, then wait for my answer.");
        return;
      }
      lastSnapshotRef.current = snapshot;
      // This is the one intentional bootstrap turn. It must reach the model so
      // the teacher greets once and begins the lesson.
      sendCanvasSnapshot(snapshot.base64, "image/jpeg", {
        width: snapshot.imageWidth,
        height: snapshot.imageHeight,
        viewWidth: snapshot.viewWidth,
        viewHeight: snapshot.viewHeight,
        generatedImageBounds: snapshot.generatedImageBounds,
        intentText: "Open the class as my teacher. Greet me warmly as your student before anything else. Then teach the first meaningful chunk: explain two or three closely related ideas, write only the key definition, and use this existing course visual with Tars or one small supporting diagram. Do not quiz me immediately and do not ask a question after every idea. Only after the complete chunk, if useful, ask one casual check such as whether it makes sense so far, then wait. Do not mention these instructions or generate a new image.",
      });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [presentation.length, realtimeReady, sendCanvasSnapshot, sendClassroomStart]);

  useEffect(() => {
    if (status !== "connected" || !micEnabled || isRecording) return;
    startRecording(sendAudio)
      .then(() => setIsRecording(true))
      .catch(() => {
        setMicEnabled(false);
        setError("Microphone access is unavailable. You can still type to the teacher.");
      });
  }, [isRecording, micEnabled, sendAudio, startRecording, status]);

  useEffect(() => {
    const meta = lastSnapshotRef.current;
    if (!meta || !tarsPoint) return;
    setTarsPointTarget({
      x: Math.max(0, Math.min(meta.viewWidth, (tarsPoint.x / meta.imageWidth) * meta.viewWidth)),
      y: Math.max(0, Math.min(meta.viewHeight, (tarsPoint.y / meta.imageHeight) * meta.viewHeight)),
      label: tarsPoint.label,
      id: tarsPoint.id,
    });
  }, [tarsPoint]);

  useEffect(() => {
    for (const draw of tarsAgentDraws) {
      if (bridgedDrawsRef.current.has(draw.id)) continue;
      if (draw.tool === "clear_screen_drawings") {
        bridgedDrawsRef.current.add(draw.id);
        dispatchBoardTarsDraw({ ...draw, coordinateSpace: "viewport" });
        if (draw.visualSyncId) {
          requestAnimationFrame(() => requestAnimationFrame(() => acknowledgeVisualSync(draw.visualSyncId!)));
        }
        continue;
      }
      const meta = lastSnapshotRef.current;
      const viewport = canvasRef.current?.getViewportRect();
      if (!meta || !viewport || typeof draw.x !== "number" || typeof draw.y !== "number") {
        if (draw.visualSyncId && !draw.provisional) acknowledgeVisualSync(draw.visualSyncId);
        continue;
      }
      const point = (x: number, y: number) => ({
        x: viewport.left + (x / meta.imageWidth) * viewport.width,
        y: viewport.top + (y / meta.imageHeight) * viewport.height,
      });
      const start = point(draw.x, draw.y);
      const end = typeof draw.endX === "number" && typeof draw.endY === "number"
        ? point(draw.endX, draw.endY)
        : null;
      bridgedDrawsRef.current.add(draw.id);
      dispatchBoardTarsDraw({
        ...draw,
        x: start.x,
        y: start.y,
        endX: end?.x ?? null,
        endY: end?.y ?? null,
        coordinateSpace: "viewport",
      });
      if (draw.visualSyncId && !draw.provisional) {
        requestAnimationFrame(() => requestAnimationFrame(() => acknowledgeVisualSync(draw.visualSyncId!)));
      }
    }
  }, [acknowledgeVisualSync, tarsAgentDraws]);

  const syncCanvasSnapshot = useCallback(() => {
    if (!realtimeReady) return;
    if (snapshotTimerRef.current) window.clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = window.setTimeout(async () => {
      const snapshot = await canvasRef.current?.getViewportSnapshot() ?? null;
      if (!snapshot) return;
      lastSnapshotRef.current = snapshot;
      // Tool drawings can trigger many canvas-change events. These snapshots
      // update pointer grounding only; sending them as user turns makes the
      // Realtime model greet or repeat its waiting question again.
      sendCanvasSnapshot(snapshot.base64, "image/jpeg", {
        width: snapshot.imageWidth,
        height: snapshot.imageHeight,
        viewWidth: snapshot.viewWidth,
        viewHeight: snapshot.viewHeight,
        silent: true,
        generatedImageBounds: snapshot.generatedImageBounds,
      });
    }, 650);
  }, [realtimeReady, sendCanvasSnapshot]);

  useEffect(() => () => {
    if (snapshotTimerRef.current) window.clearTimeout(snapshotTimerRef.current);
    stopRecording();
    cleanup();
    disconnect();
  }, [cleanup, disconnect, stopRecording]);

  function toggleMic() {
    if (micEnabled) {
      setMicEnabled(false);
      stopRecording();
      setIsRecording(false);
      return;
    }
    setError(null);
    setMicEnabled(true);
  }

  function stopClassroom() {
    stopRecording();
    setIsRecording(false);
    cleanup();
    disconnect();
  }

  return (
    <section className="classroom-session">
      <div className="classroom-stage">
        <div className="classroom-stage-label">
          <span>{activeSection ? `Section ${activeSection.number} · ${activeSection.title}` : `Live Classroom · Lesson ${entry.index + 1}`}</span>
          <strong>{entry.lesson.title}</strong>
          {isComplete && <small><Check size={11} /> Lesson complete</small>}
        </div>
        {visibleQuiz && (
          <section className={`classroom-quiz-card ${visibleQuiz.answered ? (visibleQuiz.correct ? "correct" : "incorrect") : ""}`} aria-live="polite">
            <span>Knowledge check</span>
            <strong>{visibleQuiz.question}</strong>
            <div>
              {visibleQuiz.choices.map((choice, index) => (
                <button
                  type="button"
                  key={choice}
                  className={visibleQuiz.selected === choice ? "selected" : ""}
                  disabled={Boolean(visibleQuiz.selected || visibleQuiz.answered)}
                  onClick={() => {
                    setVisibleQuiz((current) => current ? { ...current, selected: choice } : current);
                    sendText(`My answer is: ${choice}`);
                  }}
                >
                  <i>{String.fromCharCode(65 + index)}</i>{choice}
                </button>
              ))}
            </div>
            {visibleQuiz.answered && <small>{visibleQuiz.correct ? "Correct — nice work." : "Let’s repair this idea together."}</small>}
          </section>
        )}
        <WhiteboardCanvas
          ref={canvasRef}
          canvasCommands={combinedCommands}
          onCanvasChange={syncCanvasSnapshot}
          onVisualSettled={acknowledgeVisualSync}
          isGeneratingImage={isGeneratingImage}
          isSavingProgress={isSavingProgress}
          tarsActive={status === "connected"}
          tarsPointTarget={tarsPointTarget}
        />

        <div className="classroom-controls">
          <span className={`classroom-status ${status}`}><i />{status === "connected" ? (isVisualSyncing ? "Preparing the visual" : isPlaying || isAssistantTurnActive ? "Teacher speaking" : "Teacher listening") : status === "connecting" ? "Connecting" : "Ready"}</span>
          {status === "disconnected" ? (
            <button type="button" className="classroom-start" onClick={startClassroom}><Play size={14} /> Start lesson</button>
          ) : (
            <>
              <button type="button" onClick={toggleMic} aria-pressed={!micEnabled}>
                {micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                {micEnabled ? (isAssistantTurnActive ? "Mic paused" : "Mic on") : "Mic off"}
              </button>
              <button type="button" onClick={stopClassroom}><Square size={13} /> End</button>
            </>
          )}
        </div>
        {error && <div className="classroom-error"><CircleAlert size={14} /> {error}</div>}
      </div>

      <aside className="classroom-transcript">
        <div className="classroom-progress-note">
          <span>{isComplete ? "Completed" : quizProgress ? `Knowledge check · ${quizProgress.answered}/${quizProgress.total}` : "How this lesson finishes"}</span>
          <p>{isComplete ? "The teacher completed the lesson after your knowledge check." : quizProgress ? "Answer each question—the score helps the teacher adapt, but does not block progress." : "The teacher will explain each section, ask the generated quiz, then mark this lesson complete."}</p>
        </div>
        <TranscriptPanel
          messages={messages}
          onSendText={sendText}
          userPhotoURL={user?.photoURL || undefined}
          showStreamingAgentMessages
        />
        <div className="classroom-lesson-nav">
          <button type="button" disabled={!previous} onClick={() => previous && onSelect(previous.lesson.id)}><ArrowLeft size={13} /> Previous</button>
          <button type="button" disabled={!next} onClick={() => next && onSelect(next.lesson.id)}>Next <ArrowRight size={13} /></button>
        </div>
      </aside>
    </section>
  );
}
