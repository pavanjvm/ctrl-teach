"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import "../auth.css";

function getPasswordStrength(pw: string): { label: string; pct: number } {
  if (!pw) return { label: "", pct: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return { label: "Weak", pct: 25 };
  if (score === 2) return { label: "Fair", pct: 50 };
  if (score === 3) return { label: "Good", pct: 75 };
  return { label: "Strong", pct: 100 };
}

export default function SignUpPage() {
  const { user, loading, signUp } = useAuth();
  const { isOnboarded, learnerReady } = useLearner();
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && learnerReady) {
      router.push(isOnboarded ? "/dashboard" : "/onboarding");
    }
  }, [user, loading, router, isOnboarded, learnerReady]);

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

  if (loading || (user && !learnerReady)) {
    return <div className="auth-loading">Loading</div>;
  }

  return (
    <div className="auth-shell">
      <Link href="/" className="auth-brand" aria-label="Ctrl+Teach home">
        Ctrl<span>+</span>Teach
      </Link>
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ maxWidth: 500 }}
      >
        <span className="auth-eyebrow">Get started</span>
        <h1 className="auth-title">
          Create account<span className="stop">.</span>
        </h1>
        <p className="auth-sub">
          Already have an account?{" "}
          <Link href="/login">Sign in</Link>
        </p>

        {error && (
          <motion.div
            className="auth-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-name">Display name</label>
            <div className="auth-input-wrap">
              <input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="auth-input"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-username">Username</label>
            <div className="auth-input-wrap">
              <input
                id="signup-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                className="auth-input"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-password">Password</label>
            <div className="auth-input-wrap">
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password (min 8 chars)"
                className="auth-input"
                style={{ paddingRight: "44px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="auth-input-action"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && (
              <div className="auth-strength">
                <span className="auth-strength-track">
                  <span className="auth-strength-fill" style={{ width: `${strength.pct}%` }} />
                </span>
                <span className="auth-strength-label">{strength.label}</span>
              </div>
            )}
          </div>

          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
            />
            I agree to the Terms of Service and Privacy Policy.
          </label>

          <button type="submit" disabled={isSubmitting} className="auth-submit">
            {isSubmitting ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div className="auth-foot">
          <span>New learner</span>
          <Link href="/">Back to home</Link>
        </div>
      </motion.div>
    </div>
  );
}
