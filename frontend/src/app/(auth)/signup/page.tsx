"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { User, Lock, Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";

function getPasswordStrength(pw: string): { label: string; color: string; pct: number } {
  if (!pw) return { label: "", color: "#e2e8f0", pct: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return { label: "Weak password", color: "#ef4444", pct: 25 };
  if (score === 2) return { label: "Fair password", color: "#f59e0b", pct: 50 };
  if (score === 3) return { label: "Good password", color: "#3b82f6", pct: 75 };
  return { label: "Strong password", color: "#10b981", pct: 100 };
}

export default function SignUpPage() {
  const { user, loading, signUp } = useAuth();
  const { isOnboarded } = useLearner();
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.push(isOnboarded ? "/discover" : "/onboarding");
  }, [user, loading, router, isOnboarded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !username || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!agreedTerms) {
      setError("Please agree to the Terms of Service.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await signUp(username, password, name);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to create account.");
      setIsSubmitting(false);
    }
  };

  const strength = getPasswordStrength(password);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
        <p style={{ color: "#64748b", fontSize: "15px" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", padding: "24px", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: "480px", background: "white", borderRadius: "24px", padding: "48px 40px", boxShadow: "0 4px 32px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)" }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#1a1a2e", margin: "0 0 6px 0" }}>
          Create Account
        </h1>
        <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 32px 0" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>
            Sign in
          </Link>
        </p>

        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", marginBottom: "16px", border: "1px solid #fecaca" }}>
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px", display: "block" }}>Display name</label>
            <div style={{ position: "relative" }}>
              <User size={16} color="#94a3b8" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" style={{ width: "100%", height: "46px", padding: "0 14px 0 40px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", color: "#1a1a2e", background: "white", outline: "none" }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px", display: "block" }}>Username</label>
            <div style={{ position: "relative" }}>
              <User size={16} color="#94a3b8" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" style={{ width: "100%", height: "46px", padding: "0 14px 0 40px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", color: "#1a1a2e", background: "white", outline: "none" }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px", display: "block" }}>Password</label>
            <div style={{ position: "relative" }}>
              <Lock size={16} color="#94a3b8" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" style={{ width: "100%", height: "46px", padding: "0 42px 0 40px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", color: "#1a1a2e", background: "white", outline: "none" }} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && (
              <div style={{ marginTop: "10px" }}>
                <div style={{ height: "6px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                  <div style={{ width: `${strength.pct}%`, height: "100%", background: strength.color, transition: "width 0.2s" }} />
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: strength.color, fontWeight: 600 }}>{strength.label}</p>
              </div>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#475569" }}>
            <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} />
            I agree to the Terms of Service.
          </label>

          <button type="submit" disabled={isSubmitting} style={{ width: "100%", height: "48px", borderRadius: "12px", border: "none", background: "#6366f1", color: "white", fontSize: "14px", fontWeight: 700, cursor: isSubmitting ? "not-allowed" : "pointer", marginTop: "6px" }}>
            {isSubmitting ? "Creating account…" : "Create Account"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
