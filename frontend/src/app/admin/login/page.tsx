"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import "../admin.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, loading, adminLogin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user?.isAdmin) router.replace("/admin/dashboard");
  }, [loading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your admin username and password.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await adminLogin(username, password);
      router.replace("/admin/dashboard");
    } catch (caught: any) {
      setError(caught?.response?.data?.detail || caught?.message || "Admin sign in failed.");
      setSubmitting(false);
    }
  }

  if (loading || user?.isAdmin) {
    return <div className="admin-loading">Opening admin dashboard…</div>;
  }

  return (
    <main className="admin-login-page">
      <Link href="/" className="admin-wordmark" aria-label="Ctrl+Teach home">
        Ctrl<span>+</span>Teach
      </Link>

      <section className="admin-login-intro">
        <span className="admin-kicker">Business and course operations</span>
        <h1>See what learners choose<span>.</span></h1>
        <p>
          Understand conversion and demand, then shape the courses and bootcamps learners need.
        </p>
        <div className="admin-login-note">
          <LockKeyhole size={16} />
          <span>Admin access is assigned server-side and checked on every course change.</span>
        </div>
      </section>

      <section className="admin-login-card" aria-labelledby="admin-sign-in-title">
        <div>
          <span>Restricted area</span>
          <h2 id="admin-sign-in-title">Admin sign in</h2>
          <p>Use an account configured with the admin role.</p>
        </div>

        {user && !user.isAdmin && (
          <div className="admin-info">
            You are signed in as a learner. Admin sign in will replace that session.
          </div>
        )}
        {error && <div className="admin-error" role="alert">{error}</div>}

        <button
          type="button"
          className="admin-demo-login"
          onClick={() => { setUsername("admin"); setPassword("admin"); setError(null); }}
        >
          Demo administrator <span>admin / admin</span>
        </button>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Admin username"
              autoFocus
            />
          </label>
          <label>
            <span>Password</span>
            <div className="admin-password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Admin password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <button type="submit" className="admin-primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Open admin dashboard"}
          </button>
        </form>

        <Link href="/login" className="admin-back-link">Learner sign in</Link>
      </section>
    </main>
  );
}
