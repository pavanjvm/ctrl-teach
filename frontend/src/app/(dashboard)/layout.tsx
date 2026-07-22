"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLearner } from "@/lib/learning/provider";
import { useTars } from "@/lib/tars/provider";
import {
    ArrowLeft,
    BookOpen,
    Presentation,
    Settings,
    Menu,
    X,
} from "lucide-react";
import "./dashboard.css";
import "./signal-product.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, logout } = useAuth();
    const { isOnboarded, learnerReady } = useLearner();
    const { enabled: tarsEnabled, setEnabled: setTarsEnabled } = useTars();
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showMobileNav, setShowMobileNav] = useState(false);
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
            if (profileRef.current && !profileRef.current.contains(target)) {
                setShowProfileDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        setShowMobileNav(false);
        setShowProfileDropdown(false);
    }, [pathname]);

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
                        {[1, 2, 3].map((i) => (
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

    const navItems = [
        { name: "Home", href: "/dashboard", active: pathname === "/dashboard" },
        { name: "Explore", href: "/courses", active: pathname === "/courses" },
        {
            name: "Learning",
            href: "/library",
            active: pathname === "/library" || pathname === "/discover" || pathname.startsWith("/learn"),
        },
        { name: "My Path", href: "/path", active: pathname === "/path" },
    ];

    const isBoard = pathname === "/board";
    const isWorkspace = pathname === "/learn";
    const courseMatch = pathname.match(/^\/learn\/((?:generated|platform)-[^/]+)/);
    const courseId = courseMatch?.[1] ?? null;
    const isCourse = Boolean(courseId);
    const isLiveClassroom = Boolean(courseId && pathname === `/learn/${courseId}/classroom`);
    const isCourseOverview = Boolean(courseId && pathname === `/learn/${courseId}`);
    const lessonId = !isLiveClassroom ? pathname.split("/")[3] : null;
    const courseBackHref = courseId?.startsWith("platform-") ? "/courses" : "/library";
    const courseBackLabel = courseId?.startsWith("platform-") ? "Explore" : "Learning";

    return (
        <div className={`dash-app ${isBoard ? "board-shell" : ""}`}>
            {/* ── Top Navbar ──────────────────────────────────────────── */}
            {isCourse && courseId && (
                <header className="course-mode-topbar">
                    <Link href={courseBackHref} className="course-mode-back" aria-label={`Return to ${courseBackLabel}`}>
                        <ArrowLeft size={15} />
                        <span>{courseBackLabel}</span>
                    </Link>
                    <nav className="course-mode-nav" aria-label="Course modes">
                        <Link
                            href={`/learn/${courseId}`}
                            className={!isLiveClassroom ? "active" : ""}
                            aria-current={!isLiveClassroom ? "page" : undefined}
                        >
                            <BookOpen size={15} /> Course
                        </Link>
                        <Link
                            href={`/learn/${courseId}/classroom${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ""}`}
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

            {!isCourse && (
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
            <main className={`dash-main ${isBoard || isWorkspace || isCourse ? "no-padding" : ""} ${isBoard || isWorkspace ? "board-mode" : ""} ${isCourseOverview ? "course-overview-mode" : ""}`}>
                {children}
            </main>
        </div>
    );
}
