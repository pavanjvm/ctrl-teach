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
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useAuth } from "@/components/AuthProvider";
import { API_URL } from "@/lib/constants";
import type {
  OnboardingPrefs,
  CourseOnboardingPrefs,
  Course,
  ProgressState,
  Badge,
} from "@/lib/types";
import { SEED_COURSES } from "@/lib/courses";

const LS_KEY = "ctrlteach_learner_v1";

interface PersistedState {
  prefs: OnboardingPrefs | null;
  /** Course-specific onboarding prefs keyed by courseId. */
  coursePrefs: Record<string, CourseOnboardingPrefs>;
  activeCourseId: string | null;
  activeLessonId: string | null;
  progress: ProgressState;
  savedCourses: Course[];
}

const DEFAULT_BADGES: Badge[] = [
  { id: "first-session", title: "First Steps", description: "Started your first lesson", icon: "sparkles" },
  { id: "lab-master", title: "Pixel Coach", description: "Completed a Lab Mode session", icon: "target" },
  { id: "quiz-ace", title: "Quiz Ace", description: "Scored 100% on an assessment", icon: "brain" },
  { id: "roleplayer", title: "Roleplayer", description: "Completed a roleplay simulation", icon: "users" },
  { id: "streak-3", title: "On Fire", description: "3-day learning streak", icon: "flame" },
  { id: "certified", title: "Certified", description: "Finished a full course", icon: "trophy" },
];

function defaultProgress(): ProgressState {
  return {
    xp: 0,
    streak: 1,
    confidence: 0,
    completedLessons: [],
    checkpoints: [],
    badges: DEFAULT_BADGES.map((b) => ({ ...b })),
  };
}

function loadState(): PersistedState {
  const base: PersistedState = {
    prefs: null,
    coursePrefs: {},
    activeCourseId: null,
    activeLessonId: null,
    progress: defaultProgress(),
    savedCourses: [],
  };
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {}
  return base;
}

interface LearnerContextValue {
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
  /** All known courses — seeded catalog + discovered courses saved by id. */
  courses: Course[];
  setPrefs: (prefs: OnboardingPrefs) => void;
  setCoursePrefs: (courseId: string, prefs: CourseOnboardingPrefs) => void;
  setActiveCourse: (courseId: string, lessonId?: string) => void;
  setActiveLesson: (lessonId: string) => void;
  addCourse: (course: Course) => void;
  addXp: (amount: number) => void;
  completeLesson: (lessonId: string) => void;
  addCheckpoint: (id: string) => void;
  setConfidence: (value: number) => void;
  bumpStreak: () => void;
  earnBadge: (id: string) => void;
  reset: () => void;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const { user, getToken } = useAuth();
  const [state, setState] = useState<PersistedState>(loadState);
  const lastSyncRef = useRef<string>("");

  // Persist to localStorage on every change.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Hydrate prefs from the backend Profile.preferences on login (single
  // source of truth across devices), but only prefer backend if we have none
  // locally so a half-finished onboarding isn't lost.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/users/me`, {
          headers: { Authorization: token },
        });
        const remote: OnboardingPrefs | undefined = res.data?.metadata?.preferences?.ctrlteach;
        if (remote && !state.prefs) {
          setState((s) => ({ ...s, prefs: remote }));
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mirror prefs to backend (debounced by ref-key).
  useEffect(() => {
    if (!state.prefs || !user) return;
    const sig = JSON.stringify(state.prefs);
    if (sig === lastSyncRef.current) return;
    lastSyncRef.current = sig;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await axios.put(
          `${API_URL}/api/users/me`,
          // Nest under ctrlteach so we don't clobber other preferences.
          { preferences: { ctrlteach: state.prefs } },
          { headers: { Authorization: token } }
        );
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.prefs, user]);

  const courses = [...SEED_COURSES, ...state.savedCourses];

  const value: LearnerContextValue = {
    prefs: state.prefs,
    isOnboarded: !!state.prefs?.onboarded,
    getCoursePrefs: (courseId) => state.coursePrefs[courseId] ?? null,
    coursePrefs: state.coursePrefs,
    activeCourse: courses.find((c) => c.id === state.activeCourseId) ?? null,
    activeCourseId: state.activeCourseId,
    activeLessonId: state.activeLessonId,
    progress: state.progress,
    courses,
    setPrefs: (prefs) => setState((s) => ({ ...s, prefs })),
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
    addXp: (amount) =>
      setState((s) => ({
        ...s,
        progress: { ...s.progress, xp: s.progress.xp + amount },
      })),
    completeLesson: (lessonId) =>
      setState((s) => {
        if (s.progress.completedLessons.includes(lessonId)) return s;
        return {
          ...s,
          progress: {
            ...s.progress,
            xp: s.progress.xp + 50,
            completedLessons: [...s.progress.completedLessons, lessonId],
          },
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
        progress: { ...s.progress, confidence: Math.max(s.progress.confidence, Math.round(v)) },
      })),
    bumpStreak: () =>
      setState((s) => ({
        ...s,
        progress: { ...s.progress, streak: s.progress.streak + 1 },
      })),
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
    reset: () => {
      localStorage.removeItem(LS_KEY);
      setState({
        prefs: null,
        coursePrefs: {},
        activeCourseId: null,
        activeLessonId: null,
        progress: defaultProgress(),
        savedCourses: [],
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