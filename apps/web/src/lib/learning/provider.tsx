"use client";

/**
 * LearnerProvider — the global learner state for Ctrl+Teach.
 *
 * Holds onboarding prefs, the active course + lesson, and progress
 * (XP, streak, confidence, badges, completed lessons + checkpoints).
 * Persisted to localStorage and mirrored to the backend Profile.preferences
 * so the AI companion can personalize the experience.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL } from "@/lib/constants";
import type {
  OnboardingPrefs,
  CourseOnboardingPrefs,
  Course,
  ProgressState,
  Badge,
  BrowserLabRecoveryMemory,
  LearnerSkillProfile,
  LearningMemory,
} from "@/lib/types";
import { SEED_COURSES } from "@/lib/courses/catalog";
import {
  sanitizeCustomRoadmaps,
  type LearningRoadmap,
} from "@/lib/learning/roadmaps";
import {
  appendLearningMemory,
  createAssessmentMemory,
  createFeedbackMemory,
  createInterestMemory,
  createLessonMemory,
  createPracticeMemory,
  deriveSkillProfile,
  mergeLearningMemories,
  resolveLearningContext,
  sanitizeLearningMemories,
} from "@/lib/learning/skillProfile";

const LS_KEY = "ctrlteach_learner_v1";
const LESSON_PROGRESS_SEPARATOR = "::";
// Demo mode: keep completion, XP, checkpoints, streaks, and badges in memory
// for the current page session, but begin fresh after a reload.
const PERSIST_LEARNING_PROGRESS = false;

function lessonProgressId(courseId: string, lessonId: string): string {
  return `${courseId}${LESSON_PROGRESS_SEPARATOR}${lessonId}`;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function advanceDailyStreak(progress: ProgressState, now = new Date()): ProgressState {
  const today = localDateKey(now);
  if (progress.lastActivityDate === today) return progress;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const continued = progress.lastActivityDate === localDateKey(yesterday);
  return {
    ...progress,
    streak: continued ? Math.max(1, progress.streak) + 1 : 1,
    lastActivityDate: today,
  };
}

function migrateProgress(progress: ProgressState | undefined, activeCourseId: string | null): ProgressState {
  const base = defaultProgress();
  if (!progress || typeof progress !== "object") return base;
  const completedLessons = Array.isArray(progress.completedLessons)
    ? Array.from(new Set(
        progress.completedLessons
          .filter((id): id is string => typeof id === "string" && Boolean(id))
          .map((id) => (
            id.includes(LESSON_PROGRESS_SEPARATOR) || !activeCourseId
              ? id
              : lessonProgressId(activeCourseId, id)
          )),
      ))
    : [];
  return {
    ...base,
    ...progress,
    xp: Number.isFinite(progress.xp) ? Math.max(0, Math.round(progress.xp)) : 0,
    streak: typeof progress.lastActivityDate === "string" && Number.isFinite(progress.streak)
      ? Math.max(0, Math.round(progress.streak))
      : 0,
    lastActivityDate: typeof progress.lastActivityDate === "string"
      ? progress.lastActivityDate
      : undefined,
    courseCompletedAt: progress.courseCompletedAt && typeof progress.courseCompletedAt === "object"
      ? Object.fromEntries(
          Object.entries(progress.courseCompletedAt)
            .filter(([courseId, timestamp]) => (
              Boolean(courseId)
              && Number.isFinite(timestamp)
              && Number(timestamp) > 0
            ))
            .map(([courseId, timestamp]) => [courseId, Math.round(Number(timestamp))]),
        )
      : {},
    confidence: Number.isFinite(progress.confidence)
      ? Math.min(5, Math.max(0, Math.round(progress.confidence)))
      : 0,
    completedLessons,
    checkpoints: Array.isArray(progress.checkpoints)
      ? Array.from(new Set(
          progress.checkpoints
            .filter((id): id is string => typeof id === "string" && Boolean(id))
            .map((id) => {
              if (id.includes(LESSON_PROGRESS_SEPARATOR) || !activeCourseId || !id.endsWith("-checkpoint")) {
                return id;
              }
              const lessonId = id.slice(0, -"-checkpoint".length);
              return `${lessonProgressId(activeCourseId, lessonId)}${LESSON_PROGRESS_SEPARATOR}assessment`;
            }),
        ))
      : [],
    badges: Array.isArray(progress.badges) ? progress.badges : base.badges,
  };
}

interface PersistedState {
  /** Prevents one signed-in learner from inheriting another's browser cache. */
  ownerUserId: string | null;
  prefs: OnboardingPrefs | null;
  /** Course-specific onboarding prefs keyed by courseId. */
  coursePrefs: Record<string, CourseOnboardingPrefs>;
  activeCourseId: string | null;
  activeLessonId: string | null;
  progress: ProgressState;
  /** Roadmap topics the learner has explicitly marked complete. */
  completedRoadmapTopics: string[];
  /** Roadmaps where the learner has completed a topic or opened learning options. */
  startedRoadmaps: string[];
  /** Learner-owned roadmaps created from free-form prompts. */
  customRoadmaps: LearningRoadmap[];
  savedCourses: Course[];
  learningMemories: LearningMemory[];
}

const DEFAULT_BADGES: Badge[] = [
  { id: "first-session", title: "First Steps", description: "Completed your first lesson", icon: "sparkles" },
  { id: "lab-master", title: "Pixel Coach", description: "Completed a Lab Mode session", icon: "target" },
  { id: "quiz-ace", title: "Quiz Ace", description: "Scored 100% on an assessment", icon: "brain" },
  { id: "roleplayer", title: "Roleplayer", description: "Completed a roleplay simulation", icon: "users" },
  { id: "streak-3", title: "On Fire", description: "3-day learning streak", icon: "flame" },
  { id: "certified", title: "Certified", description: "Finished a full course", icon: "trophy" },
];

function defaultProgress(): ProgressState {
  return {
    xp: 0,
    streak: 0,
    courseCompletedAt: {},
    confidence: 0,
    completedLessons: [],
    checkpoints: [],
    badges: DEFAULT_BADGES.map((b) => ({ ...b })),
  };
}

function loadState(): PersistedState {
  const base: PersistedState = {
    ownerUserId: null,
    prefs: null,
    coursePrefs: {},
    activeCourseId: null,
    activeLessonId: null,
    progress: defaultProgress(),
    completedRoadmapTopics: [],
    startedRoadmaps: [],
    customRoadmaps: [],
    savedCourses: [],
    learningMemories: [],
  };
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const activeCourseId = typeof parsed?.activeCourseId === "string" ? parsed.activeCourseId : null;
      const progress = PERSIST_LEARNING_PROGRESS
        ? migrateProgress(parsed?.progress, activeCourseId)
        : defaultProgress();
      const courseCompletedAt = { ...(progress.courseCompletedAt ?? {}) };
      const knownCourses = [
        ...SEED_COURSES,
        ...(Array.isArray(parsed?.savedCourses) ? parsed.savedCourses : []),
      ];
      for (const course of PERSIST_LEARNING_PROGRESS ? knownCourses : []) {
        if (!course || typeof course.id !== "string") continue;
        const lessons = course?.modules?.flatMap((module: Course["modules"][number]) => module.lessons) ?? [];
        if (
          lessons.length > 0
          && !courseCompletedAt[course.id]
          && lessons.every((lesson: Course["modules"][number]["lessons"][number]) => (
            progress.completedLessons.includes(lessonProgressId(course.id, lesson.id))
          ))
        ) {
          courseCompletedAt[course.id] = Date.now();
        }
      }
      return {
        ...base,
        ...parsed,
        activeCourseId,
        progress: { ...progress, courseCompletedAt },
        completedRoadmapTopics: Array.isArray(parsed?.completedRoadmapTopics)
          ? parsed.completedRoadmapTopics.filter((item: unknown): item is string => typeof item === "string")
          : [],
        startedRoadmaps: Array.isArray(parsed?.startedRoadmaps)
          ? parsed.startedRoadmaps.filter((item: unknown): item is string => typeof item === "string")
          : Array.isArray(parsed?.completedRoadmapTopics)
            ? Array.from(new Set(parsed.completedRoadmapTopics
                .filter((item: unknown): item is string => typeof item === "string")
                .map((item: string) => item.split(":")[0])
                .filter(Boolean)))
            : [],
        customRoadmaps: sanitizeCustomRoadmaps(parsed?.customRoadmaps),
        learningMemories: sanitizeLearningMemories(parsed?.learningMemories),
      };
    }
  } catch {}
  return base;
}

function onboardingPrefsFromRemote(value: unknown): OnboardingPrefs | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const hasOnboardingData = [
    raw.name,
    raw.role,
    raw.experienceLevel,
    raw.careerGoal,
    raw.preparingFor,
    raw.learningPreferences,
    raw.availableHoursPerWeek,
    raw.interests,
  ].some((item) => item !== undefined && item !== null);
  if (!hasOnboardingData) return null;
  const experienceLevel = raw.experienceLevel === "Beginner"
    || raw.experienceLevel === "Intermediate"
    || raw.experienceLevel === "Advanced"
    ? raw.experienceLevel
    : "";
  const careerGoal = typeof raw.careerGoal === "string"
    ? raw.careerGoal
    : typeof raw.preparingFor === "string"
      ? raw.preparingFor
      : "";
  const learningPreferences = Array.isArray(raw.learningPreferences)
    ? raw.learningPreferences.filter((item): item is OnboardingPrefs["learningPreferences"][number] => (
        item === "Visual explanations"
        || item === "Hands-on practice"
        || item === "Reading"
        || item === "Live, interactive teaching"
      ))
    : [];
  const availableHoursPerWeek = typeof raw.availableHoursPerWeek === "number"
    && Number.isFinite(raw.availableHoursPerWeek)
    ? Math.min(40, Math.max(0, Math.round(raw.availableHoursPerWeek)))
    : 0;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    role: typeof raw.role === "string" ? raw.role : "",
    experienceLevel,
    careerGoal,
    learningPreferences,
    availableHoursPerWeek,
    interests: Array.isArray(raw.interests)
      ? raw.interests.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    preparingFor: typeof raw.preparingFor === "string" ? raw.preparingFor : careerGoal,
    onboarded: Boolean(raw.onboarded),
  };
}

interface LearnerContextValue {
  /** True once the signed-in learner's remote profile has been reconciled. */
  learnerReady: boolean;
  prefs: OnboardingPrefs | null;
  isOnboarded: boolean;
  /** Course-specific prefs for the given id (or null if not onboarded yet). */
  getCoursePrefs: (courseId: string) => CourseOnboardingPrefs | null;
  /** All course-specific prefs keyed by id. */
  coursePrefs: Record<string, CourseOnboardingPrefs>;
  activeCourse: Course | null;
  activeCourseId: string | null;
  activeLessonId: string | null;
  progress: ProgressState;
  isLessonComplete: (courseId: string, lessonId: string) => boolean;
  completedRoadmapTopics: string[];
  startedRoadmaps: string[];
  customRoadmaps: LearningRoadmap[];
  addCustomRoadmap: (roadmap: LearningRoadmap) => void;
  startRoadmap: (roadmapId: string) => void;
  toggleRoadmapTopic: (topicId: string) => void;
  learningMemories: LearningMemory[];
  skillProfile: LearnerSkillProfile;
  /** All known courses — seeded catalog + discovered courses saved by id. */
  courses: Course[];
  savedCourses: Course[];
  setPrefs: (prefs: OnboardingPrefs) => void;
  /** Persist onboarding answers without recording them as completed evidence. */
  setOnboardingDraft: (prefs: OnboardingPrefs) => void;
  setCoursePrefs: (courseId: string, prefs: CourseOnboardingPrefs) => void;
  setActiveCourse: (courseId: string, lessonId?: string) => void;
  setActiveLesson: (lessonId: string) => void;
  addCourse: (course: Course) => void;
  removeCourse: (courseId: string) => void;
  addXp: (amount: number) => void;
  awardActivity: (result: {
    courseId?: string;
    lessonId: string;
    kind: "assessment" | "lab";
    xp: number;
  }) => void;
  completeLesson: (lessonId: string) => void;
  addCheckpoint: (id: string) => void;
  setConfidence: (value: number) => void;
  bumpStreak: () => void;
  earnBadge: (id: string) => void;
  recordAssessmentResult: (result: {
    courseId?: string;
    lessonId: string;
    score: number;
    confidence?: number;
    correct: number;
    total: number;
  }) => void;
  recordPracticeResult: (result: {
    courseId?: string;
    lessonId: string;
    kind: "lab" | "roleplay";
    summary: string;
    evidence: string[];
    activityId?: string;
    recovery?: BrowserLabRecoveryMemory;
  }) => void;
  recordLessonFeedback: (result: {
    courseId?: string;
    lessonId: string;
    feedback: string;
  }) => void;
  clearLearningMemories: () => void;
  reset: () => void;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const { user, getToken } = useAuth();
  const [state, setState] = useState<PersistedState>(loadState);
  const [platformCourses, setPlatformCourses] = useState<Course[]>([]);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const lastSyncRef = useRef<string>("");

  // Persist to localStorage on every change.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        ...state,
        progress: PERSIST_LEARNING_PROGRESS ? state.progress : defaultProgress(),
      }));
    } catch {}
  }, [state]);

  // Hydrate prefs from the backend Profile.preferences on login (single
  // source of truth across devices), but only prefer backend if we have none
  // locally so a half-finished onboarding isn't lost.
  useEffect(() => {
    if (!user) {
      setHydratedUserId(null);
      return;
    }
    let cancelled = false;
    setHydratedUserId(null);
    lastSyncRef.current = "";
    setState((current) => {
      if (!current.ownerUserId || current.ownerUserId === user.uid) {
        return current.ownerUserId === user.uid
          ? current
          : { ...current, ownerUserId: user.uid };
      }
      return {
        ownerUserId: user.uid,
        prefs: null,
        coursePrefs: {},
        activeCourseId: null,
        activeLessonId: null,
        progress: defaultProgress(),
        completedRoadmapTopics: [],
        startedRoadmaps: [],
        customRoadmaps: [],
        savedCourses: [],
        learningMemories: [],
      };
    });
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/users/me`, {
          headers: { Authorization: token },
        });
        const remoteCtrlTeach = res.data?.metadata?.preferences?.ctrlteach;
        const remotePrefs = onboardingPrefsFromRemote(remoteCtrlTeach);
        const remoteMemories = sanitizeLearningMemories(remoteCtrlTeach?.learnerMemory?.events);
        const remoteRoadmapTopics = Array.isArray(remoteCtrlTeach?.roadmapProgress?.completedTopicIds)
          ? remoteCtrlTeach.roadmapProgress.completedTopicIds.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : [];
        const remoteStartedRoadmaps = Array.isArray(remoteCtrlTeach?.roadmapProgress?.startedRoadmapIds)
          ? remoteCtrlTeach.roadmapProgress.startedRoadmapIds.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : [];
        const remoteCustomRoadmaps = sanitizeCustomRoadmaps(remoteCtrlTeach?.roadmapProgress?.customRoadmaps);
        if (!cancelled) {
          setState((current) => ({
            ...current,
            ownerUserId: user.uid,
            prefs: current.ownerUserId === user.uid ? current.prefs ?? remotePrefs : remotePrefs,
            learningMemories: mergeLearningMemories(
              current.ownerUserId === user.uid ? current.learningMemories : [],
              remoteMemories,
            ),
            completedRoadmapTopics: Array.from(new Set([
              ...(current.ownerUserId === user.uid ? current.completedRoadmapTopics : []),
              ...remoteRoadmapTopics,
            ])),
            startedRoadmaps: Array.from(new Set([
              ...(current.ownerUserId === user.uid ? current.startedRoadmaps : []),
              ...remoteStartedRoadmaps,
              ...remoteRoadmapTopics.map((topicId: string) => topicId.split(":")[0]).filter(Boolean),
            ])),
            customRoadmaps: sanitizeCustomRoadmaps([
              ...(current.ownerUserId === user.uid ? current.customRoadmaps : []),
              ...remoteCustomRoadmaps,
            ]),
          }));
        }
      } catch {
        // Local state remains usable when the profile service is unavailable.
      } finally {
        if (!cancelled) setHydratedUserId(user.uid);
      }
    })();
    return () => { cancelled = true; };
  }, [user, getToken]);

  // Public, admin-managed courses are deliberately kept outside local learner
  // persistence. Unpublishing a course therefore removes it on the next load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/platform-courses`);
        if (!cancelled && Array.isArray(res.data?.courses)) {
          setPlatformCourses(res.data.courses);
        }
      } catch {
        // The built-in catalog remains available if the backend is offline.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pull this learner's completed generated courses into their local catalog.
  // Backend versions win by id so direct URLs and My Library stay in sync.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/generated-courses`, {
          headers: { Authorization: token },
        });
        const generated: Course[] = Array.isArray(res.data?.courses)
          ? res.data.courses
              .filter((job: { status?: string; course?: Course; archivedAt?: string | null }) => job.status === "ready" && job.course && !job.archivedAt)
              .map((job: { course: Course }) => job.course)
          : [];
        const ids = new Set(generated.map((course) => course.id));
        setState((current) => ({
          ...current,
          savedCourses: [
            ...generated,
            ...current.savedCourses.filter((course) => !ids.has(course.id) && !course.id.startsWith("generated-")),
          ],
        }));
      } catch {}
    })();
  }, [user, getToken]);

  // Mirror onboarding preferences and the bounded evidence log to the profile.
  useEffect(() => {
    if (
      !user
      || state.ownerUserId !== user.uid
      || hydratedUserId !== user.uid
    ) return;
    const ctrlteach = {
      ...(state.prefs ?? {}),
      learnerMemory: {
        version: 1,
        events: state.learningMemories,
      },
      roadmapProgress: {
        version: 1,
        completedTopicIds: state.completedRoadmapTopics,
        startedRoadmapIds: state.startedRoadmaps,
        customRoadmaps: state.customRoadmaps,
      },
    };
    const sig = JSON.stringify(ctrlteach);
    if (sig === lastSyncRef.current) return;
    let cancelled = false;
    let startTimer: number | null = null;
    let retryTimer: number | null = null;
    let retryDelay = 5_000;
    let controller: AbortController | null = null;
    const syncProfile = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        controller = new AbortController();
        await axios.put(
          `${API_URL}/api/users/me`,
          // Nest under ctrlteach so we don't clobber other preferences.
          { preferences: { ctrlteach } },
          { headers: { Authorization: token }, signal: controller.signal }
        );
        if (!cancelled) lastSyncRef.current = sig;
      } catch (error) {
        if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === "ERR_CANCELED")) return;
        if (!cancelled) {
          retryTimer = window.setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 60_000);
            void syncProfile();
          }, retryDelay);
        }
      }
    };
    startTimer = window.setTimeout(() => { void syncProfile(); }, 300);
    return () => {
      cancelled = true;
      controller?.abort();
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.prefs, state.learningMemories, state.completedRoadmapTopics, state.startedRoadmaps, state.customRoadmaps, user, hydratedUserId, getToken]);

  const learnerReady = !user || hydratedUserId === user.uid;
  const ownsCachedState = user
    ? !state.ownerUserId || state.ownerUserId === user.uid
    : !state.ownerUserId;
  const exposedPrefs = ownsCachedState ? state.prefs : null;
  const exposedMemories = ownsCachedState ? state.learningMemories : [];
  const exposedProgress = ownsCachedState ? state.progress : defaultProgress();
  const exposedCoursePrefs = ownsCachedState ? state.coursePrefs : {};
  const exposedRoadmapTopics = ownsCachedState ? state.completedRoadmapTopics : [];
  const exposedStartedRoadmaps = ownsCachedState ? state.startedRoadmaps : [];
  const exposedCustomRoadmaps = ownsCachedState ? state.customRoadmaps : [];
  const courses = useMemo(() => {
    const learnerCourses = ownsCachedState ? state.savedCourses : [];
    const ordered = [
      ...platformCourses,
      ...SEED_COURSES.filter((course) => !platformCourses.some((item) => item.id === course.id)),
    ];
    const positions = new Map(ordered.map((course, index) => [course.id, index]));
    for (const course of learnerCourses) {
      const position = positions.get(course.id);
      if (position === undefined) {
        positions.set(course.id, ordered.length);
        ordered.push(course);
      } else {
        ordered[position] = course;
      }
    }
    return ordered;
  }, [ownsCachedState, platformCourses, state.savedCourses]);
  const skillProfile = useMemo(
    () => deriveSkillProfile(exposedMemories, exposedPrefs),
    [exposedMemories, exposedPrefs],
  );

  const value: LearnerContextValue = {
    learnerReady,
    prefs: exposedPrefs,
    isOnboarded: !!exposedPrefs?.onboarded,
    getCoursePrefs: (courseId) => exposedCoursePrefs[courseId] ?? null,
    coursePrefs: exposedCoursePrefs,
    activeCourse: courses.find((c) => c.id === (ownsCachedState ? state.activeCourseId : null)) ?? null,
    activeCourseId: ownsCachedState ? state.activeCourseId : null,
    activeLessonId: ownsCachedState ? state.activeLessonId : null,
    progress: exposedProgress,
    isLessonComplete: (courseId, lessonId) => (
      exposedProgress.completedLessons.includes(lessonProgressId(courseId, lessonId))
    ),
    completedRoadmapTopics: exposedRoadmapTopics,
    startedRoadmaps: exposedStartedRoadmaps,
    customRoadmaps: exposedCustomRoadmaps,
    addCustomRoadmap: (roadmap) =>
      setState((current) => ({
        ...current,
        customRoadmaps: sanitizeCustomRoadmaps([
          roadmap,
          ...current.customRoadmaps.filter((item) => item.id !== roadmap.id),
        ]),
      })),
    startRoadmap: (roadmapId) =>
      setState((current) => current.startedRoadmaps.includes(roadmapId)
        ? current
        : { ...current, startedRoadmaps: [...current.startedRoadmaps, roadmapId] }),
    toggleRoadmapTopic: (topicId) =>
      setState((current) => {
        const complete = current.completedRoadmapTopics.includes(topicId);
        const roadmapId = topicId.split(":")[0];
        return {
          ...current,
          completedRoadmapTopics: complete
            ? current.completedRoadmapTopics.filter((id) => id !== topicId)
            : [...current.completedRoadmapTopics, topicId],
          startedRoadmaps: !complete && roadmapId && !current.startedRoadmaps.includes(roadmapId)
            ? [...current.startedRoadmaps, roadmapId]
            : current.startedRoadmaps,
        };
      }),
    learningMemories: exposedMemories,
    skillProfile,
    courses,
    savedCourses: ownsCachedState ? state.savedCourses : [],
    setPrefs: (prefs) => setState((s) => ({
      ...s,
      prefs,
      learningMemories: appendLearningMemory(s.learningMemories, createInterestMemory(prefs)),
    })),
    setOnboardingDraft: (prefs) => setState((s) => {
      if (JSON.stringify(s.prefs) === JSON.stringify(prefs)) return s;
      return { ...s, prefs };
    }),
    setCoursePrefs: (courseId, cp) =>
      setState((s) => ({
        ...s,
        coursePrefs: { ...s.coursePrefs, [courseId]: cp },
      })),
    setActiveCourse: (courseId, lessonId) =>
      setState((s) => ({
        ...s,
        activeCourseId: courseId,
        activeLessonId: lessonId ?? null,
      })),
    setActiveLesson: (lessonId) =>
      setState((s) => ({ ...s, activeLessonId: lessonId })),
    addCourse: (course) =>
      setState((s) => ({
        ...s,
        savedCourses: [course, ...s.savedCourses.filter((c) => c.id !== course.id)],
      })),
    removeCourse: (courseId) =>
      setState((s) => ({
        ...s,
        activeCourseId: s.activeCourseId === courseId ? null : s.activeCourseId,
        activeLessonId: s.activeCourseId === courseId ? null : s.activeLessonId,
        savedCourses: s.savedCourses.filter((course) => course.id !== courseId),
      })),
    addXp: (amount) =>
      setState((s) => ({
        ...s,
        progress: {
          ...s.progress,
          xp: s.progress.xp + Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0)),
        },
      })),
    awardActivity: (result) =>
      setState((s) => {
        const courseId = result.courseId ?? s.activeCourseId;
        if (!courseId) return s;
        const checkpointId = `${lessonProgressId(courseId, result.lessonId)}${LESSON_PROGRESS_SEPARATOR}${result.kind}`;
        if (s.progress.checkpoints.includes(checkpointId)) return s;
        return {
          ...s,
          progress: {
            ...s.progress,
            xp: s.progress.xp + Math.max(0, Math.round(Number.isFinite(result.xp) ? result.xp : 0)),
            checkpoints: [...s.progress.checkpoints, checkpointId],
          },
        };
      }),
    completeLesson: (lessonId) =>
      setState((s) => {
        const knownCourses = [...platformCourses, ...SEED_COURSES, ...s.savedCourses];
        const context = resolveLearningContext(knownCourses, s.activeCourseId, lessonId);
        const courseId = context.course?.id ?? s.activeCourseId;
        if (!courseId) return s;
        const completionId = lessonProgressId(courseId, lessonId);
        if (s.progress.completedLessons.includes(completionId)) return s;
        const completedLessons = [...s.progress.completedLessons, completionId];
        const nextProgress = advanceDailyStreak({
          ...s.progress,
          xp: s.progress.xp + 50,
          completedLessons,
        });
        const completedCourse = context.course
          ? context.course.modules
              .flatMap((module) => module.lessons)
              .every((lesson) => completedLessons.includes(lessonProgressId(courseId, lesson.id)))
          : false;
        const earnedBadgeIds = new Set(["first-session"]);
        if (nextProgress.streak >= 3) earnedBadgeIds.add("streak-3");
        if (completedCourse) earnedBadgeIds.add("certified");
        const earnedAt = Date.now();
        const courseCompletedAt = { ...(nextProgress.courseCompletedAt ?? {}) };
        if (completedCourse && !courseCompletedAt[courseId]) {
          courseCompletedAt[courseId] = earnedAt;
        }
        const hasDetailedMemory = s.learningMemories.some((memory) =>
          memory.lessonId === lessonId
          && memory.courseId === context.course?.id
          && memory.kind !== "lesson"
          && memory.kind !== "interest"
        );
        return {
          ...s,
          progress: {
            ...nextProgress,
            courseCompletedAt,
            badges: nextProgress.badges.map((badge) =>
              earnedBadgeIds.has(badge.id) && !badge.earnedAt
                ? { ...badge, earnedAt }
                : badge
            ),
          },
          learningMemories: hasDetailedMemory
            ? s.learningMemories
            : appendLearningMemory(s.learningMemories, createLessonMemory(context)),
        };
      }),
    addCheckpoint: (id) =>
      setState((s) =>
        s.progress.checkpoints.includes(id)
          ? s
          : {
              ...s,
              progress: { ...s.progress, checkpoints: [...s.progress.checkpoints, id] },
            }
      ),
    setConfidence: (v) =>
      setState((s) => ({
        ...s,
        progress: {
          ...s.progress,
          confidence: Math.min(5, Math.max(0, Math.round(Number.isFinite(v) ? v : 0))),
        },
      })),
    bumpStreak: () =>
      setState((s) => {
        const progress = advanceDailyStreak(s.progress);
        if (progress === s.progress) return s;
        const earnedAt = Date.now();
        return {
          ...s,
          progress: {
            ...progress,
            badges: progress.badges.map((badge) =>
              badge.id === "streak-3" && progress.streak >= 3 && !badge.earnedAt
                ? { ...badge, earnedAt }
                : badge
            ),
          },
        };
      }),
    earnBadge: (id) =>
      setState((s) => ({
        ...s,
        progress: {
          ...s.progress,
          badges: s.progress.badges.map((b) =>
            b.id === id && !b.earnedAt ? { ...b, earnedAt: Date.now() } : b
          ),
        },
      })),
    recordAssessmentResult: (result) =>
      setState((s) => {
        const context = resolveLearningContext(
          [...platformCourses, ...SEED_COURSES, ...s.savedCourses],
          s.activeCourseId,
          result.lessonId,
          result.courseId,
        );
        return {
          ...s,
          learningMemories: appendLearningMemory(
            s.learningMemories,
            createAssessmentMemory(context, result),
          ),
        };
      }),
    recordPracticeResult: (result) =>
      setState((s) => {
        const context = resolveLearningContext(
          [...platformCourses, ...SEED_COURSES, ...s.savedCourses],
          s.activeCourseId,
          result.lessonId,
          result.courseId,
        );
        return {
          ...s,
          learningMemories: appendLearningMemory(
            s.learningMemories,
            createPracticeMemory(context, result.kind, result.summary, result.evidence, {
              activityId: result.activityId,
              recovery: result.recovery,
            }),
          ),
        };
      }),
    recordLessonFeedback: (result) =>
      setState((s) => {
        const context = resolveLearningContext(
          [...platformCourses, ...SEED_COURSES, ...s.savedCourses],
          s.activeCourseId,
          result.lessonId,
          result.courseId,
        );
        return {
          ...s,
          learningMemories: appendLearningMemory(
            s.learningMemories,
            createFeedbackMemory(context, result.feedback),
          ),
        };
      }),
    clearLearningMemories: () =>
      setState((s) => ({ ...s, learningMemories: [] })),
    reset: () => {
      localStorage.removeItem(LS_KEY);
      setState({
        ownerUserId: user?.uid ?? null,
        prefs: null,
        coursePrefs: {},
        activeCourseId: null,
        activeLessonId: null,
        progress: defaultProgress(),
        completedRoadmapTopics: [],
        startedRoadmaps: [],
        customRoadmaps: [],
        savedCourses: [],
        learningMemories: [],
      });
    },
  };

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner() {
  const ctx = useContext(LearnerContext);
  if (!ctx) throw new Error("useLearner must be used within LearnerProvider");
  return ctx;
}
