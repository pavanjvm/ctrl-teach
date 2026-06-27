"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Plus,
    Sparkles,
    Filter,
    MoreHorizontal,
    Clock,
    ArrowRight,
    X,
    Trash2,
    Play,
    User,
    BookOpen,
    Loader2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useAuth } from "@/components/AuthProvider";
import { API_URL } from "@/lib/constants";
import "../dashboard.css";
import "./schedule.css";

/* ─── Types ──────────────────────────────────────────────── */

type SubjectClass = "math" | "science" | "history" | "languages";

type Session = {
    id: string;
    title: string;
    tutor: string;
    avatar: string;
    day: number; // 0-6 (Sun-Sat)
    startTime: number; // 0-23
    duration: number; // hours
    type: "manual" | "ai-suggested";
    subjectClass: SubjectClass;
    description?: string;
};

type Suggestion = {
    id: string;
    title: string;
    tutor: string;
    avatar: string;
    duration: string;
    durationHours: number;
    reason: string;
    subject: SubjectClass;
};

type StudyPlan = {
    id: string;
    title: string;
    description?: string;
    subject?: string;
    due_date?: string;
    created_at?: string;
};

/* ─── Constants ──────────────────────────────────────────── */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM to 7 PM

const SUBJECT_OPTIONS: { value: SubjectClass | "all"; label: string; color: string }[] = [
    { value: "all", label: "All Subjects", color: "#64748b" },
    { value: "math", label: "Mathematics", color: "#4f46e5" },
    { value: "science", label: "Science", color: "#10b981" },
    { value: "history", label: "History", color: "#f97316" },
    { value: "languages", label: "Languages", color: "#a855f7" },
];

const TUTOR_OPTIONS = [
    { value: "Prof. Algebra", avatar: "/personas/owl.png" },
    { value: "Dr. Physics", avatar: "/personas/orb.png" },
    { value: "Ms. History", avatar: "/personas/owl.png" },
    { value: "Madame Lingua", avatar: "/personas/star.png" },
    { value: "Code Bot", avatar: "/personas/orb.png" },
];

const SUBJECT_COLORS: Record<string, string> = {
    math: "#4f46e5",
    science: "#10b981",
    history: "#f97316",
    languages: "#a855f7",
};

/* ─── Helpers ────────────────────────────────────────────── */

function getMonday(d: Date): Date {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function formatHour(h: number): string {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const subjectColors: Record<string, { bg: string; border: string; text: string }> = {
    math: { bg: "#e0e7ff", border: "#4f46e5", text: "#4338ca" },
    science: { bg: "#d1fae5", border: "#10b981", text: "#047857" },
    history: { bg: "#ffedd5", border: "#f97316", text: "#c2410c" },
    languages: { bg: "#f3e8ff", border: "#a855f7", text: "#7e22ce" },
};

function getSubjectColorStyles(subject: string, isAI: boolean) {
    const c = subjectColors[subject] ?? { bg: "#f1f5f9", border: "#64748b", text: "#334155" };
    if (isAI) {
        return {
            background: `repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.5) 5px, rgba(255,255,255,0.5) 10px), ${c.bg}`,
            border: `2px dashed ${c.border}`,
            color: c.text,
        };
    }
    return {
        background: c.bg,
        border: `1px solid ${c.bg}`,
        borderLeft: `4px solid ${c.border}`,
        color: c.text,
    };
}

/* ─── Backend → Frontend mapper ──────────────────────────── */

function apiSessionToLocal(raw: Record<string, any>): Session {
    const dt = raw.start_time ? new Date(raw.start_time) : new Date();
    return {
        id: raw.id,
        title: raw.title ?? "",
        tutor: raw.tutor ?? "",
        avatar: raw.avatar || "/personas/owl.png",
        day: dt.getDay(),
        startTime: dt.getHours(),
        duration: raw.duration_hours ?? 1,
        type: (raw.session_type as Session["type"]) ?? "manual",
        subjectClass: (raw.subject_class as SubjectClass) ?? (raw.subject as SubjectClass) ?? "math",
        description: raw.description ?? "",
    };
}

/** Convert the grid day-of-week + hour into an ISO datetime on the given week. */
function buildISOTime(weekDates: Date[], day: number, hour: number): string {
    const base = weekDates[day] ?? new Date();
    const d = new Date(base);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function SchedulePage() {
    const { getToken } = useAuth();

    // ── Core state ─────────────────────────────────────────
    const today = useMemo(() => new Date(), []);
    const [weekStart, setWeekStart] = useState(() => getMonday(today));
    const [viewMode, setViewMode] = useState<"week" | "month">("week");
    const [showAISuggestions, setShowAISuggestions] = useState(true);
    const [subjectFilter, setSubjectFilter] = useState<SubjectClass | "all">("all");
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

    // Sessions, suggestions, goals from backend
    const [sessions, setSessions] = useState<Session[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<Session[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [goals, setGoals] = useState<StudyPlan[]>([]);
    const [calendarConnected, setCalendarConnected] = useState(false);
    const [loading, setLoading] = useState(true);

    // UI overlays
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [showBookingModal, setShowBookingModal] = useState(false);

    // Booking form state
    const [bookTitle, setBookTitle] = useState("");
    const [bookSubject, setBookSubject] = useState<SubjectClass>("math");
    const [bookTutor, setBookTutor] = useState(TUTOR_OPTIONS[0].value);
    const [bookDay, setBookDay] = useState(1);
    const [bookHour, setBookHour] = useState(10);
    const [bookDuration, setBookDuration] = useState(1);
    const [bookDesc, setBookDesc] = useState("");

    // Current time for live indicator
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    // Compute week dates array
    const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart]);

    // ── Fetch data from backend ────────────────────────────
    const fetchSchedule = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const headers = { Authorization: token };

            // Single combined call for all schedule data
            const res = await axios.get(`${API_URL}/api/schedule/all`, { headers });
            const d = res.data;

            const mapped = (d.sessions ?? []).map(apiSessionToLocal);
            setSessions(mapped);
            setGoals(d.study_plans ?? []);
            setCalendarConnected(d.calendar_connected ?? false);

            if (d.calendar_events?.length) {
                const gcalEvents: Session[] = d.calendar_events.map((evt: any, idx: number) => {
                    const start = evt.start ? new Date(evt.start) : new Date();
                    const end = evt.end ? new Date(evt.end) : new Date();
                    const durationH = Math.max(0.5, (end.getTime() - start.getTime()) / 3600000);
                    return {
                        id: `gcal-${evt.id || idx}`,
                        title: evt.summary || "(No title)",
                        tutor: "Google Calendar",
                        avatar: "/Logo.png",
                        day: start.getDay(),
                        startTime: start.getHours(),
                        duration: durationH,
                        type: "ai-suggested" as const,
                        subjectClass: "math" as SubjectClass,
                        description: evt.description || "",
                    };
                });
                setCalendarEvents(gcalEvents);
            }
        } catch (err) {
            console.error("Failed to fetch schedule:", err);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        fetchSchedule();
    }, [fetchSchedule]);

    // ── Navigation ─────────────────────────────────────────
    const goToPrevWeek = () => setWeekStart(prev => addDays(prev, -7));
    const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7));
    const goToToday = () => setWeekStart(getMonday(today));

    // ── Month label ────────────────────────────────────────
    const monthLabel = useMemo(() => {
        const first = weekDates[0];
        const last = weekDates[6];
        if (first.getMonth() === last.getMonth()) {
            return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
        }
        return `${MONTHS[first.getMonth()]} – ${MONTHS[last.getMonth()]} ${first.getFullYear()}`;
    }, [weekDates]);

    // ── Filtered sessions (BoardyBoo + Google Calendar) ──
    const filteredSessions = useMemo(() => {
        let list = sessions;
        if (!showAISuggestions) list = list.filter(s => s.type !== "ai-suggested");
        if (subjectFilter !== "all") list = list.filter(s => s.subjectClass === subjectFilter);
        // Merge Google Calendar events (always show them)
        return [...list, ...calendarEvents];
    }, [sessions, calendarEvents, showAISuggestions, subjectFilter]);

    // ── Session CRUD (wired to backend) ──────────────────
    const addSession = useCallback(async (s: Omit<Session, "id">) => {
        try {
            const token = await getToken();
            if (!token) return;
            const headers = { Authorization: token };
            const tutorInfo = TUTOR_OPTIONS.find(t => t.value === s.tutor) ?? TUTOR_OPTIONS[0];
            const payload = {
                title: s.title,
                subject: s.subjectClass,
                tutor: s.tutor,
                avatar: tutorInfo.avatar,
                description: s.description ?? "",
                start_time: buildISOTime(weekDates, s.day, s.startTime),
                duration_hours: s.duration,
                session_type: s.type,
                subject_class: s.subjectClass,
            };
            const res = await axios.post(`${API_URL}/api/schedule`, payload, { headers });
            const newSession = apiSessionToLocal(res.data);
            setSessions(prev => [...prev, newSession]);
        } catch (err) {
            console.error("Failed to create session:", err);
        }
    }, [getToken, weekDates]);

    const deleteSession = useCallback(async (id: string) => {
        try {
            const token = await getToken();
            if (!token) return;
            const headers = { Authorization: token };
            await axios.delete(`${API_URL}/api/schedule/${id}`, { headers });
            setSessions(prev => prev.filter(s => s.id !== id));
            setSelectedSession(null);
        } catch (err) {
            console.error("Failed to delete session:", err);
        }
    }, [getToken]);

    const addSuggestionToSchedule = useCallback(async (sug: Suggestion) => {
        const freeDays = [1, 2, 3, 4, 5].filter(d => !sessions.some(s => s.day === d && s.startTime === 10));
        const chosenDay = freeDays.length > 0 ? freeDays[0] : 1;
        await addSession({
            title: sug.title,
            tutor: sug.tutor,
            avatar: sug.avatar,
            day: chosenDay,
            startTime: 10,
            duration: sug.durationHours,
            type: "ai-suggested",
            subjectClass: sug.subject,
            description: sug.reason,
        });
        setSuggestions(prev => prev.filter(s => s.id !== sug.id));
    }, [sessions, addSession]);

    // ── Booking modal helpers ──────────────────────────────
    const openBookingFromSlot = (day: number, hour: number) => {
        setBookDay(day);
        setBookHour(hour);
        setBookTitle("");
        setBookSubject("math");
        setBookTutor(TUTOR_OPTIONS[0].value);
        setBookDuration(1);
        setBookDesc("");
        setShowBookingModal(true);
    };

    const openBookingFresh = () => {
        setBookDay(1);
        setBookHour(10);
        setBookTitle("");
        setBookSubject("math");
        setBookTutor(TUTOR_OPTIONS[0].value);
        setBookDuration(1);
        setBookDesc("");
        setShowBookingModal(true);
    };

    const submitBooking = async () => {
        if (!bookTitle.trim()) return;
        const tutorInfo = TUTOR_OPTIONS.find(t => t.value === bookTutor) ?? TUTOR_OPTIONS[0];
        await addSession({
            title: bookTitle,
            tutor: bookTutor,
            avatar: tutorInfo.avatar,
            day: bookDay,
            startTime: bookHour,
            duration: bookDuration,
            type: "manual",
            subjectClass: bookSubject,
            description: bookDesc,
        });
        setShowBookingModal(false);
    };

    // ── Current time position ──────────────────────────────
    const currentTimeTop = useMemo(() => {
        const h = now.getHours() + now.getMinutes() / 60;
        return ((h - 7) / HOURS.length) * 100;
    }, [now]);

    const isCurrentWeek = useMemo(() => {
        return weekDates.some(d => isSameDay(d, today));
    }, [weekDates, today]);

    /* ═══ RENDER ═══════════════════════════════════════════ */
    if (loading) {
        return (
            <div className="dash-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "16px" }}>
                <video src="/Loading_Schedule.webm" autoPlay loop muted playsInline style={{ width: 180, height: 180, objectFit: "contain" }} />
            </div>
        );
    }

    return (
        <div className="dash-page" style={{ padding: "40px 48px" }}>
            {/* ── Header ──────────────────────────────────────── */}
            <div className="dash-header-area">
                <div className="dash-header-text">
                    <h1 className="dash-title">
                        My Schedule <CalendarIcon className="text-indigo-600 ml-2" size={32} />
                    </h1>
                    <p className="dash-subtitle" style={{ marginTop: "6px" }}>
                        Plan your learning journey with AI-optimized session slots.
                    </p>
                </div>
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div className="sched-view-toggle">
                        <button className={`sched-toggle-btn ${viewMode === "week" ? "active" : ""}`} onClick={() => setViewMode("week")}>Week</button>
                        <button className={`sched-toggle-btn ${viewMode === "month" ? "active" : ""}`} onClick={() => setViewMode("month")}>Month</button>
                    </div>
                    <button className="btn-resume" style={{ border: "none", cursor: "pointer" }} onClick={openBookingFresh}>
                        <Plus size={18} /> Book Session
                    </button>
                </div>
            </div>

            {/* ── Main Grid ───────────────────────────────────── */}
            <div className="dash-split-layout" style={{ gridTemplateColumns: "1fr 340px" }}>

                {/* ━━ Calendar Column ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div className="dash-main-column">
                    <div className="sched-calendar-card">
                        <div className="sched-toolbar">
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                <h2 className="sched-month-label">{monthLabel}</h2>
                                <div style={{ display: "flex", gap: "4px" }}>
                                    <button className="sched-nav-btn" onClick={goToPrevWeek}><ChevronLeft size={16} /></button>
                                    <button className="sched-nav-btn" onClick={goToNextWeek}><ChevronRight size={16} /></button>
                                </div>
                                <button className="sched-today-btn" onClick={goToToday}>Today</button>
                            </div>
                            <div style={{ position: "relative" }}>
                                <button className="sched-filter-btn" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
                                    <Filter size={14} />
                                    {subjectFilter !== "all" ? SUBJECT_OPTIONS.find(o => o.value === subjectFilter)?.label : "Filter"}
                                </button>
                                <AnimatePresence>
                                    {showFilterDropdown && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            className="sched-filter-dropdown"
                                        >
                                            {SUBJECT_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    className={`sched-filter-option ${subjectFilter === opt.value ? "active" : ""}`}
                                                    onClick={() => { setSubjectFilter(opt.value); setShowFilterDropdown(false); }}
                                                >
                                                    <span className="sched-filter-dot" style={{ background: opt.color }} />
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* ── Week View ─────────────────────────────── */}
                        {viewMode === "week" && (
                            <div className="sched-grid-wrapper">
                                <div className="sched-days-header">
                                    <div className="sched-corner" />
                                    {weekDates.map((date, idx) => {
                                        const isToday = isSameDay(date, today);
                                        return (
                                            <div key={idx} className="sched-day-col-header">
                                                <div className="sched-day-name">{DAYS[idx]}</div>
                                                <div className={`sched-day-number ${isToday ? "today" : ""}`}>
                                                    {date.getDate()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="sched-time-grid">
                                    {HOURS.map(hour => (
                                        <div key={hour} className="sched-hour-row">
                                            <div className="sched-hour-label">{formatHour(hour)}</div>
                                            <div className="sched-hour-cells">
                                                {DAYS.map((_, dayIdx) => (
                                                    <div
                                                        key={dayIdx}
                                                        className="sched-cell"
                                                        onClick={() => openBookingFromSlot(dayIdx, hour)}
                                                        title={`Book at ${DAYS[dayIdx]} ${formatHour(hour)}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {filteredSessions.map(session => {
                                        const topPercent = ((session.startTime - 7) / HOURS.length) * 100;
                                        const heightPercent = (session.duration / HOURS.length) * 100;
                                        const leftPercent = (session.day / 7) * 100;
                                        const widthPercent = 100 / 7;

                                        return (
                                            <motion.div
                                                key={session.id}
                                                layoutId={session.id}
                                                initial={{ opacity: 0, scale: 0.92 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                whileHover={{ scale: 1.03, zIndex: 30 }}
                                                onClick={(e) => { e.stopPropagation(); setSelectedSession(session); }}
                                                className="sched-session-block"
                                                style={{
                                                    top: `${topPercent}%`,
                                                    left: `calc(60px + ${leftPercent}% * (100% - 60px) / 100%)`,
                                                    width: `calc((100% - 60px) * ${widthPercent / 100} - 8px)`,
                                                    height: `calc(${heightPercent}% - 4px)`,
                                                    ...getSubjectColorStyles(session.subjectClass, session.type === "ai-suggested"),
                                                }}
                                            >
                                                <div className="sched-session-top">
                                                    <h4 className="sched-session-title">{session.title}</h4>
                                                    {session.type === "ai-suggested" && <Sparkles size={12} />}
                                                </div>
                                                <span className="sched-session-tutor">{session.tutor}</span>
                                                <span className="sched-session-time">{formatHour(session.startTime)} – {formatHour(session.startTime + session.duration)}</span>
                                            </motion.div>
                                        );
                                    })}

                                    {isCurrentWeek && currentTimeTop >= 0 && currentTimeTop <= 100 && (
                                        <div className="sched-now-line" style={{ top: `${currentTimeTop}%` }}>
                                            <div className="sched-now-dot" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Month View ────────────────────────────── */}
                        {viewMode === "month" && (
                            <MonthView
                                weekStart={weekStart}
                                sessions={filteredSessions}
                                today={today}
                                onSelectDay={(d) => { setWeekStart(getMonday(d)); setViewMode("week"); }}
                            />
                        )}
                    </div>
                </div>

                {/* ━━ Sidebar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div className="dash-side-column">

                    {/* Today's sessions summary */}
                    <div className="dash-sidebar-card">
                        <div className="sidebar-card-header" style={{ marginBottom: "16px" }}>
                            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Today&apos;s Sessions</h2>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>{today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        </div>
                        {sessions.filter(s => s.day === today.getDay()).length === 0 ? (
                            <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No sessions today — enjoy your free time! 🎉</p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {sessions.filter(s => s.day === today.getDay()).map(s => (
                                    <div
                                        key={s.id}
                                        className="sched-sidebar-session"
                                        onClick={() => setSelectedSession(s)}
                                    >
                                        <div className="sched-sidebar-avatar">
                                            <Image src={s.avatar} alt={s.tutor} width={36} height={36} style={{ objectFit: "contain" }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h4 style={{ fontSize: "13px", fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</h4>
                                            <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>{s.tutor}</p>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <span style={{ fontSize: "12px", fontWeight: 700 }}>{formatHour(s.startTime)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* AI Suggestions Card */}
                    <div className="dash-sidebar-card" style={{ background: "linear-gradient(135deg, var(--bg-card) 0%, #f0efff 100%)", border: "1px solid var(--primary-light)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ background: "var(--primary)", color: "white", padding: "6px", borderRadius: "8px" }}><Sparkles size={16} /></div>
                                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Smart Suggestions</h2>
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                <div
                                    className="sched-toggle-switch"
                                    style={{ background: showAISuggestions ? "var(--primary)" : "var(--border-color)" }}
                                    onClick={() => setShowAISuggestions(!showAISuggestions)}
                                >
                                    <motion.div
                                        className="sched-toggle-knob"
                                        layout
                                        animate={{ left: showAISuggestions ? "18px" : "2px" }}
                                    />
                                </div>
                            </label>
                        </div>

                        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px", lineHeight: "1.5" }}>
                            AI-optimized learning slots based on your recent struggles and upcoming goals.
                        </p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <AnimatePresence mode="popLayout">
                                {suggestions.map(sug => (
                                    <motion.div
                                        key={sug.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -100, height: 0, marginBottom: 0, padding: 0 }}
                                        className="sched-suggestion-card"
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                                            <h4 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>{sug.title}</h4>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}><Clock size={12} /> {sug.duration}</span>
                                        </div>
                                        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.4 }}>{sug.reason}</p>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <button className="sched-add-btn" onClick={() => addSuggestionToSchedule(sug)}>
                                                <Plus size={14} /> Add to Schedule
                                            </button>
                                            <button className="sched-more-btn"><MoreHorizontal size={16} /></button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {suggestions.length === 0 && (
                                <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>All suggestions scheduled! ✨</p>
                            )}
                        </div>
                    </div>

                    {/* Upcoming Goals */}
                    <div className="dash-sidebar-card">
                        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px" }}>Upcoming Goals</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            {goals.length === 0 && (
                                <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>No study plans yet.</p>
                            )}
                            {goals.slice(0, 5).map((g) => (
                                <div key={g.id} style={{ display: "flex", gap: "12px" }}>
                                    <div style={{ width: "4px", borderRadius: "4px", background: SUBJECT_COLORS[g.subject ?? ""] ?? "#64748b" }} />
                                    <div>
                                        <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 4px" }}>{g.title}</h4>
                                        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                                            {g.due_date ? new Date(g.due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : (g.description ?? "")}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ━━ SESSION DETAIL MODAL ━━━━━━━━━━━━━━━━━━━━━━━ */}
            <AnimatePresence>
                {selectedSession && (
                    <motion.div
                        className="sched-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedSession(null)}
                    >
                        <motion.div
                            className="sched-detail-modal"
                            initial={{ opacity: 0, y: 40, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 40, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button className="sched-modal-close" onClick={() => setSelectedSession(null)}>
                                <X size={18} />
                            </button>

                            <div className="sched-modal-color-bar" style={{ background: subjectColors[selectedSession.subjectClass]?.border ?? "#64748b" }} />

                            <div className="sched-modal-body">
                                <div className="sched-modal-avatar-row">
                                    <div className="sched-modal-avatar">
                                        <Image src={selectedSession.avatar} alt={selectedSession.tutor} width={56} height={56} style={{ objectFit: "contain" }} />
                                    </div>
                                    <div>
                                        <h2 className="sched-modal-title">{selectedSession.title}</h2>
                                        <p className="sched-modal-tutor">
                                            <User size={14} /> {selectedSession.tutor}
                                            {selectedSession.type === "ai-suggested" && (
                                                <span className="sched-ai-badge"><Sparkles size={10} /> AI Suggested</span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="sched-modal-meta">
                                    <div className="sched-modal-meta-item">
                                        <CalendarIcon size={16} />
                                        <span>{FULL_DAYS[selectedSession.day]}</span>
                                    </div>
                                    <div className="sched-modal-meta-item">
                                        <Clock size={16} />
                                        <span>{formatHour(selectedSession.startTime)} – {formatHour(selectedSession.startTime + selectedSession.duration)} ({selectedSession.duration}h)</span>
                                    </div>
                                    <div className="sched-modal-meta-item">
                                        <BookOpen size={16} />
                                        <span style={{ textTransform: "capitalize" }}>{selectedSession.subjectClass}</span>
                                    </div>
                                </div>

                                {selectedSession.description && (
                                    <p className="sched-modal-desc">{selectedSession.description}</p>
                                )}

                                <div className="sched-modal-actions">
                                    <Link
                                        href={`/board?tutor=${encodeURIComponent(selectedSession.tutor)}&topic=${encodeURIComponent(selectedSession.title)}`}
                                        className="sched-start-btn"
                                    >
                                        <Play size={18} fill="currentColor" /> Start Whiteboard Session
                                    </Link>
                                    <button className="sched-delete-btn" onClick={() => deleteSession(selectedSession.id)}>
                                        <Trash2 size={16} /> Remove
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ━━ BOOKING MODAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <AnimatePresence>
                {showBookingModal && (
                    <motion.div
                        className="sched-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowBookingModal(false)}
                    >
                        <motion.div
                            className="sched-booking-modal"
                            initial={{ opacity: 0, y: 40, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 40, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button className="sched-modal-close" onClick={() => setShowBookingModal(false)}>
                                <X size={18} />
                            </button>

                            <div className="sched-modal-color-bar" style={{ background: subjectColors[bookSubject]?.border ?? "#4f46e5" }} />

                            <div className="sched-modal-body">
                                <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 24px" }}>Book a Session</h2>

                                <div className="sched-form-grid">
                                    <div className="sched-form-group full">
                                        <label>Session Title</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Calculus Differentiation"
                                            value={bookTitle}
                                            onChange={e => setBookTitle(e.target.value)}
                                            className="sched-input"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="sched-form-group">
                                        <label>Subject</label>
                                        <select value={bookSubject} onChange={e => setBookSubject(e.target.value as SubjectClass)} className="sched-input">
                                            <option value="math">Mathematics</option>
                                            <option value="science">Science</option>
                                            <option value="history">History</option>
                                            <option value="languages">Languages</option>
                                        </select>
                                    </div>

                                    <div className="sched-form-group">
                                        <label>Tutor</label>
                                        <select value={bookTutor} onChange={e => setBookTutor(e.target.value)} className="sched-input">
                                            {TUTOR_OPTIONS.map(t => (
                                                <option key={t.value} value={t.value}>{t.value}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sched-form-group">
                                        <label>Day</label>
                                        <select value={bookDay} onChange={e => setBookDay(Number(e.target.value))} className="sched-input">
                                            {DAYS.map((d, i) => (
                                                <option key={i} value={i}>{d}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sched-form-group">
                                        <label>Start Time</label>
                                        <select value={bookHour} onChange={e => setBookHour(Number(e.target.value))} className="sched-input">
                                            {HOURS.map(h => (
                                                <option key={h} value={h}>{formatHour(h)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sched-form-group">
                                        <label>Duration</label>
                                        <select value={bookDuration} onChange={e => setBookDuration(Number(e.target.value))} className="sched-input">
                                            <option value={0.5}>30 min</option>
                                            <option value={1}>1 hour</option>
                                            <option value={1.5}>1.5 hours</option>
                                            <option value={2}>2 hours</option>
                                            <option value={3}>3 hours</option>
                                        </select>
                                    </div>

                                    <div className="sched-form-group full">
                                        <label>Description (optional)</label>
                                        <textarea
                                            placeholder="What topics will you cover?"
                                            value={bookDesc}
                                            onChange={e => setBookDesc(e.target.value)}
                                            className="sched-input sched-textarea"
                                            rows={3}
                                        />
                                    </div>
                                </div>

                                <div className="sched-modal-actions" style={{ marginTop: "24px" }}>
                                    <button className="sched-start-btn" style={{ flex: 1 }} onClick={submitBooking}>
                                        <Plus size={18} /> Create Session
                                    </button>
                                    <button className="sched-cancel-btn" onClick={() => setShowBookingModal(false)}>Cancel</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   MONTH VIEW SUB-COMPONENT
   ═══════════════════════════════════════════════════════════ */

function MonthView({ weekStart, sessions, today, onSelectDay }: {
    weekStart: Date;
    sessions: Session[];
    today: Date;
    onSelectDay: (d: Date) => void;
}) {
    const month = weekStart.getMonth();
    const year = weekStart.getFullYear();

    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const sessionCountByDay = (dayOfWeek: number) => sessions.filter(s => s.day === dayOfWeek).length;

    return (
        <div className="sched-month-view">
            <div className="sched-month-grid-header">
                {DAYS.map(d => <div key={d} className="sched-month-day-name">{d}</div>)}
            </div>
            <div className="sched-month-grid">
                {cells.map((date, idx) => {
                    if (!date) return <div key={idx} className="sched-month-cell empty" />;
                    const isToday = isSameDay(date, today);
                    const count = sessionCountByDay(date.getDay());
                    return (
                        <motion.div
                            key={idx}
                            className={`sched-month-cell ${isToday ? "today" : ""}`}
                            whileHover={{ scale: 1.08 }}
                            onClick={() => onSelectDay(date)}
                        >
                            <span className="sched-month-date">{date.getDate()}</span>
                            {count > 0 && (
                                <div className="sched-month-dots">
                                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                                        <span key={i} className="sched-month-dot" />
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
