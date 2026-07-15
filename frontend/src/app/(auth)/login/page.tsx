"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { useLearner } from "@/lib/learner";
import "../auth.css";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const { isOnboarded, learnerReady } = useLearner();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && learnerReady) {
      router.push(isOnboarded ? "/dashboard" : "/onboarding");
    }
  }, [user, loading, router, isOnboarded, learnerReady]);

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
      >
        <span className="auth-eyebrow">Welcome back</span>
        <h1 className="auth-title">
          Sign in<span className="stop">.</span>
        </h1>
        <p className="auth-sub">
          New to Ctrl+Teach?{" "}
          <Link href="/signup">Create an account</Link>
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
            <label className="auth-label" htmlFor="login-username">Username</label>
            <div className="auth-input-wrap">
              <input
                id="login-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="login-password">Password</label>
            <div className="auth-input-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>

          <button type="submit" disabled={isSubmitting} className="auth-submit">
            {isSubmitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="auth-foot">
          <span>Returning learner</span>
          <Link href="/">Back to home</Link>
        </div>
      </motion.div>
    </div>
  );
}
