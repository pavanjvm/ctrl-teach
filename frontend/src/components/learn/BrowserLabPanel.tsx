"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Check, ExternalLink, Loader2, MonitorCheck, ShieldCheck } from "lucide-react";

import { useClicky } from "@/lib/clicky";
import { API_URL } from "@/lib/constants";
import type { BrowserLabBlueprint } from "@/lib/types";

type Attempt = {
  id: string;
  status: "running" | "needs_cleanup" | "verified" | string;
  launchUrl: string;
  plan: BrowserLabBlueprint;
  verification?: {
    taskComplete?: boolean;
    cleanupComplete?: boolean;
    evidenceCount?: number;
    taskAssertions?: Record<string, boolean>;
    cleanupAssertions?: Record<string, boolean>;
  };
  evidenceCount?: number;
};

type Props = {
  courseId: string;
  lessonId: string;
  browserLab: BrowserLabBlueprint;
  completed: boolean;
  getToken: () => Promise<string | null>;
  onVerified: () => void;
};

function extractAttempt(data: unknown): Attempt | null {
  if (!data || typeof data !== "object") return null;
  const maybe = data as { attempt?: Attempt };
  return maybe.attempt ?? (data as Attempt);
}

function postLabMessage(type: string, payload: Record<string, unknown>) {
  window.postMessage({ type, requestId: crypto.randomUUID(), ...payload }, window.location.origin);
}

export default function BrowserLabPanel({
  courseId,
  lessonId,
  browserLab,
  completed,
  getToken,
  onVerified,
}: Props) {
  const { extensionAvailable } = useClicky();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePlan = attempt?.plan ?? browserLab;
  const taskComplete = completed || Boolean(attempt?.verification?.taskComplete);
  const cleanupComplete = completed || Boolean(attempt?.verification?.cleanupComplete);
  const verified = completed || attempt?.status === "verified";
  const evidenceCount = attempt?.evidenceCount ?? attempt?.verification?.evidenceCount ?? 0;

  const headers = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: token } : undefined;
  }, [getToken]);

  const refresh = useCallback(async (attemptId: string) => {
    const response = await axios.get(`${API_URL}/api/browser-labs/attempts/${attemptId}`, {
      headers: await headers(),
    });
    const next = extractAttempt(response.data);
    if (next) {
      setAttempt(next);
      if (next.status === "verified") onVerified();
    }
  }, [headers, onVerified]);

  const startLab = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/browser-labs/${courseId}/${lessonId}/attempts`,
        {},
        { headers: await headers() },
      );
      const next = extractAttempt(response.data);
      if (!next) throw new Error("Browser lab attempt did not start.");
      setAttempt(next);
      postLabMessage("CTRLTEACH_BROWSER_LAB_START", {
        attemptId: next.id,
        launchUrl: next.launchUrl,
        lab: next.plan,
      });
      if (next.status === "verified") onVerified();
    } catch (startError) {
      setError(
        axios.isAxiosError(startError)
          ? String(startError.response?.data?.detail || "Could not start this browser lab.")
          : "Could not start this browser lab.",
      );
    } finally {
      setBusy(false);
    }
  }, [courseId, headers, lessonId, onVerified]);

  useEffect(() => {
    if (!attempt?.id || verified) return;
    const timer = window.setInterval(() => {
      void refresh(attempt.id).catch((refreshError) => {
        console.warn("[BrowserLab] refresh failed", refreshError);
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [attempt?.id, refresh, verified]);

  useEffect(() => {
    if (attempt?.id && attempt.status === "needs_cleanup") {
      postLabMessage("CTRLTEACH_BROWSER_LAB_CLEANUP_READY", { attemptId: attempt.id });
    }
  }, [attempt?.id, attempt?.status]);

  useEffect(() => {
    return () => {
      if (attempt?.id) {
        postLabMessage("CTRLTEACH_BROWSER_LAB_STOP", { attemptId: attempt.id });
      }
    };
  }, [attempt?.id]);

  const status = useMemo(() => {
    if (verified) return "Verified by backend";
    if (attempt?.status === "needs_cleanup") return "Cleanup evidence needed";
    if (attempt) return "Clicky is collecting evidence";
    return "Ready to start";
  }, [attempt, verified]);

  return (
    <section className="rich-browser-lab">
      <div className="rich-browser-lab-head">
        <span><MonitorCheck size={13} /> Browser lab</span>
        <h2>{activePlan.platform || activePlan.platformId}</h2>
        <p>{activePlan.objective}</p>
      </div>

      <div className="rich-browser-lab-status">
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
          {activePlan.steps.map((step) => (
            <li key={step.id}>
              <Check size={13} className={taskComplete ? "done" : ""} />
              <div><strong>{step.instruction}</strong><small>{step.expectedEvidence}</small></div>
            </li>
          ))}
        </ol>
      </div>

      <div className="rich-browser-lab-list cleanup">
        <span>Cleanup</span>
        <ol>
          {activePlan.cleanupSteps.map((step) => (
            <li key={step.id}>
              <ShieldCheck size={13} className={cleanupComplete ? "done" : ""} />
              <div><strong>{step.instruction}</strong><small>{step.expectedEvidence}</small></div>
            </li>
          ))}
        </ol>
      </div>

      {error && <p className="rich-browser-lab-error">{error}</p>}

      <div className="rich-browser-lab-actions">
        <button type="button" className="rich-primary" disabled={busy || verified} onClick={startLab}>
          {busy ? <Loader2 size={14} className="rich-spin" /> : <MonitorCheck size={14} />}
          {attempt ? "Reopen with Clicky" : "Start with Clicky"}
        </button>
        <small>{extensionAvailable === false ? "Clicky extension not detected in this tab." : "Completion waits for backend verification."}</small>
      </div>
    </section>
  );
}
