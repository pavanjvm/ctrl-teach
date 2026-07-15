"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CircleAlert, Clock, Loader2, Plus, Sparkles } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { API_URL } from "@/lib/constants";
import { assetUrl, isGenerationActive, type GeneratedCourseJob } from "@/lib/generatedCourses";

import "./library.css";

export default function LibraryPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<GeneratedCourseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await axios.get<{ courses: GeneratedCourseJob[] }>(
        `${API_URL}/api/generated-courses`,
        { headers: token ? { Authorization: token } : undefined }
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
    if (!jobs.some((job) => isGenerationActive(job.status))) return;
    const timer = window.setInterval(() => void load(), 3500);
    return () => window.clearInterval(timer);
  }, [jobs, load]);

  function open(job: GeneratedCourseJob) {
    if (job.status === "ready" && job.course) router.push(`/learn/${job.id}`);
    else router.push(`/discover?generation=${job.id}`);
  }

  return (
    <div className="library-page">
      <header className="library-head">
        <div>
          <span>My learning library</span>
          <h1>Courses made for you<span>.</span></h1>
          <p>Every course here was researched, written, illustrated, and saved for your learning goal.</p>
        </div>
        <button type="button" onClick={() => router.push("/discover")}>
          <Plus size={15} /> Generate another course
        </button>
      </header>

      {loading ? (
        <div className="library-state"><Loader2 className="library-spin" size={24} /> Loading your courses…</div>
      ) : error ? (
        <div className="library-state library-error"><CircleAlert size={20} /> {error}</div>
      ) : jobs.length === 0 ? (
        <section className="library-empty">
          <BookOpen size={42} />
          <h2>Your first course starts with a question.</h2>
          <p>Describe something you want to master or bring a curriculum you already have.</p>
          <button type="button" onClick={() => router.push("/discover")}><Sparkles size={15} /> Create my first course</button>
        </section>
      ) : (
        <section className="library-grid">
          {jobs.map((job, index) => {
            const course = job.course || job.partialCourse;
            const writtenLessons = job.partialCourse?.modules.reduce(
              (total, module) => total + module.lessons.filter((lesson) => (lesson.contentBlocks?.length || 0) > 0).length,
              0,
            ) || 0;
            const image = assetUrl(course?.coverImage?.url || course?.thumbnail);
            return (
              <motion.article
                key={job.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * .04 }}
                className="library-card"
              >
                <button type="button" onClick={() => open(job)} aria-label={`Open ${job.topic}`}>
                  <div
                    className="library-cover"
                  >
                    <Sparkles className="library-cover-fallback" size={28} aria-hidden="true" />
                    {image && (
                      <img
                        src={image}
                        alt={course?.coverImage?.alt || `${course?.title || job.topic} course cover`}
                        loading="lazy"
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                    )}
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
                      {job.status === "ready" ? "Open course" : job.status === "failed" ? "Review and retry" : job.status === "intake" ? "Continue setup" : `${job.progress?.percent ?? 0}% complete`}
                      <ArrowRight size={14} />
                    </div>
                  </div>
                </button>
              </motion.article>
            );
          })}
        </section>
      )}

      {!loading && jobs.length > 0 && (
        <footer className="library-foot"><Clock size={13} /> Active generations continue while this page is open.</footer>
      )}
    </div>
  );
}
