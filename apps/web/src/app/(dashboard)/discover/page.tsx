"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  FileText,
  FlaskConical,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useLearner } from "@/lib/learning/provider";
import { API_URL } from "@/lib/constants";
import {
  isGenerationActive,
  type GeneratedCourseJob,
  type IntakeQuestion,
} from "@/lib/courses/generated";

import "./discover.css";

type SourceMode = "prompt" | "curriculum";
type Phase = "source" | "interview" | "generating";
type Answer = string | string[];

const GENERATION_STAGES = [
  ["outlining", "Designing your course modules"],
  ["researching", "Researching authoritative sources"],
  ["generating", "Writing your course and interactions"],
  ["generating_images", "Creating original course artwork"],
  ["ready", "Preparing your course overview"],
] as const;

function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    return String(error.response?.data?.detail || fallback);
  }
  return fallback;
}

export default function CourseBuilder() {
  const router = useRouter();
  const pathname = usePathname();
  const { getToken } = useAuth();
  const { addCourse } = useLearner();
  const fileInput = useRef<HTMLInputElement>(null);
  const openingCourse = useRef(false);

  const [phase, setPhase] = useState<Phase>("source");
  const [sourceMode, setSourceMode] = useState<SourceMode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<GeneratedCourseJob | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions = job?.questions ?? [];
  const question = questions[questionIndex] ?? null;
  const adminContext = pathname.startsWith("/admin");
  const githubCourseIntent = /(^|\W)github(\W|$)/i.test(
    sourceMode === "prompt" ? prompt : `${curriculum} ${file?.name || ""}`,
  );

  const rememberJob = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("generation", id);
    else url.searchParams.delete("generation");
    window.history.replaceState({}, "", url);
  }, []);

  useEffect(() => {
    const suggestedPrompt = new URLSearchParams(window.location.search).get("prompt");
    if (!suggestedPrompt) return;
    setSourceMode("prompt");
    setPrompt(suggestedPrompt);
  }, []);

  const loadJob = useCallback(async (id: string) => {
    const token = await getToken();
    const response = await axios.get<GeneratedCourseJob>(
      `${API_URL}/api/generated-courses/${id}`,
      { headers: token ? { Authorization: token } : undefined }
    );
    const next = response.data;
    setJob(next);
    setAnswers(next.answers ?? {});
    setError(null);
    if (next.status === "intake") {
      const storedAnswers = next.answers ?? {};
      const nextQuestions = next.questions ?? [];
      const unansweredIndex = nextQuestions.findIndex((item) => {
        const value = storedAnswers[item.id];
        return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
      });
      setQuestionIndex(unansweredIndex >= 0 ? unansweredIndex : Math.max(0, nextQuestions.length - 1));
      setPhase("interview");
    }
    else if (next.status === "ready" && next.course) {
      // Remove the resume marker before updating global learner state. Updating
      // that state recreates the context callbacks and can re-run this page's
      // resume effect while the route transition is still in flight.
      if (openingCourse.current) return next;
      openingCourse.current = true;
      try {
        if (adminContext) {
          const token = await getToken();
          if (!token) throw new Error("Your admin session has expired.");
          const imported = await axios.post(
            `${API_URL}/api/admin/courses/import-generated/${next.id}`,
            {},
            { headers: { Authorization: token } },
          );
          window.dispatchEvent(new CustomEvent("ctrlteach:admin-course-imported", {
            detail: imported.data,
          }));
        } else {
          addCourse(next.course);
          router.replace(`/learn/${next.id}`);
        }
        rememberJob(null);
      } catch (completionError) {
        openingCourse.current = false;
        throw completionError;
      }
    } else setPhase("generating");
    return next;
  }, [addCourse, adminContext, getToken, rememberJob, router]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("generation");
    if (!id) return;
    setBusy(true);
    loadJob(id)
      .catch((loadError) => {
        if (openingCourse.current) return;
        setError(errorMessage(loadError, "That generation could not be resumed."));
      })
      .finally(() => setBusy(false));
  }, [loadJob, rememberJob]);

  useEffect(() => {
    if (!job || !isGenerationActive(job.status)) return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        await loadJob(job.id);
      } catch (pollError) {
        if (cancelled) return;
        setError(errorMessage(pollError, "Could not refresh generation progress."));
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 2500);
      }
    };
    timer = window.setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [job, loadJob]);

  async function beginIntake() {
    setError(null);
    const form = new FormData();
    if (sourceMode === "prompt") {
      if (prompt.trim().length < 8) {
        setError("Describe what you want to learn in a little more detail.");
        return;
      }
      form.append("prompt", prompt.trim());
    } else if (file) {
      form.append("curriculum_file", file);
    } else {
      if (curriculum.trim().length < 40) {
        setError("Paste a more complete curriculum or choose a file.");
        return;
      }
      form.append("curriculum_text", curriculum.trim());
    }

    setBusy(true);
    try {
      const token = await getToken();
      const response = await axios.post<GeneratedCourseJob>(
        `${API_URL}/api/generated-courses/intake`,
        form,
        { headers: token ? { Authorization: token } : undefined }
      );
      setJob(response.data);
      setAnswers(response.data.answers ?? {});
      setQuestionIndex(0);
      setPhase("interview");
      rememberJob(response.data.id);
    } catch (requestError) {
      setError(errorMessage(requestError, "The course interview could not be created."));
    } finally {
      setBusy(false);
    }
  }

  function setAnswer(id: string, value: Answer) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }

  function answerIsValid(item: IntakeQuestion | null): boolean {
    if (!item) return false;
    const value = answers[item.id];
    if (!item.required) return true;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value?.trim());
  }

  async function requestGeneration(targetJob: GeneratedCourseJob, targetAnswers: Record<string, Answer>) {
    const token = await getToken();
    const response = await axios.post<GeneratedCourseJob>(
      `${API_URL}/api/generated-courses/${targetJob.id}/generate`,
      { answers: targetAnswers },
      { headers: token ? { Authorization: token } : undefined }
    );
    setJob(response.data);
    setPhase("generating");
  }

  async function startGeneration() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      await requestGeneration(job, answers);
    } catch (requestError) {
      setError(errorMessage(requestError, "Course generation could not start."));
    } finally {
      setBusy(false);
    }
  }

  async function continueInterview() {
    if (!question || !answerIsValid(question)) return;
    const nextAnswers = { ...answers, [question.id]: answers[question.id] };
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await axios.post<GeneratedCourseJob>(
        `${API_URL}/api/generated-courses/${job?.id}/intake-answer`,
        { questionId: question.id, answer: nextAnswers[question.id] },
        { headers: token ? { Authorization: token } : undefined }
      );
      const nextJob = response.data;
      const persistedAnswers = nextJob.answers ?? nextAnswers;
      setJob(nextJob);
      setAnswers(persistedAnswers);
      if (nextJob.interviewComplete) {
        await requestGeneration(nextJob, persistedAnswers);
      } else {
        setQuestionIndex(Math.max(0, (nextJob.questions?.length ?? 1) - 1));
      }
    } catch (requestError) {
      setError(errorMessage(requestError, "The next interview question could not be prepared."));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhase("source");
    setJob(null);
    setAnswers({});
    setQuestionIndex(0);
    setError(null);
    rememberJob(null);
  }

  function openAvailableCourse() {
    if (!job?.partialCourse) return;
    openingCourse.current = true;
    addCourse(job.partialCourse);
    rememberJob(null);
    router.push(`/learn/${job.id}`);
  }

  if (phase === "generating" && job) {
    return (
      <GenerationView
        job={job}
        context={adminContext ? "admin" : "learner"}
        busy={busy}
        error={error}
        onRetry={startGeneration}
        onReset={reset}
        onOpenCourse={openAvailableCourse}
      />
    );
  }

  return (
    <div className="gen-page">
      <header className="gen-heading">
        <span className="gen-kicker">01 / Build your course</span>
        <h1>Tell us what you want to master<span>.</span></h1>
        <p>
          Start with a goal or bring your own curriculum. Ctrl+Teach will ask
          what matters, research the topic, and create the complete course.
        </p>
      </header>

      <AnimatePresence mode="wait">
        {phase === "source" ? (
          <motion.section
            key="source"
            className="gen-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="gen-source-tabs" role="tablist" aria-label="Course source">
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === "prompt"}
                className={sourceMode === "prompt" ? "active" : ""}
                onClick={() => { setSourceMode("prompt"); setError(null); }}
              >
                <Sparkles size={16} /> Learning prompt
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === "curriculum"}
                className={sourceMode === "curriculum" ? "active" : ""}
                onClick={() => { setSourceMode("curriculum"); setError(null); }}
              >
                <FileText size={16} /> My curriculum
              </button>
            </div>

            {sourceMode === "prompt" ? (
              <div className="gen-source-body">
                <label htmlFor="learning-prompt">What do you want to learn?</label>
                <textarea
                  id="learning-prompt"
                  rows={7}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: I want to understand distributed systems well enough to design a reliable event-driven architecture for a production SaaS product."
                  autoFocus
                />
                <small>Be specific about the outcome; the interview will resolve everything else.</small>
                {githubCourseIntent && (
                  <div className="gen-capability-note">
                    <FlaskConical size={16} />
                    <div>
                      <strong>Real-tool GitHub Lab included</strong>
                      <span>The finished course will include Tars-guided private repository creation in GitHub.</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="gen-source-body gen-curriculum-grid">
                <div>
                  <label htmlFor="curriculum-text">Paste curriculum or outline</label>
                  <textarea
                    id="curriculum-text"
                    rows={9}
                    value={curriculum}
                    disabled={Boolean(file)}
                    onChange={(event) => setCurriculum(event.target.value)}
                    placeholder="Paste a syllabus, table of contents, training outline, or study plan…"
                  />
                </div>
                <div className="gen-or"><span>or</span></div>
                <button
                  type="button"
                  className={`gen-upload ${file ? "has-file" : ""}`}
                  onClick={() => fileInput.current?.click()}
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  {file ? <Check size={22} /> : <Upload size={22} />}
                  <strong>{file ? file.name : "Choose curriculum file"}</strong>
                  <span>{file ? "Ready to analyze" : "PDF, DOCX, PPTX, TXT, or Markdown · max 20 MB"}</span>
                </button>
                {file && (
                  <button
                    className="gen-clear-file"
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    Use pasted text instead
                  </button>
                )}
                {githubCourseIntent && (
                  <div className="gen-capability-note">
                    <FlaskConical size={16} />
                    <div>
                      <strong>Real-tool GitHub Lab included</strong>
                      <span>The finished course will include Tars-guided private repository creation in GitHub.</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <div className="gen-error"><CircleAlert size={16} /> {error}</div>}

            <div className="gen-card-footer">
              <div><span>Next</span><p>A short, adaptive course interview</p></div>
              <button type="button" className="gen-primary" onClick={beginIntake} disabled={busy}>
                {busy ? <Loader2 className="gen-spin" size={16} /> : <ArrowRight size={16} />}
                {busy ? "Analyzing" : "Shape my course"}
              </button>
            </div>
          </motion.section>
        ) : question && job ? (
          <InterviewView
            key="interview"
            job={job}
            question={question}
            index={questionIndex}
            total={questions.length}
            answer={answers[question.id]}
            busy={busy}
            error={error}
            onAnswer={(value) => setAnswer(question.id, value)}
            onBack={() => questionIndex > 0 ? setQuestionIndex((index) => index - 1) : reset()}
            onContinue={() => { void continueInterview(); }}
            valid={answerIsValid(question)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function InterviewView({
  job,
  question,
  index,
  total,
  answer,
  busy,
  error,
  valid,
  onAnswer,
  onBack,
  onContinue,
}: {
  job: GeneratedCourseJob;
  question: IntakeQuestion;
  index: number;
  total: number;
  answer?: Answer;
  busy: boolean;
  error: string | null;
  valid: boolean;
  onAnswer: (answer: Answer) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const progress = Math.min(90, (index + 1) * 20);
  return (
    <motion.section
      className="gen-card gen-interview"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="gen-interview-context">
        <span>Designing</span>
        <strong>{job.topic}</strong>
        <p>{job.summary}</p>
      </div>
      <div className="gen-question-progress">
        <span>Question {index + 1} · adapts after every answer</span>
        <div><i style={{ width: `${progress}%` }} /></div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          className="gen-question"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
        >
          <h2>{question.prompt}</h2>
          {question.kind === "short_text" ? (
            <textarea
              rows={5}
              value={typeof answer === "string" ? answer : ""}
              onChange={(event) => onAnswer(event.target.value)}
              placeholder="Write your answer…"
              autoFocus
            />
          ) : (
            <div className="gen-options">
              {question.options.map((option) => {
                const selected = Array.isArray(answer) ? answer.includes(option) : answer === option;
                return (
                  <button
                    type="button"
                    key={option}
                    className={selected ? "selected" : ""}
                    onClick={() => {
                      if (question.kind === "multi_select") {
                        const current = Array.isArray(answer) ? answer : [];
                        onAnswer(selected ? current.filter((item) => item !== option) : [...current, option]);
                      } else onAnswer(option);
                    }}
                  >
                    <span>{selected && <Check size={14} />}</span>
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {error && <div className="gen-error"><CircleAlert size={16} /> {error}</div>}
      <div className="gen-interview-actions">
        <button type="button" className="gen-back" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <button type="button" className="gen-primary" onClick={onContinue} disabled={!valid || busy}>
          {busy ? <Loader2 className="gen-spin" size={16} /> : <ArrowRight size={16} />}
          {busy ? "Adapting" : "Continue"}
        </button>
      </div>
    </motion.section>
  );
}

function GenerationView({
  job,
  context,
  busy,
  error,
  onRetry,
  onReset,
  onOpenCourse,
}: {
  job: GeneratedCourseJob;
  context: "learner" | "admin";
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onReset: () => void;
  onOpenCourse: () => void;
}) {
  const percent = job.progress?.percent ?? 0;
  const activeStage = job.progress?.stage || job.status;
  const displayError = error || job.error;
  const partialModules = job.partialCourse?.modules || [];
  const completedLessonCount = partialModules.reduce(
    (total, module) => total + module.lessons.filter((lesson) => lesson.status !== "pending").length,
    0,
  );
  const totalLessonCount = job.partialCourse?.modules.reduce((total, module) => total + module.lessons.length, 0) || 0;
  const hasOutline = partialModules.length > 0;
  return (
    <div className={`gen-generation-page ${hasOutline ? "has-preview" : ""}`}>
      <motion.div className="gen-orbit" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
        <Sparkles size={25} />
      </motion.div>
      <span className="gen-kicker">Ctrl+Teach course generation</span>
      <h1>{job.status === "failed" ? "Generation paused" : "Building your course"}<span>.</span></h1>
      <p>{job.progress?.message || "Preparing your course"}</p>
      <strong className="gen-generation-topic">{job.topic}</strong>

      <div className="gen-total-progress"><i style={{ width: `${percent}%` }} /></div>
      <span className="gen-percent">{percent}%</span>

      <div className="gen-stage-list">
        {GENERATION_STAGES.map(([stage, label], index) => {
          const activeIndex = GENERATION_STAGES.findIndex(([value]) => value === activeStage);
          const complete = activeIndex > index || job.status === "ready";
          const active = activeIndex === index;
          return (
            <div key={stage} className={`${complete ? "complete" : ""} ${active ? "active" : ""}`}>
              <span>{complete ? <Check size={12} /> : index + 1}</span>
              <small>{label}</small>
            </div>
          );
        })}
      </div>

      {hasOutline && (
        <section className="gen-live-course" aria-live="polite">
          <header>
            <div>
              <span>Available while generation continues</span>
              <strong>{job.partialCourse?.title || job.topic}</strong>
            </div>
            <div className="gen-live-summary">
              <small>{completedLessonCount} of {totalLessonCount} lessons written</small>
              {context === "learner" && completedLessonCount > 0 && (
                <button type="button" onClick={onOpenCourse}>Start available lessons <ArrowRight size={14} /></button>
              )}
            </div>
          </header>
          <div className="gen-live-modules">
            {partialModules.map((module) => (
              <section key={module.id}>
                <h2>{module.title}</h2>
                <div>
                  {module.lessons.map((lesson) => {
                    const firstContent = lesson.contentBlocks?.find((block) => block.type === "content");
                    return (
                      <article key={lesson.id} className={lesson.status === "pending" ? "pending" : ""}>
                        <span>{lesson.status === "pending" ? "Generating" : lesson.duration || "Lesson ready"}</span>
                        <strong>{lesson.title}</strong>
                        <p>{firstContent?.paragraphs[0] || lesson.summary}</p>
                        <small>{lesson.status === "pending" ? "Content will appear here automatically" : `${lesson.contentBlocks?.length || 0} learning blocks ready`}</small>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}

      {displayError && <div className="gen-error"><CircleAlert size={16} /> {displayError}</div>}
      {job.status === "failed" && (
        <div className="gen-failure-actions">
          <button type="button" className="gen-back" onClick={onReset}>Start over</button>
          <button type="button" className="gen-primary" disabled={busy} onClick={onRetry}>
            {busy ? <Loader2 className="gen-spin" size={16} /> : <Sparkles size={16} />}
            Retry from last step
          </button>
        </div>
      )}
      <div className="gen-reassurance">
        <BookOpen size={14} />
        {context === "admin"
          ? "You can safely leave this page and resume from Manage courses."
          : "You can safely leave this page and resume from My Library."}
      </div>
    </div>
  );
}
