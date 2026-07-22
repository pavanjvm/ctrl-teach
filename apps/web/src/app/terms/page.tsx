"use client";

import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <div className="legal-page" style={{
      minHeight: "100vh",
      background: "#f8fafc",
      color: "#0f172a",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Header */}
      <header className="legal-header" style={{
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 28px",
        background: "#ffffff",
      }}>
        <div className="legal-header-inner" style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Link className="legal-brand" href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <span>Ctrl<span>+</span>Teach</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="legal-main" style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Terms of Service<span>.</span></h1>
        <p className="legal-updated" style={{ color: "#64748b", marginBottom: 32 }}>Last updated: July 14, 2026</p>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>1. Acceptance of Terms</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            By accessing or using Ctrl+Teach (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>2. Description of Service</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            Ctrl+Teach is an AI-powered whiteboard tutoring platform that provides real-time voice-interactive learning experiences. The Service includes AI-generated explanations, whiteboard drawings, study scheduling, and progress tracking features.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>3. User Accounts</h2>
          <ul style={{ lineHeight: 1.8, color: "#334155", paddingLeft: 24 }}>
            <li>You may create an account with a username and password. You are responsible for maintaining the security of your credentials.</li>
            <li>You must provide accurate and complete information when creating your account.</li>
            <li>You are responsible for all activities that occur under your account.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>4. Acceptable Use</h2>
          <p style={{ lineHeight: 1.7, color: "#334155", marginBottom: 12 }}>You agree not to:</p>
          <ul style={{ lineHeight: 1.8, color: "#334155", paddingLeft: 24 }}>
            <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
            <li>Attempt to gain unauthorized access to any part of the Service or its related systems.</li>
            <li>Interfere with or disrupt the integrity or performance of the Service.</li>
            <li>Use the Service to generate harmful, misleading, or inappropriate content.</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>5. AI-Generated Content</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            Ctrl+Teach uses artificial intelligence to generate explanations, drawings, and educational content. While we strive for accuracy, AI-generated content may contain errors or inaccuracies. The Service is intended as a supplementary learning tool and should not be considered a replacement for professional instruction. We do not guarantee the accuracy, completeness, or reliability of AI-generated content.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>6. Intellectual Property</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            The Service, including its design, code, AI models, and branding, is owned by Ctrl+Teach and protected by intellectual property laws. You retain ownership of any content you create or upload through the Service.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>7. Limitation of Liability</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            To the maximum extent permitted by law, Ctrl+Teach shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, academic outcomes, or reliance on AI-generated content. The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>8. Termination</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            We reserve the right to suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Upon termination, your right to use the Service will immediately cease.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>9. Changes to Terms</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            We may modify these Terms of Service at any time. Continued use of the Service after any changes constitutes acceptance of the revised terms. We will update the &quot;Last updated&quot; date at the top of this page when changes are made.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>10. Contact Us</h2>
          <p style={{ lineHeight: 1.7, color: "#334155" }}>
            If you have any questions about these Terms of Service, please contact us at:{" "}
            <a href="mailto:support@ctrlteach.com" style={{ color: "#D4A574" }}>support@ctrlteach.com</a>
          </p>
        </section>

        <div className="legal-footer" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 24, marginTop: 48, display: "flex", gap: 24 }}>
          <Link href="/" style={{ color: "#D4A574", textDecoration: "none" }}>&larr; Back to Home</Link>
          <Link href="/privacy" style={{ color: "#D4A574", textDecoration: "none" }}>Privacy Policy</Link>
        </div>
      </main>
    </div>
  );
}
