"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { DashboardSkeleton } from "@/components/Skeleton";
import { API_URL } from "@/lib/constants";
import {
    Play,
    PenTool,
    Plus,
} from "lucide-react";
import axios from "axios";

/* ── Types ──────────────────────────────────────────── */

interface DashboardStats {
    total_sessions: number;
    total_hours: number;
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

interface ScheduledSession {
    id: string;
    title: string;
    start_time: string;
    duration_hours: number;
    subject_class?: string;
    tutor?: string;
}

interface Streak {
    current_streak: number;
    longest_streak: number;
}

interface Progress {
    id: string;
    subject: string;
    topic: string;
    mastery_level: number;
}

/* ── Component ──────────────────────────────────────── */

export default function Dashboard() {
    const { user, getToken } = useAuth();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentSessions, setRecentSessions] = useState<Session[]>([]);
    const [upcoming, setUpcoming] = useState<ScheduledSession[]>([]);
    const [streak, setStreak] = useState<Streak | null>(null);
    const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
    const [progress, setProgress] = useState<Progress[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        async function fetchDashboardData() {
            if (!user) return;

            try {
                const token = await getToken();
                if (!token) return;

                const headers = { Authorization: `Bearer ${token}` };

                const [allRes] = await Promise.allSettled([
                    axios.get(`${API_URL}/api/dashboard/all`, { headers }),
                ]);

                if (allRes.status === "fulfilled") {
                    const d = allRes.value.data;
                    setStats(d.stats);
                    setRecentSessions(d.sessions ?? []);
                    setStreak(d.streak);
                    setSuggestedTopics(d.topics ?? []);
                    setProgress(d.progress ?? []);

                    const now = new Date();
                    const boardyBooSessions: ScheduledSession[] = (d.schedule ?? [])
                        .filter((s: any) => s.start_time && new Date(s.start_time) >= now);

                    boardyBooSessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
                    setUpcoming(boardyBooSessions.slice(0, 3));
                }
            } catch (error) {
                console.error("Failed to fetch dashboard data:", error);
            } finally {
                setLoadingData(false);
            }
        }

        fetchDashboardData();
    }, [user, getToken]);

    const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    const formatTime12 = (iso: string) => {
        const d = new Date(iso);
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
    };

    const formatDuration = (hrs: number) => {
        const mins = Math.round(hrs * 60);
        return mins >= 60 ? `${Math.round(mins / 60)}h ${mins % 60 ? `${mins % 60} min` : ""}`.trim() : `${mins} min`;
    };

    const firstName = user?.displayName?.split(" ")[0] || "Student";

    if (loadingData) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="page fade-in">
            {/* ── 01 — Greeting ─────────────────────────────── */}
            <section className="sec" id="greeting">
                <div className="sec-eyebrow">01 / Today</div>
                <h1 className="sec-title">
                    Hello, {firstName}<span className="stop">.</span>
                </h1>
                <p className="lede">
                    Ready to tackle your goals today? Your personal AI tutor is prepared for the next chapter. Start a new session, review what is scheduled, or pick up where you left off.
                </p>
                <div className="ctas">
                    <Link href="/board" className="cta cta-primary">
                        <Play size={14} fill="currentColor" /> Start new session
                    </Link>
                    <Link href="/schedule" className="cta cta-secondary">
                        View plan
                    </Link>
                </div>
            </section>

            {/* ── 02 — Stats ────────────────────────────────── */}
            <section className="sec sec-tight" id="stats">
                <div className="sec-num">02 / At a glance</div>
                <span className="gold-rule" />
                <div className="stat-grid">
                    <div className="stat">
                        <div className="stat-label">Total sessions</div>
                        <div className="stat-value">{stats?.total_sessions ?? 0}</div>
                        <div className="stat-foot">All time</div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">Learning time</div>
                        <div className="stat-value">{stats?.total_hours ?? 0}<span className="unit">h</span></div>
                        <div className="stat-foot">Hours tutored</div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">Current streak</div>
                        <div className="stat-value">{streak?.current_streak ?? 0}<span className="unit">d</span></div>
                        <div className="stat-foot">Day{((streak?.current_streak ?? 0) !== 1) ? "s" : ""} in a row</div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">Avg quiz score</div>
                        <div className="stat-value">{stats?.avg_score ?? 0}<span className="unit">%</span></div>
                        <div className="stat-foot">Across subjects</div>
                    </div>
                </div>
            </section>

            {/* ── 03 — Upcoming ─────────────────────────────── */}
            <section className="sec" id="upcoming">
                <div className="sec-num">03 / Upcoming</div>
                <h2 className="sec-title">
                    What is next on the schedule<span className="stop">.</span>
                </h2>
                <p className="lede">
                    Sessions you have scheduled. One question in, a live AI-led session out.
                </p>

                {upcoming.length > 0 ? (
                    <ul className="rule-list">
                        {upcoming.map((s) => {
                            const d = new Date(s.start_time);
                            return (
                                <li key={s.id} className="rule-row">
                                    <div className="rule-date">
                                        <div className="rule-date-month">{MONTH_SHORT[d.getMonth()]}</div>
                                        <div className="rule-date-day">{d.getDate()}</div>
                                    </div>
                                    <div className="rule-body">
                                        <h3 className="rule-title">{s.title}</h3>
                                        <p className="rule-meta">
                                            {formatTime12(s.start_time)} &middot; {formatDuration(s.duration_hours)}
                                        </p>
                                    </div>
                                    <div className="rule-action">
                                        <span className="hairline-pill">Scheduled</span>
                                    </div>
                                </li>
                            );
                        })}
                        <li className="rule-row rule-row-add">
                            <Link href="/schedule" className="add-link">
                                <Plus size={14} /> Schedule a new session
                            </Link>
                        </li>
                    </ul>
                ) : (
                    <div className="empty">
                        <p className="empty-msg">No upcoming sessions scheduled yet.</p>
                        <Link href="/schedule" className="cta cta-secondary">
                            <Plus size={14} /> Schedule session
                        </Link>
                    </div>
                )}
            </section>

            {/* ── 04 — Recent sessions ──────────────────────── */}
            <section className="sec" id="recent">
                <div className="sec-num">04 / Recent</div>
                <h2 className="sec-title">
                    What you have been working on<span className="stop">.</span>
                </h2>
                <p className="lede">A short history of your last sessions.</p>

                {recentSessions.length > 0 ? (
                    <ul className="rule-list">
                        {recentSessions.map((session) => (
                            <li key={session.id} className="rule-row">
                                <div className="rule-body">
                                    <h3 className="rule-title">{session.topic || "General tutoring"}</h3>
                                    <p className="rule-meta">
                                        {session.created_at
                                            ? new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                            : "—"}
                                        {session.duration_minutes != null ? ` · ${session.duration_minutes} min` : ""}
                                        {session.subject ? ` · ${session.subject}` : ""}
                                    </p>
                                </div>
                                <div className="rule-action">
                                    <span className={`hairline-pill ${session.status === "active" ? "pill-active" : ""}`}>
                                        {session.status === "active" ? "Active" : "Completed"}
                                    </span>
                                </div>
                            </li>
                        ))}
                        <li className="rule-row rule-row-add">
                            <Link href="/board" className="add-link">
                                <PenTool size={14} /> Open the whiteboard to start a new session
                            </Link>
                        </li>
                    </ul>
                ) : (
                    <div className="empty">
                        <p className="empty-msg">No sessions yet. Jump into the whiteboard to start learning.</p>
                        <Link href="/board" className="cta cta-primary">
                            <Play size={14} fill="currentColor" /> Launch whiteboard
                        </Link>
                    </div>
                )}
            </section>

            {/* ── 05 — Suggested topics ─────────────────────── */}
            <section className="sec" id="suggested">
                <div className="sec-num">05 / Suggested</div>
                <h2 className="sec-title">
                    Areas to review<span className="stop">.</span>
                </h2>
                <p className="lede">
                    {suggestedTopics.length > 0
                        ? "Based on your sessions and progress, review these areas:"
                        : "Start a few sessions and BoardyBoo will suggest topics to review."}
                </p>

                {suggestedTopics.length > 0 && (
                    <div className="topic-pills">
                        {suggestedTopics.map((topic) => (
                            <span key={topic} className="topic-pill">{topic}</span>
                        ))}
                    </div>
                )}
            </section>

            {/* ── 06 — Mastery ──────────────────────────────── */}
            {progress.length > 0 && (
                <section className="sec" id="mastery">
                    <div className="sec-num">06 / Mastery</div>
                    <h2 className="sec-title">
                        Where you stand today<span className="stop">.</span>
                    </h2>
                    <p className="lede">Per-topic mastery across the subjects you have studied.</p>

                    <ul className="rule-list">
                        {progress.slice(0, 5).map((p) => {
                            const pct = Math.round((p.mastery_level / 5) * 100);
                            const labels = ["", "Beginner", "Developing", "Competent", "Proficient", "Mastered"];
                            return (
                                <li key={p.id} className="rule-row rule-row-mastery">
                                    <div className="rule-body">
                                        <h3 className="rule-title">{p.topic}</h3>
                                        <p className="rule-meta">{p.subject} · {labels[p.mastery_level] || "Unknown"}</p>
                                    </div>
                                    <div className="rule-bar">
                                        <div className="bar-track">
                                            <div className="bar-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="bar-val">{pct}<span className="unit">%</span></span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {/* ── 07 — Closing CTA ──────────────────────────── */}
            <section className="sec sec-close" id="close">
                <div className="sec-num">07 / Begin</div>
                <h2 className="sec-title">
                    Open the whiteboard. Ask out loud<span className="stop">.</span>
                </h2>
                <span className="gold-rule" />
                <p className="lede">No setup, no sign-up, no waiting. One question in, a live AI-led session out.</p>
                <div className="ctas">
                    <Link href="/board" className="cta cta-primary">
                        <Play size={14} fill="currentColor" /> Generate a session
                    </Link>
                    <Link href="/tutors" className="cta cta-secondary">
                        Browse tutors
                    </Link>
                </div>
            </section>
        </div>
    );
}
