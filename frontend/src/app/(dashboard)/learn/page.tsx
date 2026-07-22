"use client";

/**
 * The Learner Workspace — the immersive heart of Ctrl+Teach.
 * Left: learning path · Center: the active mode stage · Right: AI companion
 * · Bottom: progress + mode switcher. This is where the magic lives.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTree, MessageCircle, X } from "lucide-react";
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
  const { activeCourse, activeLessonId, setActiveLesson, completeLesson } = useLearner();

  React.useEffect(() => {
    if (!activeCourse) router.replace("/library");
    else if (activeCourse.format === "rich") router.replace(`/learn/${activeCourse.id}`);
  }, [activeCourse, router]);

  if (!activeCourse || activeCourse.format === "rich") {
    return <div className="ls-empty" style={{ display: "grid", placeItems: "center" }}><p style={{ color: "var(--muted)" }}>Pick a course to begin your journey…</p></div>;
  }
  return <Workspace course={activeCourse} activeLessonId={activeLessonId} setActiveLesson={setActiveLesson} completeLesson={completeLesson} router={router} />;
}

interface WProps {
  course: NonNullable<ReturnType<typeof useLearner>["activeCourse"]>;
  activeLessonId: string | null;
  setActiveLesson: (id: string) => void;
  completeLesson: (id: string) => void;
  router: ReturnType<typeof useRouter>;
}

function Workspace({ course, activeLessonId, setActiveLesson, completeLesson, router }: WProps) {
  const { isLessonComplete } = useLearner();
  const [mobilePanel, setMobilePanel] = useState<"path" | "companion" | null>(null);
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
    setMobilePanel(null);
  };

  const advance = () => {
    const nxt = nextLesson(course, currentLessonId);
    if (nxt) { setActiveLesson(nxt.lessonId); }
    else {
      const firstIncomplete = flat.find((item) => !isLessonComplete(course.id, item.lessonId));
      if (firstIncomplete) setActiveLesson(firstIncomplete.lessonId);
      else router.push("/learn/completion");
    }
  };

  const onModeDone = () => {
    // Mark the current lesson complete + XP handled in modes; then offer next.
    if (lesson) completeLesson(lesson.id);
  };

  const typePillStyle: React.CSSProperties = { background: "#ebf8d1", color: "#4f7716" };
  const lessonComplete = Boolean(lesson && isLessonComplete(course.id, lesson.id));

  return (
    <div className={`learn-app${mobilePanel ? ` mobile-${mobilePanel}` : ""}`}>
      <PathSidebar course={course} activeLessonId={currentLessonId} onSelectLesson={onSelectLesson} />

      <div className="learn-center">
        <div className="ls-topbar">
          <span className="ls-eyebrow">{course.platform}</span>
          <span className="ls-title">{lesson?.title ?? "Select a lesson"}</span>
          {lesson && <span className={`ls-type-pill ${lesson.type}`} style={lesson.type === "lab" ? typePillStyle : undefined}>{lesson.type}</span>}
          {lessonComplete && (
            <button className="bp-mode-btn" style={{ marginLeft: "auto" }} onClick={advance}>Next lesson ›</button>
          )}
          <div className="learn-mobile-actions">
            <button
              type="button"
              className={mobilePanel === "path" ? "active" : ""}
              aria-label="Open learning path"
              aria-expanded={mobilePanel === "path"}
              onClick={() => setMobilePanel((panel) => panel === "path" ? null : "path")}
            >
              <ListTree size={16} />
            </button>
            <button
              type="button"
              className={mobilePanel === "companion" ? "active" : ""}
              aria-label="Open AI companion"
              aria-expanded={mobilePanel === "companion"}
              onClick={() => setMobilePanel((panel) => panel === "companion" ? null : "companion")}
            >
              <MessageCircle size={16} />
            </button>
          </div>
        </div>

        <div className="ls-stage">
          {!lesson ? (
            <div className="ls-empty">
              <h2>Select a lesson from your learning path</h2>
              <p style={{ color: "var(--muted)" }}>Your AI companion is ready whenever you are.</p>
            </div>
          ) : mode === "study" ? (
            <StudyMode key={`study:${lesson.id}`} course={course} lesson={lesson} />
          ) : mode === "lab" ? (
            <LabMode key={`lab:${lesson.id}`} lesson={lesson} onComplete={onModeDone} />
          ) : mode === "assessment" ? (
            <div style={{ padding: 24, height: "100%", overflowY: "auto" }}>
              <AssessmentMode key={`assessment:${lesson.id}`} course={course} courseId={course.id} lessonId={lesson.id} onDone={onModeDone} />
            </div>
          ) : (
            <RoleplayMode key={`roleplay:${lesson.id}`} lesson={lesson} onCoached={onModeDone} />
          )}
        </div>
      </div>

      <CompanionPanel course={course} lesson={lesson} />

      {mobilePanel && (
        <button
          type="button"
          className="learn-mobile-drawer-close"
          aria-label={`Close ${mobilePanel === "path" ? "learning path" : "AI companion"}`}
          onClick={() => setMobilePanel(null)}
        >
          <X size={18} />
        </button>
      )}

      <ProgressBar mode={mode} onMode={setMode} />
    </div>
  );
}
