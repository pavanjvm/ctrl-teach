"use client";

/**
 * UserStoryBuilder — the practice surface for Lab Mode.
 *
 * A mock, premium "story composer" the learner fills in while the AI coach
 * overlays pixel-precise guidance. Each field is tagged with data-field
 * selectors that LabCoach resolves to live rects.
 *
 * It also renders a live "story preview" card that assembles the parts into the
 * classic "As a … I want … so that …" form, so the learner sees the story
 * come together as they type — making the coaching feel tangible.
 */

import React from "react";

interface Props {
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  background: "#fff",
  fontSize: 15,
  fontWeight: 400,
  color: "var(--fg)",
  fontFamily: "Inter, system-ui, sans-serif",
  outline: "none",
  transition: "border-color .2s, box-shadow .2s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: 6,
};

const Part: React.FC<{ tag: string; color: string }> = ({ tag, color }) => (
  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.08, textTransform: "uppercase", color, marginRight: 8 }}>{tag}</span>
);

export default function UserStoryBuilder({ values, onChange }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, height: "100%", alignItems: "start" }}>
      {/* ── Composer ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <span style={labelStyle}>Role</span>
          <input
            data-field="role"
            value={values.role ?? ""}
            onChange={(e) => onChange("role", e.target.value)}
            placeholder="product manager"
            style={fieldStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
        <div>
          <span style={labelStyle}>Goal</span>
          <input
            data-field="goal"
            value={values.goal ?? ""}
            onChange={(e) => onChange("goal", e.target.value)}
            placeholder="see cohort progress at a glance"
            style={fieldStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
        <div>
          <span style={labelStyle}>Benefit</span>
          <input
            data-field="benefit"
            value={values.benefit ?? ""}
            onChange={(e) => onChange("benefit", e.target.value)}
            placeholder="prioritise the roadmap by value"
            style={fieldStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#e8590c")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        <div style={{ border: "1.5px dashed var(--border)", borderRadius: 10, padding: 16, marginTop: 6 }}>
          <span style={labelStyle}>Acceptance Criteria — Given / When / Then</span>
          <div style={{ display: "grid", gap: 10 }}>
            <input data-field="given" value={values.given ?? ""} onChange={(e) => onChange("given", e.target.value)} placeholder="a backlog with unprioritised items" style={fieldStyle} />
            <input data-field="when" value={values.when ?? ""} onChange={(e) => onChange("when", e.target.value)} placeholder="I open the cohorts dashboard" style={fieldStyle} />
            <input data-field="then" value={values.then ?? ""} onChange={(e) => onChange("then", e.target.value)} placeholder="items are ranked by scored value" style={fieldStyle} />
          </div>
        </div>
      </div>

      {/* ── Live story preview ───────────────────────────── */}
      <div data-story-card="preview" style={{ position: "sticky", top: 0, background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, padding: 24, minHeight: 360 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.1, textTransform: "uppercase", color: "var(--accent)", marginBottom: 18 }}>Story Preview</div>
        <div style={{ fontSize: 20, lineHeight: 1.5, fontWeight: 300, color: "var(--fg)" }}>
          <div style={{ marginBottom: 6 }}>
            <Part tag="As a" color="#1864ab" />
            <span style={{ fontWeight: 500 }}>{values.role || <em style={{ color: "var(--baseline)" }}>a user</em>}</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <Part tag="I want" color="#2f9e44" />
            <span style={{ fontWeight: 500 }}>{values.goal || <em style={{ color: "var(--baseline)" }}>a goal</em>}</span>
          </div>
          <div>
            <Part tag="So that" color="#7048e8" />
            <span style={{ fontWeight: 500 }}>{values.benefit || <em style={{ color: "#e8590c", fontWeight: 600 }}>…benefit left undefined</em>}</span>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "22px 0 16px" }} />

        <div style={{ fontFamily: "Inter, monospace", fontSize: 13, lineHeight: 1.7, color: "var(--fg)" }}>
          <div><span style={{ color: "#666", marginRight: 8 }}>Given</span>{values.given || <em style={{ color: "var(--baseline)" }}>a state</em>}</div>
          <div><span style={{ color: "#666", marginRight: 8 }}>When</span>{values.when || <em style={{ color: "var(--baseline)" }}>an action</em>}</div>
          <div><span style={{ color: "#666", marginRight: 8 }}>Then</span>{values.then || <em style={{ color: "var(--baseline)" }}>an outcome</em>}</div>
        </div>

        {/* invisible anchor the coach arrows can originate from */}
        <div data-coach="anchor" style={{ position: "absolute", left: 20, bottom: 20, width: 1, height: 1 }} />
      </div>
    </div>
  );
}