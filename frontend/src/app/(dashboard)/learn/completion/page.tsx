"use client";

/**
 * Completion — the celebratory landng page reached after finishing a course
 * (or via a "view certificate" CTA). Shows a certificate preview, the skills
 * learned, a progress summary grid, the badges earned on this journey, and
 * CTAs to head back to the dashboard or find another course.
 *
 * Editorial / Luxe Whitespace: warm off-white field, ink type, single gold
 * accent, parchment certificate with a dashed gold border and an inline SVG
 * seal. Gold hairlines carry the structure — no content shadows.
 */

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Download,
  ArrowRight,
  Lock,
  Sparkles,
  Target,
  Brain,
  Users,
  Flame,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import type { Badge } from "@/lib/types";

import "./completion.css";

/* badge.icon → lucide icon map */
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  target: Target,
  brain: Brain,
  users: Users,
  flame: Flame,
  trophy: Trophy,
};

function iconFor(badge: Badge): LucideIcon {
  return ICONS[badge.icon] ?? Trophy;
}

const CONFETTI_PALETTE = ["#D4A574", "#6366F1", "#E0DCD6", "#6B8E5A"];

export default function CompletionPage() {
  const { user } = useAuth();
  const { activeCourse, progress } = useLearner();

  /* lessons that belong to this course, for the "lessons completed" count */
  const courseLessonIds = useMemo(
    () =>
      activeCourse
        ? activeCourse.modules.flatMap((m) => m.lessons.map((l) => l.id))
        : [],
    [activeCourse]
  );

  const completedInCourse = useMemo(
    () =>
      progress.completedLessons.filter((id) => courseLessonIds.includes(id))
        .length,
    [progress.completedLessons, courseLessonIds]
  );

  /* ── empty state ── */
  if (!activeCourse) {
    return (
      <div className="cmp cmp-empty page">
        <div className="sec sec-tight">
          <div className="sec-eyebrow">No active course</div>
          <h1 className="sec-title">
            Nothing to celebrate yet<span className="stop">.</span>
          </h1>
          <p className="lede">
            Pick up a course and finish it to earn a certificate and a record
            of your journey.
          </p>
          <div className="ctas">
            <Link href="/discover" className="cta cta-primary">
              <ArrowRight size={14} /> Find a course
            </Link>
            <Link href="/dashboard" className="cta cta-secondary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const learnerName = user?.displayName || user?.username || "Learner";
  const certificate = activeCourse.certificateCriteria;
  const verifiedSkills = certificate?.skills?.length
    ? certificate.skills
    : activeCourse.skills;
  const completedOn = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const earned = progress.badges.filter((b) => Boolean(b.earnedAt));
  const comingSoon = progress.badges.filter((b) => !b.earnedAt);

  return (
    <div className="cmp page">
      <Confetti />

      {/* ── 01 — Hero / Certificate ──────────────────────────────────── */}
      <section className="sec sec-tight cmp-hero">
        <div className="sec-eyebrow">01 / Course complete</div>
        <h1 className="sec-title">
          {activeCourse.title}
          <span className="stop">.</span>
        </h1>
        <p className="lede">
          You reached the end. Here is your certificate of completion and a
          record of everything you learned along the way.
        </p>
        <span className="gold-rule" />

        <div className="cmp-cert" role="figure" aria-label={certificate?.title ?? "Certificate of completion"}>
          <div className="cmp-cert-inner">
            <div className="cmp-cert-eyebrow">{certificate?.title ?? "Certificate of completion"}</div>
            <div className="cmp-cert-name">{learnerName}</div>
            <span className="cmp-cert-hairline" />
            <p className="cmp-cert-line">
              has successfully completed
            </p>
            <p className="cmp-cert-course">{activeCourse.title}</p>
            {certificate?.statement && (
              <p className="cmp-cert-proof">{certificate.statement}</p>
            )}
            <p className="cmp-cert-instructor">
              with {activeCourse.instructor} · {activeCourse.platform}
            </p>
            <p className="cmp-cert-date">Completed on {completedOn}</p>

            <div className="cmp-cert-foot">
              <div className="cmp-cert-issued">
                <span className="cmp-cert-foot-label">Issued by</span>
                <span className="cmp-cert-foot-value">Ctrl+Teach</span>
              </div>
              <Seal />
            </div>
          </div>

          <div className="cmp-cert-cta">
            <button
              type="button"
              className="cmp-download"
              onClick={() => window.print()}
            >
              <Download size={14} /> Download certificate
            </button>
          </div>
        </div>
      </section>

      {/* ── 02 — Skills learned ─────────────────────────────────────── */}
      {verifiedSkills.length > 0 && (
        <section className="sec sec-tight cmp-skills">
          <div className="sec-num">02 / Skills learned</div>
          <h2 className="sec-title">
            What you can now do<span className="stop">.</span>
          </h2>
          <div className="cmp-skills-row">
            {verifiedSkills.map((s) => (
              <span key={s} className="cmp-skill-chip">{s}</span>
            ))}
          </div>
        </section>
      )}

      {/* ── 03 — Progress summary ─────────────────────────────────────── */}
      <section className="sec sec-tight cmp-progress">
        <div className="sec-num">03 / Your journey</div>
        <h2 className="sec-title">
          The numbers behind the finish<span className="stop">.</span>
        </h2>
        <div className="cmp-stat-grid">
          <div className="cmp-stat">
            <div className="cmp-stat-label">XP gained</div>
            <div className="cmp-stat-value">{progress.xp}</div>
            <div className="cmp-stat-foot">All time</div>
          </div>
          <div className="cmp-stat">
            <div className="cmp-stat-label">Confidence</div>
            <div className="cmp-stat-value">
              {progress.confidence}<span className="cmp-unit">/5</span>
            </div>
            <div className="cmp-stat-foot">Self-rated</div>
          </div>
          <div className="cmp-stat">
            <div className="cmp-stat-label">Streak</div>
            <div className="cmp-stat-value">
              {progress.streak}<span className="cmp-unit">d</span>
            </div>
            <div className="cmp-stat-foot">Day{progress.streak === 1 ? "" : "s"} in a row</div>
          </div>
          <div className="cmp-stat">
            <div className="cmp-stat-label">Lessons done</div>
            <div className="cmp-stat-value">
              {completedInCourse}
              <span className="cmp-unit">/{courseLessonIds.length}</span>
            </div>
            <div className="cmp-stat-foot">In this course</div>
          </div>
        </div>
      </section>

      {/* ── 04 — Badges ───────────────────────────────────────────────── */}
      <section className="sec sec-tight cmp-badges">
        <div className="sec-num">04 / Badges</div>
        <h2 className="sec-title">
          Earned along the way<span className="stop">.</span>
        </h2>
        <p className="lede">
          Every milestone you crossed. The dimmed ones are still waiting for
          their run.
        </p>

        <ul className="cmp-badge-grid">
          {earned.map((b, i) => {
            const Icon = iconFor(b);
            return (
              <motion.li
                key={b.id}
                className="cmp-badge is-earned"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.6), ease: "easeOut" }}
              >
                <div className="cmp-badge-icon">
                  <Icon size={20} />
                </div>
                <div className="cmp-badge-body">
                  <h3 className="cmp-badge-title">{b.title}</h3>
                  <p className="cmp-badge-desc">{b.description}</p>
                  {b.earnedAt && (
                    <span className="cmp-badge-when">
                      Earned {new Date(b.earnedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </motion.li>
            );
          })}

          {comingSoon.map((b) => {
            const Icon = iconFor(b);
            return (
              <li key={b.id} className="cmp-badge is-locked">
                <div className="cmp-badge-icon cmp-badge-icon-locked">
                  <Lock size={18} />
                </div>
                <div className="cmp-badge-body">
                  <h3 className="cmp-badge-title">{b.title}</h3>
                  <p className="cmp-badge-desc">{b.description}</p>
                  <span className="cmp-badge-when cmp-badge-when-soon">Coming soon</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── 05 — CTAs ─────────────────────────────────────────────────── */}
      <section className="sec sec-close cmp-ctas">
        <div className="sec-num">05 / Where next</div>
        <div className="ctas">
          <Link href="/dashboard" className="cta cta-primary">
            Back to dashboard
          </Link>
          <Link href="/discover" className="cta cta-secondary">
            Find another course <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ── Seal (inline SVG circle + star) ────────────────────────────────────── */

function Seal() {
  return (
    <svg
      className="cmp-seal"
      viewBox="0 0 64 64"
      width="64"
      height="64"
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill="none" stroke="#D4A574" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="24" fill="#FBF8F1" stroke="#D4A574" strokeWidth="1" />
      <path
        d="M32 18l3.6 7.3 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z"
        fill="#D4A574"
      />
    </svg>
  );
}

/* ── Confetti burst ────────────────────────────────────────────────────── */

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 420,
        y: -120 - Math.random() * 80,
        r: (Math.random() - 0.5) * 360,
        s: 6 + Math.random() * 9,
        c: CONFETTI_PALETTE[i % CONFETTI_PALETTE.length],
        d: Math.random() * 0.4,
      })),
    []
  );
  return (
    <div className="cmp-confetti" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="cmp-confetti-bit"
          style={{ background: p.c, width: p.s, height: p.s * 0.5 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y + 320, rotate: p.r, opacity: 0 }}
          transition={{ duration: 1.8, delay: p.d, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
