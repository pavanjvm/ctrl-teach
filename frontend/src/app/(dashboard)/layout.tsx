"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useClicky } from "@/lib/clicky";
import {
    LayoutDashboard,
    Users,
    PenTool,
    Trophy,
    Settings,
    Bell,
    CalendarDays,
    X,
    Check,
} from "lucide-react";
import "./dashboard.css";

/* ── Mock Notifications ──────────────────────────────── */
const MOCK_NOTIFICATIONS = [
    { id: "1", icon: "01", title: "New Achievement Unlocked", desc: "You completed 10 practice sessions", time: "2m", unread: true },
    { id: "2", icon: "02", title: "Session Reminder", desc: "Algebra fundamentals in 30 min", time: "28m", unread: true },
    { id: "3", icon: "03", title: "Streak Alert", desc: "You're on a 12-day streak — keep going", time: "1h", unread: true },
    { id: "4", icon: "04", title: "Tutor Feedback", desc: "Your AI coach left notes on the last session", time: "3h", unread: false },
    { id: "5", icon: "05", title: "Weekly Report Ready", desc: "Your learning summary for this week is available", time: "1d", unread: false },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, logout } = useAuth();
    const { enabled: clickyEnabled, setEnabled: setClickyEnabled } = useClicky();
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
    const notifRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // Auth Protection
    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node;
            if (notifRef.current && !notifRef.current.contains(target)) {
                setShowNotifications(false);
            }
            if (profileRef.current && !profileRef.current.contains(target)) {
                setShowProfileDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            await logout();
            router.push("/");
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    // Show skeleton while checking auth state instead of blank screen
    if (loading || !user) {
        return (
            <div className="dash-app">
                <header className="dash-topbar">
                    <div className="topbar-logo-zone">
                        <div className="dash-brand" style={{ pointerEvents: "none" }}>
                            <span className="dash-brand-name" style={{ opacity: 0.3 }}>Ctrl</span>
                            <span className="dash-brand-plus" style={{ opacity: 0.3 }}>+</span>
                            <span className="dash-brand-name" style={{ opacity: 0.3 }}>Teach</span>
                        </div>
                    </div>
                    <nav className="topbar-nav">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="skeleton-shimmer" style={{ width: 90, height: 20, borderRadius: 999 }} />
                        ))}
                    </nav>
                </header>
                <main className="dash-main">
                    <div style={{ padding: "32px 0" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32, marginBottom: 40 }}>
                            <div className="skeleton-shimmer" style={{ height: 220 }} />
                            <div className="skeleton-shimmer" style={{ height: 220 }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="skeleton-shimmer" style={{ height: 140 }} />
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const unreadCount = notifications.filter((n) => n.unread).length;

    const markAllRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    };

    const markRead = (id: string) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    };

    const navItems = [
        { name: "Discover", href: "/discover" },
        { name: "Workspace", href: "/learn" },
        { name: "Dashboard", href: "/dashboard" },
        { name: "Calendar", href: "/schedule" },
        { name: "Tutors", href: "/tutors" },
        { name: "Whiteboard", href: "/board" },
        { name: "Achievements", href: "/profile?tab=achievements" },
    ];

    const isWizard = pathname === "/tutors/create";
    const isBoard = pathname === "/board";
    const isLearn = pathname === "/learn" || pathname.startsWith("/learn");

    return (
        <div className={`dash-app ${isBoard ? "board-shell" : ""}`}>
            {/* ── Top Navbar ──────────────────────────────────────────── */}
            {!isWizard && (
                <header className="dash-topbar">
                    {/* 1. Logo Zone */}
                    <div className="topbar-logo-zone">
                        <Link href="/" className="dash-brand" aria-label="Ctrl+Teach home">
                            <span className="dash-brand-name">Ctrl</span>
                            <span className="dash-brand-plus">+</span>
                            <span className="dash-brand-name">Teach</span>
                        </Link>
                    </div>

                    {/* 2. Navigation Links */}
                    <nav className="topbar-nav">
                        {navItems.map((item) => {
                            const hrefPath = item.href.split("?")[0];
                            const isActive = pathname === hrefPath || pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`topbar-nav-item ${isActive ? "active" : ""}`}
                                >
                                    <span>{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="topbar-divider" />

                    {/* 3. Right Controls */}
                    <div className="topbar-controls">
                        <label
                            className={`topbar-clicky-switch ${clickyEnabled && !isBoard ? "is-on" : ""} ${isBoard ? "is-paused" : ""}`}
                            title={isBoard ? "Clicky is controlled by the whiteboard tutor" : clickyEnabled ? "Clicky is on — toggle off to disable" : "Clicky is off — toggle on to enable"}
                        >
                            <span className="topbar-clicky-switch-label">Clicky</span>
                            <span className="topbar-clicky-switch-track">
                                <span className="topbar-clicky-switch-thumb" />
                            </span>
                            <input
                                type="checkbox"
                                role="switch"
                                aria-checked={clickyEnabled && !isBoard}
                                aria-disabled={isBoard}
                                checked={clickyEnabled && !isBoard}
                                disabled={isBoard}
                                onChange={(e) => setClickyEnabled(e.target.checked)}
                                className="topbar-clicky-switch-input"
                            />
                        </label>

                        <Link
                            href="/profile?tab=settings"
                            className={`topbar-icon-btn ${pathname === "/profile" ? "active" : ""}`}
                            title="Settings"
                        >
                            <Settings size={18} />
                        </Link>

                        <div className="topbar-notif-wrapper" ref={notifRef}>
                            <button
                                className={`topbar-icon-btn notification-btn ${showNotifications ? "active" : ""}`}
                                title="Notifications"
                                onClick={() => setShowNotifications(!showNotifications)}
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && (
                                    <span className="notification-dot">
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                )}
                            </button>

                            {showNotifications && (
                                <div className="notif-dropdown">
                                    <div className="notif-header">
                                        <h3 className="notif-title">Notifications</h3>
                                        <div className="notif-header-actions">
                                            {unreadCount > 0 && (
                                                <button className="notif-mark-all" onClick={markAllRead}>
                                                    <Check size={12} />
                                                    Mark all read
                                                </button>
                                            )}
                                            <button
                                                className="notif-close"
                                                onClick={() => setShowNotifications(false)}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="notif-list">
                                        {notifications.map((n) => (
                                            <button
                                                key={n.id}
                                                className={`notif-item ${n.unread ? "unread" : ""}`}
                                                onClick={() => markRead(n.id)}
                                            >
                                                <span className="notif-item-icon">{n.icon}</span>
                                                <div className="notif-item-content">
                                                    <span className="notif-item-title">{n.title}</span>
                                                    <span className="notif-item-desc">{n.desc}</span>
                                                </div>
                                                <span className="notif-item-time">{n.time}</span>
                                                {n.unread && <span className="notif-unread-dot" />}
                                            </button>
                                        ))}
                                    </div>
                                    <Link
                                        href="/profile?tab=settings"
                                        className="notif-footer"
                                        onClick={() => setShowNotifications(false)}
                                    >
                                        Notification Settings
                                    </Link>
                                </div>
                            )}
                        </div>

                        <div className="topbar-user-wrapper" ref={profileRef} style={{ position: "relative" }}>
                            <button
                                className="topbar-user-card"
                                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", padding: 0 }}
                                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                            >
                                <div className="topbar-avatar" style={{ width: 32, height: 32 }}>
                                    {user?.photoURL ? (
                                        <>
                                            <img
                                                src={user.photoURL}
                                                alt={user.displayName || "User"}
                                                width={32}
                                                height={32}
                                                referrerPolicy="no-referrer"
                                                style={{ objectFit: "cover" }}
                                                onError={(e) => {
                                                    const img = e.currentTarget;
                                                    img.style.display = "none";
                                                    const fallback = img.nextElementSibling as HTMLElement | null;
                                                    if (fallback) fallback.style.display = "flex";
                                                }}
                                            />
                                            <div style={{ width: "100%", height: "100%", display: "none", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12, color: "var(--text-main)" }}>
                                                {user?.displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12, color: "var(--text-main)" }}>
                                            {user?.email?.charAt(0).toUpperCase() || "U"}
                                        </div>
                                    )}
                                </div>
                                <div className="topbar-user-info" style={{ textAlign: "left" }}>
                                    <span className="user-name" style={{ display: "block" }}>
                                        {user?.displayName || "Student"}
                                    </span>
                                </div>
                            </button>

                            {showProfileDropdown && (
                                <div className="notif-dropdown" style={{ width: "200px", right: 0, padding: "8px" }}>
                                    <Link
                                        href="/profile"
                                        className="notif-item"
                                        onClick={() => setShowProfileDropdown(false)}
                                        style={{ padding: "10px", borderRadius: "4px" }}
                                    >
                                        My Profile
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className="notif-item"
                                        style={{ width: "100%", textAlign: "left", padding: "10px", borderRadius: "4px", color: "var(--text-main)" }}
                                    >
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
            )}

            {/* ── Main Content Area ──────────────────────────────── */}
            <main className={`dash-main ${pathname === "/tutors" || isWizard || isBoard || isLearn ? "no-padding" : ""} ${isWizard ? "wizard-mode" : ""} ${isBoard || isLearn ? "board-mode" : ""}`}>
                {children}
            </main>
        </div>
    );
}
