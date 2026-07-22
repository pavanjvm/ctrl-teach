"use client";

/**
 * Ctrl+Teach — Onboarding Wizard (/onboarding)
 *
 * A conversational, multi-step interview the AI companion uses to
 * personalize the learning experience. Luxe Whitespace design language:
 * warm off-white field, soft black ink, single gold accent, hairlines.
 *
 * Storage is handled by useLearner().setPrefs (persists + syncs).
 * No backend endpoints are touched directly here.
 */

import { useEffect, useRef, useState, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/components/auth/AuthProvider";
import { useLearner } from "@/lib/learning/provider";
import type { OnboardingPrefs } from "@/lib/types";

import "./onboarding.css";

// ── Option sets (single source of truth for the chips) ────────────────────────

const ROLE_OPTIONS = [
  "Product Manager",
  "Engineer",
  "Designer",
  "Student",
  "Founder",
  "Career switcher",
  "Educator",
  "Other",
];

const INTEREST_OPTIONS = [
  "Product Management",
  "System Design",
  "Python",
  "AI Engineering",
  "Scrum",
  "UX Design",
  "Data Science",
  "Leadership",
  "Public speaking",
];

const PREPARING_OPTIONS = [
  "Career growth",
  "Interview preparation",
  "Certification",
  "Personal interest",
  "New role",
  "Skill improvement",
  "Builder's journey",
  "Other",
];

// ── Step model ─────────────────────────────────────────────────────────────────

type StepId = "identity" | "interests" | "preparing" | "review";

interface Step {
  id: StepId;
  question: string;
  helper?: string;
}

const STEPS: Step[] = [
  {
    id: "identity",
    question: "Who are you?",
    helper:
      "Tell me your name and what you do — I'll tune the way I teach to you.",
  },
  {
    id: "interests",
    question: "What are you interested in?",
    helper: "Pick the topics you want to grow in. Choose as many as you like.",
  },
  {
    id: "preparing",
    question: "What are you preparing for?",
    helper: "Your goal shapes the path I'll build for you.",
  },
  {
    id: "review",
    question: "Nice to meet you.",
    helper: "Here's everything I learned about you. Let's begin.",
  },
];

const PREVIEW_TITLES: Record<StepId, string> = {
  identity: "Who you are",
  interests: "Interests",
  preparing: "Preparing for",
  review: "Ready",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

type Answers = Omit<Partial<OnboardingPrefs>, "onboarded">;

function isStepValid(step: StepId, a: Answers): boolean {
  switch (step) {
    case "identity":
      return !!a.name && a.name.trim().length > 0 && !!a.role;
    case "interests":
      return (a.interests?.length ?? 0) > 0;
    case "preparing":
      return !!a.preparingFor;
    case "review":
      return true;
    default:
      return false;
  }
}

function allAnswered(a: Answers): a is OnboardingPrefs {
  return (
    isStepValid("identity", a) &&
    isStepValid("interests", a) &&
    isStepValid("preparing", a)
  );
}

function previewLabel(step: StepId, a: Answers): string {
  switch (step) {
    case "identity":
      return [a.name?.trim(), a.role].filter(Boolean).join(" · ");
    case "interests":
      return a.interests && a.interests.length ? a.interests.join(", ") : "";
    case "preparing":
      return a.preparingFor ?? "";
    case "review":
      return allAnswered(a) ? "All set" : "";
    default:
      return "";
  }
}

// ── Tiny line icon ──────────────────────────────────────────────────────────────

const IconArrow = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

// ── Chip row (single + multi select) ──────────────────────────────────────────

interface ChipRowProps {
  options: readonly string[];
  selected: readonly string[];
  multi?: boolean;
  onSelect?: (v: string) => void;
  onToggle?: (v: string) => void;
  renderLabel?: (o: string) => string;
}

const ChipRow = forwardRef<HTMLDivElement, ChipRowProps>(function ChipRow(
  props,
  ref
) {
  const { options, selected, multi, onSelect, onToggle, renderLabel } = props;
  return (
    <div
      className="ob-chips"
      ref={ref}
      role={multi ? "group" : "radiogroup"}
      aria-label="Choices"
    >
      {options.map((opt) => {
        const isSel = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            data-chip="true"
            role={multi ? "switch" : "radio"}
            aria-checked={isSel}
            aria-label={opt}
            className={`ob-chip ${isSel ? "is-selected" : ""}`}
            onClick={() => (multi ? onToggle?.(opt) : onSelect?.(opt))}
          >
            <span className="ob-chip-mark" aria-hidden="true" />
            <span className="ob-chip-label">
              {renderLabel ? renderLabel(opt) : opt}
            </span>
          </button>
        );
      })}
    </div>
  );
});

ChipRow.displayName = "ChipRow";

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { prefs, isOnboarded, learnerReady, setPrefs } = useLearner();

  const [answers, setAnswers] = useState<Answers>(() => {
    const base: Answers = {};
    if (prefs && !prefs.onboarded) {
      const { onboarded: _onboarded, ...rest } = prefs;
      void _onboarded;
      Object.assign(base, rest);
    }
    return base;
  });

  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  const [tellMore, setTellMore] = useState("");

  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);

  const total = STEPS.length;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === total - 1;
  const canContinue = isStepValid(step.id, answers);

  // ── Guards ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.isAdmin) {
      router.replace("/admin/dashboard");
      return;
    }
    if (!learnerReady) return;
    if (isOnboarded) {
      router.push("/dashboard");
    }
  }, [user, loading, isOnboarded, learnerReady, router]);

  // ── Pre-fill name from the auth profile once it's available ─────────────────
  useEffect(() => {
    if (user?.displayName && !answers.name) {
      setAnswers((a) => ({ ...a, name: user.displayName as string }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Focus management on step change ────────────────────────────────────────
  useEffect(() => {
    if (step.id === "identity") {
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    if (step.id === "review") return;
    const first = chipsRef.current?.querySelector<HTMLButtonElement>(
      "button[data-chip='true']"
    );
    if (first) {
      const t = setTimeout(() => first.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [stepIndex, step.id]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goNext = () => {
    if (!canContinue) return;
    if (isLast) {
      finish();
      return;
    }
    setDir(1);
    setStepIndex((i) => Math.min(i + 1, total - 1));
  };

  const goBack = () => {
    setDir(-1);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const finish = () => {
    if (!allAnswered(answers)) return;
    const preparingFor = tellMore.trim()
      ? `${answers.preparingFor} — ${tellMore.trim()}`
      : answers.preparingFor;
    setPrefs({
      name: answers.name,
      role: answers.role,
      interests: answers.interests,
      preparingFor,
      onboarded: true,
    });
    router.push("/dashboard");
  };

  // ── State setters per field ─────────────────────────────────────────────────
  const setName = (v: string) => setAnswers((a) => ({ ...a, name: v }));

  const pickSingle = <K extends keyof OnboardingPrefs>(
    key: K
  ) => (v: OnboardingPrefs[K]) => setAnswers((a) => ({ ...a, [key]: v }));

  const toggleInArray = <K extends keyof OnboardingPrefs>(
    key: K,
    v: NonNullable<OnboardingPrefs[K]> extends Array<infer U> ? U : never
  ) =>
    setAnswers((a) => {
      const current = (a[key] as unknown as Array<typeof v> | undefined) ?? [];
      const next = current.includes(v)
        ? current.filter((x) => x !== v)
        : [...current, v];
      return { ...a, [key]: next };
    });

  const addInterest = () => {
    const v = interestInput.trim();
    if (!v) return;
    if (![...INTEREST_OPTIONS, ...customInterests].includes(v)) {
      setCustomInterests((c) => [...c, v]);
    }
    toggleInArray("interests", v);
    setInterestInput("");
  };

  // ── Keystroke helpers ───────────────────────────────────────────────────────
  const onNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canContinue) {
      e.preventDefault();
      goNext();
    }
  };

  const onInterestInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addInterest();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading || (user && !user.isAdmin && !learnerReady) || user?.isAdmin) {
    return (
      <div className="ob-page ob-loading">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="ob-page">
      <div className="ob-shell">
        {/* ── Brand mark ──────────────────────────────────────────────── */}
        <div className="ob-brand" aria-label="Ctrl+Teach">
          <span className="ob-brand-name">Ctrl</span>
          <span className="ob-brand-plus">+</span>
          <span className="ob-brand-name">Teach</span>
        </div>

        <div className="ob-grid">
          {/* ── Conversation column ───────────────────────────────────── */}
          <section
            className="ob-col ob-col-form"
            aria-label="Onboarding interview"
          >
            {/* Progress indicator */}
            <div className="ob-progress" aria-live="polite">
              <span className="ob-prog-now">
                {String(stepIndex + 1).padStart(2, "0")}
              </span>
              <span className="ob-prog-sep">/</span>
              <span className="ob-prog-total">
                {String(total).padStart(2, "0")}
              </span>
              <span className="ob-prog-track" aria-hidden="true">
                <span
                  className="ob-prog-fill"
                  style={{
                    width: `${((stepIndex + 1) / total) * 100}%`,
                  }}
                />
              </span>
            </div>

            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={step.id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -28 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                className="ob-step"
              >
                {/* Eyebrow + hairline */}
                <div className="ob-eyebrow">
                  Question {String(stepIndex + 1).padStart(2, "0")}
                </div>
                <span className="ob-hairline" aria-hidden="true" />

                <h1 className="ob-question">{step.question}</h1>
                {step.helper && <p className="ob-helper">{step.helper}</p>}

                {/* ── Per-step input surface ──────────────────────────── */}
                <div className="ob-answer">
                  {step.id === "identity" && (
                    <>
                      <div className="ob-input-wrap">
                        <label htmlFor="ob-name" className="ob-input-label">
                          Your name
                        </label>
                        <input
                          id="ob-name"
                          ref={inputRef}
                          className="ob-input"
                          type="text"
                          value={answers.name ?? ""}
                          onChange={(e) => setName(e.target.value)}
                          onKeyDown={onNameKeyDown}
                          placeholder="e.g. Alex"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="ob-input-wrap ob-input-wrap-margin">
                        <div className="ob-input-label">Your role</div>
                        <ChipRow
                          ref={chipsRef}
                          options={ROLE_OPTIONS}
                          selected={answers.role ? [answers.role] : []}
                          onSelect={(v) => pickSingle("role")(v)}
                        />
                      </div>
                    </>
                  )}

                  {step.id === "interests" && (
                    <>
                      <ChipRow
                        ref={chipsRef}
                        options={[...INTEREST_OPTIONS, ...customInterests]}
                        selected={answers.interests ?? []}
                        multi
                        onToggle={(v) => toggleInArray("interests", v)}
                      />
                      <div className="ob-input-wrap ob-input-wrap-margin ob-interest-add">
                        <input
                          className="ob-input"
                          type="text"
                          value={interestInput}
                          onChange={(e) => setInterestInput(e.target.value)}
                          onKeyDown={onInterestInputKeyDown}
                          placeholder="Add your own"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className="ob-chip ob-chip-ghost"
                          onClick={addInterest}
                        >
                          Add
                        </button>
                      </div>
                    </>
                  )}

                  {step.id === "preparing" && (
                    <>
                      <ChipRow
                        ref={chipsRef}
                        options={PREPARING_OPTIONS}
                        selected={
                          answers.preparingFor ? [answers.preparingFor] : []
                        }
                        onSelect={(v) => pickSingle("preparingFor")(v)}
                      />
                      <div className="ob-input-wrap ob-input-wrap-margin">
                        <label htmlFor="ob-more" className="ob-input-label">
                          Tell us more (optional)
                        </label>
                        <input
                          id="ob-more"
                          className="ob-input"
                          type="text"
                          value={tellMore}
                          onChange={(e) => setTellMore(e.target.value)}
                          placeholder="Anything else about your goal"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    </>
                  )}

                  {step.id === "review" && (
                    <div className="ob-review">
                      <div className="ob-review-greeting">
                        Hi {answers.name?.trim() || "there"}! I'm Tars, your
                        AI coach. Say "Tars" anytime you need me.
                      </div>
                      <ul className="ob-review-list">
                        <li className="ob-review-row">
                          <span className="ob-review-key">Name</span>
                          <span className="ob-review-val">
                            {answers.name || "—"}
                          </span>
                        </li>
                        <li className="ob-review-row">
                          <span className="ob-review-key">Role</span>
                          <span className="ob-review-val">
                            {answers.role || "—"}
                          </span>
                        </li>
                        <li className="ob-review-row">
                          <span className="ob-review-key">Interests</span>
                          <span className="ob-review-val">
                            {answers.interests?.length
                              ? answers.interests.join(", ")
                              : "—"}
                          </span>
                        </li>
                        <li className="ob-review-row">
                          <span className="ob-review-key">Preparing for</span>
                          <span className="ob-review-val">
                            {answers.preparingFor || "—"}
                          </span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* ── Navigation ──────────────────────────────────────────── */}
            <div className="ob-nav">
              <button
                type="button"
                className="ob-btn ob-btn-ghost"
                onClick={goBack}
                disabled={stepIndex === 0}
              >
                <IconArrow className="ob-icon-left" /> Back
              </button>

              <button
                type="button"
                className="ob-btn ob-btn-primary"
                onClick={goNext}
                disabled={!canContinue}
              >
                {isLast ? "Take me to my dashboard" : "Continue"}
                <IconArrow />
              </button>
            </div>
          </section>

          {/* ── Live preview column ───────────────────────────────────── */}
          <aside
            className="ob-col ob-col-preview"
            aria-label="Live companion preview"
          >
            <div className="ob-preview-card">
              <div className="ob-preview-eyebrow">
                Your companion will be tuned to:
              </div>
              <span className="ob-hairline ob-hairline-soft" aria-hidden="true" />

              <ul className="ob-preview-list">
                {STEPS.map((s, i) => {
                  const value = previewLabel(s.id, answers);
                  const done =
                    s.id === "review"
                      ? allAnswered(answers)
                      : isStepValid(s.id, answers);
                  const isCurrent = i === stepIndex;
                  return (
                    <li
                      key={s.id}
                      className={`ob-preview-row ${
                        done ? "is-done" : ""
                      } ${isCurrent ? "is-current" : ""}`}
                    >
                      <span className="ob-preview-key">
                        <span className="ob-preview-idx">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {PREVIEW_TITLES[s.id]}
                      </span>
                      <span className="ob-preview-val">
                        {done ? (
                          value
                        ) : (
                          <span className="ob-preview-pending">—</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <span className="ob-hairline ob-hairline-soft" aria-hidden="true" />
              <p className="ob-preview-footnote">
                You can refine any of this later in settings.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
