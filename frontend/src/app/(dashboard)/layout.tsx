"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import { useTars } from "@/lib/tars";
import {
    ArrowLeft,
    BookOpen,
    Presentation,
    Settings,
    Bell,
    Menu,
    X,
    Check,
} from "lucide-react";
import "./dashboard.css";
import "./signal-product.css";

function relativeTime(timestamp: number): string {
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, logout } = useAuth();
    const { isOnboarded, learnerReady, progress, skillProfile } = useLearner();
    const { enabled: tarsEnabled, setEnabled: setTarsEnabled } = useTars();
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showMobileNav, setShowMobileNav] = useState(false);
    const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
    const notifRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // Auth Protection
    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (!loading && user?.isAdmin) {
            router.replace("/admin/dashboard");
        } else if (!loading && user && learnerReady && !isOnboarded) {
            router.push("/onboarding");
        }
    }, [user, loading, learnerReady, isOnboarded, router]);

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

    useEffect(() => {
        setShowMobileNav(false);
        setShowNotifications(false);
        setShowProfileDropdown(false);
    }, [pathname]);

    const notifications = useMemo(() => {
        const items: Array<{ id: string; title: string; desc: string; time: string; timestamp: number }> = [];
        for (const badge of progress.badges
            .filter((item) => item.earnedAt)
            .sort((first, second) => (second.earnedAt ?? 0) - (first.earnedAt ?? 0))
            .slice(0, 3)) {
            const timestamp = badge.earnedAt ?? Date.now();
            items.push({
                id: `badge:${badge.id}:${timestamp}`,
                title: "Achievement unlocked",
                desc: `${badge.title}: ${badge.description}`,
                time: relativeTime(timestamp),
                timestamp,
            });
        }
        if (progress.streak > 0 && progress.lastActivityDate) {
            const timestamp = new Date(`${progress.lastActivityDate}T12:00:00`).getTime();
            items.push({
                id: `streak:${progress.lastActivityDate}`,
                title: `${progress.streak}-day learning streak`,
                desc: "Your completed learning activity kept the streak moving.",
                time: relativeTime(timestamp),
                timestamp,
            });
        }
        const focus = skillProfile.focusAreas[0];
        if (focus) {
            items.push({
                id: `focus:${focus.name}:${focus.lastObservedAt}`,
                title: `Focus next: ${focus.name}`,
                desc: focus.reason,
                time: relativeTime(focus.lastObservedAt),
                timestamp: focus.lastObservedAt,
            });
        }
        return items
            .sort((first, second) => second.timestamp - first.timestamp)
            .slice(0, 5)
            .map((item, index) => ({
                ...item,
                icon: String(index + 1).padStart(2, "0"),
                unread: !readNotificationIds.has(item.id),
            }));
    }, [progress.badges, progress.lastActivityDate, progress.streak, readNotificationIds, skillProfile.focusAreas]);
    const unreadCount = notifications.filter((notification) => notification.unread).length;

    const handleLogout = async () => {
        try {
            await logout();
            router.push("/");
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    // Show skeleton while checking auth state instead of blank screen
    if (loading || !user || user.isAdmin || !learnerReady || !isOnboarded) {
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

    const markAllRead = () => {
        setReadNotificationIds((current) => new Set([
            ...current,
            ...notifications.map((notification) => notification.id),
        ]));
    };

    const markRead = (id: string) => {
        setReadNotificationIds((current) => new Set([...current, id]));
    };

    const navItems = [
        { name: "Home", href: "/dashboard", active: pathname === "/dashboard" },
        {
            name: "Learn",
            href: "/library",
            active: pathname === "/library" || pathname === "/discover" || pathname.startsWith("/learn"),
        },
    ];

    const isBoard = pathname === "/board";
    const isWorkspace = pathname === "/learn";
    const generatedCourseMatch = pathname.match(/^\/learn\/(generated-[^/]+)/);
    const generatedCourseId = generatedCourseMatch?.[1] ?? null;
    const isGeneratedCourse = Boolean(generatedCourseId);
    const isLiveClassroom = Boolean(generatedCourseId && pathname === `/learn/${generatedCourseId}/classroom`);
    const isGeneratedOverview = Boolean(generatedCourseId && pathname === `/learn/${generatedCourseId}`);
    const generatedLessonId = !isLiveClassroom ? pathname.split("/")[3] : null;

    return (
        <div className={`dash-app ${isBoard ? "board-shell" : ""}`}>
            {/* ── Top Navbar ──────────────────────────────────────────── */}
            {isGeneratedCourse && generatedCourseId && (
                <header className="course-mode-topbar">
                    <Link href="/library" className="course-mode-back" aria-label="Return to My Library">
                        <ArrowLeft size={15} />
                        <span>My Library</span>
                    </Link>
                    <nav className="course-mode-nav" aria-label="Course modes">
                        <Link
                            href={`/learn/${generatedCourseId}`}
                            className={!isLiveClassroom ? "active" : ""}
                            aria-current={!isLiveClassroom ? "page" : undefined}
                        >
                            <BookOpen size={15} /> Course
                        </Link>
                        <Link
                            href={`/learn/${generatedCourseId}/classroom${generatedLessonId ? `?lesson=${encodeURIComponent(generatedLessonId)}` : ""}`}
                            className={isLiveClassroom ? "active" : ""}
                            aria-current={isLiveClassroom ? "page" : undefined}
                        >
                            <Presentation size={15} /> Live Classroom
                        </Link>
                    </nav>
                    <Link href="/dashboard" className="course-mode-brand" aria-label="Ctrl+Teach home">
                        Ctrl<span>+</span>Teach
                    </Link>
                </header>
            )}

            {!isGeneratedCourse && (
                <header className="dash-topbar">
                    {/* 1. Logo Zone */}
                    <div className="topbar-logo-zone">
                        <Link href="/dashboard" className="dash-brand" aria-label="Ctrl+Teach home">
                            <span className="dash-brand-name">Ctrl</span>
                            <span className="dash-brand-plus">+</span>
                            <span className="dash-brand-name">Teach</span>
                        </Link>
                    </div>

                    <button
                        type="button"
                        className={`topbar-mobile-menu ${showMobileNav ? "active" : ""}`}
                        aria-label={showMobileNav ? "Close navigation" : "Open navigation"}
                        aria-expanded={showMobileNav}
                        aria-controls="mobile-product-navigation"
                        onClick={() => setShowMobileNav((current) => !current)}
                    >
                        {showMobileNav ? <X size={18} /> : <Menu size={18} />}
                    </button>

                    {/* 2. Navigation Links */}
                    <nav className="topbar-nav">
                        {navItems.map((item) => {
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`topbar-nav-item ${item.active ? "active" : ""}`}
                                    aria-current={item.active ? "page" : undefined}
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
                            className={`topbar-tars-switch ${tarsEnabled && !isBoard ? "is-on" : ""} ${isBoard ? "is-paused" : ""}`}
                            title={isBoard ? "Tars is controlled by the whiteboard tutor" : tarsEnabled ? "Tars is on — toggle off to disable" : "Tars is off — toggle on to enable"}
                        >
                            <span className="topbar-tars-switch-label">Tars</span>
                            <span className="topbar-tars-switch-track">
                                <span className="topbar-tars-switch-thumb" />
                            </span>
                            <input
                                type="checkbox"
                                role="switch"
                                aria-checked={tarsEnabled && !isBoard}
                                aria-disabled={isBoard}
                                checked={tarsEnabled && !isBoard}
                                disabled={isBoard}
                                onChange={(e) => setTarsEnabled(e.target.checked)}
                                className="topbar-tars-switch-input"
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
                                        {notifications.length === 0 && (
                                            <p style={{ margin: 0, padding: "24px 16px", color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>
                                                You&apos;re all caught up.
                                            </p>
                                        )}
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
                                    <Link
                                        href="/profile?tab=achievements"
                                        className="notif-item"
                                        onClick={() => setShowProfileDropdown(false)}
                                        style={{ padding: "10px", borderRadius: "4px" }}
                                    >
                                        Achievements
                                    </Link>
                                    <Link
                                        href="/teaching-profiles"
                                        className="notif-item"
                                        onClick={() => setShowProfileDropdown(false)}
                                        style={{ padding: "10px", borderRadius: "4px" }}
                                    >
                                        Teaching style
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

                    {showMobileNav && (
                        <nav id="mobile-product-navigation" className="topbar-mobile-nav" aria-label="Product navigation">
                            {navItems.map((item, index) => {
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`topbar-mobile-nav-item ${item.active ? "active" : ""}`}
                                        aria-current={item.active ? "page" : undefined}
                                    >
                                        <span className="topbar-mobile-nav-index">{String(index + 1).padStart(2, "0")}</span>
                                        <span>{item.name}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    )}
                </header>
            )}

            {/* ── Main Content Area ──────────────────────────────── */}
            <main className={`dash-main ${isBoard || isWorkspace || isGeneratedCourse ? "no-padding" : ""} ${isBoard || isWorkspace ? "board-mode" : ""} ${isGeneratedOverview ? "course-overview-mode" : ""}`}>
                {children}
            </main>
        </div>
    );
}
