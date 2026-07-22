"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, Loader2, Sparkles, Target } from "lucide-react";

import { assetUrl } from "@/lib/courses/generated";
import type { Course } from "@/lib/types";

export type CourseOverviewTextField = {
  key: "title" | "description" | "estimatedTime" | "moduleTitle" | "lessonTitle" | "outcome" | "audience" | "prerequisite";
  value: string;
  moduleId?: string;
  lessonId?: string;
  index?: number;
  multiline?: boolean;
};

export default function CourseOverviewView({
  course,
  completed = 0,
  isLessonComplete = () => false,
  onBack,
  backLabel = "My Library",
  onStart,
  startLabel,
  onSelectLesson,
  renderText,
  coverActions,
  showProgress = true,
}: {
  course: Course;
  completed?: number;
  isLessonComplete?: (lessonId: string) => boolean;
  onBack?: () => void;
  backLabel?: string;
  onStart?: () => void;
  startLabel?: string;
  onSelectLesson?: (moduleId: string, lessonId: string) => void;
  renderText?: (field: CourseOverviewTextField) => ReactNode;
  coverActions?: ReactNode;
  showProgress?: boolean;
}) {
  const lessons = course.modules.flatMap((module) => module.lessons);
  const readyLessons = lessons.filter((lesson) => lesson.status !== "pending");
  const allComplete = lessons.length > 0 && completed === lessons.length;
  const completion = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const cover = course.coverImage?.url || course.thumbnail;
  const coverStyle = !cover ? undefined : cover.includes("gradient(")
    ? { backgroundImage: cover }
    : { backgroundImage: `url("${assetUrl(cover)}")` };
  const text = (field: CourseOverviewTextField) => renderText?.(field) ?? field.value;

  return (
    <div className="rich-overview">
      {onBack && (
        <button type="button" className="rich-text-link" onClick={onBack}>
          <ArrowLeft size={14} /> {backLabel}
        </button>
      )}

      {course.partial && (
        <div className="rich-generation-notice" role="status">
          <Loader2 className="rich-spin" size={15} />
          Course generation continues in background. Ready lessons are unlocked now; remaining lessons and artwork appear automatically.
        </div>
      )}

      <header className="rich-overview-hero">
        <motion.div className="rich-overview-copy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <span className="rich-kicker">AI-generated course · {course.difficulty}</span>
          <h1>{text({ key: "title", value: course.title })}<span>.</span></h1>
          <p>{text({ key: "description", value: course.description, multiline: true })}</p>
          <div className="rich-overview-meta">
            <span><Clock size={14} /> {text({ key: "estimatedTime", value: course.overview?.estimatedTime || course.duration })}</span>
            <span><BookOpen size={14} /> {course.modules.length} modules · {lessons.length} lessons</span>
          </div>
          {onStart && (
            <button type="button" className="rich-primary" disabled={readyLessons.length === 0} onClick={onStart}>
              {startLabel || (allComplete ? "View certificate" : completed ? "Resume course" : "Start course")} <ArrowRight size={15} />
            </button>
          )}
        </motion.div>
        <motion.div
          className={`rich-cover ${cover ? "" : "rich-cover-pending"}`}
          initial={{ opacity: 0, scale: .98 }}
          animate={{ opacity: 1, scale: 1 }}
          style={coverStyle}
          role="img"
          aria-label={course.coverImage?.alt || `Cover for ${course.title}`}
        >
          <span>{course.coverImage ? "Generated course cover" : course.partial ? "Artwork is generating" : "Course cover"}</span>
          {!cover && course.partial && <Loader2 className="rich-spin" size={24} aria-hidden="true" />}
          {coverActions}
        </motion.div>
      </header>

      {showProgress && completed > 0 && (
        <section className="rich-resume-line">
          <div><span>Course progress</span><strong>{completion}%</strong></div>
          <div><i style={{ width: `${completion}%` }} /></div>
        </section>
      )}

      <section className="rich-overview-grid">
        <div className="rich-overview-main">
          <span className="rich-section-label">Course path</span>
          <h2>From understanding to application.</h2>
          <div className="rich-module-list">
            {course.modules.map((module, moduleIndex) => (
              <article key={module.id}>
                <div className="rich-module-number">{String(moduleIndex + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{text({ key: "moduleTitle", value: module.title, moduleId: module.id })}</h3>
                  <ol>
                    {module.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <span>{isLessonComplete(lesson.id) ? <Check size={12} /> : null}</span>
                        {renderText ? (
                          <div className="rich-module-lesson-label rich-module-lesson-editor">
                            {text({ key: "lessonTitle", value: lesson.title, moduleId: module.id, lessonId: lesson.id })}
                          </div>
                        ) : onSelectLesson ? (
                          <button type="button" disabled={lesson.status === "pending"} onClick={() => onSelectLesson(module.id, lesson.id)}>{lesson.title}</button>
                        ) : (
                          <div className="rich-module-lesson-label">{lesson.title}</div>
                        )}
                        <small>{lesson.status === "pending" ? "Generating" : lesson.duration}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="rich-overview-side">
          <section>
            <Target size={18} />
            <span className="rich-section-label">What you’ll achieve</span>
            <ul>
              {(course.overview?.outcomes ?? []).map((outcome, index) => (
                <li key={`${outcome}-${index}`}>{text({ key: "outcome", value: outcome, index, multiline: true })}</li>
              ))}
            </ul>
          </section>
          <section>
            <Sparkles size={18} />
            <span className="rich-section-label">Designed for</span>
            <p>{text({ key: "audience", value: course.overview?.audience ?? "", multiline: true })}</p>
          </section>
          {!!course.overview?.prerequisites.length && (
            <section>
              <BookOpen size={18} />
              <span className="rich-section-label">Before you begin</span>
              <ul>
                {course.overview.prerequisites.map((item, index) => (
                  <li key={`${item}-${index}`}>{text({ key: "prerequisite", value: item, index, multiline: true })}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </section>
    </div>
  );
}
