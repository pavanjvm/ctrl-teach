"use client";

/**
 * CompanionPanel — the always-on AI companion on the right of the Workspace.
 *
 * Tabs: Chat · Notes · Hints · Feedback. The companion is proactive (timing-based
 * nudges like "stuck for a bit?") rather than purely reactive, per the spec. The
 * chat is a lightweight rule-based agent so the demo is reliable without a live
 * LLM round-trip; it routes to richer responses for common learning intents
 * ("explain", "example", "quiz me", "summarize").
 *
 * Notes persist to localStorage so learners build a personal knowledge base.
 */

import React, { useEffect, useRef, useState } from "react";
import { useLearner } from "@/lib/learner";
import type { Course, Lesson } from "@/lib/types";

const NOTES_KEY = (courseId: string) => `ctrlteach_notes_${courseId}`;

type Msg = { id: number; role: "user" | "agent"; text: string };

function companionReply(input: string, course: Course | null, lesson: Lesson | null): string {
  const q = input.toLowerCase().trim();
  const topic = lesson?.title ?? "this topic";

  if (/^(hi|hello|hey)\b/.test(q)) return `Hey! I'm your AI companion. We're working on "${topic}" right now. Ask me to explain, give an example, summarize, or quiz you.`;
  if (q.includes("summar")) return summary(course, lesson);
  if (q.includes("example") || q.includes("example")) return exampleFor(lesson);
  if (q.includes("quiz me") || q.includes("test me") || q.includes("quiz")) return `Sure — switch to Assessment mode when you're ready. Here's a quick check: ${quickCheck(lesson)}`;
  if (q.includes("explain") || q.includes("what is") || q.includes("why")) return explainFor(lesson);
  if (q.includes("simpl") || q.includes("hard") || q.includes("confus") || q.includes("stuck")) return `Totally normal. Let me make it simpler: ${simplifyFor(lesson)} Want me to draw it on the whiteboard next?`;
  if (q.includes("compare")) return `To compare, note the key dimensions — what each does, when to use it, and the trade-off. Tap Study mode and I'll sketch a comparison table on the board.`;
  if (q.includes("video") || q.includes("youtube")) return `Great idea — check the resource pills at the bottom-right of the board; I've surfaced a relevant video for this lesson.`;
  return `Good question on ${topic}. In short: focus on the core idea, then apply it once. Want me to explain it visually on the whiteboard, or quiz you on it?`;
}

function summary(_c: Course | null, l: Lesson | null): string { return `Quick summary: ${l?.summary ?? "the key idea is to focus on the why before the how."}`; }
function exampleFor(l: Lesson | null): string {
  if (l?.id === "lsn-1") return `Example story: "As a customer, I want to track my order so that I can plan my day around delivery." Note all three parts are present.`;
  if (l?.id?.startsWith("lsn")) return `Example: take the abstract rule and apply it to a concrete, real-world scenario you can picture. Want me to walk through one on the board?`;
  return `Example: break the concept into a tiny, concrete case and work it end-to-end.`;
}
function quickCheck(l: Lesson | null): string {
  if (l?.id === "lsn-3") return `Which part of a user story explains business value — role, goal, or benefit?`;
  return `In one sentence, what's the single most important takeaway from this lesson?`;
}
function explainFor(l: Lesson | null): string {
  if (l?.id === "lsn-1") return `A user story captures a need from a real person's perspective: WHO they are, WHAT they want to do, and WHY it matters. It keeps the team focused on value, not features.`;
  return `The core idea is the relationship between the parts and the outcome they produce. Let me put it on the board in Study mode so you can see it.`;
}
function simplifyFor(l: Lesson | null): string {
  return `Think of it like everyday life: someone wants something for a reason. That's all a user story is — a want, plus a why. The details come after.`;
}

interface Props { course: Course | null; lesson: Lesson | null; }

export default function CompanionPanel({ course, lesson }: Props) {
  const [tab, setTab] = useState<"chat" | "notes" | "hints" | "feedback">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: "agent", text: `Hi! I'm your AI companion for "${course?.title ?? "this course"}". I'll be right here as you learn — ask me anything, or I'll nudge you forward.` },
  ]);
  const [input, setInput] = useState("");
  const [proactive, setProactive] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string>("");
  const idRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { earnBadge } = useLearner();

  // Load notes for this course.
  useEffect(() => {
    if (!course) return;
    const key = NOTES_KEY(course.id);
    setNotes(localStorage.getItem(key) ?? "");
  }, [course?.id]);

  // Save notes (debounced).
  useEffect(() => {
    if (!course) return;
    const id = setTimeout(() => localStorage.setItem(NOTES_KEY(course.id), notes), 400);
    return () => clearTimeout(id);
  }, [notes, course?.id]);

  // Proactive nudge after a period of inactivity in chat.
  useEffect(() => {
    setProactive(null);
    const t = setTimeout(() => {
      setProactive("Looks like it's been a few minutes — want me to walk through this visually, or give you a quick example?");
    }, 28000);
    return () => clearTimeout(t);
  }, [lesson?.id, course?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, proactive]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const reply = companionReply(text, course, lesson);
    setMsgs((m) => [...m, { id: idRef.current++, role: "user", text }]);
    setInput("");
    if (text.toLowerCase().includes("badge")) earnBadge("first-session");
    setTimeout(() => setMsgs((m) => [...m, { id: idRef.current++, role: "agent", text: reply }]), 380);
  };

  const hints = lesson ? buildHints(lesson) : [];

  return (
    <aside className="learn-comp">
      <div className="cp-tabs">
        {(["chat", "notes", "hints", "feedback"] as const).map((t) => (
          <button key={t} className={`cp-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "chat" ? "Chat" : t === "notes" ? "Notes" : t === "hints" ? "Hints" : "Feedback"}
          </button>
        ))}
      </div>

      <div className="cp-body" ref={scrollRef} style={{ display: tab === "notes" ? "block" : "flex", flexDirection: "column" }}>
        {proactive && tab === "chat" && (
          <div className="cp-proactive">
            <span className="tag">Companion</span>
            {proactive}
          </div>
        )}

        {tab === "chat" && msgs.map((m) => (
          <div key={m.id} className={`cp-msg ${m.role}`}>
            <div className="who">{m.role === "user" ? "You" : "AI Companion"}</div>
            <div className="bubble">{m.text}</div>
          </div>
        ))}

        {tab === "notes" && (
          <>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
              Your notes save automatically to this device. Revisit, export, and build a knowledge base over time.
            </div>
            <textarea
              className="cp-note-area"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Notes for "${lesson?.title ?? "this lesson"}"…`}
            />
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="bp-mode-btn" onClick={() => { const blob = new Blob([notes], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ctrlteach-notes.md"; a.click(); }}>Export</button>
              <button className="bp-mode-btn" onClick={() => setNotes("")}>Clear</button>
            </div>
          </>
        )}

        {tab === "hints" && (
          <>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Progressive hints — reveal only as you need them.</div>
            {hints.map((h, i) => (
              <div className="cp-hint" key={i}>
                <div className="h">Hint {i + 1}</div>
                {h}
              </div>
            ))}
          </>
        )}

        {tab === "feedback" && (
          <>
            <div style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.5, marginBottom: 12 }}>
              {feedback || `Tell me how this lesson landed. I'll use it to adapt your next sessions — what clicked, what didn't?`}
            </div>
            <textarea
              className="cp-note-area"
              style={{ minHeight: 120 }}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What worked? What was tough?"
            />
            <button className="bp-mode-btn active" style={{ marginTop: 10 }} onClick={() => setFeedback("")}>Submit feedback</button>
          </>
        )}
      </div>

      {tab === "chat" && (
        <div className="cp-input">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the companion…"
          />
          <button onClick={send}>Send</button>
        </div>
      )}
    </aside>
  );
}

function buildHints(lesson: Lesson): string[] {
  if (lesson.id === "lsn-1") return [
    "A user story has three parts: who, what, and why.",
    "If you can't state the 'why', the story probably isn't ready yet.",
    "Ask: whose life gets better if this ships?",
  ];
  if (lesson.id === "lsn-2") return [
    "Fill the role first — the person who gets value.",
    "The goal is an outcome, not a feature name.",
    "The benefit is what the role gains. Don't leave it blank.",
  ];
  return [
    "Start with the core idea in one sentence.",
    "Connect it to something you already know.",
    "Apply it once in a tiny example before moving on.",
  ];
}