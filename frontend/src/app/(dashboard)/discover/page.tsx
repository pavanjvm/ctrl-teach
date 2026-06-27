"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Star, ArrowRight, Loader2, Clock, AlertCircle, Play } from "lucide-react";
import axios from "axios";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import { API_URL } from "@/lib/constants";
import type { Course, ContentPlatform, SkillLevel } from "@/lib/types";

import "./discover.css";

/* ── Platform gradient map + raw→Course transformer ──────────────────── */

const GRADIENTS: Record<string, string> = {
  "LinkedIn Learning": "linear-gradient(135deg,#0a66c2,#0b3d91)",
  "Udemy": "linear-gradient(135deg,#a435f0,#1c1d1f)",
  "YouTube": "linear-gradient(135deg,#ff0000,#cc0000)",
  "Documentation": "linear-gradient(135deg,#0ea5e9,#1e3a8a)",
  "Blogs": "linear-gradient(135deg,#f59e0b,#b45309)",
  "Articles": "linear-gradient(135deg,#10b981,#065f46)",
};

interface DiscoverResult {
  id?: string;
  title: string;
  platform: ContentPlatform;
  instructor?: string;
  description: string;
  difficulty: SkillLevel;
  duration: string;
  rating?: number;
  ratingCount?: number;
  skills?: string[];
  url?: string;
  reason?: string;
}

function toCourse(raw: DiscoverResult): Course {
  return {
    id: raw.id || `d${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: raw.title,
    description: raw.description,
    thumbnail: GRADIENTS[raw.platform] || "linear-gradient(135deg,#6366f1,#4338ca)",
    instructor: raw.instructor || "Expert",
    platform: raw.platform,
    difficulty: raw.difficulty,
    duration: raw.duration,
    skills: raw.skills || [],
    rating: raw.rating || 4.5,
    ratingCount: raw.ratingCount || 0,
    url: raw.url,
    modules: [
      {
        id: "m1",
        title: "Course overview",
        lessons: [
          {
            id: "l1",
            title: "Get started",
            type: "study",
            duration: "10m",
            summary: "Start with this resource.",
          },
        ],
      },
    ],
  };
}

/* Extend Course with optional reason carried from discovery results */
type CourseWithReason = Course & { reason?: string };

const PLATFORMS: ContentPlatform[] = [
  "LinkedIn Learning",
  "Udemy",
  "YouTube",
  "Documentation",
  "Blogs",
  "Articles",
];

const LEVELS: ("All" | SkillLevel)[] = ["All", "Beginner", "Intermediate", "Advanced"];

const RECENT_KEY = "ctrlteach_recent_courses";

/* ── Component ───────────────────────────────────────────────────────── */

export default function DiscoverPage() {
  const router = useRouter();
  const { prefs, courses, addCourse, setActiveCourse, activeCourseId, activeCourse } =
    useLearner();
  const { getToken } = useAuth();

  // Redirect to onboarding if not onboarded.
  useEffect(() => {
    if (prefs && !prefs.onboarded) {
      router.replace("/onboarding");
    }
  }, [prefs, router]);

  const goal = prefs?.goal ?? "";

  const [query, setQuery] = useState(goal);
  const [selectedPlatforms, setSelectedPlatforms] = useState<ContentPlatform[]>(
    prefs?.sources ?? []
  );
  const [level, setLevel] = useState<"All" | SkillLevel>("All");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseWithReason[]>([]);

  const [searched, setSearched] = useState(false);

  const [browserFilter, setBrowserFilter] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Keep query in sync if prefs arrive later.
  useEffect(() => {
    if (goal) setQuery((q) => (q ? q : goal));
  }, [goal]);

  // Load recently viewed from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecentIds(raw.split(",").filter(Boolean));
    } catch {}
  }, []);

  function pushRecent(courseId: string) {
    setRecentIds((prev) => {
      const next = [courseId, ...prev.filter((id) => id !== courseId)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, next.join(","));
      } catch {}
      return next;
    });
  }

  function togglePlatform(p: ContentPlatform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function runSearch() {
    setLoading(true);
    setSearched(true);
    setError(null);
    setResults([]);
    try {
      const token = await getToken();
      const res = await axios.post(
        `${API_URL}/api/discover`,
        {
          query,
          platforms: selectedPlatforms,
          level: level === "All" ? undefined : level,
        },
        { headers: token ? { Authorization: token } : undefined }
      );
      const rawList: DiscoverResult[] = res.data?.courses ?? [];
      const mapped: CourseWithReason[] = rawList.map((r) => {
        const c = toCourse(r);
        addCourse(c);
        return { ...c, reason: r.reason };
      });
      setResults(mapped);
    } catch {
      setError("Could not reach the discovery service — showing your catalog instead.");
    } finally {
      setLoading(false);
    }
  }

  function launch(course: Course) {
    const firstLessonId = course.modules[0]?.lessons[0]?.id;
    setActiveCourse(course.id, firstLessonId);
    pushRecent(course.id);
    router.push("/learn");
  }

  /* Derived: client-side catalog filter */
  const catalogFiltered = useMemo(() => {
    const f = browserFilter.trim().toLowerCase();
    if (!f) return courses;
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(f) ||
        c.description.toLowerCase().includes(f) ||
        c.skills.some((s) => s.toLowerCase().includes(f))
    );
  }, [courses, browserFilter]);

  /* Recommended for goal — loose keyword match on seeded catalog, top 3 */
  const recommended = useMemo(() => {
    const g = (goal || query).toLowerCase();
    if (!g) return [];
    const tokens = g.split(/\s+/).filter((t) => t.length > 3);
    const scored = courses
      .map((c) => {
        const hay = `${c.title} ${c.description} ${c.skills.join(" ")}`.toLowerCase();
        const score = tokens.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
        return { c, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.c);
    return scored;
  }, [courses, goal, query]);

  /* Recently viewed courses */
  const recentCourses = useMemo(
    () =>
      recentIds
        .map((id) => courses.find((c) => c.id === id))
        .filter((c): c is Course => Boolean(c))
        .slice(0, 3),
    [recentIds, courses]
  );

  if (!prefs) return null;

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="page dsc-page">
      {/* ── 01 — Hero / Search ────────────────────────────────────────── */}
      <section className="sec dsc-hero" id="discover-hero">
        <div className="sec-eyebrow">01 / Discover</div>
        <h1 className="sec-title">
          Find the right course to learn {goal || "anything"}
          <span className="stop">.</span>
        </h1>
        <p className="lede">
          Search the web for the best courses across the platforms you trust, or browse
          the curated catalog below. Every result launches straight into the workspace.
        </p>

        <div className="dsc-search-wrap">
          <div className="dsc-search">
            <Search size={18} className="dsc-search-icon" />
            <input
              className="dsc-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="What do you want to learn?"
              aria-label="Search query"
            />
            <button
              className="dsc-search-btn"
              onClick={runSearch}
              disabled={loading}
              type="button"
            >
              {loading ? <Loader2 size={15} className="dsc-spin" /> : <Search size={15} />}
              {loading ? "Searching" : "Search"}
            </button>
          </div>

          <div className="dsc-filters">
            <div className="dsc-filter-row">
              <span className="dsc-filter-label">Platforms</span>
              <div className="dsc-chips">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`dsc-chip ${selectedPlatforms.includes(p) ? "on" : ""}`}
                    onClick={() => togglePlatform(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="dsc-filter-row">
              <span className="dsc-filter-label">Level</span>
              <div className="dsc-chips">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`dsc-chip ${level === l ? "on" : ""}`}
                    onClick={() => setLevel(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 02 — Continue learning ────────────────────────────────────── */}
      {activeCourse && (
        <section className="sec sec-tight dsc-resume" id="discover-resume">
          <div className="sec-num">Continue learning</div>
          <span className="gold-rule" />
          <div className="dsc-resume-card">
            <div
              className="dsc-resume-thumb"
              style={{ background: activeCourse.thumbnail }}
              aria-hidden
            />
            <div className="dsc-resume-body">
              <span className="dsc-resume-eyebrow">Resume · {activeCourse.platform}</span>
              <h3 className="dsc-resume-title">{activeCourse.title}</h3>
              <p className="dsc-resume-meta">
                {activeCourse.instructor} · {activeCourse.difficulty} · {activeCourse.duration}
              </p>
              <Link href="/learn" className="cta cta-primary dsc-resume-cta">
                <Play size={13} fill="currentColor" /> Resume
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── 03 — Search results ───────────────────────────────────────── */}
      {searched && (
        <section className="sec dsc-results" id="discover-results">
          <div className="sec-num">02 / Results</div>
          <h2 className="sec-title dsc-results-title">
            {loading ? "Searching the web" : error ? "Catalog fallback" : "What we found"}
            <span className="stop">.</span>
          </h2>

          {loading && (
            <div className="dsc-loading">
              <Loader2 size={22} className="dsc-spin" />
              <span>Drawing from across the platforms…</span>
            </div>
          )}

          {error && !loading && (
            <div className="dsc-note">
              <AlertCircle size={14} />
              <span>Could not reach the discovery service — showing your catalog instead.</span>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <p className="lede">
              No results yet. Refine your query, or browse the catalog below.
            </p>
          )}

          {!loading && results.length > 0 && (
            <div className="dsc-grid">
              {results.map((c, i) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  reason={c.reason}
                  index={i}
                  onLaunch={launch}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 04 — Recommended for your goal ────────────────────────────── */}
      {recommended.length > 0 && (
        <section className="sec sec-tight dsc-recommended" id="discover-recommended">
          <div className="sec-num">03 / Recommended</div>
          <h2 className="sec-title">
            Recommended for {goal || "you"}
            <span className="stop">.</span>
          </h2>
          <p className="lede">A few catalog picks that line up with your goal.</p>
          <div className="dsc-grid dsc-grid-3">
            {recommended.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} onLaunch={launch} />
            ))}
          </div>
        </section>
      )}

      {/* ── 05 — Recently viewed ──────────────────────────────────────── */}
      {recentCourses.length > 0 && (
        <section className="sec sec-tight dsc-recent" id="discover-recent">
          <div className="sec-num">04 / Recently viewed</div>
          <h2 className="sec-title">
            Where you left off<span className="stop">.</span>
          </h2>
          <div className="dsc-grid dsc-grid-3">
            {recentCourses.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} onLaunch={launch} />
            ))}
          </div>
        </section>
      )}

      {/* ── 06 — Catalog ─────────────────────────────────────────────── */}
      <section className="sec dsc-catalog" id="discover-catalog">
        <div className="sec-num">05 / Catalog</div>
        <h2 className="sec-title">
          Browse the catalog<span className="stop">.</span>
        </h2>
        <p className="lede">
          A hand-curated set of courses across every learning mode — study, lab,
          assessment, and roleplay.
        </p>

        <div className="dsc-catalog-toolbar">
          <Search size={16} className="dsc-catalog-search-icon" />
          <input
            className="dsc-catalog-filter"
            type="text"
            value={browserFilter}
            onChange={(e) => setBrowserFilter(e.target.value)}
            placeholder="Filter the catalog…"
            aria-label="Filter the catalog"
          />
        </div>

        {catalogFiltered.length === 0 ? (
          <p className="lede">No catalog courses match “{browserFilter}”.</p>
        ) : (
          <div className="dsc-grid">
            {catalogFiltered.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} onLaunch={launch} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Course card ─────────────────────────────────────────────────────── */

function CourseCard({
  course,
  reason,
  index,
  onLaunch,
}: {
  course: Course;
  reason?: string;
  index: number;
  onLaunch: (c: Course) => void;
}) {
  return (
    <motion.article
      className="dsc-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4), ease: "easeOut" }}
      data-platform={course.platform}
    >
      <div className="dsc-card-thumb" style={{ background: course.thumbnail }} aria-hidden>
        <span className="dsc-card-platform">{course.platform}</span>
        <span className="dsc-card-level">{course.difficulty}</span>
      </div>

      <div className="dsc-card-body">
        <h3 className="dsc-card-title">{course.title}</h3>
        <p className="dsc-card-instructor">{course.instructor}</p>

        <p className="dsc-card-desc">{course.description}</p>

        {reason && <p className="dsc-card-reason">{reason}</p>}

        <div className="dsc-card-meta">
          <span className="dsc-card-duration">
            <Clock size={12} />
            {course.duration}
          </span>
          <span className="dsc-card-rating">
            <Star size={12} fill="currentColor" />
            {course.rating.toFixed(1)}
            {course.ratingCount > 0 && (
              <span className="dsc-card-rating-count"> · {course.ratingCount.toLocaleString()}</span>
            )}
          </span>
        </div>

        {course.skills.length > 0 && (
          <div className="dsc-card-skills">
            {course.skills.slice(0, 4).map((s) => (
              <span key={s} className="dsc-card-skill">{s}</span>
            ))}
          </div>
        )}

        <button
          type="button"
          className="dsc-card-launch"
          onClick={() => onLaunch(course)}
        >
          Launch <ArrowRight size={13} />
        </button>
      </div>
    </motion.article>
  );
}