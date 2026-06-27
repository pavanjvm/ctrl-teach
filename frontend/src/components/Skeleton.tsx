"use client";

import React from "react";

/* ── Skeleton primitives ─────────────────────────────────────────── */

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${className ?? ""}`}
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 0.8s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

/* ── Skeleton cards ──────────────────────────────────────────────── */

export function SkeletonCard({ height = 200 }: { height?: number }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        border: "1px solid var(--border, #e5e7eb)",
        padding: 24,
        height,
      }}
    >
      <Skeleton width="40%" height={20} style={{ marginBottom: 16 }} />
      <Skeleton width="70%" height={14} style={{ marginBottom: 12 }} />
      <Skeleton width="55%" height={14} style={{ marginBottom: 12 }} />
      <Skeleton width="80%" height={14} />
    </div>
  );
}

/* ── Dashboard skeleton ──────────────────────────────────────────── */

export function DashboardSkeleton() {
  return (
    <div className="dash-content fade-in" style={{ padding: "32px 40px" }}>
      {/* Hero + Upcoming */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, marginBottom: 36 }}>
        <Skeleton height={220} borderRadius={20} />
        <div style={{ background: "white", borderRadius: 20, border: "1px solid var(--border, #e5e7eb)", padding: "24px 28px" }}>
          <Skeleton width="50%" height={22} style={{ marginBottom: 20 }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <Skeleton width={52} height={52} borderRadius={12} />
              <div style={{ flex: 1 }}>
                <Skeleton width="70%" height={14} style={{ marginBottom: 6 }} />
                <Skeleton width="50%" height={12} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 36 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              background: "white",
              borderRadius: 16,
              border: "1px solid var(--border, #e5e7eb)",
              padding: "20px 24px",
            }}
          >
            <Skeleton width={40} height={40} borderRadius={10} style={{ marginBottom: 12 }} />
            <Skeleton width="50%" height={12} style={{ marginBottom: 8 }} />
            <Skeleton width="40%" height={24} />
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <SkeletonCard height={300} />
        <SkeletonCard height={300} />
      </div>
    </div>
  );
}

/* ── Schedule skeleton ───────────────────────────────────────────── */

export function ScheduleSkeleton() {
  return (
    <div className="dash-content fade-in" style={{ padding: "32px 40px" }}>
      <Skeleton width="30%" height={28} style={{ marginBottom: 8 }} />
      <Skeleton width="50%" height={16} style={{ marginBottom: 32 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        <SkeletonCard height={400} />
        <div>
          <Skeleton width="40%" height={20} style={{ marginBottom: 16 }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <Skeleton width={60} height={60} borderRadius={12} />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
                <Skeleton width="40%" height={12} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Profile skeleton ────────────────────────────────────────────── */

export function ProfileSkeleton() {
  return (
    <div className="dash-content fade-in" style={{ padding: "32px 40px" }}>
      {/* Profile header */}
      <div
        style={{
          background: "white",
          borderRadius: 20,
          border: "1px solid var(--border, #e5e7eb)",
          padding: "32px 40px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginBottom: 32,
        }}
      >
        <Skeleton width={80} height={80} borderRadius="50%" />
        <div style={{ flex: 1 }}>
          <Skeleton width="30%" height={24} style={{ marginBottom: 8 }} />
          <Skeleton width="45%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="20%" height={12} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} width={100} height={36} borderRadius={8} />
        ))}
      </div>

      {/* Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <SkeletonCard height={250} />
        <SkeletonCard height={250} />
      </div>
    </div>
  );
}

/* ── Generic page skeleton ───────────────────────────────────────── */

export function PageSkeleton() {
  return (
    <div className="dash-content fade-in" style={{ padding: "32px 40px" }}>
      <Skeleton width="35%" height={28} style={{ marginBottom: 8 }} />
      <Skeleton width="55%" height={16} style={{ marginBottom: 32 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        <SkeletonCard height={200} />
        <SkeletonCard height={200} />
        <SkeletonCard height={200} />
      </div>
    </div>
  );
}
