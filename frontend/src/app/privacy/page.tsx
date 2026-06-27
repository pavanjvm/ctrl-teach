"use client";

import Link from "next/link";
import Image from "next/image";

export default function PrivacyPolicyPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      color: "#0f172a",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 28px",
        background: "#ffffff",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <Image src="/Logo.png" alt="Ctrl+Teach" width={32} height={32} style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase" }}>Ctrl<span style={{ color: "#D4A574" }}>+</span>Teach</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: "#64748b", marginBottom: 32 }}>Last updated: March 9, 2026</p>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>1. Introduction</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            Ctrl+Teach (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is an AI-powered whiteboard tutoring platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application and services. Please read this policy carefully. By using Ctrl+Teach, you agree to the collection and use of information in accordance with this policy.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>2. Information We Collect</h2>
          <p style={{ lineHeight: 1.7, color: "#334155", marginBottom: 12 }}>We may collect the following types of information:</p>
          <ul style={{ lineHeight: 1.8, color: "#334155", paddingLeft: 24 }}>
            <li><strong>Account Information:</strong> When you sign up locally, we store the username and profile information you provide.</li>
            <li><strong>Google Calendar Data:</strong> If you connect your Google Calendar, we access your calendar events solely to help you manage your study schedule. We do not store calendar data on our servers beyond what is needed for the session.</li>
            <li><strong>Usage Data:</strong> We collect information about how you interact with the platform, including questions asked, whiteboard sessions, and learning progress.</li>
            <li><strong>Audio Data:</strong> When you use voice features, audio is processed in real time for transcription and AI responses. We do not permanently store raw audio recordings.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>3. How We Use Your Information</h2>
          <ul style={{ lineHeight: 1.8, color: "#334155", paddingLeft: 24 }}>
            <li>To provide, operate, and maintain the Ctrl+Teach tutoring platform.</li>
            <li>To personalize your learning experience and track academic progress.</li>
            <li>To integrate with Google Calendar for study scheduling (when authorized by you).</li>
            <li>To improve our AI models and platform features.</li>
            <li>To communicate with you about updates or changes to our service.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>4. Data Sharing and Disclosure</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            We do not sell your personal information. We may share data with third-party service providers only as necessary to operate the platform, including:
          </p>
          <ul style={{ lineHeight: 1.8, color: "#334155", paddingLeft: 24 }}>
            <li><strong>Google:</strong> For authentication and Calendar integration (via OAuth 2.0).</li>
            <li><strong>Firebase / Google Cloud:</strong> For data storage and hosting infrastructure.</li>
            <li><strong>AI Service Providers:</strong> For processing tutoring interactions (e.g., Google Gemini).</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>5. Data Security</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            We implement appropriate technical and organizational security measures to protect your personal information. All data is transmitted over encrypted connections (HTTPS/TLS). Access to user data is restricted to authorized personnel only.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>6. Data Retention</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            We retain your account information and learning data for as long as your account is active. You may request deletion of your data at any time by contacting us. Google Calendar data is only accessed during active sessions and is not permanently stored.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>7. Your Rights</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>You have the right to:</p>
          <ul style={{ lineHeight: 1.8, color: "#334155", paddingLeft: 24 }}>
            <li>Access the personal data we hold about you.</li>
            <li>Request correction or deletion of your personal data.</li>
            <li>Revoke Google Calendar access at any time through your Google Account settings.</li>
            <li>Opt out of non-essential data collection.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>8. Google API Services</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            Ctrl+Teach&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: "#D4A574" }}>
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>9. Changes to This Policy</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>10. Contact Us</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            If you have any questions about this Privacy Policy, please contact us at:{" "}
            <a href="mailto:support@ctrlteach.com" style={{ color: "#D4A574" }}>support@ctrlteach.com</a>
          </p>
        </section>

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 24, marginTop: 48, display: "flex", gap: 24 }}>
          <Link href="/" style={{ color: "#D4A574", textDecoration: "none" }}>&larr; Back to Home</Link>
          <Link href="/terms" style={{ color: "#D4A574", textDecoration: "none" }}>Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
