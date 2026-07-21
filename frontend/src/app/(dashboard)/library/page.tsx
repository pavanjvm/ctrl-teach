"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  ArchiveRestore,
  BookOpen,
  CircleAlert,
  Clock,
  EllipsisVertical,
  Loader2,
  MessageSquareText,
  PenTool,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { API_URL } from "@/lib/constants";
import { assetUrl, isGenerationActive, type GeneratedCourseJob } from "@/lib/generatedCourses";
import { useLearner } from "@/lib/learner";
import type { Course } from "@/lib/types";
import CourseBuilder from "../discover/page";

import "./library.css";

function courseCoverStyle(course: Course): CSSProperties {
  const cover = course.coverImage?.url || course.thumbnail;
  if (!cover) return {};
  if (cover.includes("gradient(")) return { backgroundImage: cover };
  return {
    backgroundImage: `url("${assetUrl(cover)}")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
  };
}

function courseProgress(
  course: Course,
  isLessonComplete: (courseId: string, lessonId: string) => boolean,
): number {
  const lessons = course.modules.flatMap((module) => module.lessons);
  if (!lessons.length) return 0;
  const complete = lessons.filter((lesson) => isLessonComplete(course.id, lesson.id)).length;
  return Math.round((complete / lessons.length) * 100);
}

export default function LibraryPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { activeCourse, addCourse, removeCourse, savedCourses, setActiveCourse, isLessonComplete } = useLearner();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [jobs, setJobs] = useState<GeneratedCourseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [managingJobId, setManagingJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await axios.get<{ courses: GeneratedCourseJob[] }>(
        `${API_URL}/api/generated-courses`,
        { headers: token ? { Authorization: token } : undefined },
      );
      setJobs(response.data.courses ?? []);
      setError(null);
    } catch {
      setError("Your generated courses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const syncBuilderState = () => {
      const params = new URLSearchParams(window.location.search);
      setBuilderOpen(params.has("create") || params.has("generation") || params.has("prompt"));
    };
    syncBuilderState();
    window.addEventListener("popstate", syncBuilderState);
    return () => window.removeEventListener("popstate", syncBuilderState);
  }, []);

  useEffect(() => {
    if (!jobs.some((job) => isGenerationActive(job.status))) return;
    const timer = window.setInterval(() => void load(), 3500);
    return () => window.clearInterval(timer);
  }, [jobs, load]);

  const activeJobs = useMemo(() => jobs.filter((job) => !job.archivedAt), [jobs]);
  const archivedJobs = useMemo(() => jobs.filter((job) => Boolean(job.archivedAt)), [jobs]);
  const startedPlatformCourses = useMemo(
    () => savedCourses.filter((course) => course.id.startsWith("platform-")),
    [savedCourses],
  );

  async function archiveJob(job: GeneratedCourseJob) {
    setManagingJobId(job.id);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await axios.post<GeneratedCourseJob>(
        `${API_URL}/api/generated-courses/${job.id}/archive`,
        {},
        { headers: token ? { Authorization: token } : undefined },
      );
      setJobs((current) => current.map((item) => item.id === job.id ? response.data : item));
      removeCourse(job.id);
    } catch (actionFailure) {
      setActionError(axios.isAxiosError(actionFailure)
        ? String(actionFailure.response?.data?.detail || "Course could not be archived.")
        : "Course could not be archived.");
    } finally {
      setManagingJobId(null);
    }
  }

  async function restoreJob(job: GeneratedCourseJob) {
    setManagingJobId(job.id);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await axios.post<GeneratedCourseJob>(
        `${API_URL}/api/generated-courses/${job.id}/restore`,
        {},
        { headers: token ? { Authorization: token } : undefined },
      );
      setJobs((current) => current.map((item) => item.id === job.id ? response.data : item));
      if (response.data.course) addCourse(response.data.course);
    } catch (actionFailure) {
      setActionError(axios.isAxiosError(actionFailure)
        ? String(actionFailure.response?.data?.detail || "Course could not be restored.")
        : "Course could not be restored.");
    } finally {
      setManagingJobId(null);
    }
  }

  async function deleteJob(job: GeneratedCourseJob) {
    const title = job.course?.title || job.partialCourse?.title || job.topic;
    if (!window.confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;
    setManagingJobId(job.id);
    setActionError(null);
    try {
      const token = await getToken();
      await axios.delete(`${API_URL}/api/generated-courses/${job.id}`, {
        headers: token ? { Authorization: token } : undefined,
      });
      setJobs((current) => current.filter((item) => item.id !== job.id));
      removeCourse(job.id);
    } catch (actionFailure) {
      setActionError(axios.isAxiosError(actionFailure)
        ? String(actionFailure.response?.data?.detail || "Course could not be deleted.")
        : "Course could not be deleted.");
    } finally {
      setManagingJobId(null);
    }
  }

  function openJob(job: GeneratedCourseJob) {
    if (job.course || job.partialCourse) router.push(`/learn/${job.id}`);
    else openBuilder(job.id);
  }

  function openBuilder(generationId?: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("generation");
    if (generationId) url.searchParams.set("generation", generationId);
    else url.searchParams.set("create", "1");
    window.history.pushState({}, "", url);
    setBuilderOpen(true);
  }

  function closeBuilder() {
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("generation");
    url.searchParams.delete("prompt");
    window.history.pushState({}, "", url);
    setBuilderOpen(false);
    void load();
  }

  function openCourse(course: Course) {
    const lessons = course.modules.flatMap((module) => module.lessons);
    const nextLesson = lessons.find((lesson) => !isLessonComplete(course.id, lesson.id)) ?? lessons[0];
    setActiveCourse(course.id, nextLesson?.id);
    router.push(course.id.startsWith("platform-") || course.format === "rich" ? `/learn/${course.id}` : "/learn");
  }

  const activeProgress = activeCourse ? courseProgress(activeCourse, isLessonComplete) : 0;

  if (builderOpen) {
    return (
      <div className="library-builder-shell">
        <button type="button" className="library-builder-back" onClick={closeBuilder}>
          <ArrowLeft size={14} /> Back to Learn
        </button>
        <CourseBuilder />
      </div>
    );
  }

  return (
    <div className="library-page">
      <header className="library-head">
        <div>
          <span>Your learning space</span>
          <h1>Learn what matters next<span>.</span></h1>
          <p>Continue where you stopped or create a focused course around a new goal.</p>
        </div>
      </header>

      <section className="library-launchpad" aria-label="Ways to learn">
        {activeCourse ? (
          <section className="library-continue" aria-labelledby="library-continue-title">
            <div className="library-continue-cover" style={courseCoverStyle(activeCourse)}>
              <span>{activeProgress}% complete</span>
            </div>
            <div className="library-continue-copy">
              <span>Continue learning</span>
              <h2 id="library-continue-title">{activeCourse.title}</h2>
              <p>{activeCourse.description}</p>
              <div className="library-continue-progress" aria-label={`${activeProgress}% complete`}>
                <i style={{ width: `${activeProgress}%` }} />
              </div>
              <button type="button" onClick={() => openCourse(activeCourse)}>
                {activeProgress > 0 ? "Resume course" : "Start course"} <ArrowRight size={15} />
              </button>
            </div>
          </section>
        ) : (
          <section className="library-start" aria-labelledby="library-start-title">
            <span>Start a learning path</span>
            <BookOpen size={26} />
            <h2 id="library-start-title">Choose something worth getting good at.</h2>
            <p>Explore published courses, then learn through explanation, practice, and feedback.</p>
            <Link href="/courses">Browse courses <ArrowRight size={15} /></Link>
          </section>
        )}

        <div className="library-launch-actions">
          <Link href="/board" className="library-launch-action">
            <span>01 / Think visually</span>
            <div><PenTool size={20} /><strong>Open the whiteboard</strong></div>
            <small>Work through a question while Tars explains and draws.</small>
            <ArrowRight className="library-launch-arrow" size={16} />
          </Link>
          <Link href="/role-playing" className="library-launch-action library-launch-action-accent">
            <span>02 / Rehearse</span>
            <div><MessageSquareText size={20} /><strong>Practice a conversation</strong></div>
            <small>Enter a realistic scenario with a live AI counterpart.</small>
            <ArrowRight className="library-launch-arrow" size={16} />
          </Link>
        </div>
      </section>

      <section className="library-section" aria-labelledby="your-courses-title">
        <div className="library-section-head">
          <div>
            <span>Your courses</span>
            <h2 id="your-courses-title">Made around your goals</h2>
          </div>
          <div className="library-section-aside">
            <p>Courses you created with Ctrl+Teach, including work still in progress.</p>
            <button type="button" onClick={() => openBuilder()}>
              <Plus size={14} /> New course
            </button>
          </div>
        </div>

        {actionError && <div className="library-action-error"><CircleAlert size={15} /> {actionError}</div>}
        {loading ? (
          <div className="library-state library-section-state"><Loader2 className="library-spin" size={20} /> Loading your courses…</div>
        ) : error ? (
          <div className="library-state library-section-state library-error"><CircleAlert size={18} /> {error}</div>
        ) : activeJobs.length === 0 ? (
          <div className="library-collection-empty">
            <Sparkles size={20} />
            <div><strong>No custom courses yet</strong><span>Create one when the ready-made catalog does not fit your goal.</span></div>
            <button type="button" onClick={() => openBuilder()}>Create a course <ArrowRight size={14} /></button>
          </div>
        ) : (
          <section className="library-grid">
            {activeJobs.map((job, index) => {
              const course = job.course || job.partialCourse;
              const writtenLessons = job.partialCourse?.modules.reduce(
                (total, module) => total + module.lessons.filter((lesson) => (lesson.contentBlocks?.length || 0) > 0).length,
                0,
              ) || 0;
              return (
                <motion.article
                  key={job.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .04 }}
                  className="library-card"
                >
                  <button className="library-card-main" type="button" onClick={() => openJob(job)} aria-label={`Open ${job.topic}`}>
                    <div
                      className="library-cover"
                      style={course ? courseCoverStyle(course) : undefined}
                      role={course ? "img" : undefined}
                      aria-label={course ? course.coverImage?.alt || `${course.title} course cover` : undefined}
                    >
                      <Sparkles className="library-cover-fallback" size={28} aria-hidden="true" />
                      <span className={`library-status ${job.status}`}>
                        {job.status === "ready" ? "Ready" : job.status === "failed" ? "Needs attention" : job.status === "intake" ? "Needs answers" : "Generating"}
                      </span>
                      {isGenerationActive(job.status) && (
                        <div className="library-progress"><i style={{ width: `${job.progress?.percent ?? 0}%` }} /></div>
                      )}
                    </div>
                    <div className="library-body">
                      <span className="library-meta">
                        {writtenLessons > 0 && job.status !== "ready"
                          ? `${writtenLessons} lessons written · ${course?.duration}`
                          : course ? `${course.modules.length} modules · ${course.duration}` : job.progress?.message}
                      </span>
                      <h2>{course?.title || job.topic}</h2>
                      <p>{course?.description || job.summary}</p>
                      <div className="library-open">
                        {course ? (job.status === "ready" ? "Open course" : "Open available course") : job.status === "failed" ? "Review and retry" : job.status === "intake" ? "Continue setup" : `${job.progress?.percent ?? 0}% complete`}
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </button>
                  <details className="library-card-menu">
                    <summary aria-label={`Manage ${course?.title || job.topic}`} title="Course actions"><EllipsisVertical size={17} /></summary>
                    <div>
                      <button
                        type="button"
                        disabled={managingJobId === job.id || isGenerationActive(job.status)}
                        title={isGenerationActive(job.status) ? "Archive becomes available after generation finishes" : "Archive course"}
                        onClick={() => void archiveJob(job)}
                      >
                        {managingJobId === job.id ? <Loader2 className="library-spin" size={14} /> : <Archive size={14} />} <span>Archive</span>
                      </button>
                      <button type="button" disabled={managingJobId === job.id} onClick={() => void deleteJob(job)}>
                        <Trash2 size={14} /> <span>Delete</span>
                      </button>
                    </div>
                  </details>
                </motion.article>
              );
            })}
          </section>
        )}
      </section>

      {startedPlatformCourses.length > 0 && (
        <section className="library-section" aria-labelledby="started-courses-title">
          <div className="library-section-head">
            <div>
              <span>Started courses</span>
              <h2 id="started-courses-title">Published learning in progress</h2>
            </div>
            <p>Courses from the published catalog that you have started.</p>
          </div>
          <section className="library-grid">
            {startedPlatformCourses.map((course, index) => {
              const progress = courseProgress(course, isLessonComplete);
              return (
                <motion.article
                  key={course.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .035 }}
                  className="library-card"
                >
                  <button className="library-card-main" type="button" onClick={() => openCourse(course)} aria-label={`Open ${course.title}`}>
                    <div
                      className="library-cover"
                      style={courseCoverStyle(course)}
                      role="img"
                      aria-label={course.coverImage?.alt || `${course.title} course cover`}
                    >
                      <BookOpen className="library-cover-fallback" size={28} aria-hidden="true" />
                      <span className="library-status ready">{progress}% complete</span>
                    </div>
                    <div className="library-body">
                      <span className="library-meta">{course.modules.length} modules · {course.duration}</span>
                      <h2>{course.title}</h2>
                      <p>{course.description}</p>
                      <div className="library-open">Continue course <ArrowRight size={14} /></div>
                    </div>
                  </button>
                </motion.article>
              );
            })}
          </section>
        </section>
      )}

      {archivedJobs.length > 0 && (
        <section className="library-section" aria-labelledby="archived-courses-title">
          <div className="library-section-head">
            <div>
              <span>Archived</span>
              <h2 id="archived-courses-title">Stored outside your active library</h2>
            </div>
            <p>Restore a course anytime, or permanently delete it.</p>
          </div>
          <section className="library-grid">
            {archivedJobs.map((job, index) => {
              const course = job.course || job.partialCourse;
              return (
                <motion.article
                  key={job.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .04 }}
                  className="library-card library-card-archived"
                >
                  <div className="library-card-main">
                    <div
                      className="library-cover"
                      style={course ? courseCoverStyle(course) : undefined}
                      role={course ? "img" : undefined}
                      aria-label={course ? course.coverImage?.alt || `${course.title} course cover` : undefined}
                    >
                      <Sparkles className="library-cover-fallback" size={28} aria-hidden="true" />
                      <span className="library-status">Archived</span>
                    </div>
                    <div className="library-body">
                      <span className="library-meta">{course ? `${course.modules.length} modules · ${course.duration}` : "Generated course"}</span>
                      <h2>{course?.title || job.topic}</h2>
                      <p>{course?.description || job.summary}</p>
                      <div className="library-open">Archived {job.archivedAt ? new Date(job.archivedAt).toLocaleDateString() : ""}</div>
                    </div>
                  </div>
                  <details className="library-card-menu">
                    <summary aria-label={`Manage ${course?.title || job.topic}`} title="Course actions"><EllipsisVertical size={17} /></summary>
                    <div>
                      <button type="button" disabled={managingJobId === job.id} onClick={() => void restoreJob(job)}>
                        {managingJobId === job.id ? <Loader2 className="library-spin" size={14} /> : <ArchiveRestore size={14} />} <span>Restore</span>
                      </button>
                      <button type="button" disabled={managingJobId === job.id} onClick={() => void deleteJob(job)}>
                        <Trash2 size={14} /> <span>Delete</span>
                      </button>
                    </div>
                  </details>
                </motion.article>
              );
            })}
          </section>
        </section>
      )}

      {!loading && jobs.some((job) => isGenerationActive(job.status)) && (
        <footer className="library-foot"><Clock size={13} /> Active generations continue while this page is open.</footer>
      )}
    </div>
  );
}
