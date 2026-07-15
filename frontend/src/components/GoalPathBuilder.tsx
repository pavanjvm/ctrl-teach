"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  Play,
  Sparkles,
  Target,
} from "lucide-react";
import axios from "axios";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import { API_URL } from "@/lib/constants";
import type { ContentPlatform, Course, SkillLevel } from "@/lib/types";

const PATH_GRADIENT =
  "linear-gradient(135deg,#151515 0%,#4b3b18 58%,#c49a3a 100%)";

const SOURCES: ContentPlatform[] = [
  "YouTube",
  "Documentation",
  "GitHub",
  "freeCodeCamp",
  "MIT OpenCourseWare",
];

const DEFAULT_SOURCES: ContentPlatform[] = [
  "YouTube",
  "Documentation",
  "GitHub",
];

const LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];
const TARGETS = ["7 days", "2 weeks", "4 weeks"] as const;

interface PathPayload {
  id: string;
  title: string;
  description: string;
  difficulty: SkillLevel;
  duration: string;
  skills: string[];
  goal: string;
  sourceCount: number;
  modules: Course["modules"];
}

function asCourse(path: PathPayload): Course {
  return {
    ...path,
    thumbnail: PATH_GRADIENT,
    instructor: "Curated by Tars",
    platform: "Ctrl+Teach",
    rating: 0,
    ratingCount: 0,
  };
}

export default function GoalPathBuilder() {
  const router = useRouter();
  const { prefs, courses, addCourse, setActiveCourse, activeCourse } =
    useLearner();
  const { getToken } = useAuth();

  const suggestedGoal = prefs?.interests?.[0]
    ? `Build practical ${prefs.interests[0]} skills`
    : "";

  const [goal, setGoal] = useState(suggestedGoal);
  const [sources, setSources] =
    useState<ContentPlatform[]>(DEFAULT_SOURCES);
  const [level, setLevel] = useState<SkillLevel>("Beginner");
  const [target, setTarget] =
    useState<(typeof TARGETS)[number]>("2 weeks");
  const [path, setPath] = useState<Course | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLinkedIn, setShowLinkedIn] = useState(false);

  useEffect(() => {
    if (prefs && !prefs.onboarded) router.replace("/onboarding");
  }, [prefs, router]);

  useEffect(() => {
    if (suggestedGoal) setGoal((current) => current || suggestedGoal);
  }, [suggestedGoal]);

  const publishedCount = useMemo(
    () => courses.filter((course) => course.status === "published").length,
    [courses]
  );

  const authoredPaths = useMemo(
    () => [
      ...courses.filter((course) => course.status === "published"),
      ...courses.filter(
        (course) => course.status !== "published" && course.platform !== "Ctrl+Teach"
      ),
    ].slice(0, 3),
    [courses]
  );

  if (!prefs) return null;

  function toggleSource(source: ContentPlatform) {
    setSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source]
    );
  }

  async function generatePath() {
    if (!goal.trim()) return;
    setAttempted(true);
    setLoading(true);
    setPath(null);
    setError(null);

    try {
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/discover/path`,
        {
          query: goal.trim(),
          platforms: sources,
          level,
          time_budget: target,
        },
        { headers: token ? { Authorization: token } : undefined }
      );

      const payload = response.data?.path as PathPayload | undefined;
      if (!payload?.modules?.length) throw new Error("No path returned");
      const generated = asCourse(payload);
      addCourse(generated);
      setPath(generated);
    } catch (requestError) {
      console.error("Path generation failed", requestError);
      setError(
        "The grounded path service is unavailable. Check the backend API and connector keys."
      );
    } finally {
      setLoading(false);
    }
  }

  function launch(course: Course) {
    setActiveCourse(course.id, course.modules[0]?.lessons[0]?.id);
    router.push("/learn");
  }

  return (
    <div className="page dsc-page">
      <section className="sec dsc-hero">
        <div className="sec-eyebrow">01 / Build your path</div>
        <h1 className="sec-title">
          Start with the outcome, not the course<span className="stop">.</span>
        </h1>
        <p className="lede">
          Describe what you need to be able to do. Tars will find grounded
          resources, sequence the work, and add practice and checkpoints.
        </p>

        <div className="dsc-search-wrap">
          <div className="dsc-search">
            <Target size={19} className="dsc-search-icon" />
            <input
              className="dsc-search-input"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") generatePath();
              }}
              placeholder="Example: Prepare for a system design interview"
              aria-label="Learning outcome"
            />
            <button
              className="dsc-search-btn"
              type="button"
              onClick={generatePath}
              disabled={loading || !goal.trim()}
            >
              {loading ? (
                <Loader2 size={15} className="dsc-spin" />
              ) : (
                <Sparkles size={15} />
              )}
              {loading ? "Building" : "Build my path"}
            </button>
          </div>

          <div className="dsc-filters">
            <FilterGroup label="Open sources">
              {SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  className={`dsc-chip ${sources.includes(source) ? "on" : ""}`}
                  onClick={() => toggleSource(source)}
                >
                  {source}
                </button>
              ))}
            </FilterGroup>

            <FilterGroup label="Starting level">
              {LEVELS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`dsc-chip ${level === item ? "on" : ""}`}
                  onClick={() => setLevel(item)}
                >
                  {item}
                </button>
              ))}
            </FilterGroup>

            <FilterGroup label="Target">
              {TARGETS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`dsc-chip ${target === item ? "on" : ""}`}
                  onClick={() => setTarget(item)}
                >
                  {item}
                </button>
              ))}
            </FilterGroup>
          </div>

          <button
            type="button"
            className="dsc-connector"
            onClick={() => setShowLinkedIn((current) => !current)}
          >
            <Building2 size={18} />
            <span>
              <strong>Connect LinkedIn Learning</strong>
              <small>Optional organization connector</small>
            </span>
            <Link2 size={15} />
          </button>

          {showLinkedIn && (
            <div className="dsc-note dsc-connector-note">
              <AlertCircle size={14} />
              <span>
                Organization administrators will be able to add catalog and
                reporting credentials here later. Open-source paths work without it.
              </span>
            </div>
          )}
        </div>
      </section>

      {activeCourse && (
        <section className="sec sec-tight dsc-resume">
          <div className="sec-num">Continue learning</div>
          <span className="gold-rule" />
          <div className="dsc-resume-card">
            <div
              className="dsc-resume-thumb"
              style={{ background: activeCourse.thumbnail }}
            />
            <div className="dsc-resume-body">
              <span className="dsc-resume-eyebrow">
                Resume - {activeCourse.platform}
              </span>
              <h3 className="dsc-resume-title">{activeCourse.title}</h3>
              <p className="dsc-resume-meta">
                {activeCourse.modules.length} modules - {activeCourse.duration}
              </p>
              <button
                type="button"
                className="cta cta-primary dsc-resume-cta"
                onClick={() => router.push("/learn")}
              >
                <Play size={13} fill="currentColor" /> Resume
              </button>
            </div>
          </div>
        </section>
      )}

      {attempted && (
        <section className="sec dsc-results">
          <div className="sec-num">02 / Your path</div>
          <h2 className="sec-title dsc-results-title">
            {loading ? "Curating your path" : "Built around your goal"}
            <span className="stop">.</span>
          </h2>

          {loading && (
            <div className="dsc-loading">
              <Loader2 size={22} className="dsc-spin" />
              <span>
                Finding sources, sequencing practice, and writing checkpoints...
              </span>
            </div>
          )}

          {error && !loading && (
            <div className="dsc-note">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {path && !loading && <PathPreview course={path} onLaunch={launch} />}
        </section>
      )}

      <section className="sec dsc-catalog">
        <div className="sec-num">
          03 / {publishedCount > 0 ? "Published course inventory" : "Authored demonstrations"}
        </div>
        <h2 className="sec-title">
          {publishedCount > 0 ? "Ready for learners" : "See every learning mode"}
          <span className="stop">.</span>
        </h2>
        <p className="lede">
          {publishedCount > 0
            ? `${publishedCount} course${publishedCount === 1 ? " has" : "s have"} been transformed from existing IP and published as a complete Ctrl+Teach experience.`
            : "These paths remain as polished demonstrations while generated paths become the primary product workflow."}
        </p>
        <div className="dsc-grid dsc-grid-3">
          {authoredPaths.map((course, index) => (
            <motion.article
              className="dsc-card"
              key={course.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div
                className="dsc-card-thumb"
                style={{ background: course.thumbnail }}
              >
                <span className="dsc-card-platform">{course.platform}</span>
                <span className="dsc-card-level">{course.difficulty}</span>
              </div>
              <div className="dsc-card-body">
                <h3 className="dsc-card-title">{course.title}</h3>
                <p className="dsc-card-desc">{course.description}</p>
                <button
                  type="button"
                  className="dsc-card-launch"
                  onClick={() => launch(course)}
                >
                  {course.status === "published" ? "Start course" : "Open demo"} <ArrowRight size={13} />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="dsc-filter-row">
      <span className="dsc-filter-label">{label}</span>
      <div className="dsc-chips">{children}</div>
    </div>
  );
}

function PathPreview({
  course,
  onLaunch,
}: {
  course: Course;
  onLaunch: (course: Course) => void;
}) {
  const lessons = course.modules.flatMap((module) => module.lessons);
  const providers = Array.from(
    new Set(
      lessons.flatMap((lesson) =>
        (lesson.resources ?? []).map((resource) => resource.provider)
      )
    )
  );

  return (
    <motion.article
      className="dsc-path-preview"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="dsc-path-heading">
        <div>
          <span className="dsc-path-kicker">
            <CheckCircle2 size={13} /> Grounded learning path
          </span>
          <h3>{course.title}</h3>
          <p>{course.description}</p>
        </div>
        <button
          type="button"
          className="dsc-search-btn"
          onClick={() => onLaunch(course)}
        >
          Start path <ArrowRight size={15} />
        </button>
      </div>

      <div className="dsc-path-stats">
        <span><BookOpen size={14} /> {course.modules.length} modules</span>
        <span><Target size={14} /> {lessons.length} coached steps</span>
        <span><Clock size={14} /> {course.duration}</span>
        <span><Link2 size={14} /> {course.sourceCount ?? providers.length} sources</span>
      </div>

      <div className="dsc-path-modules">
        {course.modules.map((module, index) => (
          <div key={module.id} className="dsc-path-module">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{module.title}</strong>
              <small>
                {module.lessons.map((lesson) => lesson.title).join(" - ")}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className="dsc-path-footer">
        <div className="dsc-card-skills">
          {course.skills.slice(0, 6).map((skill) => (
            <span key={skill} className="dsc-card-skill">{skill}</span>
          ))}
        </div>
        {providers.length > 0 && <p>Sources: {providers.join(", ")}</p>}
      </div>
    </motion.article>
  );
}
