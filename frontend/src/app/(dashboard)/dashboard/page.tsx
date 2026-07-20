"use client";

import type { CSSProperties, ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Flame,
  MessageSquareText,
  PenTool,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/Skeleton";
import { API_URL } from "@/lib/constants";
import { assetUrl, isGenerationActive, type GeneratedCourseJob } from "@/lib/generatedCourses";
import {
  rankCourseRecommendations,
  rankCprimeRecommendations,
} from "@/lib/homeRecommendations";
import { useLearner } from "@/lib/learner";
import type { Course, LearningMemoryKind } from "@/lib/types";

import "./home.css";

interface DashboardStats {
  total_sessions: number;
  total_hours: number;
  weekly_minutes: number;
  avg_score: number;
  subjects_covered: number;
}

interface Session {
  id: string;
  topic?: string;
  subject?: string;
  duration_minutes?: number;
  created_at?: string;
  status?: string;
}

interface ServerStreak {
  current_streak: number;
  longest_streak: number;
}

interface HomeActivity {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
  icon: ComponentType<{ size?: number }>;
}

function courseCoverStyle(course: Course): CSSProperties {
  const cover = course.coverImage?.url || course.thumbnail;
  if (!cover) return {};
  if (cover.includes("gradient(")) return { backgroundImage: cover };
  return { backgroundImage: `url("${assetUrl(cover)}")` };
}

function formatActivityTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function memoryIcon(kind: LearningMemoryKind): ComponentType<{ size?: number }> {
  if (kind === "assessment") return CheckCircle2;
  if (kind === "lab" || kind === "roleplay") return Target;
  return BookOpen;
}

function HomeSkeleton() {
  return (
    <div className="home-page home-skeleton" aria-label="Loading your home">
      <div className="home-skeleton-head">
        <Skeleton width={110} height={12} borderRadius={3} />
        <Skeleton width="42%" height={42} borderRadius={4} />
      </div>
      <div className="home-skeleton-grid">
        <Skeleton height={330} borderRadius={8} />
        <Skeleton height={330} borderRadius={8} />
        <Skeleton height={92} borderRadius={8} />
      </div>
      <Skeleton height={250} borderRadius={8} />
    </div>
  );
}

export default function HomePage() {
  const { user, getToken } = useAuth();
  const {
    prefs,
    activeCourse,
    activeLessonId,
    courses,
    progress,
    isLessonComplete,
    setActiveCourse,
    skillProfile,
    learningMemories,
  } = useLearner();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [serverStreak, setServerStreak] = useState<ServerStreak | null>(null);
  const [jobs, setJobs] = useState<GeneratedCourseJob[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHomeData() {
      if (!user) return;
      try {
        const token = await getToken();
        if (!token) return;
        const headers = { Authorization: token };
        const [dashboardResult, jobsResult] = await Promise.allSettled([
          axios.get(`${API_URL}/api/dashboard/all`, { headers }),
          axios.get<{ courses: GeneratedCourseJob[] }>(`${API_URL}/api/generated-courses`, { headers }),
        ]);
        if (cancelled) return;
        if (dashboardResult.status === "fulfilled") {
          const data = dashboardResult.value.data;
          setStats(data.stats ?? null);
          setSessions(data.sessions ?? []);
          setServerStreak(data.streak ?? null);
        }
        if (jobsResult.status === "fulfilled") {
          setJobs(jobsResult.value.data.courses ?? []);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    void loadHomeData();
    return () => { cancelled = true; };
  }, [getToken, user]);

  const lessons = useMemo(
    () => activeCourse?.modules.flatMap((module) => module.lessons) ?? [],
    [activeCourse],
  );
  const completedLessonCount = activeCourse
    ? lessons.filter((lesson) => isLessonComplete(activeCourse.id, lesson.id)).length
    : 0;
  const currentLesson = activeCourse
    ? lessons.find((lesson) => lesson.id === activeLessonId && !isLessonComplete(activeCourse.id, lesson.id))
      ?? lessons.find((lesson) => !isLessonComplete(activeCourse.id, lesson.id))
      ?? null
    : null;
  const courseProgress = lessons.length > 0
    ? Math.round((completedLessonCount / lessons.length) * 100)
    : 0;
  const activeCourseComplete = Boolean(activeCourse && lessons.length > 0 && completedLessonCount === lessons.length);

  const sortedJobs = useMemo(
    () => [...jobs].sort((left, right) => (
      new Date(right.updatedAt || right.createdAt || 0).getTime()
      - new Date(left.updatedAt || left.createdAt || 0).getTime()
    )),
    [jobs],
  );
  const activeGeneration = sortedJobs.find((job) => job.status === "intake" || isGenerationActive(job.status));
  const fallbackJob = !activeCourse
    ? sortedJobs.find((job) => job.status === "ready" || job.status === "failed")
    : undefined;
  const priorityJob = activeGeneration ?? fallbackJob ?? null;

  const completedCourses = useMemo(
    () => courses.filter((course) => Boolean(progress.courseCompletedAt?.[course.id])),
    [courses, progress.courseCompletedAt],
  );
  const startedCourseIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(progress.courseCompletedAt ?? {}));
    if (activeCourse) ids.add(activeCourse.id);
    for (const course of courses) {
      if (progress.completedLessons.some((id) => id.startsWith(`${course.id}::`))) ids.add(course.id);
    }
    return ids;
  }, [activeCourse, courses, progress.completedLessons, progress.courseCompletedAt]);
  const recommendationSignals = useMemo(() => ({
    prefs,
    skillProfile,
    activeCourse,
    completedCourses,
  }), [activeCourse, completedCourses, prefs, skillProfile]);
  const recommendations = useMemo(
    () => rankCourseRecommendations(courses, startedCourseIds, recommendationSignals),
    [courses, recommendationSignals, startedCourseIds],
  );
  const cprimeRecommendations = useMemo(
    () => rankCprimeRecommendations(recommendationSignals),
    [recommendationSignals],
  );

  const activities = useMemo<HomeActivity[]>(() => {
    const memoryItems: HomeActivity[] = learningMemories.map((memory) => ({
      id: `memory:${memory.id}`,
      title: memory.title,
      detail: memory.summary,
      timestamp: memory.createdAt,
      icon: memoryIcon(memory.kind),
    }));
    const sessionItems: HomeActivity[] = sessions
      .filter((session) => session.created_at)
      .map((session) => ({
        id: `session:${session.id}`,
        title: session.topic || "Tars tutoring session",
        detail: [session.subject, session.duration_minutes ? `${session.duration_minutes} min` : null]
          .filter(Boolean)
          .join(" · ") || "Learning session",
        timestamp: new Date(session.created_at as string).getTime(),
        icon: BrainCircuit,
      }));
    const badgeItems: HomeActivity[] = progress.badges
      .filter((badge) => badge.earnedAt)
      .map((badge) => ({
        id: `badge:${badge.id}:${badge.earnedAt}`,
        title: badge.title,
        detail: badge.description,
        timestamp: badge.earnedAt as number,
        icon: Trophy,
      }));
    return [...memoryItems, ...sessionItems, ...badgeItems]
      .filter((activity) => Number.isFinite(activity.timestamp))
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 3);
  }, [learningMemories, progress.badges, sessions]);

  const firstName = user?.displayName?.trim().split(/\s+/)[0] || prefs?.name?.trim().split(/\s+/)[0] || "Student";
  const strength = skillProfile.strengths[0] ?? skillProfile.building[0] ?? null;
  const focusArea = skillProfile.focusAreas[0] ?? null;
  const streak = Math.max(progress.streak, serverStreak?.current_streak ?? 0);
  const momentum = [
    progress.xp > 0 ? { label: "XP earned", value: progress.xp, icon: Zap } : null,
    streak > 0 ? { label: "Day streak", value: streak, icon: Flame } : null,
    (stats?.weekly_minutes ?? 0) > 0
      ? { label: "This week", value: `${stats?.weekly_minutes}m`, icon: Clock3 }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: number | string; icon: ComponentType<{ size?: number }> }>;

  if (loadingData) return <HomeSkeleton />;

  return (
    <main className="home-page fade-in">
      <header className="home-heading">
        <div>
          <span className="home-eyebrow">Your learning home</span>
          <h1>Good to see you, {firstName}<span>.</span></h1>
        </div>
        <p>{prefs?.preparingFor || "Keep moving toward the skills that matter to you."}</p>
      </header>

      <div className="home-layout">
        <section className="home-continue" aria-labelledby="continue-heading">
          {priorityJob ? (
            <GenerationCard job={priorityJob} />
          ) : activeCourse ? (
            <div className="home-course-hero">
              <div className="home-course-cover" style={courseCoverStyle(activeCourse)}>
                <span>{activeCourse.platform}</span>
                <strong>{String(courseProgress).padStart(2, "0")}%</strong>
              </div>
              <div className="home-course-copy">
                <span className="home-section-label">
                  {activeCourseComplete ? "Course completed" : "Continue where you left off"}
                </span>
                <h2 id="continue-heading">{activeCourse.title}</h2>
                {activeCourseComplete ? (
                  <p>You completed every lesson. Your evidence and achievement are ready in your learner profile.</p>
                ) : (
                  <>
                    <div className="home-next-lesson">
                      <span>Up next</span>
                      <strong>{currentLesson?.title || "Course overview"}</strong>
                      <small>{currentLesson?.duration || activeCourse.duration}</small>
                    </div>
                    <div className="home-progress" aria-label={`${courseProgress}% of course complete`}>
                      <i style={{ width: `${courseProgress}%` }} />
                    </div>
                    <p className="home-progress-copy">{completedLessonCount} of {lessons.length} lessons complete</p>
                  </>
                )}
                {activeCourseComplete ? (
                  <Link className="home-primary-action" href="/profile?tab=achievements">
                    View achievement <ArrowRight size={16} />
                  </Link>
                ) : (
                  <Link
                    className="home-primary-action"
                    href={activeCourse.format === "rich" && currentLesson
                      ? `/learn/${activeCourse.id}/${currentLesson.id}`
                      : "/learn"}
                  >
                    Continue learning <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="home-empty-hero">
              <span className="home-section-label">Your first step</span>
              <h2 id="continue-heading">Build a course around what you want to achieve.</h2>
              <p>Tars will shape the material, practice, and feedback around your goal and learning history.</p>
              <Link className="home-primary-action" href="/library?create=1">
                Create your first course <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>

        <section className="home-quick" aria-label="Quick actions">
          <Link href="/library?create=1"><Plus size={17} /><span><strong>Create a course</strong><small>Start with a learning goal</small></span></Link>
          <Link href="/board"><PenTool size={17} /><span><strong>Open whiteboard</strong><small>Ask Tars and work it out</small></span></Link>
          <Link href="/role-playing"><MessageSquareText size={17} /><span><strong>Practice a conversation</strong><small>Rehearse with a live AI counterpart</small></span></Link>
        </section>

        <aside className="home-insight" aria-labelledby="insight-heading">
          <div className="home-insight-head">
            <span className="home-section-label">What Tars has learned</span>
            <BrainCircuit size={19} />
          </div>
          <h2 id="insight-heading">Your skill profile is taking shape.</h2>
          {skillProfile.memoryCount > 0 ? (
            <div className="home-skill-signals">
              {strength && (
                <div>
                  <span><CheckCircle2 size={14} /> Observed strength</span>
                  <strong>{strength.name}</strong>
                  <p>{strength.reason}</p>
                </div>
              )}
              {focusArea && (
                <div>
                  <span><Target size={14} /> Current focus</span>
                  <strong>{focusArea.name}</strong>
                  <p>{focusArea.reason}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="home-insight-empty">Complete a lesson, practice, or assessment and Tars will start turning your work into useful evidence.</p>
          )}
          <Link href="/profile">
            Built from {skillProfile.memoryCount} learning {skillProfile.memoryCount === 1 ? "moment" : "moments"}
            <ArrowRight size={14} />
          </Link>
          {momentum.length > 0 && (
            <div className="home-momentum" aria-label="Learning momentum">
              {momentum.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    <Icon size={15} />
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <section className="home-recommendations" aria-labelledby="recommend-heading">
          <div className="home-section-head">
            <div>
              <span className="home-section-label">Recommended for you</span>
              <h2 id="recommend-heading">A useful next move.</h2>
            </div>
            <Link href="/library">Browse library <ArrowRight size={14} /></Link>
          </div>
          <div className="home-course-grid">
            {recommendations.map(({ course, reason }) => (
              <article className="home-recommend-card" key={course.id}>
                <div className="home-recommend-cover" style={courseCoverStyle(course)}>
                  <span>{course.difficulty}</span>
                </div>
                <div className="home-recommend-body">
                  <span className="home-reason"><Sparkles size={12} /> {reason}</span>
                  <h3>{course.title}</h3>
                  <p>{course.description}</p>
                  <div><span>{course.duration}</span><span>{course.modules.length} modules</span></div>
                  <Link
                    href={course.format === "rich" ? `/learn/${course.id}` : "/learn"}
                    onClick={() => setActiveCourse(course.id)}
                  >
                    Start course <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-cprime" aria-labelledby="cprime-heading">
          <div className="home-section-head">
            <div>
              <span className="home-section-label">From Cprime Learning</span>
              <h2 id="cprime-heading">Expert-led topics, adapted for you.</h2>
            </div>
          </div>
          <div className="home-cprime-list">
            {cprimeRecommendations.map(({ course, reason }, index) => (
              <article key={course.id} className="home-cprime-row">
                <span className="home-cprime-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="home-cprime-main">
                  <span>{course.category} · {course.difficulty}</span>
                  <h3>{course.title}</h3>
                  <p>{course.summary}</p>
                </div>
                <div className="home-cprime-action">
                  <span><Sparkles size={12} /> {reason}</span>
                  <small>{course.duration}</small>
                  <Link href={course.url} target="_blank" rel="noopener noreferrer">
                    Join the bootcamp <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {activities.length > 0 && (
          <section className="home-activity" aria-labelledby="activity-heading">
            <div className="home-section-head">
              <div>
                <span className="home-section-label">Recent activity</span>
                <h2 id="activity-heading">What you have accomplished.</h2>
              </div>
              <Link href="/profile">View profile <ArrowRight size={14} /></Link>
            </div>
            <div className="home-activity-list">
              {activities.map((activity) => {
                const Icon = activity.icon;
                return (
                  <article key={activity.id}>
                    <span><Icon size={16} /></span>
                    <div><strong>{activity.title}</strong><p>{activity.detail}</p></div>
                    <time dateTime={new Date(activity.timestamp).toISOString()}>{formatActivityTime(activity.timestamp)}</time>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function GenerationCard({ job }: { job: GeneratedCourseJob }) {
  const isFailed = job.status === "failed";
  const isReady = job.status === "ready";
  const isIntake = job.status === "intake";
  const percent = job.progress?.percent ?? 0;
  const href = isReady ? `/learn/${job.id}` : `/library?generation=${encodeURIComponent(job.id)}`;

  return (
    <div className={`home-generation ${isFailed ? "is-failed" : ""}`}>
      <div className="home-generation-mark">
        {isFailed ? <RefreshCcw size={24} /> : isReady ? <CheckCircle2 size={24} /> : <Sparkles size={24} />}
      </div>
      <div className="home-generation-copy">
        <span className="home-section-label">
          {isFailed ? "Course needs attention" : isReady ? "Your course is ready" : isIntake ? "Continue course setup" : "Creating your course"}
        </span>
        <h2 id="continue-heading">{job.course?.title || job.partialCourse?.title || job.topic}</h2>
        <p>{isFailed ? job.error || "Course generation stopped before it could finish." : job.progress?.message || job.summary}</p>
        {!isFailed && !isReady && !isIntake && (
          <>
            <div className="home-progress" aria-label={`${percent}% generated`}><i style={{ width: `${percent}%` }} /></div>
            <p className="home-progress-copy">{percent}% complete</p>
          </>
        )}
        <Link className="home-primary-action" href={href}>
          {isFailed ? "Review and retry" : isReady ? "Open course" : isIntake ? "Resume setup" : "View progress"}
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
