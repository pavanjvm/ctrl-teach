"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AudioLines,
  BrainCircuit,
  Coins,
  LogOut,
  ScanSearch,
  Sparkles,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import {
  TARS_COST_BREAKDOWN,
  TARS_FEATURE_USAGE,
  TARS_OPERATIONAL_METRICS,
  TARS_PERIODS,
  TARS_PERSONALITIES,
  TARS_PERSONALITY_FEATURE_MATRIX,
  type AdminPeriodKey,
} from "@/lib/adminMockData";
import "../admin.css";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 250;
const CHART_PAD_X = 34;
const CHART_PAD_TOP = 24;
const CHART_PAD_BOTTOM = 34;

function formatCurrency(value: number, compact = false): string {
  if (compact && value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function lineGeometry(values: number[]) {
  const max = Math.max(...values) * 1.08;
  const usableWidth = CHART_WIDTH - CHART_PAD_X * 2;
  const usableHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const points = values.map((value, index) => ({
    x: CHART_PAD_X + (values.length === 1 ? 0 : index / (values.length - 1)) * usableWidth,
    y: CHART_PAD_TOP + (1 - value / max) * usableHeight,
    value,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const baseline = CHART_HEIGHT - CHART_PAD_BOTTOM;
  const area = `${line} L${points.at(-1)?.x ?? CHART_PAD_X},${baseline} L${points[0]?.x ?? CHART_PAD_X},${baseline} Z`;
  return { points, line, area, max };
}

export default function TarsAnalyticsPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const reduceMotion = useReducedMotion();
  const [periodKey, setPeriodKey] = useState<AdminPeriodKey>("90d");

  useEffect(() => {
    if (!loading && !user?.isAdmin) router.replace("/admin/login");
  }, [loading, router, user]);

  const period = TARS_PERIODS[periodKey];
  const costScale = period.totalCost / TARS_PERIODS["90d"].totalCost;
  const usageScale = periodKey === "30d" ? .34 : periodKey === "12m" ? 4.56 : 1;
  const geometry = useMemo(
    () => lineGeometry(period.trend.map((item) => item.cost)),
    [period.trend],
  );
  const maxFeatureSessions = Math.max(...TARS_FEATURE_USAGE.map((item) => item.sessions));

  async function signOut() {
    await logout();
    router.replace("/admin/login");
  }

  if (loading || !user?.isAdmin) {
    return <div className="admin-loading">Opening Tars analytics…</div>;
  }

  return (
    <div className="admin-dashboard-shell">
      <header className="admin-studio-header admin-dashboard-header">
        <Link href="/admin/dashboard" className="admin-wordmark" aria-label="Admin dashboard">Ctrl<span>+</span>Teach</Link>
        <div className="admin-studio-title">
          <span>Admin</span>
          <nav className="admin-section-nav" aria-label="Admin sections">
            <Link href="/admin/dashboard">Dashboard</Link>
            <Link href="/admin/courses">Manage courses</Link>
            <Link href="/admin/tars" className="active">Tars analytics</Link>
          </nav>
        </div>
        <div className="admin-header-actions">
          <span className="admin-header-user">{user.displayName || user.username}</span>
          <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>

      <main className="admin-dashboard-page admin-tars-page">
        <header className="admin-dashboard-intro">
          <div>
            <span className="admin-tars-kicker"><Sparkles size={13} /> Tars intelligence</span>
            <h1>Usage and AI economics</h1>
            <p>Understand where Tars creates value, what learners prefer, and what each experience costs.</p>
          </div>
          <div className="admin-period-control" aria-label="Tars reporting period">
            {(Object.keys(TARS_PERIODS) as AdminPeriodKey[]).map((key) => (
              <button type="button" key={key} className={periodKey === key ? "active" : ""} onClick={() => setPeriodKey(key)}>
                {key === "30d" ? "30 days" : key === "90d" ? "90 days" : "12 months"}
              </button>
            ))}
          </div>
        </header>

        <motion.section
          className="admin-kpi-grid admin-tars-kpis"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .45, ease: [0.16, 1, 0.3, 1] }}
          aria-label={`Tars metrics for ${period.label}`}
        >
          <article><span><Coins size={16} /> Total AI cost</span><strong>{formatCurrency(period.totalCost, true)}</strong><small>{formatCurrency(period.totalCost / period.activeLearners)} per active learner</small></article>
          <article><span><BrainCircuit size={16} /> Tutor turns</span><strong>{period.tutorTurns.toLocaleString("en-IN")}</strong><small>Voice, text, visual, and classroom turns</small></article>
          <article><span><AudioLines size={16} /> Realtime voice</span><strong>{period.realtimeMinutes.toLocaleString("en-IN")}m</strong><small>Live tutor and roleplay audio</small></article>
          <article><span><ScanSearch size={16} /> Visual guidance</span><strong>{period.visualScans.toLocaleString("en-IN")}</strong><small>Screen and whiteboard grounding scans</small></article>
        </motion.section>

        <section className="admin-tars-primary-grid">
          <motion.article
            className="admin-analytics-panel admin-tars-trend"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: .5, delay: .08, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="admin-panel-head">
              <div><h2>AI spend trend</h2><p>Weekly platform cost with session volume shown on each point.</p></div>
              <strong>{period.generatedCourses.toLocaleString("en-IN")} courses generated</strong>
            </div>
            <div className="admin-tars-line-chart">
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-labelledby="tars-cost-chart-title tars-cost-chart-desc">
                <title id="tars-cost-chart-title">Tars AI spend over time</title>
                <desc id="tars-cost-chart-desc">Spend rises from {formatCurrency(period.trend[0].cost)} to {formatCurrency(period.trend.at(-1)?.cost ?? 0)} during {period.label.toLowerCase()}.</desc>
                <defs>
                  <linearGradient id="tars-cost-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#719f2c" stopOpacity=".28" />
                    <stop offset="1" stopColor="#719f2c" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, .25, .5, .75, 1].map((ratio) => {
                  const y = CHART_PAD_TOP + ratio * (CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM);
                  return <line key={ratio} x1={CHART_PAD_X} y1={y} x2={CHART_WIDTH - CHART_PAD_X} y2={y} className="admin-tars-grid-line" />;
                })}
                <motion.path key={`area:${periodKey}`} d={geometry.area} fill="url(#tars-cost-area)" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }} />
                <motion.path
                  key={`line:${periodKey}`}
                  d={geometry.line}
                  className="admin-tars-cost-line"
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: .8, ease: [0.16, 1, 0.3, 1] }}
                />
                {geometry.points.map((point, index) => (
                  <motion.g key={`${periodKey}:${period.trend[index].label}`} initial={reduceMotion ? false : { opacity: 0, scale: .5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .18 + index * .035 }}>
                    <circle cx={point.x} cy={point.y} r="4" className="admin-tars-cost-point" />
                    {(index === geometry.points.length - 1 || period.trend.length <= 4) && (
                      <text x={point.x} y={point.y - 12} textAnchor="middle" className="admin-tars-point-label">{formatCurrency(point.value, true)}</text>
                    )}
                  </motion.g>
                ))}
              </svg>
              <div className="admin-tars-axis-labels">
                {period.trend.map((item) => <span key={item.label}>{item.label}</span>)}
              </div>
            </div>
            <div className="admin-tars-trend-summary">
              <span><Activity size={14} /> {period.trend.at(-1)?.sessions.toLocaleString("en-IN")} sessions in the latest period</span>
              <strong>{formatCurrency(period.totalCost)}</strong>
            </div>
          </motion.article>

          <motion.aside
            className="admin-analytics-panel admin-cost-allocation"
            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .5, delay: .14, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="admin-panel-head"><div><h2>Cost allocation</h2><p>AI and rendering spend by workload.</p></div></div>
            <div className="admin-cost-list">
              {TARS_COST_BREAKDOWN.map((item, index) => (
                <div key={item.name}>
                  <header><span><strong>{item.name}</strong><small>{item.category}</small></span><strong>{formatCurrency(Math.round(item.cost * costScale), true)}</strong></header>
                  <div><motion.i initial={reduceMotion ? false : { width: 0 }} animate={{ width: `${item.share}%` }} transition={{ duration: .6, delay: .12 + index * .06, ease: [0.16, 1, 0.3, 1] }} /></div>
                  <footer><span>{item.share}% of spend</span><span>{item.unit}</span></footer>
                </div>
              ))}
            </div>
          </motion.aside>
        </section>

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-head"><div><h2>Feature adoption and cost</h2><p>Which Tars experiences learners use, how long they stay, and what each one costs.</p></div></div>
          <div className="admin-feature-usage">
            {TARS_FEATURE_USAGE.map((item, index) => (
              <motion.article key={item.feature} initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ delay: index * .05 }}>
                <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.feature}</strong><small>{Math.round(item.sessions * usageScale).toLocaleString("en-IN")} sessions</small></header>
                <div className="admin-feature-bar"><motion.i initial={reduceMotion ? false : { width: 0 }} whileInView={{ width: `${item.sessions / maxFeatureSessions * 100}%` }} viewport={{ once: true }} transition={{ duration: .65, delay: index * .06, ease: [0.16, 1, 0.3, 1] }} /></div>
                <dl><div><dt>Usage share</dt><dd>{item.share}%</dd></div><div><dt>Avg session</dt><dd>{item.minutes} min</dd></div><div><dt>Completion</dt><dd>{item.completion}%</dd></div><div><dt>AI cost</dt><dd>{formatCurrency(Math.round(item.cost * costScale), true)}</dd></div></dl>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="admin-tars-secondary-grid">
          <article className="admin-analytics-panel admin-personality-panel">
            <div className="admin-panel-head"><div><h2>Teacher personality usage</h2><p>Selected personality, engagement, completion, and learner rating.</p></div><strong><Users size={14} /> {TARS_PERSONALITIES[0].name} leads</strong></div>
            <div className="admin-personality-list">
              {TARS_PERSONALITIES.map((item, index) => (
                <div key={item.name}>
                  <header><span><b>{index + 1}</b><strong>{item.name}</strong></span><span><strong>{item.share}%</strong><small>{Math.round(item.learners * usageScale).toLocaleString("en-IN")} learners</small></span></header>
                  <div><motion.i initial={reduceMotion ? false : { width: 0 }} whileInView={{ width: `${item.share}%` }} viewport={{ once: true }} transition={{ duration: .65, delay: index * .06 }} /></div>
                  <footer><span>{item.sessions} sessions / learner</span><span>{item.completion}% completion</span><span>{item.satisfaction} / 5 rating</span></footer>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-analytics-panel admin-heatmap-panel">
            <div className="admin-panel-head"><div><h2>Personality by feature</h2><p>Relative preference within each teaching experience.</p></div></div>
            <div className="admin-tars-heatmap" role="table" aria-label="Teacher personality preference by feature">
              <div className="admin-heatmap-heading"><span /><span>Whiteboard</span><span>Roleplay</span><span>Builder</span><span>Labs</span><span>Tests</span></div>
              {TARS_PERSONALITY_FEATURE_MATRIX.map((row, rowIndex) => (
                <div key={row.personality} className="admin-heatmap-row">
                  <strong>{row.personality}</strong>
                  {row.values.map((value, columnIndex) => (
                    <motion.span
                      key={`${row.personality}:${columnIndex}`}
                      aria-label={`${row.personality}: ${value} preference index`}
                      style={{ backgroundColor: `rgba(113,159,44,${.12 + value / 120})` }}
                      initial={reduceMotion ? false : { opacity: 0, scale: .85 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: rowIndex * .04 + columnIndex * .025 }}
                    >{value}</motion.span>
                  ))}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-head"><div><h2>Operational efficiency</h2><p>Signals that connect learner experience with AI infrastructure performance.</p></div></div>
          <div className="admin-tars-operations">
            {TARS_OPERATIONAL_METRICS.map((item, index) => (
              <motion.article key={item.label} initial={reduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .06 }}>
                <span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small>
              </motion.article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
