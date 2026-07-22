"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowRight, BookOpen, CircleAlert, Search } from "lucide-react";

import { API_URL } from "@/lib/constants";
import { assetUrl } from "@/lib/courses/generated";
import { useLearner } from "@/lib/learning/provider";
import type { Course } from "@/lib/types";

import "./courses.css";

function courseCoverStyle(course: Course): CSSProperties {
  const cover = course.coverImage?.url || course.thumbnail;
  if (!cover) return {};
  if (cover.includes("gradient(")) return { backgroundImage: cover };
  return { backgroundImage: `url("${assetUrl(cover)}")` };
}

function courseProgress(
  course: Course,
  isLessonComplete: (courseId: string, lessonId: string) => boolean,
): number {
  const lessons = course.modules.flatMap((module) => module.lessons);
  if (!lessons.length) return 0;
  const completed = lessons.filter((lesson) => isLessonComplete(course.id, lesson.id)).length;
  return Math.round((completed / lessons.length) * 100);
}

export default function CoursesPage() {
  const router = useRouter();
  const { isLessonComplete } = useLearner();
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ courses: Course[] }>(`${API_URL}/api/platform-courses`);
      setCourses(response.data.courses ?? []);
      setError(null);
    } catch {
      setError("Published courses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  const visibleCourses = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return courses;
    return courses.filter((course) => [
      course.title,
      course.description,
      course.instructor,
      course.difficulty,
      ...course.skills,
    ].join(" ").toLocaleLowerCase().includes(search));
  }, [courses, query]);

  return (
    <div className="courses-page">
      <section className="courses-toolbar" aria-label="Search published courses">
        <label htmlFor="course-search">
          <Search size={17} aria-hidden="true" />
          <span className="courses-search-label">Search courses</span>
          <input
            id="course-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by topic, skill, or instructor"
          />
        </label>
        {!loading && !error && (
          <span className="courses-result-count" aria-live="polite">
            {visibleCourses.length} {visibleCourses.length === 1 ? "result" : "results"}
          </span>
        )}
      </section>

      {loading ? (
        <section className="courses-grid" aria-label="Loading courses" aria-busy="true">
          {[0, 1, 2, 3].map((item) => <div className="courses-skeleton" key={item}><i /><span /><span /><span /></div>)}
        </section>
      ) : error ? (
        <section className="courses-state courses-error" role="alert">
          <CircleAlert size={22} />
          <div><strong>Catalog unavailable</strong><span>{error}</span></div>
          <button type="button" onClick={() => void loadCourses()}>Try again</button>
        </section>
      ) : courses.length === 0 ? (
        <section className="courses-state">
          <BookOpen size={22} />
          <div><strong>No published courses yet</strong><span>New courses will appear here after faculty publishes them.</span></div>
        </section>
      ) : visibleCourses.length === 0 ? (
        <section className="courses-state">
          <Search size={22} />
          <div><strong>No matching courses</strong><span>Try another topic, skill, or instructor.</span></div>
          <button type="button" onClick={() => setQuery("")}>Clear search</button>
        </section>
      ) : (
        <section className="courses-grid" aria-label="Published courses">
          {visibleCourses.map((course) => {
            const progress = courseProgress(course, isLessonComplete);
            const lessonCount = course.modules.reduce((total, module) => total + module.lessons.length, 0);
            return (
              <article className="courses-card" key={course.id}>
                <button type="button" onClick={() => router.push(`/learn/${course.id}`)} aria-label={`View ${course.title}`}>
                  <div
                    className="courses-cover"
                    style={courseCoverStyle(course)}
                    role="img"
                    aria-label={course.coverImage?.alt || `${course.title} course cover`}
                  >
                    <BookOpen size={28} aria-hidden="true" />
                    <span>{progress > 0 ? `${progress}% complete` : course.difficulty}</span>
                  </div>
                  <div className="courses-card-body">
                    <div className="courses-card-meta">
                      <span>{course.modules.length} modules</span>
                      <span>{lessonCount} lessons</span>
                      <span>{course.duration}</span>
                    </div>
                    <h2>{course.title}</h2>
                    <p>{course.description}</p>
                    {course.skills.length > 0 && (
                      <div className="courses-skills" aria-label="Skills covered">
                        {course.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}
                      </div>
                    )}
                    <div className="courses-card-action">
                      <span>{progress > 0 ? "Resume course" : "View course"}</span>
                      <ArrowRight size={15} />
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
