"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  Clock3,
  ExternalLink,
  Layers3,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL } from "@/lib/constants";
import { useLearner } from "@/lib/learning/provider";
import {
  rankRoadmapsForGoal,
  type RankedRoadmapMatch,
} from "@/lib/learning/roadmapMatching";
import {
  CPRIME_BOOTCAMPS,
  LEARNING_ROADMAPS,
  sanitizeCustomRoadmaps,
  type CprimeBootcamp,
  type LearningRoadmap,
} from "@/lib/learning/roadmaps";
import type {
  LearningPreference,
  OnboardingPrefs,
  SkillLevel,
} from "@/lib/types";

import "./onboarding.css";

const EXPERIENCE_LEVELS: SkillLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

const LEARNING_PREFERENCES: Array<{
  value: LearningPreference;
  detail: string;
}> = [
  { value: "Visual explanations", detail: "Diagrams and clear visual models" },
  { value: "Hands-on practice", detail: "Labs, scenarios and real tasks" },
  { value: "Reading", detail: "Structured notes and references" },
  { value: "Live, interactive teaching", detail: "Learn through conversation" },
];

const GOAL_EXAMPLES = [
  "I want to become a cloud architect.",
  "I want to become a product manager.",
  "I want to build production AI agents.",
];

const MATCHING_STAGES = [
  "Understanding your goal",
  "Finding relevant Cprime roadmaps",
  "Matching the roadmap to your experience",
];

const GENERATION_STAGES = [
  "Mapping the required skills",
  "Finding relevant Cprime learning",
  "Organizing your learning sequence",
  "Building your personalized roadmap",
];

const STEP_LABELS = ["Current context", "Career goal", "Learning preferences"];

type Phase =
  | "form"
  | "matching"
  | "recommendation"
  | "no-match"
  | "generating"
  | "error";

type FailedAction = "matching" | "generation";

interface Answers {
  role: string;
  experienceLevel: SkillLevel | "";
  careerGoal: string;
  learningPreferences: LearningPreference[];
  availableHoursPerWeek: number | "";
}

const EMPTY_ANSWERS: Answers = {
  role: "",
  experienceLevel: "",
  careerGoal: "",
  learningPreferences: [],
  availableHoursPerWeek: "",
};

function answersFromPrefs(prefs: OnboardingPrefs | null): Answers {
  return {
    role: prefs?.role ?? "",
    experienceLevel: prefs?.experienceLevel ?? "",
    careerGoal: prefs?.careerGoal || prefs?.preparingFor || "",
    learningPreferences: prefs?.learningPreferences ?? [],
    availableHoursPerWeek: prefs?.availableHoursPerWeek || "",
  };
}

function prefsFromAnswers(
  answers: Answers,
  name: string,
  onboarded: boolean,
): OnboardingPrefs {
  const goal = answers.careerGoal.trim();
  return {
    name: name.trim(),
    role: answers.role.trim(),
    experienceLevel: answers.experienceLevel,
    careerGoal: goal,
    learningPreferences: answers.learningPreferences,
    availableHoursPerWeek: Number(answers.availableHoursPerWeek) || 0,
    interests: goal ? [goal] : [],
    preparingFor: goal,
    onboarded,
  };
}

function stepIsValid(step: number, answers: Answers): boolean {
  if (step === 0) {
    return answers.role.trim().length >= 2 && Boolean(answers.experienceLevel);
  }
  if (step === 1) return answers.careerGoal.trim().length >= 8;
  return (
    answers.learningPreferences.length > 0
    && Number(answers.availableHoursPerWeek) >= 1
    && Number(answers.availableHoursPerWeek) <= 40
  );
}

function allStepsAreValid(answers: Answers): answers is Answers & {
  experienceLevel: SkillLevel;
  availableHoursPerWeek: number;
} {
  return [0, 1, 2].every((step) => stepIsValid(step, answers));
}

function cprimeCoursesForRoadmap(roadmap: LearningRoadmap): CprimeBootcamp[] {
  const ids = new Set(
    roadmap.stages.flatMap((stage) => (
      stage.topics.flatMap((topic) => topic.bootcampIds)
    )),
  );
  return Array.from(ids)
    .map((id) => CPRIME_BOOTCAMPS[id])
    .filter((course): course is CprimeBootcamp => Boolean(course));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, getToken } = useAuth();
  const {
    prefs,
    learnerReady,
    setPrefs,
    setOnboardingDraft,
    addCustomRoadmap,
    startRoadmap,
  } = useLearner();

  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [phase, setPhase] = useState<Phase>("form");
  const [hydrated, setHydrated] = useState(false);
  const [profileWasComplete, setProfileWasComplete] = useState(false);
  const [matchingStage, setMatchingStage] = useState(0);
  const [generationStage, setGenerationStage] = useState(0);
  const [matches, setMatches] = useState<RankedRoadmapMatch[]>([]);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [failedAction, setFailedAction] = useState<FailedAction>("matching");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);

  const onboardingCompleteRef = useRef(false);
  const matchRequestRef = useRef(0);
  const generationRequestRef = useRef(0);
  const generationRunningRef = useRef(false);
  const openingRoadmapRef = useRef(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const firstFieldRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null
  >(null);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const selectedMatch = matches[selectedMatchIndex] ?? null;
  const selectedCprimeCourses = useMemo(
    () => selectedMatch ? cprimeCoursesForRoadmap(selectedMatch.roadmap) : [],
    [selectedMatch],
  );
  const canContinue = stepIsValid(stepIndex, answers);
  const displayName = prefs?.name || user?.displayName || user?.username || "";
  const hasSavedAnswers = Boolean(
    answers.role
    || answers.careerGoal
    || answers.learningPreferences.length
    || answers.availableHoursPerWeek,
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.isAdmin) router.replace("/admin/dashboard");
  }, [loading, router, user]);

  useEffect(() => {
    if (!learnerReady || !user || user.isAdmin || hydrated) return;
    const restored = answersFromPrefs(prefs);
    setAnswers(restored);
    if (!prefs?.onboarded) {
      const firstIncompleteStep = [0, 1, 2].find((index) => !stepIsValid(index, restored));
      setStepIndex(firstIncompleteStep ?? 2);
    }
    onboardingCompleteRef.current = Boolean(prefs?.onboarded);
    setProfileWasComplete(Boolean(prefs?.onboarded));
    setHydrated(true);
  }, [hydrated, learnerReady, prefs, user]);

  // The existing LearnerProvider owns both local persistence and backend sync.
  // Drafts use the same preference object so a refresh or failed request cannot
  // discard answers.
  useEffect(() => {
    if (!hydrated || phase !== "form") return;
    const timer = window.setTimeout(() => {
      setOnboardingDraft(
        prefsFromAnswers(answers, displayName, onboardingCompleteRef.current),
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [answers, displayName, hydrated, phase, setOnboardingDraft]);

  useEffect(() => {
    if (!hydrated || phase !== "form") return;
    const timer = window.setTimeout(() => {
      (firstFieldRef.current ?? stepHeadingRef.current)?.focus();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [hydrated, phase, stepIndex]);

  useEffect(() => () => {
    matchRequestRef.current += 1;
    generationRequestRef.current += 1;
    generationAbortRef.current?.abort();
  }, []);

  const updateAnswer = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const togglePreference = (preference: LearningPreference) => {
    setAnswers((current) => ({
      ...current,
      learningPreferences: current.learningPreferences.includes(preference)
        ? current.learningPreferences.filter((item) => item !== preference)
        : [...current.learningPreferences, preference],
    }));
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    setDirection(-1);
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const openFormAt = (index: number) => {
    matchRequestRef.current += 1;
    generationAbortRef.current?.abort();
    generationRunningRef.current = false;
    setDirection(index < stepIndex ? -1 : 1);
    setStepIndex(index);
    setPhase("form");
  };

  const findRoadmap = async () => {
    if (!allStepsAreValid(answers)) return;
    const requestId = ++matchRequestRef.current;
    const completedPrefs = prefsFromAnswers(answers, displayName, true);
    onboardingCompleteRef.current = true;
    setProfileWasComplete(true);
    setPrefs(completedPrefs);
    setPhase("matching");
    setMatchingStage(0);
    setErrorMessage("");

    try {
      for (let index = 0; index < MATCHING_STAGES.length; index += 1) {
        if (requestId !== matchRequestRef.current) return;
        setMatchingStage(index);
        await wait(index === MATCHING_STAGES.length - 1 ? 620 : 520);
      }
      if (requestId !== matchRequestRef.current) return;
      const ranked = rankRoadmapsForGoal(LEARNING_ROADMAPS, {
        goal: answers.careerGoal,
        currentRole: answers.role,
        experienceLevel: answers.experienceLevel,
      });
      setMatches(ranked);
      setSelectedMatchIndex(0);
      setPhase(ranked.length ? "recommendation" : "no-match");
    } catch {
      if (requestId !== matchRequestRef.current) return;
      setFailedAction("matching");
      setErrorMessage(
        "We couldn’t finish the roadmap search. Your answers are saved, so you can retry safely.",
      );
      setPhase("error");
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue) return;
    if (stepIndex < 2) {
      setDirection(1);
      setStepIndex((current) => current + 1);
      return;
    }
    void findRoadmap();
  };

  const useRoadmap = () => {
    if (!selectedMatch || openingRoadmapRef.current) return;
    openingRoadmapRef.current = true;
    startRoadmap(selectedMatch.roadmap.id);
    router.push(`/path/${selectedMatch.roadmap.id}`);
  };

  const generateRoadmap = async () => {
    if (!allStepsAreValid(answers) || generationRunningRef.current) return;
    generationRunningRef.current = true;
    const requestId = ++generationRequestRef.current;
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setGenerationStage(0);
    setPhase("generating");
    setErrorMessage("");

    const progressTimer = window.setInterval(() => {
      setGenerationStage((current) => (
        current < GENERATION_STAGES.length - 1 ? current + 1 : current
      ));
    }, 1_250);

    try {
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/discover/roadmap`,
        {
          prompt: [
            answers.careerGoal.trim(),
            `Current role: ${answers.role.trim()}.`,
            `Experience: ${answers.experienceLevel}.`,
            `Learning preferences: ${answers.learningPreferences.join(", ")}.`,
            `Available time: ${answers.availableHoursPerWeek} hours per week.`,
          ].join(" "),
        },
        {
          headers: token ? { Authorization: token } : undefined,
          signal: controller.signal,
        },
      );
      if (requestId !== generationRequestRef.current) return;
      const roadmap = sanitizeCustomRoadmaps([response.data?.roadmap])[0];
      if (!roadmap) throw new Error("The generated roadmap was incomplete.");
      setGenerationStage(GENERATION_STAGES.length - 1);
      addCustomRoadmap(roadmap);
      startRoadmap(roadmap.id);
      router.push(`/path/custom/${roadmap.id}`);
    } catch (error) {
      if (axios.isCancel(error) || requestId !== generationRequestRef.current) return;
      setFailedAction("generation");
      setErrorMessage(
        "We couldn’t reach the roadmap generation service. Nothing was lost and no duplicate request was created.",
      );
      setPhase("error");
    } finally {
      window.clearInterval(progressTimer);
      if (requestId === generationRequestRef.current) {
        generationRunningRef.current = false;
        generationAbortRef.current = null;
      }
    }
  };

  const resetOnboarding = () => {
    matchRequestRef.current += 1;
    generationRequestRef.current += 1;
    generationAbortRef.current?.abort();
    generationRunningRef.current = false;
    openingRoadmapRef.current = false;
    onboardingCompleteRef.current = false;
    setProfileWasComplete(false);
    setAnswers(EMPTY_ANSWERS);
    setMatches([]);
    setSelectedMatchIndex(0);
    setStepIndex(0);
    setDirection(-1);
    setPhase("form");
    setConfirmingReset(false);
    setOnboardingDraft(prefsFromAnswers(EMPTY_ANSWERS, displayName, false));
  };

  if (
    loading
    || !user
    || user.isAdmin
    || !learnerReady
    || !hydrated
  ) {
    return (
      <main className="ob-page ob-loading" aria-busy="true">
        <LoaderCircle className="ob-spin" aria-hidden="true" />
        <p>Preparing your learning profile…</p>
      </main>
    );
  }

  return (
    <main className="ob-page">
      <header className="ob-topbar">
        <div className="ob-brand" aria-label="Ctrl+Teach">
          Ctrl<span>+</span>Teach
        </div>
        <div className="ob-topbar-actions">
          {profileWasComplete && <span className="ob-saved"><Check size={13} /> Profile saved</span>}
          {hasSavedAnswers && (
            <button type="button" className="ob-start-over" onClick={() => setConfirmingReset(true)}>
              <RotateCcw size={14} /> Start over
            </button>
          )}
        </div>
      </header>

      {phase === "form" ? (
        <div className="ob-shell">
          <nav className="ob-stepper" aria-label="Onboarding progress">
            {STEP_LABELS.map((label, index) => {
              const complete = stepIsValid(index, answers);
              const current = stepIndex === index;
              return (
                <div
                  key={label}
                  className={`ob-stepper-item ${current ? "is-current" : ""} ${complete ? "is-complete" : ""}`}
                  aria-current={current ? "step" : undefined}
                >
                  <span className="ob-stepper-number">
                    {complete && !current ? <Check size={13} /> : index + 1}
                  </span>
                  <span>
                    <small>Step {index + 1}</small>
                    <strong>{label}</strong>
                  </span>
                </div>
              );
            })}
          </nav>

          <div className="ob-layout">
            <form className="ob-form" onSubmit={onSubmit}>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.section
                  key={stepIndex}
                  custom={direction}
                  initial={{ opacity: 0, x: direction * 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -20 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  aria-labelledby={`ob-step-title-${stepIndex}`}
                >
                  {stepIndex === 0 && (
                    <>
                      <div className="ob-kicker">Start where you are</div>
                      <h1
                        id="ob-step-title-0"
                        ref={stepHeadingRef}
                        className="ob-title"
                        tabIndex={-1}
                      >
                        Tell us about your current context.
                      </h1>
                      <p className="ob-intro">
                        Your role and experience help us avoid teaching below or above the level you need.
                      </p>

                      <div className="ob-fields">
                        <label className="ob-field" htmlFor="current-role">
                          <span>Current role</span>
                          <input
                            ref={firstFieldRef as React.RefObject<HTMLInputElement>}
                            id="current-role"
                            value={answers.role}
                            onChange={(event) => updateAnswer("role", event.target.value)}
                            placeholder="Software Engineer"
                            autoComplete="organization-title"
                            maxLength={80}
                          />
                        </label>

                        <fieldset className="ob-fieldset">
                          <legend>Experience level</legend>
                          <div className="ob-segmented" role="radiogroup">
                            {EXPERIENCE_LEVELS.map((level) => (
                              <button
                                key={level}
                                type="button"
                                role="radio"
                                aria-checked={answers.experienceLevel === level}
                                className={answers.experienceLevel === level ? "is-selected" : ""}
                                onClick={() => updateAnswer("experienceLevel", level)}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                    </>
                  )}

                  {stepIndex === 1 && (
                    <>
                      <div className="ob-kicker">Your destination</div>
                      <h1
                        id="ob-step-title-1"
                        ref={stepHeadingRef}
                        className="ob-title ob-title-goal"
                        tabIndex={-1}
                      >
                        What do you want to become?
                      </h1>
                      <p className="ob-intro">
                        Describe the outcome in your own words. We’ll find the closest existing roadmap before creating anything new.
                      </p>

                      <label className="ob-goal-field" htmlFor="career-goal">
                        <span className="ob-sr-only">Career goal</span>
                        <textarea
                          ref={firstFieldRef as React.RefObject<HTMLTextAreaElement>}
                          id="career-goal"
                          value={answers.careerGoal}
                          onChange={(event) => updateAnswer("careerGoal", event.target.value)}
                          placeholder="I want to become a cloud architect."
                          rows={4}
                          maxLength={500}
                        />
                        <small>{answers.careerGoal.length}/500</small>
                      </label>

                      <div className="ob-examples" aria-label="Career goal examples">
                        <span>Try an example</span>
                        <div>
                          {GOAL_EXAMPLES.map((goal) => (
                            <button
                              key={goal}
                              type="button"
                              onClick={() => updateAnswer("careerGoal", goal)}
                            >
                              {goal}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {stepIndex === 2 && (
                    <>
                      <div className="ob-kicker">Make it work for you</div>
                      <h1
                        id="ob-step-title-2"
                        ref={stepHeadingRef}
                        className="ob-title"
                        tabIndex={-1}
                      >
                        How do you learn best?
                      </h1>
                      <p className="ob-intro">
                        Choose every format that helps. We’ll use your weekly time to keep the path realistic.
                      </p>

                      <fieldset className="ob-fieldset ob-preference-fieldset">
                        <legend>Learning preferences</legend>
                        <div className="ob-preference-grid">
                          {LEARNING_PREFERENCES.map((preference, index) => {
                            const selected = answers.learningPreferences.includes(preference.value);
                            return (
                              <button
                                key={preference.value}
                                ref={index === 0 ? firstFieldRef as React.RefObject<HTMLButtonElement> : undefined}
                                type="button"
                                aria-pressed={selected}
                                className={selected ? "is-selected" : ""}
                                onClick={() => togglePreference(preference.value)}
                              >
                                <span className="ob-check"><Check size={13} /></span>
                                <span>
                                  <strong>{preference.value}</strong>
                                  <small>{preference.detail}</small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      <fieldset className="ob-fieldset ob-hours-fieldset">
                        <legend>Hours per week</legend>
                        <div className="ob-hours-row">
                          <label htmlFor="hours-per-week">
                            <Clock3 size={18} aria-hidden="true" />
                            <input
                              id="hours-per-week"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={40}
                              value={answers.availableHoursPerWeek}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateAnswer(
                                  "availableHoursPerWeek",
                                  value === "" ? "" : Number(value),
                                );
                              }}
                            />
                            <span>hours / week</span>
                          </label>
                          <div className="ob-hour-presets" aria-label="Weekly hour presets">
                            {[3, 5, 8].map((hours) => (
                              <button
                                key={hours}
                                type="button"
                                className={answers.availableHoursPerWeek === hours ? "is-selected" : ""}
                                onClick={() => updateAnswer("availableHoursPerWeek", hours)}
                              >
                                {hours}h
                              </button>
                            ))}
                          </div>
                        </div>
                      </fieldset>
                    </>
                  )}
                </motion.section>
              </AnimatePresence>

              <div className="ob-navigation">
                <button
                  type="button"
                  className="ob-button ob-button-secondary"
                  onClick={goBack}
                  disabled={stepIndex === 0}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  type="submit"
                  className="ob-button ob-button-primary"
                  disabled={!canContinue}
                >
                  {stepIndex === 2 ? "Find my roadmap" : "Continue"}
                  {stepIndex === 2 ? <Sparkles size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
            </form>

            <aside className="ob-summary" aria-label="Your learning direction">
              <div className="ob-summary-heading">
                <Target size={18} />
                <span>
                  <small>Your direction</small>
                  <strong>Goal first, roadmap second.</strong>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Current context</dt>
                  <dd>
                    {answers.role || "Add your role"}
                    {answers.experienceLevel && <span>{answers.experienceLevel}</span>}
                  </dd>
                </div>
                <div className="ob-summary-goal">
                  <dt>Career goal</dt>
                  <dd>{answers.careerGoal || "Describe what you want to become"}</dd>
                </div>
                <div>
                  <dt>Learning rhythm</dt>
                  <dd>
                    {answers.learningPreferences.length
                      ? answers.learningPreferences.join(", ")
                      : "Choose how you learn"}
                    {answers.availableHoursPerWeek && (
                      <span>{answers.availableHoursPerWeek} hours each week</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p>
                We search the existing Cprime roadmap catalogue before offering personalized generation.
              </p>
            </aside>
          </div>
        </div>
      ) : (
        <div className="ob-outcome-shell">
          {(phase === "matching" || phase === "generating") && (
            <section className="ob-process" aria-live="polite" aria-busy="true">
              <div className="ob-process-mark">
                {phase === "matching" ? <Target size={24} /> : <Sparkles size={24} />}
              </div>
              <div className="ob-kicker">
                {phase === "matching" ? "Finding your best starting point" : "Creating with your confirmation"}
              </div>
              <h1>
                {phase === "matching"
                  ? "Turning your goal into a clear direction."
                  : "Building a roadmap around your goal."}
              </h1>
              <p>
                {phase === "matching"
                  ? `We’re comparing “${answers.careerGoal.trim()}” with published Ctrl+Teach roadmaps.`
                  : "Your preferences and available time are shaping the sequence."}
              </p>
              <ol className="ob-process-list">
                {(phase === "matching" ? MATCHING_STAGES : GENERATION_STAGES).map((label, index) => {
                  const activeIndex = phase === "matching" ? matchingStage : generationStage;
                  return (
                    <li
                      key={label}
                      className={`${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-complete" : ""}`}
                    >
                      <span>{index < activeIndex ? <Check size={14} /> : index + 1}</span>
                      <strong>{label}</strong>
                      {index === activeIndex && <LoaderCircle className="ob-spin" size={16} />}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {phase === "recommendation" && selectedMatch && (
            <section className="ob-result">
              <div className="ob-result-heading">
                <div>
                  <div className="ob-kicker">Recommended for you</div>
                  <h1>We found a roadmap that fits.</h1>
                  <p>{selectedMatch.reason}</p>
                </div>
                <button type="button" className="ob-edit-link" onClick={() => openFormAt(1)}>
                  Edit answers
                </button>
              </div>

              <article
                className="ob-roadmap-card"
                style={{
                  "--roadmap-accent": selectedMatch.roadmap.accent,
                  "--roadmap-soft": selectedMatch.roadmap.softAccent,
                } as React.CSSProperties}
              >
                <div className="ob-roadmap-main">
                  <div className="ob-roadmap-eyebrow">{selectedMatch.roadmap.eyebrow}</div>
                  <h2>{selectedMatch.roadmap.title}</h2>
                  <p>{selectedMatch.roadmap.description}</p>
                  <div className="ob-roadmap-meta">
                    <span><Clock3 size={15} /> {selectedMatch.roadmap.duration}</span>
                    <span><Layers3 size={15} /> {selectedMatch.roadmap.stages.length} skill stages</span>
                    <span><BookOpenCheck size={15} /> {selectedCprimeCourses.length} Cprime courses</span>
                  </div>
                  <div className="ob-roadmap-actions">
                    <button type="button" className="ob-button ob-button-primary" onClick={useRoadmap}>
                      Use this roadmap <ArrowRight size={16} />
                    </button>
                    <button type="button" className="ob-button ob-button-secondary" onClick={() => void generateRoadmap()}>
                      Generate a different roadmap
                    </button>
                  </div>
                </div>

                <div className="ob-roadmap-details">
                  <section>
                    <h3>Skill stages</h3>
                    <ol className="ob-stage-list">
                      {selectedMatch.roadmap.stages.map((stage, index) => (
                        <li key={stage.id}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{stage.label.replace(/^\d+\s*·\s*/, "")}</strong>
                            <small>{stage.topics.map((topic) => topic.title).join(" · ")}</small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section>
                    <h3>Associated Cprime courses</h3>
                    {selectedCprimeCourses.length ? (
                      <div className="ob-cprime-list">
                        {selectedCprimeCourses.map((course) => (
                          <a key={course.id} href={course.url} target="_blank" rel="noreferrer">
                            <span>
                              <strong>{course.title}</strong>
                              <small>{course.duration} · {course.format}</small>
                            </span>
                            <ExternalLink size={14} />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="ob-empty-courses">
                        Course options will appear inside each roadmap stage.
                      </p>
                    )}
                  </section>
                </div>
              </article>

              {matches.length > 1 && (
                <div className="ob-alternatives">
                  <span>Other strong matches</span>
                  <div>
                    {matches.slice(1).map((match, index) => (
                      <button
                        key={match.roadmap.id}
                        type="button"
                        onClick={() => setSelectedMatchIndex(index + 1)}
                      >
                        <strong>{match.roadmap.title}</strong>
                        <small>{match.roadmap.duration}</small>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {phase === "no-match" && (
            <section className="ob-decision">
              <div className="ob-process-mark"><Target size={24} /></div>
              <div className="ob-kicker">No suitable published match</div>
              <h1>We couldn’t find an existing roadmap that fully matches your goal.</h1>
              <p>Would you like Ctrl+Teach to create a personalized roadmap?</p>
              <blockquote>“{answers.careerGoal.trim()}”</blockquote>
              <div className="ob-decision-actions">
                <button type="button" className="ob-button ob-button-primary" onClick={() => void generateRoadmap()}>
                  Generate my roadmap <Sparkles size={16} />
                </button>
                <button type="button" className="ob-button ob-button-secondary" onClick={() => openFormAt(1)}>
                  Change my goal
                </button>
              </div>
              <small>Nothing will be generated until you choose the primary action.</small>
            </section>
          )}

          {phase === "error" && (
            <section className="ob-decision ob-error" role="alert">
              <div className="ob-process-mark"><RotateCcw size={24} /></div>
              <div className="ob-kicker">A connection problem, not a missing match</div>
              <h1>We hit a temporary problem.</h1>
              <p>{errorMessage}</p>
              <div className="ob-decision-actions">
                <button
                  type="button"
                  className="ob-button ob-button-primary"
                  onClick={() => failedAction === "generation" ? void generateRoadmap() : void findRoadmap()}
                >
                  Retry <RotateCcw size={15} />
                </button>
                <button type="button" className="ob-button ob-button-secondary" onClick={() => openFormAt(1)}>
                  Review my answers
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      <AnimatePresence>
        {confirmingReset && (
          <motion.div
            className="ob-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setConfirmingReset(false);
            }}
          >
            <motion.section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="start-over-title"
              className="ob-dialog"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
            >
              <div className="ob-kicker">Confirm reset</div>
              <h2 id="start-over-title">Start onboarding again?</h2>
              <p>This clears these onboarding answers. Your learning progress and completed work stay untouched.</p>
              <div>
                <button type="button" className="ob-button ob-button-secondary" onClick={() => setConfirmingReset(false)}>
                  Keep my answers
                </button>
                <button type="button" className="ob-button ob-button-danger" onClick={resetOnboarding}>
                  Start over
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
