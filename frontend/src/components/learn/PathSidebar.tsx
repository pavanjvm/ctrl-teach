"use client";

/**
 * PathSidebar — left rail of the Learner Workspace.
 * Shows the course's modules + lessons, per-lesson progress, and bookmarks.
 * Hijacks the Browse-style module tree on the Luxe palette.
 */

import React from "react";
import type { Course, Lesson } from "@/lib/types";
import { useLearner } from "@/lib/learner";

interface Props {
  course: Course;
  activeLessonId: string | null;
  onSelectLesson: (lessonId: string) => void;
}

const typeLabel: Record<string, string> = {
  study: "Study",
  lab: "Lab",
  assessment: "Quiz",
  roleplay: "Roleplay",
};

export default function PathSidebar({ course, activeLessonId, onSelectLesson }: Props) {
  const { isLessonComplete } = useLearner();
  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const doneCount = course.modules
    .flatMap((m) => m.lessons)
    .filter((l) => isLessonComplete(course.id, l.id)).length;
  const pct = totalLessons ? Math.round((doneCount / totalLessons) * 100) : 0;

  return (
    <aside className="learn-side">
      <div className="lp-head">
        <div className="lp-eyebrow">Learning path</div>
        <div className="lp-title">{course.title}</div>
        <div className="lp-instructor">{course.instructor} · {course.platform}</div>
        <div className="lp-progressbar"><span style={{ width: `${pct}%` }} /></div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          {doneCount} / {totalLessons} lessons · {pct}%
        </div>
      </div>

      {course.modules.map((m) => (
        <div className="lp-module" key={m.id}>
          <div className="lp-module-title">{m.title}</div>
          {m.lessons.map((l: Lesson) => {
            const done = isLessonComplete(course.id, l.id);
            const active = l.id === activeLessonId;
            return (
              <div
                key={l.id}
                className={`lp-lesson ${active ? "active" : ""} ${done ? "done" : ""}`}
                onClick={() => onSelectLesson(l.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") onSelectLesson(l.id); }}
              >
                <span className="lp-lesson-dot" />
                <span className="lp-lesson-label">{l.title}</span>
                <span className={`lp-lesson-type ${l.type}`}>{typeLabel[l.type]}</span>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
