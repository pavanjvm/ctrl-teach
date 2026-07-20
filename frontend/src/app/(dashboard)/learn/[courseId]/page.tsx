"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import { assetUrl, fetchAvailableCourse } from "@/lib/generatedCourses";
import type { Course } from "@/lib/types";

import "./rich-course.css";

export default function RichCourseOverviewPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { addCourse, setActiveCourse, isLessonComplete } = useLearner();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const nextCourse = await fetchAvailableCourse(params.courseId, token);
      if (!nextCourse) {
        router.replace(`/library?generation=${params.courseId}`);
        return;
      }
      setCourse(nextCourse);
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) ? String(loadError.response?.data?.detail || "Course not found.") : "Course not found.");
    } finally {
      setLoading(false);
    }
  }, [getToken, params.courseId, router]);

  useEffect(() => { void load(); }, [load]);

  const lessons = useMemo(() => course?.modules.flatMap((module) => module.lessons) ?? [], [course]);
  const completed = course
    ? lessons.filter((lesson) => isLessonComplete(course.id, lesson.id)).length
    : 0;
  const firstIncomplete = course
    ? lessons.find((lesson) => !isLessonComplete(course.id, lesson.id)) ?? lessons[0]
    : lessons[0];
  const allComplete = lessons.length > 0 && completed === lessons.length;

  function start() {
    if (!course || !firstIncomplete) return;
    addCourse(course);
    setActiveCourse(course.id, firstIncomplete.id);
    router.push(allComplete ? "/learn/completion" : `/learn/${course.id}/${firstIncomplete.id}`);
  }

  if (loading) return <div className="rich-load"><Loader2 className="rich-spin" size={25} /> Loading your course…</div>;
  if (error || !course) return <div className="rich-load rich-load-error"><CircleAlert size={22} /> {error || "Course not found."}</div>;

  const cover = assetUrl(course.coverImage?.url || course.thumbnail);
  const completion = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;

  return (
    <div className="rich-overview">
      <button type="button" className="rich-text-link" onClick={() => router.push("/library")}>
        <ArrowLeft size={14} /> My Library
      </button>

      <header className="rich-overview-hero">
        <motion.div
          className="rich-overview-copy"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="rich-kicker">AI-generated course · {course.difficulty}</span>
          <h1>{course.title}<span>.</span></h1>
          <p>{course.description}</p>
          <div className="rich-overview-meta">
            <span><Clock size={14} /> {course.overview?.estimatedTime || course.duration}</span>
            <span><BookOpen size={14} /> {course.modules.length} modules · {lessons.length} lessons</span>
          </div>
          <button type="button" className="rich-primary" onClick={start}>
            {allComplete ? "View certificate" : completed ? "Resume course" : "Start course"} <ArrowRight size={15} />
          </button>
        </motion.div>
        <motion.div
          className="rich-cover"
          initial={{ opacity: 0, scale: .98 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ backgroundImage: `url("${cover}")` }}
          role="img"
          aria-label={course.coverImage?.alt || `Cover for ${course.title}`}
        >
          <span>Generated with GPT Image 2</span>
        </motion.div>
      </header>

      {completed > 0 && (
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
                  <h3>{module.title}</h3>
                  <ol>
                    {module.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <span>{isLessonComplete(course.id, lesson.id) ? <Check size={12} /> : null}</span>
                        <button type="button" onClick={() => router.push(`/learn/${course.id}/${lesson.id}`)}>{lesson.title}</button>
                        <small>{lesson.duration}</small>
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
            <ul>{course.overview?.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>
          </section>
          <section>
            <Sparkles size={18} />
            <span className="rich-section-label">Designed for</span>
            <p>{course.overview?.audience}</p>
          </section>
          {!!course.overview?.prerequisites.length && (
            <section>
              <BookOpen size={18} />
              <span className="rich-section-label">Before you begin</span>
              <ul>{course.overview.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}
        </aside>
      </section>
    </div>
  );
}
