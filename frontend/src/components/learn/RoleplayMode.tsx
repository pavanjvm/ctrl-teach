"use client";

/**
 * RoleplayMode — simulated realistic conversations.
 *
 * The AI behaves like another person (Product Owner, stakeholder, interviewer…)
 * and the learner practices. A lightweight rule-based persona keeps the demo
 * reliable: it recognises intents, responds in character, and ends each
 * roleplay with a coaching critique that highlights strengths and gaps.
 */

import React, { useRef, useState } from "react";
import { useLearner } from "@/lib/learner";
import type { Lesson } from "@/lib/types";

interface Line { id: number; role: "me" | "them"; text: string }

interface Persona {
  name: string;
  role: string;
  initials: string;
  opener: string;
  followUps?: string[];
  critique: string[];
}

function personaFor(lesson: Lesson | null): Persona {
  if (lesson?.roleplay) {
    return {
      name: lesson.roleplay.name,
      role: lesson.roleplay.role,
      initials: lesson.roleplay.initials,
      opener: lesson.roleplay.opener,
      followUps: lesson.roleplay.followUps,
      critique: lesson.roleplay.critique,
    };
  }
  if (lesson?.id === "lsn-6") return {
    name: "Priya",
    role: "Senior Product Owner",
    initials: "PR",
    opener: "Thanks for meeting. I've got three story ideas for next sprint — can you tell me which one delivers the most value and why?",
    critique: [
      "You acknowledged value over effort — good instinct.",
      "You asked clarifying questions about the 'why' — that's senior-level.",
      "Try tying each story back to a measurable outcome, not just a feeling of value.",
    ],
  };
  if (lesson?.id === "lsn-6" && lesson.title.includes("Engineer")) return {
    name: "Devon",
    role: "Staff Engineer",
    initials: "DE",
    opener: "Walk me through how you'd scale this to 10M users. Start with the single biggest risk.",
    critique: ["You identified the bottleneck before jumping to solutions.", "You justified the trade-offs out loud.", "Quantify the scaling targets next time."],
  };
  if (lesson?.id === "lsn-6") return {
    name: "Marcus",
    role: "Scrum Master",
    initials: "MA",
    opener: "Let's run the daily. What did you do yesterday, what's blocking you, and what's next?",
    critique: ["You kept the daily focused and time-boxed.", "You flagged a blocker early.", "End with a clear commitment for today."],
  };
  return {
    name: "Sam",
    role: "Product Owner",
    initials: "SA",
    opener: "Hi! I was hoping you could help me shape a feature. What's the first question you'd ask me about a new user request?",
    critique: ["You started with the user, not the feature.", "You probed for value and outcome.", "Land on an acceptance criterion to confirm done."],
  };
}

function reply(them: string, persona: Persona, turn: number): string {
  if (persona.followUps?.length) {
    return persona.followUps[Math.min(turn - 1, persona.followUps.length - 1)];
  }
  const q = them.toLowerCase();
  if (q.includes("?")) return `Good question back. Let me give you more: our biggest constraint is engineer time. How would you weigh that against the value you described?`;
  if (q.includes("value")) return `Hmm — that's a fair framing. But how would we actually measure that value after it ships?`;
  if (q.includes("user") || q.includes("customer")) return `Yes, the customer perspective matters most. So based on that, which of my three stories would you prioritise, and how would you write it as a story?`;
  if (q.includes("accept")) return `Spot on. Let's draft the acceptance criteria together — Given, When, Then. You start the Given.`;
  return `Interesting. Can you tell me why that matters to the end user, in one sentence?`;
}

interface Props { lesson: Lesson | null; onCoached: () => void; }

export default function RoleplayMode({ lesson, onCoached }: Props) {
  const { earnBadge } = useLearner();
  const persona = personaFor(lesson);
  const [lines, setLines] = useState<Line[]>([{ id: 0, role: "them", text: persona.opener }]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState(0);
  const [showCritique, setShowCritique] = useState(false);
  const idRef = useRef(1);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const meLine: Line = { id: idRef.current++, role: "me", text };
    setLines((l) => [...l, meLine]);
    setInput("");
    const n = turns + 1;
    setTurns(n);
    if (n >= 4) {
      setTimeout(() => {
        setLines((l) => [...l, { id: idRef.current++, role: "them", text: "Great session. Let me give you some feedback." }]);
        setShowCritique(true);
        earnBadge("roleplayer");
        onCoached();
      }, 450);
    } else {
      setTimeout(() => {
        setLines((l) => [...l, { id: idRef.current++, role: "them", text: reply(text, persona, n) }]);
      }, 400);
    }
  };

  return (
    <div className="role-wrap">
      <div className="role-persona">
        <div className="av">{persona.initials}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>{persona.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{persona.role} · simulated conversation</div>
        </div>
      </div>

      <div className="role-chat">
        {lines.map((l) => (
          <div key={l.id} className={`role-row ${l.role}`}>
            <div className="role-bubble">{l.text}</div>
          </div>
        ))}

        {showCritique && (
          <div style={{ border: "1px solid var(--accent)", borderRadius: 12, padding: 16, background: "#fff8e1", marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>Coach critique</div>
            {persona.critique.map((c, i) => (
              <div key={i} style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.5, marginBottom: 6 }}>· {c}</div>
            ))}
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, fontStyle: "italic" }}>The Roleplayer badge is now unlocked.</div>
          </div>
        )}
      </div>

      <div className="role-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={showCritique ? "Conversation complete" : `Respond to ${persona.name}…`}
          disabled={showCritique}
        />
        <button onClick={send} disabled={showCritique}>Send</button>
      </div>
    </div>
  );
}