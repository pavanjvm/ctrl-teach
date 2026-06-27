"use client";

/**
 * The Learner Workspace — the immersive heart of Ctrl+Teach.
 * Left: learning path · Center: the active mode stage · Right: AI companion
 * · Bottom: progress + mode switcher. This is where the magic lives.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLearner } from "@/lib/learner";
import PathSidebar from "@/components/learn/PathSidebar";
import ProgressBar from "@/components/learn/ProgressBar";
import CompanionPanel from "@/components/learn/CompanionPanel";
import StudyMode from "@/components/learn/StudyMode";
import LabMode from "@/components/learn/LabMode";
import RoleplayMode from "@/components/learn/RoleplayMode";
import AssessmentMode from "@/components/AssessmentMode";
import { flattenLessons, nextLesson } from "@/lib/courses";
import type { Lesson, LessonType } from "@/lib/types";
import "./learn.css";

export default function LearnWorkspace() {
  const router = useRouter();
  const { activeCourse, activeLessonId, setActiveLesson, completeLesson, addXp } = useLearner();

  React.useEffect(() => {
    if (!activeCourse) router.replace("/discover");
  }, [activeCourse, router]);

  if (!activeCourse) {
    return <div className="ls-empty" style={{ display: "grid", placeItems: "center" }}><p style={{ color: "var(--muted)" }}>Pick a course to begin your journey…</p></div>;
  }
  return <Workspace course={activeCourse} activeLessonId={activeLessonId} setActiveLesson={setActiveLesson} completeLesson={completeLesson} addXp={addXp} router={router} />;
}

interface WProps {
  course: NonNullable<ReturnType<typeof useLearner>["activeCourse"]>;
  activeLessonId: string | null;
  setActiveLesson: (id: string) => void;
  completeLesson: (id: string) => void;
  addXp: (n: number) => void;
  router: ReturnType<typeof useRouter>;
}

function Workspace({ course, activeLessonId, setActiveLesson, completeLesson, addXp, router }: WProps) {
  const flat = useMemo(() => flattenLessons(course), [course]);
  // Default to the first lesson if none active.
  const currentLessonId = activeLessonId ?? flat[0]?.lessonId ?? null;
  const lesson: Lesson | null = useMemo(() => {
    for (const m of course.modules) for (const l of m.lessons) if (l.id === currentLessonId) return l;
    return null;
  }, [course, currentLessonId]);

  // The mode defaults to the lesson's type but the learner can override it
  // via the bottom mode switcher (so they can re-study, re-practice, etc.).
  const [mode, setMode] = useState<LessonType>(lesson?.type ?? "study");
  React.useEffect(() => { setMode(lesson?.type ?? "study"); }, [currentLessonId, lesson?.type]);

  const onSelectLesson = (id: string) => {
    setActiveLesson(id);
  };

  const advance = () => {
    const nxt = nextLesson(course, currentLessonId);
    if (nxt) { setActiveLesson(nxt.lessonId); }
    else { router.push("/learn/completion"); }
  };

  const onModeDone = () => {
    // Mark the current lesson complete + XP handled in modes; then offer next.
    if (lesson) completeLesson(lesson.id);
  };

  const typePillStyle: React.CSSProperties = { background: "#6366f11a", color: "#6366f1" };

  return (
    <div className="learn-app">
      <PathSidebar course={course} activeLessonId={currentLessonId} onSelectLesson={onSelectLesson} />

      <div className="learn-center">
        <div className="ls-topbar">
          <span className="ls-eyebrow">{course.platform}</span>
          <span className="ls-title">{lesson?.title ?? "Select a lesson"}</span>
          {lesson && <span className={`ls-type-pill ${lesson.type}`} style={lesson.type === "lab" ? typePillStyle : undefined}>{lesson.type}</span>}
          {(mode === "assessment" || mode === "roleplay") && (
            <button className="bp-mode-btn" style={{ marginLeft: "auto" }} onClick={advance}>Next lesson ›</button>
          )}
        </div>

        <div className="ls-stage">
          {!lesson ? (
            <div className="ls-empty">
              <h2>Select a lesson from your learning path</h2>
              <p style={{ color: "var(--muted)" }}>Your AI companion is ready whenever you are.</p>
            </div>
          ) : mode === "study" ? (
            <StudyMode course={course} lesson={lesson} />
          ) : mode === "lab" ? (
            <LabMode lesson={lesson} onComplete={onModeDone} />
          ) : mode === "assessment" ? (
            <div style={{ padding: 24, height: "100%", overflowY: "auto" }}>
              <AssessmentMode course={course} courseId={course.id} lessonId={lesson.id} onDone={onModeDone} />
            </div>
          ) : (
            <RoleplayMode lesson={lesson} onCoached={onModeDone} />
          )}
        </div>
      </div>

      <CompanionPanel course={course} lesson={lesson} />

      <ProgressBar mode={mode} onMode={setMode} />
    </div>
  );
}
