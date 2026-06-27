"use client";

/**
 * AssessmentMode — an interactive quiz experience for a single lesson.
 *
 * A confidence intro → 4 hand-authored/generic questions → immediate
 * feedback → a result screen with score, confidence-vs-actual delta, a
 * celebratory checkpoint burst, and CTAs.
 *
 * Mirrors the "Luxe Whitespace" editorial language: warm off-white field,
 * ink type, a single gold accent, sage for success. No content shadows —
 * gold hairlines and rules carry the structure instead.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, RotateCcw, ArrowRight } from "lucide-react";
import type { Course, QuizQuestion } from "@/lib/types";
import { useLearner } from "@/lib/learner";

/* ── Authored quiz for the User Stories "Anatomy Check" lesson ──────────── */

const USER_STORIES_LSN3: QuizQuestion[] = [
  {
    id: "us-1",
    question: "Which part of a user story explains business value?",
    choices: ["User role", "Goal", "Benefit", "Story points"],
    answerIndex: 2,
    explanation:
      "The 'so that' clause articulates the business value — why the story matters.",
  },
  {
    id: "us-2",
    question: "A good user story describes...",
    choices: [
      "a technical task",
      "an outcome the user values",
      "a JIRA ticket type",
      "a sprint ceremony",
    ],
    answerIndex: 1,
    explanation:
      "Stories describe outcomes the user values, not implementation tasks.",
  },
  {
    id: "us-3",
    question: "Given-When-Then expresses...",
    choices: [
      "acceptance criteria",
      "the product vision",
      "effort estimates",
      "team capacity",
    ],
    answerIndex: 0,
    explanation: "Given-When-Then frames testable acceptance criteria.",
  },
  {
    id: "us-4",
    question: "The role in a user story should be...",
    choices: [
      "a job title",
      "a generic 'user'",
      "the person who gets value",
      "the developer",
    ],
    answerIndex: 2,
    explanation:
      "The role is whoever receives value — not a job title.",
  },
];

/* ── Generic-but-reasonable quiz builder ───────────────────────────────── */

/**
 * Build 4 plausible multiple-choice questions about a lesson title.
 *
 * We hand-roll a small set of templates that read naturally for any topic:
 * the essence of the concept, the canonical objection / smell, the
 * practical application, and the meta-check (best description). The choices
 * are composed from the lesson title + neighbouring facets so they stay
 * topical without needing real content.
 */
export function buildQuiz(lessonId: string, lessonTitle: string): QuizQuestion[] {
  // The User Stories "Anatomy Check" lesson is hand-authored exactly.
  if (lessonId === "lsn-3" && lessonTitle === "Anatomy Check") {
    return USER_STORIES_LSN3;
  }

  const t = lessonTitle.trim() || "this lesson";
  const topic = t.replace(/\?+$/, "");

  const id = (n: number) => `g-${lessonId}-${n}`;

  return [
    {
      id: id(1),
      question: `Which statement best captures the core idea of “${topic}”?`,
      choices: [
        "A surface-level label for the topic",
        "The central concept and why it matters",
        "An unrelated historical aside",
        "A list of tool names with no context",
      ],
      answerIndex: 1,
      explanation: `“${topic}” is defined by its central concept and the reason it matters in practice.`,
    },
    {
      id: id(2),
      question: `A common mistake when applying “${topic}” is to...`,
      choices: [
        "focus on the underlying principle it teaches",
        "ignore the principle and copy a pattern blindly",
        "test it against a real example",
        "review it with a peer",
      ],
      answerIndex: 1,
      explanation:
        "Applying a concept without the principle behind it leads to brittle, cargo-cult work.",
    },
    {
      id: id(3),
      question: `“${topic}” is most useful when you need to...`,
      choices: [
        "decide between two reasonable approaches on merit",
        "pick the longest option available",
        "avoid making any decision at all",
        "blindly follow the most recent tool release",
      ],
      answerIndex: 0,
      explanation:
        "A good concept helps you weigh trade-offs and decide between reasonable options.",
    },
    {
      id: id(4),
      question: `Which of these is the strongest signal you have understood “${topic}”?`,
      choices: [
        "You can recite its name from memory",
        "You saw it mentioned in a video",
        "You can apply it to a new problem and explain why",
        "You opened its documentation page once",
      ],
      answerIndex: 2,
      explanation:
        "True understanding shows when you apply a concept to a novel problem and justify it.",
    },
  ];
}

/* ── Component ─────────────────────────────────────────────────────────── */

type Phase = "confidence" | "question" | "result";

export interface AssessmentModeProps {
  course: Course;
  courseId: string;
  lessonId: string;
  onDone: () => void;
}

export default function AssessmentMode({
  course,
  courseId,
  lessonId,
  onDone,
}: AssessmentModeProps) {
  const { addXp, addCheckpoint, setConfidence, earnBadge } = useLearner();

  // Resolve the lesson title from the course tree, falling back gracefully.
  const lessonTitle = useMemo(() => {
    for (const m of course.modules) {
      const l = m.lessons.find((x) => x.id === lessonId);
      if (l) return l.title;
    }
    return "this lesson";
  }, [course, lessonId]);

  const questions = useMemo(
    () => buildQuiz(lessonId, lessonTitle),
    [lessonId, lessonTitle]
  );

  const [phase, setPhase] = useState<Phase>("confidence");
  const [confidence, setConfidenceValue] = useState<number>(0); // 1–5
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);

  const total = questions.length;
  const current = questions[qIndex];
  const correctCount = answers.reduce(
    (n, a, i) => (a === questions[i].answerIndex ? n + 1 : n),
    0
  );
  const score = Math.round((correctCount / total) * 100);

  /* ── handlers ── */
  function startQuiz() {
    if (confidence < 1) return;
    setPhase("question");
  }

  function choose(i: number) {
    if (revealed) return;
    setPicked(i);
    setRevealed(true);
    setAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = i;
      return next;
    });
  }

  function nextQuestion() {
    if (qIndex + 1 >= total) {
      // Finalize: commit progress + celebrate.
      commitProgress();
      setPhase("result");
      return;
    }
    setQIndex((i) => i + 1);
    setPicked(null);
    setRevealed(false);
  }

  function restart() {
    setPhase("confidence");
    setConfidenceValue(0);
    setQIndex(0);
    setPicked(null);
    setRevealed(false);
    setAnswers([]);
  }

  function commitProgress() {
    addXp(Math.round((score / 100) * 100));
    addCheckpoint(`${lessonId}-checkpoint`);
    setConfidence(confidence);
    if (score === 100) earnBadge("quiz-ace");
  }

  /* ── render ── */
  return (
    <div className="asm">
      <div className="asm-shell">
        <AnimatePresence mode="wait">
          {phase === "confidence" && (
            <motion.section
              key="confidence"
              className="asm-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              aria-label="Confidence check"
            >
              <div className="asm-eyebrow">Assessment</div>
              <h2 className="asm-title">
                How confident do you feel about {lessonTitle}
                <span className="asm-stop">?</span>
              </h2>
              <p className="asm-lede">
                Rate your confidence before you begin. We will compare it to
                your actual score at the end.
              </p>
              <span className="asm-rule" />

              <div className="asm-conf" role="radiogroup" aria-label="Confidence from 1 to 5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const selected = confidence === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`asm-conf-dot ${selected ? "on" : ""}`}
                      onClick={() => setConfidenceValue(n)}
                    >
                      <span className="asm-conf-num">{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="asm-conf-labels">
                <span>Not at all</span>
                <span>Very</span>
              </div>

              <div className="asm-ctas">
                <button
                  type="button"
                  className="asm-btn asm-btn-primary"
                  onClick={startQuiz}
                  disabled={confidence < 1}
                >
                  Begin <ArrowRight size={14} />
                </button>
              </div>
            </motion.section>
          )}

          {phase === "question" && current && (
            <motion.section
              key={`q-${qIndex}`}
              className="asm-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              aria-label={`Question ${qIndex + 1} of ${total}`}
            >
              <div className="asm-qhead">
                <span className="asm-qcount">Q {qIndex + 1} / {total}</span>
                <span className="asm-progress" aria-hidden>
                  <span
                    className="asm-progress-fill"
                    style={{ width: `${((qIndex + (revealed ? 1 : 0)) / total) * 100}%` }}
                  />
                </span>
              </div>

              <h2 className="asm-title asm-title-q">{current.question}</h2>

              <div className="asm-choices" role="radiogroup" aria-label="Answer choices">
                {current.choices.map((c, i) => {
                  const isPicked = picked === i;
                  const isAnswer = i === current.answerIndex;
                  const showCorrect = revealed && isAnswer;
                  const showWrong = revealed && isPicked && !isAnswer;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={isPicked}
                      disabled={revealed}
                      className={[
                        "asm-choice",
                        showCorrect ? "is-correct" : "",
                        showWrong ? "is-wrong" : "",
                        !revealed && isPicked ? "is-picked" : "",
                      ].join(" ").trim()}
                      onClick={() => choose(i)}
                    >
                      <span className="asm-choice-mark" aria-hidden>
                        {showCorrect ? (
                          <Check size={15} />
                        ) : showWrong ? (
                          <X size={15} />
                        ) : (
                          <span className="asm-choice-letter">
                            {String.fromCharCode(65 + i)}
                          </span>
                        )}
                      </span>
                      <span className="asm-choice-text">{c}</span>
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {revealed && (
                  <motion.div
                    className={`asm-feedback ${picked === current.answerIndex ? "ok" : "no"}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <div className="asm-feedback-head">
                      {picked === current.answerIndex ? "Correct" : "Not quite"}
                    </div>
                    <p className="asm-feedback-body">{current.explanation}</p>
                    <div className="asm-ctas">
                      <button
                        type="button"
                        className="asm-btn asm-btn-primary"
                        onClick={nextQuestion}
                      >
                        {qIndex + 1 >= total ? "See results" : "Next"}{" "}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {phase === "result" && (
            <motion.section
              key="result"
              className="asm-card asm-result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              aria-label="Assessment results"
            >
              <Confetti />
              <div className="asm-eyebrow">Result</div>
              <h2 className="asm-title">
                You scored {score}
                <span className="asm-stop">%</span>
              </h2>
              <p className="asm-lede">
                {correctCount} of {total} correct. You felt {confidence}/5,
                scored {score}% —
                <span className="asm-delta">
                  {" "}
                  {deltaLabel(confidence, score)}
                </span>
              </p>
              <span className="asm-rule" />

              <div className="asm-result-grid">
                <div className="asm-result-stat">
                  <span className="asm-result-label">Score</span>
                  <span className="asm-result-value">{score}<span className="asm-unit">%</span></span>
                </div>
                <div className="asm-result-stat">
                  <span className="asm-result-label">Confidence</span>
                  <span className="asm-result-value">{confidence}<span className="asm-unit">/5</span></span>
                </div>
                <div className="asm-result-stat">
                  <span className="asm-result-label">Correct</span>
                  <span className="asm-result-value">{correctCount}<span className="asm-unit">/{total}</span></span>
                </div>
              </div>

              {score === 100 && (
                <p className="asm-banner">Perfect — the “Quiz Ace” badge is yours.</p>
              )}

              <div className="asm-ctas">
                <button
                  type="button"
                  className="asm-btn asm-btn-secondary"
                  onClick={restart}
                >
                  <RotateCcw size={14} /> Retry
                </button>
                <button
                  type="button"
                  className="asm-btn asm-btn-primary"
                  onClick={onDone}
                >
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AssessmentStyles lessonId={lessonId} courseId={courseId} />
    </div>
  );
}

/* ── helpers ── */

function deltaLabel(confidence: number, score: number) {
  const actual = (score / 20); // score% out of 20 → /5 scale
  const delta = Math.round(actual - confidence);
  if (delta > 0) return `you knew more than you thought (+${delta}).`;
  if (delta < 0) return `you were a touch over-confident (${delta}).`;
  return `your confidence matched the result exactly.`;
}

/* ── confetti ──────────────────────────────────────────────────────────── */

const CONFETTI_PALETTE = ["#D4A574", "#6366F1", "#E0DCD6", "#6B8E5A"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 360,
        y: -120 - Math.random() * 80,
        r: (Math.random() - 0.5) * 360,
        s: 6 + Math.random() * 8,
        c: CONFETTI_PALETTE[i % CONFETTI_PALETTE.length],
        d: Math.random() * 0.3,
      })),
    []
  );
  return (
    <div className="asm-confetti" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="asm-confetti-bit"
          style={{ background: p.c, width: p.s, height: p.s * 0.5 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y + 320, rotate: p.r, opacity: 0 }}
          transition={{ duration: 1.6, delay: p.d, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/* ── scoped styles (inline via a style tag so the component is portable) ── */

function AssessmentStyles({ lessonId, courseId }: { lessonId: string; courseId: string }) {
  // keep the tags unique-ish to avoid duplication warnings across rerenders
  return (
    <style>{`
.asm { --asm-sage: #6B8E5A; --asm-indigo: #6366F1; --asm-gold: #D4A574;
  --asm-border: #E0DCD6; --asm-fg: #2A2A2A; --asm-muted: #666666;
  --asm-bg: #FAFAF8; --asm-card: #FFFFFF; }
.asm-shell { max-width: 720px; margin: 0 auto; padding: clamp(32px, 6vw, 80px) 0; }
.asm-card { position: relative; background: var(--asm-card);
  border: 1px solid var(--asm-border); border-radius: 4px; padding: clamp(28px, 4vw, 48px);
  overflow: hidden; }
.asm-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--asm-muted); margin-bottom: 18px; }
.asm-title { font-size: clamp(26px, 3.4vw, 38px); font-weight: 300;
  letter-spacing: -0.02em; line-height: 1.15; color: var(--asm-fg); margin: 0;
  max-width: 22ch; }
.asm-title-q { font-size: clamp(20px, 2.6vw, 26px); max-width: none; }
.asm-stop { color: var(--asm-gold); }
.asm-lede { font-size: 16px; line-height: 1.6; color: var(--asm-muted);
  font-weight: 300; margin-top: 18px; max-width: 52ch; }
.asm-rule { display: block; width: 36px; height: 1px; background: var(--asm-gold);
  margin: 24px 0; }

.asm-conf { display: flex; gap: 16px; }
.asm-conf-dot { width: 56px; height: 56px; border-radius: 50%;
  border: 1px solid var(--asm-border); background: transparent;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: border-color 0.2s, background 0.2s, color 0.2s; }
.asm-conf-dot:hover { border-color: var(--asm-fg); }
.asm-conf-dot.on { border-color: var(--asm-gold); background: var(--asm-gold);
  color: var(--asm-fg); }
.asm-conf-num { font-size: 18px; font-weight: 400; }
.asm-conf-labels { display: flex; justify-content: space-between;
  width: calc(56px * 5 + 16px * 4); max-width: 100%; margin-top: 12px;
  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--asm-muted); }

.asm-qhead { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.asm-qcount { font-size: 11px; font-weight: 500; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--asm-muted); white-space: nowrap; }
.asm-progress { flex: 1; height: 1px; background: var(--asm-border); position: relative; overflow: hidden; }
.asm-progress-fill { position: absolute; left: 0; top: 0; height: 100%;
  background: var(--asm-gold); transition: width 0.4s ease; }

.asm-choices { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.asm-choice { display: flex; gap: 14px; align-items: center; text-align: left;
  padding: 18px 20px; border: 1px solid var(--asm-border); border-radius: 4px;
  background: transparent; cursor: pointer; color: var(--asm-fg);
  font-family: inherit; font-size: 15px; font-weight: 300; line-height: 1.5;
  transition: border-color 0.2s, background 0.2s; }
.asm-choice:not(:disabled):hover { border-color: var(--asm-fg); }
.asm-choice.is-picked { border-color: var(--asm-gold); }
.asm-choice.is-correct { border-color: var(--asm-sage);
  background: rgba(107,142,90,0.08); color: var(--asm-fg); }
.asm-choice.is-wrong { border-color: #B07B62; background: rgba(176,123,98,0.06); }
.asm-choice:disabled { cursor: default; }
.asm-choice-mark { width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%;
  border: 1px solid var(--asm-border); display: flex; align-items: center;
  justify-content: center; color: var(--asm-muted); }
.asm-choice.is-correct .asm-choice-mark { border-color: var(--asm-sage);
  color: var(--asm-sage); background: rgba(107,142,90,0.12); }
.asm-choice.is-wrong .asm-choice-mark { border-color: #B07B62; color: #B07B62;
  background: rgba(176,123,98,0.1); }
.asm-choice-letter { font-size: 12px; font-weight: 500; letter-spacing: 0.04em; }
.asm-choice-text { flex: 1; }

.asm-feedback { margin-top: 24px; border-top: 1px solid var(--asm-border);
  padding-top: 20px; overflow: hidden; }
.asm-feedback.ok .asm-feedback-head { color: var(--asm-sage); }
.asm-feedback.no .asm-feedback-head { color: #B07B62; }
.asm-feedback-head { font-size: 13px; font-weight: 500; letter-spacing: 0.08em;
  text-transform: uppercase; margin-bottom: 8px; }
.asm-feedback-body { font-size: 15px; line-height: 1.6; color: var(--asm-fg);
  font-weight: 300; margin: 0 0 18px; max-width: 56ch; }

.asm-ctas { display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
  margin-top: 24px; }
.asm-btn { display: inline-flex; align-items: center; gap: 8px; font-size: 13px;
  font-weight: 500; letter-spacing: 0.06em; padding: 13px 22px; border-radius: 999px;
  border: 1px solid transparent; cursor: pointer; font-family: inherit;
  transition: background 0.3s, border-color 0.3s, color 0.3s; }
.asm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.asm-btn-primary { background: var(--asm-fg); color: var(--asm-bg);
  border-color: var(--asm-fg); }
.asm-btn-primary:not(:disabled):hover { background: var(--asm-gold);
  border-color: var(--asm-gold); color: var(--asm-fg); }
.asm-btn-secondary { background: transparent; color: var(--asm-fg);
  border-color: var(--asm-border); }
.asm-btn-secondary:hover { border-color: var(--asm-fg); }

.asm-result-grid { display: grid; grid-template-columns: repeat(3, 1fr);
  margin-top: 8px; }
.asm-result-stat { display: flex; flex-direction: column; gap: 8px;
  padding: 0 24px; border-left: 1px solid var(--asm-border); }
.asm-result-stat:first-child { border-left: none; padding-left: 0; }
.asm-result-label { font-size: 11px; font-weight: 500; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--asm-muted); }
.asm-result-value { font-size: clamp(34px, 4vw, 48px); font-weight: 200;
  letter-spacing: -0.04em; line-height: 1; color: var(--asm-fg); }
.asm-unit { color: var(--asm-gold); font-size: 0.5em; vertical-align: 0.55em;
  margin-left: 4px; font-weight: 300; }
.asm-delta { color: var(--asm-gold); }
.asm-banner { margin-top: 24px; font-size: 14px; color: var(--asm-sage);
  letter-spacing: 0.02em; }

.asm-confetti { position: absolute; top: 40px; left: 50%; width: 0; height: 0;
  pointer-events: none; z-index: 1; }
.asm-confetti-bit { position: absolute; top: 0; left: 0; border-radius: 1px;
  display: block; }

@media (max-width: 720px) {
  .asm-conf { gap: 10px; }
  .asm-conf-dot { width: 48px; height: 48px; }
  .asm-conf-labels { width: calc(48px * 5 + 10px * 4); }
  .asm-result-grid { grid-template-columns: 1fr; }
  .asm-result-stat { border-left: none; border-top: 1px solid var(--asm-border);
    padding: 20px 0 0; }
  .asm-result-stat:first-child { border-top: none; padding-top: 0; }
}
`}</style>
  );
}