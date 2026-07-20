"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";

import type { Course, Lesson } from "@/lib/types";

export type CourseLessonTextField = {
  key: "courseTitle" | "lessonTitle" | "lessonSummary";
  value: string;
  multiline?: boolean;
};

export default function CourseLessonView({
  course,
  lesson,
  lessonIndex,
  completion = 0,
  isLessonComplete = () => false,
  onOverview,
  onSelectLesson,
  renderText,
  children,
  footer,
  showOutline = true,
}: {
  course: Course;
  lesson: Lesson;
  lessonIndex: number;
  completion?: number;
  isLessonComplete?: (lessonId: string) => boolean;
  onOverview?: () => void;
  onSelectLesson?: (lessonId: string) => void;
  renderText?: (field: CourseLessonTextField) => ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  showOutline?: boolean;
}) {
  const lessons = course.modules.flatMap((module) => module.lessons);
  const text = (field: CourseLessonTextField) => renderText?.(field) ?? field.value;

  return (
    <div className={`rich-reader-shell ${showOutline ? "" : "rich-reader-shell-canvas"}`}>
      {showOutline && (
        <aside className="rich-reader-nav">
          {onOverview && (
            <button type="button" className="rich-reader-back" onClick={onOverview}>
              <ArrowLeft size={13} /> Course overview
            </button>
          )}
          <div className="rich-reader-course">
            <span>{course.difficulty} · {course.duration}</span>
            <strong>{text({ key: "courseTitle", value: course.title })}</strong>
            <div><i style={{ width: `${completion}%` }} /></div>
          </div>
          <nav>
            {course.modules.map((module, moduleIndex) => (
              <section key={module.id}>
                <span>{String(moduleIndex + 1).padStart(2, "0")} / {module.title}</span>
                {module.lessons.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === lesson.id ? "active" : ""}
                    onClick={() => onSelectLesson?.(item.id)}
                  >
                    <i>{isLessonComplete(item.id) ? <Check size={10} /> : null}</i>
                    <b>{item.title}</b>
                    <small>{item.duration}</small>
                  </button>
                ))}
              </section>
            ))}
          </nav>
        </aside>
      )}

      <main className="rich-lesson">
        <header className="rich-lesson-head">
          <span>Lesson {lessonIndex + 1} of {lessons.length}</span>
          <h1>{text({ key: "lessonTitle", value: lesson.title })}</h1>
          <p>{text({ key: "lessonSummary", value: lesson.summary, multiline: true })}</p>
          <div className="rich-lesson-rule" />
        </header>

        <div className="rich-blocks">{children}</div>

        {!!course.citations?.length && (
          <section className="rich-sources">
            <span>Sources used in this course</span>
            <div>
              {course.citations.map((citation) => (
                <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">
                  {citation.title} <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </section>
        )}

        {footer}
      </main>
    </div>
  );
}
