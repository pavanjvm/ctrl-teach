"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
    User,
    Mail,
    GraduationCap,
    Target,
    Trophy,
    Clock,
    Flame,
    BookOpen,
    Camera,
    Edit3,
    Save,
    X,
    ChevronRight,
    Sigma,
    Globe,
    Calendar,
    BarChart3,
    Shield,
    Bell,
    Moon,
    Sun,
    Volume2,
    Eye,
    LogOut,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { API_URL } from "@/lib/constants";
import axios from "axios";
import "../dashboard.css";
import "./profile.css";

/* ─── Types ──────────────────────────────────────────── */

interface ProfileData {
    name: string;
    email: string;
    picture: string;
    bio: string;
    grade: string;
    school: string;
    languages: string[];
    created_at: string;
    preferences: Record<string, any>;
}

interface StatsData {
    total_sessions: number;
    total_hours: number;
    current_streak: number;
    longest_streak: number;
    avg_score: number;
    subjects_covered: number;
}

interface SubjectData {
    name: string;
    progress: number;
    topic_count: number;
    topics: { topic: string; mastery_level: number }[];
}

interface SessionData {
    id: string;
    topic: string;
    subject: string;
    duration_minutes: number;
    created_at: string;
    status: string;
}

interface GoalData {
    id: string;
    plan_name: string;
    subjects: string[];
    weekly_goals: string[];
    target_date: string | null;
}

/* ─── Subject colour palette ─────────────────────────── */

const SUBJECT_COLORS = [
    "#4f46e5", "#10b981", "#f97316", "#a855f7", "#ef4444", "#0ea5e9",
];

function subjectColor(index: number): string {
    return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function ProfilePage() {
    return (
        <Suspense fallback={<div className="dash-page" style={{ padding: "40px 48px" }} />}>
            <ProfileContent />
        </Suspense>
    );
}

function ProfileContent() {
    const searchParams = useSearchParams();
    const { user, getToken, logout } = useAuth();

    /* ── Data state ────────────────────────────────── */
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [stats, setStats] = useState<StatsData | null>(null);
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [recentSessions, setRecentSessions] = useState<SessionData[]>([]);
    const [goals, setGoals] = useState<GoalData[]>([]);
    const [loading, setLoading] = useState(true);

    /* ── UI state ──────────────────────────────────── */
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editBio, setEditBio] = useState("");
    const [editGrade, setEditGrade] = useState("");
    const [editSchool, setEditSchool] = useState("");
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<"overview" | "achievements" | "settings">("overview");

    // Settings state
    const [darkMode, setDarkMode] = useState(false);
    const [notifications, setNotifications] = useState(true);
    const [soundEffects, setSoundEffects] = useState(true);
    const [sessionReminders, setSessionReminders] = useState(true);

    // Read ?tab= query param on mount
    useEffect(() => {
        const tab = searchParams.get("tab");
        if (tab === "settings" || tab === "achievements" || tab === "overview") {
            setActiveTab(tab);
        }
    }, [searchParams]);

    /* ── Fetch profile data ────────────────────────── */

    const fetchProfile = useCallback(async () => {
        if (!user) return;
        try {
            const token = await getToken();
            if (!token) return;
            const headers = { Authorization: token };
            const res = await axios.get(`${API_URL}/api/users/me/full`, { headers });
            const data = res.data;

            setProfile(data.profile);
            setStats(data.stats);
            setSubjects(data.subjects ?? []);
            setRecentSessions(data.recent_sessions ?? []);
            setGoals(data.goals ?? []);

            // Seed edit fields
            setEditName(data.profile.name ?? "");
            setEditBio(data.profile.bio ?? "");
            setEditGrade(data.profile.grade ?? "");
            setEditSchool(data.profile.school ?? "");

            // Seed settings from preferences
            const prefs = data.profile.preferences ?? {};
            if (prefs.dark_mode !== undefined) setDarkMode(prefs.dark_mode);
            if (prefs.notifications !== undefined) setNotifications(prefs.notifications);
            if (prefs.sound_effects !== undefined) setSoundEffects(prefs.sound_effects);
            if (prefs.session_reminders !== undefined) setSessionReminders(prefs.session_reminders);
        } catch (err) {
            console.error("Failed to fetch profile:", err);
        } finally {
            setLoading(false);
        }
    }, [user, getToken]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    /* ── Save profile edits ────────────────────────── */

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const token = await getToken();
            if (!token) return;
            const headers = { Authorization: token };
            await axios.put(
                `${API_URL}/api/users/me`,
                {
                    name: editName,
                    bio: editBio,
                    grade: editGrade,
                    school: editSchool,
                },
                { headers },
            );
            // Optimistic update
            setProfile((prev) =>
                prev ? { ...prev, name: editName, bio: editBio, grade: editGrade, school: editSchool } : prev,
            );
            setIsEditing(false);
        } catch (err) {
            console.error("Failed to save profile:", err);
        } finally {
            setSaving(false);
        }
    };

    /* ── Save preferences ──────────────────────────── */

    const savePreferences = async (prefs: Record<string, any>) => {
        if (!user) return;
        try {
            const token = await getToken();
            if (!token) return;
            await axios.put(
                `${API_URL}/api/users/me`,
                { preferences: prefs },
                { headers: { Authorization: token } },
            );
        } catch (err) {
            console.error("Failed to save preferences:", err);
        }
    };

    /* ── Derived values ────────────────────────────── */

    const displayName = profile?.name || user?.displayName || "Student";
    const displayEmail = profile?.email || user?.email || "";
    const displayPicture = profile?.picture || user?.photoURL || "";
    const joinDate = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : "";

    if (loading) {
        return (
            <div className="dash-page" style={{ padding: "40px 48px", textAlign: "center", color: "var(--text-sec)" }}>
                Loading profile…
            </div>
        );
    }

    return (
        <div className="dash-page" style={{ padding: "40px 48px" }}>
            {/* ── Profile Header ──────────────────────────────── */}
            <div className="prof-header-card">
                <div className="prof-header-content">
                    <div className="prof-avatar-wrapper">
                        {displayPicture ? (
                            <>
                                <img
                                    src={displayPicture}
                                    alt={displayName}
                                    className="prof-avatar-img"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                        const img = e.currentTarget;
                                        img.style.display = 'none';
                                        const fallback = img.nextElementSibling as HTMLElement | null;
                                        if (fallback) fallback.style.display = 'flex';
                                    }}
                                />
                                <div className="prof-avatar-img" style={{ display: "none", alignItems: "center", justifyContent: "center", background: "var(--bg)", fontSize: 28, fontWeight: 700, color: "var(--text-sec)" }}>
                                    {displayName.charAt(0).toUpperCase()}
                                </div>
                            </>
                        ) : (
                            <div className="prof-avatar-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", fontSize: 28, fontWeight: 700, color: "var(--text-sec)" }}>
                                {displayName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        {isEditing && (
                            <button className="prof-avatar-edit" title="Change photo">
                                <Camera size={14} />
                            </button>
                        )}
                    </div>

                    <div className="prof-info">
                        <div className="prof-name-row">
                            {isEditing ? (
                                <input
                                    className="prof-edit-name"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    autoFocus
                                />
                            ) : (
                                <h1 className="prof-name">{displayName}</h1>
                            )}
                        </div>
                        {isEditing ? (
                            <textarea
                                className="prof-edit-bio"
                                value={editBio}
                                onChange={(e) => setEditBio(e.target.value)}
                                rows={2}
                                placeholder="Write something about yourself..."
                            />
                        ) : (
                            <p className="prof-bio">{profile?.bio || "No bio yet — click Edit to add one!"}</p>
                        )}
                        <div className="prof-badges-row">
                            {(isEditing ? editGrade : profile?.grade) && (
                                <span className="prof-badge grade">
                                    <GraduationCap size={12} />{" "}
                                    {isEditing ? (
                                        <input
                                            className="prof-edit-inline"
                                            value={editGrade}
                                            onChange={(e) => setEditGrade(e.target.value)}
                                            placeholder="Grade"
                                            style={{ width: 80 }}
                                        />
                                    ) : (
                                        profile?.grade
                                    )}
                                </span>
                            )}
                            {(isEditing ? editSchool : profile?.school) && (
                                <span className="prof-badge">
                                    <BookOpen size={12} />{" "}
                                    {isEditing ? (
                                        <input
                                            className="prof-edit-inline"
                                            value={editSchool}
                                            onChange={(e) => setEditSchool(e.target.value)}
                                            placeholder="School"
                                            style={{ width: 140 }}
                                        />
                                    ) : (
                                        profile?.school
                                    )}
                                </span>
                            )}
                            {isEditing && !editGrade && (
                                <button className="prof-badge" onClick={() => setEditGrade("Grade ")}>
                                    <GraduationCap size={12} /> + Add Grade
                                </button>
                            )}
                            {isEditing && !editSchool && (
                                <button className="prof-badge" onClick={() => setEditSchool("My School")}>
                                    <BookOpen size={12} /> + Add School
                                </button>
                            )}
                            {joinDate && (
                                <span className="prof-badge">
                                    <Calendar size={12} /> Joined {joinDate}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="prof-header-actions">
                        {isEditing ? (
                            <>
                                <button className="prof-save-btn" onClick={handleSave} disabled={saving}>
                                    <Save size={16} /> {saving ? "Saving…" : "Save"}
                                </button>
                                <button className="prof-cancel-btn" onClick={() => setIsEditing(false)}>
                                    <X size={16} />
                                </button>
                            </>
                        ) : (
                            <button className="prof-edit-btn" onClick={() => setIsEditing(true)}>
                                <Edit3 size={16} /> Edit Profile
                            </button>
                        )}
                    </div>
                </div>

                {/* Quick stats */}
                <div className="prof-stats-bar">
                    <div className="prof-stat-item">
                        <span className="prof-stat-value">{stats?.total_sessions ?? 0}</span>
                        <span className="prof-stat-label">Sessions</span>
                    </div>
                    <div className="prof-stat-divider" />
                    <div className="prof-stat-item">
                        <span className="prof-stat-value">{stats?.total_hours ?? 0}h</span>
                        <span className="prof-stat-label">Study Hours</span>
                    </div>
                    <div className="prof-stat-divider" />
                    <div className="prof-stat-item">
                        <span className="prof-stat-value">{stats?.current_streak ?? 0}d</span>
                        <span className="prof-stat-label">Streak</span>
                    </div>
                    <div className="prof-stat-divider" />
                    <div className="prof-stat-item">
                        <span className="prof-stat-value">{stats?.avg_score ?? 0}%</span>
                        <span className="prof-stat-label">Avg. Score</span>
                    </div>
                    <div className="prof-stat-divider" />
                    <div className="prof-stat-item">
                        <span className="prof-stat-value">{stats?.subjects_covered ?? 0}</span>
                        <span className="prof-stat-label">Subjects</span>
                    </div>
                </div>
            </div>

            {/* ── Tab Navigation ──────────────────────────────── */}
            <div className="prof-tabs">
                {(["overview", "achievements", "settings"] as const).map((tab) => (
                    <button
                        key={tab}
                        className={`prof-tab ${activeTab === tab ? "active" : ""}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === "overview" && <BarChart3 size={16} />}
                        {tab === "achievements" && <Trophy size={16} />}
                        {tab === "settings" && <Shield size={16} />}
                        <span style={{ textTransform: "capitalize" }}>{tab}</span>
                    </button>
                ))}
            </div>

            {/* ── Tab Content ─────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {activeTab === "overview" && (
                    <motion.div
                        key="overview"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="dash-split-layout"
                        style={{ gridTemplateColumns: "1fr 380px" }}
                    >
                        {/* Main column */}
                        <div className="dash-main-column" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                            {/* Subject Mastery */}
                            <div className="dash-sidebar-card" style={{ padding: "24px" }}>
                                <h2 className="prof-section-title">
                                    <Sigma size={20} /> Subject Mastery
                                </h2>
                                {subjects.length > 0 ? (
                                    <div className="prof-subjects-grid">
                                        {subjects.map((sub, idx) => (
                                            <div key={sub.name} className="prof-subject-row">
                                                <div className="prof-subject-info">
                                                    <div className="prof-subject-dot" style={{ background: subjectColor(idx) }} />
                                                    <span className="prof-subject-name">{sub.name}</span>
                                                    <span className="prof-subject-trend" style={{ color: subjectColor(idx) }}>
                                                        {sub.topic_count} topic{sub.topic_count !== 1 ? "s" : ""}
                                                    </span>
                                                </div>
                                                <div className="prof-subject-bar-track">
                                                    <motion.div
                                                        className="prof-subject-bar-fill"
                                                        style={{ background: subjectColor(idx) }}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${sub.progress}%` }}
                                                        transition={{ duration: 1, ease: "easeOut" }}
                                                    />
                                                </div>
                                                <span className="prof-subject-percent">{sub.progress}%</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: "var(--text-sec)", fontSize: 14 }}>
                                        No progress data yet. Start a session to begin tracking your mastery!
                                    </p>
                                )}
                            </div>

                            {/* Recent Sessions */}
                            <div className="dash-sidebar-card" style={{ padding: "24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                                    <h2 className="prof-section-title" style={{ margin: 0 }}>
                                        <Clock size={20} /> Recent Sessions
                                    </h2>
                                    <Link href="/library" className="dash-link-btn">
                                        View All
                                    </Link>
                                </div>
                                {recentSessions.length > 0 ? (
                                    <div className="prof-sessions-list">
                                        {recentSessions.map((sess) => (
                                            <div key={sess.id} className="prof-session-row">
                                                <div
                                                    className="prof-session-subject-dot"
                                                    style={{ background: "var(--brand-main)" }}
                                                />
                                                <div className="prof-session-info">
                                                    <h4>{sess.topic || "General Tutoring"}</h4>
                                                    <p>
                                                        {sess.subject || "—"} •{" "}
                                                        {sess.created_at
                                                            ? new Date(sess.created_at).toLocaleDateString()
                                                            : "—"}
                                                    </p>
                                                </div>
                                                <span className="prof-session-duration">
                                                    {sess.duration_minutes ? `${sess.duration_minutes}m` : "—"}
                                                </span>
                                                <span
                                                    className="prof-session-score"
                                                    style={{
                                                        background: sess.status === "active" ? "#d1fae5" : "#e0e7ff",
                                                        color: sess.status === "active" ? "#10b981" : "#4f46e5",
                                                    }}
                                                >
                                                    {sess.status === "active" ? "Active" : "Done"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: "var(--text-sec)", fontSize: 14 }}>No sessions yet.</p>
                                )}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="dash-side-column">
                            {/* Learning Goals (Study Plans) */}
                            <div className="dash-sidebar-card">
                                <h2 className="prof-section-title">
                                    <Target size={20} /> Study Plans
                                </h2>
                                {goals.length > 0 ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                                        {goals.map((goal) => (
                                            <div key={goal.id} className="prof-goal-item">
                                                <div className="prof-goal-top">
                                                    <span className="prof-goal-text">{goal.plan_name}</span>
                                                </div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                                    {goal.subjects.map((s) => (
                                                        <span
                                                            key={s}
                                                            style={{
                                                                padding: "2px 8px",
                                                                borderRadius: 12,
                                                                fontSize: 12,
                                                                background: "var(--bg)",
                                                                color: "var(--text-sec)",
                                                            }}
                                                        >
                                                            {s}
                                                        </span>
                                                    ))}
                                                </div>
                                                {goal.weekly_goals.length > 0 && (
                                                    <ul style={{ margin: "8px 0 0 16px", padding: 0, fontSize: 13, color: "var(--text-sec)" }}>
                                                        {goal.weekly_goals.slice(0, 3).map((wg, i) => (
                                                            <li key={i}>{wg}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                                {goal.target_date && (
                                                    <span className="prof-goal-detail">
                                                        Target: {new Date(goal.target_date).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: "var(--text-sec)", fontSize: 14 }}>
                                        No study plans yet. Ask your tutor to create one!
                                    </p>
                                )}
                            </div>

                            {/* Study Streak Card */}
                            <div className="prof-streak-card">
                                <div className="prof-streak-flame">
                                    <Flame size={32} />
                                </div>
                                <h3 className="prof-streak-count">
                                    {stats?.current_streak ?? 0} Day Streak!
                                </h3>
                                <p className="prof-streak-sub">
                                    Best: {stats?.longest_streak ?? 0} days — keep it going!
                                </p>
                                <div className="prof-streak-dots">
                                    {Array.from({ length: 7 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`prof-streak-day ${
                                                i < Math.min(stats?.current_streak ?? 0, 7)
                                                    ? "completed"
                                                    : i === Math.min(stats?.current_streak ?? 0, 7)
                                                    ? "today"
                                                    : ""
                                            }`}
                                        >
                                            <span>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Contact Info */}
                            <div className="dash-sidebar-card">
                                <h2 className="prof-section-title">
                                    <Mail size={20} /> Contact Info
                                </h2>
                                <div className="prof-contact-list">
                                    <div className="prof-contact-item">
                                        <Mail size={16} />
                                        <span>{displayEmail}</span>
                                    </div>
                                    {profile?.school && (
                                        <div className="prof-contact-item">
                                            <GraduationCap size={16} />
                                            <span>{profile.school}</span>
                                        </div>
                                    )}
                                    {profile?.languages && profile.languages.length > 0 && (
                                        <div className="prof-contact-item">
                                            <Globe size={16} />
                                            <span>{profile.languages.join(", ")}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === "achievements" && (
                    <motion.div
                        key="achievements"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                    >
                        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-sec)" }}>
                            <Trophy size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                            <h3 style={{ color: "var(--text-main)" }}>Achievements Coming Soon</h3>
                            <p>Complete sessions and quizzes to unlock badges!</p>
                        </div>
                    </motion.div>
                )}

                {activeTab === "settings" && (
                    <motion.div
                        key="settings"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="prof-settings-layout"
                    >
                        <div className="dash-sidebar-card" style={{ padding: "28px" }}>
                            <h2 className="prof-section-title">
                                <Shield size={20} /> Preferences
                            </h2>
                            <div className="prof-settings-list">
                                <div className="prof-setting-row">
                                    <div className="prof-setting-info">
                                        {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                                        <div>
                                            <h4>Dark Mode</h4>
                                            <p>Switch between light and dark themes</p>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        checked={darkMode}
                                        onChange={(v) => {
                                            setDarkMode(v);
                                            savePreferences({ dark_mode: v, notifications, sound_effects: soundEffects, session_reminders: sessionReminders });
                                        }}
                                    />
                                </div>
                                <div className="prof-setting-row">
                                    <div className="prof-setting-info">
                                        <Bell size={18} />
                                        <div>
                                            <h4>Push Notifications</h4>
                                            <p>Get notified about sessions and achievements</p>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        checked={notifications}
                                        onChange={(v) => {
                                            setNotifications(v);
                                            savePreferences({ dark_mode: darkMode, notifications: v, sound_effects: soundEffects, session_reminders: sessionReminders });
                                        }}
                                    />
                                </div>
                                <div className="prof-setting-row">
                                    <div className="prof-setting-info">
                                        <Volume2 size={18} />
                                        <div>
                                            <h4>Sound Effects</h4>
                                            <p>Play sounds during whiteboard sessions</p>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        checked={soundEffects}
                                        onChange={(v) => {
                                            setSoundEffects(v);
                                            savePreferences({ dark_mode: darkMode, notifications, sound_effects: v, session_reminders: sessionReminders });
                                        }}
                                    />
                                </div>
                                <div className="prof-setting-row">
                                    <div className="prof-setting-info">
                                        <Calendar size={18} />
                                        <div>
                                            <h4>Session Reminders</h4>
                                            <p>Remind me 15 minutes before sessions</p>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        checked={sessionReminders}
                                        onChange={(v) => {
                                            setSessionReminders(v);
                                            savePreferences({ dark_mode: darkMode, notifications, sound_effects: soundEffects, session_reminders: v });
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="dash-sidebar-card" style={{ padding: "28px" }}>
                            <h2 className="prof-section-title">
                                <Eye size={20} /> Privacy & Account
                            </h2>
                            <div className="prof-settings-list">
                                <button className="prof-setting-link">
                                    <span>Change Password</span>
                                    <ChevronRight size={16} />
                                </button>
                                <button className="prof-setting-link">
                                    <span>Manage Data & Privacy</span>
                                    <ChevronRight size={16} />
                                </button>
                                <button className="prof-setting-link">
                                    <span>Connected Accounts</span>
                                    <ChevronRight size={16} />
                                </button>
                                <button className="prof-setting-link danger" onClick={logout}>
                                    <span>
                                        <LogOut size={16} /> Sign Out
                                    </span>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Toggle Switch Sub-component ────────────────────── */

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div
            className="prof-toggle-switch"
            style={{ background: checked ? "var(--primary)" : "var(--border-color)" }}
            onClick={() => onChange(!checked)}
        >
            <motion.div
                className="prof-toggle-knob"
                layout
                animate={{ left: checked ? "18px" : "2px" }}
            />
        </div>
    );
}
