"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  BrainCircuit,
  Check,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
  MonitorCheck,
  RotateCcw,
  ShieldCheck,
  Target,
  ThumbsUp,
  TrendingUp,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { useTars } from "@/lib/tars/provider";
import { API_URL } from "@/lib/constants";
import type {
  BrowserLabAttempt,
  BrowserLabBlueprint,
  BrowserLabRecovery,
  BrowserLabStep,
} from "@/lib/types";
import type { CanvasCommand } from "@/types/whiteboard";

const WhiteboardCanvas = dynamic(() => import("@/components/realtime/WhiteboardCanvas"), { ssr: false });

type Props = {
  courseId: string;
  lessonId: string;
  browserLab: BrowserLabBlueprint;
  getToken: () => Promise<string | null>;
  onVerified: (attempt: BrowserLabAttempt) => void;
};

type BusyAction = "hydrate" | "launch" | "check" | "practice" | "retry" | null;

function extractAttempt(data: unknown): BrowserLabAttempt | null {
  if (!data || typeof data !== "object") return null;
  const maybe = data as { attempt?: BrowserLabAttempt };
  return maybe.attempt ?? (data as BrowserLabAttempt);
}

function postLabMessage(type: string, payload: Record<string, unknown>) {
  window.postMessage({ type, requestId: crypto.randomUUID(), ...payload }, window.location.origin);
}

function requestError(error: unknown, fallback: string): string {
  return axios.isAxiosError(error)
    ? String(error.response?.data?.detail || fallback)
    : fallback;
}

function assertionsComplete(
  step: BrowserLabStep,
  assertions: Record<string, boolean> | undefined,
  allComplete: boolean,
) {
  if (allComplete) return true;
  const ids = step.assertionIds ?? [];
  return ids.length > 0 && ids.every((id) => assertions?.[id] === true);
}

function retryPlan(plan: BrowserLabBlueprint, recovery: BrowserLabRecovery): BrowserLabBlueprint {
  const retryAssertionIds = recovery.failedStep.assertionIds?.length
    ? recovery.failedStep.assertionIds
    : recovery.missingAssertionIds;
  const retryIds = new Set(retryAssertionIds);
  const taskAssertions = plan.taskAssertions.filter((assertion) => retryIds.has(assertion.id));
  return {
    ...plan,
    objective: recovery.failedStep.instruction,
    steps: [recovery.failedStep],
    taskAssertions: taskAssertions.length ? taskAssertions : plan.taskAssertions,
  };
}

function microLessonCommands(recovery: BrowserLabRecovery): CanvasCommand[] {
  const lesson = recovery.microLesson;
  if (!lesson?.objective) return [];
  const beats = (lesson.beats ?? []).filter(Boolean).slice(0, 3);
  const visualElements = (lesson.visualElements ?? []).filter(Boolean).slice(0, 3);
  return [{
    tool: "browser_lab_recovery_micro_lesson",
    action: "replace",
    elements: [
      {
        type: "text",
        x: 40,
        y: 35,
        text: lesson.objective,
        fontSize: 25,
        strokeColor: "#20231e",
      },
      ...beats.map((beat, index) => ({
        type: "text",
        x: 56,
        y: 105 + index * 54,
        text: `${index + 1}. ${beat}`,
        fontSize: 17,
        strokeColor: "#3d4339",
      })),
      ...(visualElements.length ? [
        {
          type: "rectangle",
          x: 520,
          y: 45,
          width: 260,
          height: 170,
          strokeColor: "#79a925",
          backgroundColor: "#f4f8ec",
        },
        {
          type: "text",
          x: 545,
          y: 72,
          text: `Look for\n${visualElements.join("\n")}`,
          fontSize: 18,
          strokeColor: "#3d5b17",
        },
      ] : []),
    ],
  }];
}

export default function BrowserLabPanel({
  courseId,
  lessonId,
  browserLab,
  getToken,
  onVerified,
}: Props) {
  const { extensionAvailable } = useTars();
  const [attempt, setAttempt] = useState<BrowserLabAttempt | null>(null);
  const [busy, setBusy] = useState<BusyAction>("hydrate");
  const [error, setError] = useState<string | null>(null);
  const attemptIdRef = useRef("");
  const verifiedNotificationRef = useRef("");
  const stoppedRecoveryRef = useRef("");
  const cleanupReadyRef = useRef("");
  const refreshInFlightRef = useRef(false);
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  const acceptAttempt = useCallback((next: BrowserLabAttempt) => {
    attemptIdRef.current = next.id;
    setAttempt(next);
    if (next.status === "verified" && verifiedNotificationRef.current !== next.id) {
      verifiedNotificationRef.current = next.id;
      onVerifiedRef.current(next);
    }
  }, []);

  const headers = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: token } : undefined;
  }, [getToken]);

  const hydrate = useCallback(async (cancelled?: () => boolean) => {
    setBusy("hydrate");
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/browser-labs/${courseId}/${lessonId}/attempts`,
        {},
        { headers: await headers() },
      );
      const next = extractAttempt(response.data);
      if (!next) throw new Error("Browser lab attempt did not load.");
      if (!cancelled?.()) acceptAttempt(next);
      return next;
    } catch (hydrateError) {
      if (!cancelled?.()) setError(requestError(hydrateError, "Could not prepare this browser lab."));
      return null;
    } finally {
      if (!cancelled?.()) setBusy(null);
    }
  }, [acceptAttempt, courseId, headers, lessonId]);

  useEffect(() => {
    let cancelled = false;
    setAttempt(null);
    attemptIdRef.current = "";
    verifiedNotificationRef.current = "";
    stoppedRecoveryRef.current = "";
    cleanupReadyRef.current = "";
    void hydrate(() => cancelled);
    return () => { cancelled = true; };
  }, [hydrate]);

  const refresh = useCallback(async (attemptId: string) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const response = await axios.get(`${API_URL}/api/browser-labs/attempts/${attemptId}`, {
        headers: await headers(),
      });
      const next = extractAttempt(response.data);
      if (next && attemptIdRef.current === attemptId) acceptAttempt(next);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [acceptAttempt, headers]);

  useEffect(() => {
    if (!attempt?.id || attempt.status === "verified") return;
    const timer = window.setInterval(() => {
      void refresh(attempt.id).catch((refreshError) => {
        console.warn("[BrowserLab] refresh failed", refreshError);
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [attempt?.id, attempt?.status, refresh]);

  useEffect(() => {
    const recovery = attempt?.activeRecovery;
    if (!attempt?.id || recovery?.status !== "practicing") return;
    const stopKey = `${attempt.id}:${recovery.id}`;
    if (stoppedRecoveryRef.current === stopKey) return;
    stoppedRecoveryRef.current = stopKey;
    postLabMessage("CTRLTEACH_BROWSER_LAB_STOP", { attemptId: attempt.id });
  }, [attempt?.activeRecovery, attempt?.id]);

  useEffect(() => {
    if (!attempt?.id || attempt.status !== "needs_cleanup") return;
    if (cleanupReadyRef.current === attempt.id) return;
    cleanupReadyRef.current = attempt.id;
    postLabMessage("CTRLTEACH_BROWSER_LAB_CLEANUP_READY", { attemptId: attempt.id });
  }, [attempt?.id, attempt?.status]);

  useEffect(() => () => {
    if (attemptIdRef.current) {
      postLabMessage("CTRLTEACH_BROWSER_LAB_STOP", { attemptId: attemptIdRef.current });
    }
  }, []);

  const activePlan = attempt?.plan ?? browserLab;
  const recovery = attempt?.activeRecovery ?? null;
  const taskComplete = Boolean(attempt?.verification?.taskComplete);
  const cleanupComplete = Boolean(attempt?.verification?.cleanupComplete);
  const verified = attempt?.status === "verified";
  const evidenceCount = attempt?.evidenceCount ?? attempt?.verification?.evidenceCount ?? 0;
  const boardCommands = useMemo(
    () => recovery ? microLessonCommands(recovery) : [],
    [recovery],
  );
  const lastPractice = recovery?.practiceAttempts?.[recovery.practiceAttempts.length - 1];
  const postLabRemarks = useMemo(() => {
    if (!verified || !attempt) return null;
    const history = attempt.recoveryHistory ?? [];
    const recovered = history.filter((item) => item.status === "resolved" || item.finalOutcome === "resolved");
    const completedSteps = activePlan.steps.filter((step) => assertionsComplete(
      step,
      attempt.verification?.taskAssertions,
      taskComplete,
    )).length;
    const issues = history.length
      ? history.slice(-3).map((item) => `${item.misconception.title}: ${item.misconception.evidenceSummary}`)
      : ["No major task gaps were detected by backend verification."];
    const latestRecovery = history[history.length - 1];
    const improvement = latestRecovery?.microLesson?.objective
      || activePlan.successCriteria[activePlan.successCriteria.length - 1]
      || "Repeat the workflow once without prompts and explain why each step satisfies the evidence requirement.";
    return {
      good: `${completedSteps} of ${activePlan.steps.length} task steps and cleanup were verified from ${evidenceCount} evidence events.${recovered.length ? ` ${recovered.length} detected gap${recovered.length === 1 ? " was" : "s were"} successfully recovered.` : ""}`,
      issues,
      improvement,
    };
  }, [activePlan.steps, activePlan.successCriteria, attempt, evidenceCount, taskComplete, verified]);

  const launchPlan = useCallback((next: BrowserLabAttempt, plan: BrowserLabBlueprint) => {
    postLabMessage("CTRLTEACH_BROWSER_LAB_START", {
      attemptId: next.id,
      launchUrl: next.launchUrl,
      lab: plan,
    });
    if (next.status === "needs_cleanup") {
      window.setTimeout(() => {
        postLabMessage("CTRLTEACH_BROWSER_LAB_CLEANUP_READY", { attemptId: next.id });
      }, 350);
    }
  }, []);

  const openLab = useCallback(async () => {
    setBusy("launch");
    setError(null);
    try {
      const next = attempt ?? await hydrate();
      if (!next || next.status === "verified") return;
      launchPlan(next, next.plan);
    } finally {
      setBusy(null);
    }
  }, [attempt, hydrate, launchPlan]);

  const checkAttempt = useCallback(async () => {
    if (!attempt || attempt.status === "verified" || recovery) return;
    setBusy("check");
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/browser-labs/attempts/${attempt.id}/recovery`,
        {},
        { headers: await headers() },
      );
      const next = extractAttempt(response.data);
      if (!next) throw new Error("Recovery check did not return an attempt.");
      acceptAttempt(next);
    } catch (checkError) {
      setError(requestError(checkError, "Could not check this attempt."));
    } finally {
      setBusy(null);
    }
  }, [acceptAttempt, attempt, headers, recovery]);

  const submitPractice = useCallback(async (optionId: string) => {
    if (!attempt || !recovery || recovery.status !== "practicing") return;
    setBusy("practice");
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/browser-labs/attempts/${attempt.id}/recoveries/${recovery.id}/practice-attempts`,
        { clientAttemptId: crypto.randomUUID(), optionId },
        { headers: await headers() },
      );
      const next = extractAttempt(response.data);
      if (!next) throw new Error("Practice check did not return an attempt.");
      acceptAttempt(next);
    } catch (practiceError) {
      setError(requestError(practiceError, "Could not check that practice answer."));
    } finally {
      setBusy(null);
    }
  }, [acceptAttempt, attempt, headers, recovery]);

  const retryOriginal = useCallback(async () => {
    if (!attempt || !recovery || !["retry_ready", "retrying"].includes(recovery.status)) return;
    setBusy("retry");
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/browser-labs/attempts/${attempt.id}/recoveries/${recovery.id}/retry`,
        {},
        { headers: await headers() },
      );
      const next = extractAttempt(response.data);
      if (!next) throw new Error("Original retry did not start.");
      acceptAttempt(next);
      const retryRecovery = next.activeRecovery ?? recovery;
      launchPlan(next, retryPlan(next.plan, retryRecovery));
    } catch (retryError) {
      setError(requestError(retryError, "Could not start the original-step retry."));
    } finally {
      setBusy(null);
    }
  }, [acceptAttempt, attempt, headers, launchPlan, recovery]);

  const status = useMemo(() => {
    if (!attempt && busy === "hydrate") return "Preparing verified attempt";
    if (verified) return "Verified by backend";
    if (attempt?.status === "needs_cleanup") return "Cleanup evidence needed";
    if (recovery?.status === "practicing") return "Recovery practice";
    if (recovery?.status === "retry_ready") return "Ready to retry the original step";
    if (recovery?.status === "retrying") return "Original step retry in progress";
    if (attempt?.status === "recovering") return "Recovery is being prepared";
    if (attempt && evidenceCount === 0) return "Ready to start";
    if (attempt) return "Tars is collecting evidence";
    return "Unable to prepare attempt";
  }, [attempt, busy, evidenceCount, recovery?.status, verified]);

  const canCheck = Boolean(
    attempt
    && attempt.status === "running"
    && evidenceCount > 0
    && !recovery
    && !verified,
  );

  return (
    <section className="rich-browser-lab">
      <div className="rich-browser-lab-head">
        <span><MonitorCheck size={13} /> Browser lab</span>
        <h2>{activePlan.platform || activePlan.platformId}</h2>
        <p>{activePlan.objective}</p>
      </div>

      <div className="rich-browser-lab-status" aria-live="polite">
        <div>
          <strong>{status}</strong>
          <span>{evidenceCount} evidence events received</span>
        </div>
        <a href={activePlan.launchUrl} target="_blank" rel="noreferrer">
          Open URL <ExternalLink size={12} />
        </a>
      </div>

      {!!activePlan.prerequisites?.length && (
        <div className="rich-browser-lab-list">
          <span>Before you start</span>
          <ul>{activePlan.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      <div className="rich-browser-lab-list">
        <span>Task</span>
        <ol>
          {activePlan.steps.map((step) => {
            const done = assertionsComplete(
              step,
              attempt?.verification?.taskAssertions,
              taskComplete,
            );
            const failed = recovery?.failedStep.id === step.id;
            return (
              <li key={step.id} className={failed ? "needs-recovery" : ""}>
                {done ? <CheckCircle2 size={14} className="done" /> : <Check size={13} />}
                <div><strong>{step.instruction}</strong><small>{step.expectedEvidence}</small></div>
              </li>
            );
          })}
        </ol>
      </div>

      {recovery && (
        <section className="rich-browser-lab-recovery" aria-label="Targeted recovery">
          <div className="rich-recovery-head">
            <span><BrainCircuit size={14} /> Targeted recovery</span>
            <strong>{recovery.misconception.title}</strong>
            <p>{recovery.misconception.explanation}</p>
            <small><Lightbulb size={12} /> {recovery.misconception.evidenceSummary}</small>
          </div>

          {!!boardCommands.length && (
            <div className="rich-recovery-board" aria-label={recovery.microLesson.objective}>
              <WhiteboardCanvas canvasCommands={boardCommands} tarsActive={false} />
            </div>
          )}

          {recovery.status === "practicing" && (
            <div className="rich-recovery-practice">
              <span><Target size={13} /> Smaller practice</span>
              <strong>{recovery.practiceTask.prompt}</strong>
              <div className="rich-recovery-options">
                {recovery.practiceTask.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => { void submitPractice(option.id); }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {lastPractice && (
                <p className={lastPractice.correct ? "correct" : "wrong"} role="status">
                  {lastPractice.correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {lastPractice.feedback}
                </p>
              )}
            </div>
          )}

          {["retry_ready", "retrying"].includes(recovery.status) && (
            <div className="rich-recovery-retry">
              <div>
                <span>{recovery.status === "retry_ready" ? "Practice verified" : "Server-verified retry"}</span>
                <strong>{recovery.failedStep.instruction}</strong>
                <small>{recovery.failedStep.expectedEvidence}</small>
              </div>
              <button type="button" className="rich-primary" disabled={busy !== null} onClick={() => { void retryOriginal(); }}>
                {busy === "retry" ? <Loader2 size={14} className="rich-spin" /> : <RotateCcw size={14} />}
                {recovery.status === "retry_ready" ? "Retry original step" : "Reopen retry"}
              </button>
            </div>
          )}
        </section>
      )}

      <div className="rich-browser-lab-list cleanup">
        <span>Cleanup</span>
        <ol>
          {activePlan.cleanupSteps.map((step) => {
            const done = assertionsComplete(
              step,
              attempt?.verification?.cleanupAssertions,
              cleanupComplete,
            );
            return (
              <li key={step.id}>
                <ShieldCheck size={13} className={done ? "done" : ""} />
                <div><strong>{step.instruction}</strong><small>{step.expectedEvidence}</small></div>
              </li>
            );
          })}
        </ol>
      </div>

      {postLabRemarks && (
        <section className="rich-browser-lab-review" aria-labelledby={`lab-review-${attempt?.id}`}>
          <header>
            <span>Post-lab remarks</span>
            <h3 id={`lab-review-${attempt?.id}`}>Your verified performance review</h3>
          </header>
          <div>
            <article className="went-well">
              <ThumbsUp size={16} />
              <div><strong>What went well</strong><p>{postLabRemarks.good}</p></div>
            </article>
            <article className="went-wrong">
              <TriangleAlert size={16} />
              <div>
                <strong>What went wrong</strong>
                <ul>{postLabRemarks.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </div>
            </article>
            <article className="improve-next">
              <TrendingUp size={16} />
              <div><strong>What could be better</strong><p>{postLabRemarks.improvement}</p></div>
            </article>
          </div>
        </section>
      )}

      {error && <p className="rich-browser-lab-error" role="alert">{error}</p>}

      <div className="rich-browser-lab-actions">
        <div className="rich-browser-lab-buttons">
          {!recovery && (
            <button
              type="button"
              className="rich-primary"
              disabled={busy !== null || verified || attempt?.status === "recovering"}
              onClick={() => { void openLab(); }}
            >
              {busy === "hydrate" || busy === "launch" ? <Loader2 size={14} className="rich-spin" /> : <MonitorCheck size={14} />}
              {verified ? "Verified" : attempt?.status === "needs_cleanup" ? "Reopen cleanup" : "Open with Tars"}
            </button>
          )}
          {canCheck && (
            <button type="button" className="rich-secondary" disabled={busy !== null} onClick={() => { void checkAttempt(); }}>
              {busy === "check" ? <Loader2 size={14} className="rich-spin" /> : <BrainCircuit size={14} />}
              Check attempt
            </button>
          )}
        </div>
        <small>
          {extensionAvailable === false
            ? "Tars extension not detected in this tab."
            : recovery?.status === "practicing"
              ? "Browser evidence is paused during targeted practice."
              : "Completion waits for backend verification."}
        </small>
      </div>
    </section>
  );
}
