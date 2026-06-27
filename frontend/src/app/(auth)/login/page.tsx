"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, User } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const { isOnboarded } = useLearner();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.push(isOnboarded ? "/discover" : "/onboarding");
  }, [user, loading, router, isOnboarded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please fill in both username and password.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await login(username, password);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to sign in.");
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
        <p style={{ color: "#64748b", fontSize: "15px" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafafa",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "24px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "white",
          borderRadius: "24px",
          padding: "48px 40px",
          boxShadow: "0 4px 32px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px 0" }}>
          Sign In
        </h1>
        <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 32px 0" }}>
          New to Ctrl+Teach?{" "}
          <Link href="/signup" style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>
            Create an account
          </Link>
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "#fef2f2",
              color: "#dc2626",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              marginBottom: "16px",
              border: "1px solid #fecaca",
            }}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px", display: "block" }}>
              Username
            </label>
            <div style={{ position: "relative" }}>
              <User size={16} color="#94a3b8" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: "100%", height: "46px", padding: "0 14px 0 40px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", color: "#1a1a2e", background: "white", outline: "none" }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px", display: "block" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={16} color="#94a3b8" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", height: "46px", padding: "0 42px 0 40px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", color: "#1a1a2e", background: "white", outline: "none" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              height: "48px",
              borderRadius: "12px",
              border: "none",
              background: "#6366f1",
              color: "white",
              fontSize: "14px",
              fontWeight: 700,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              marginTop: "6px",
            }}
          >
            {isSubmitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
