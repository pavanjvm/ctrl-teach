"use client";

/**
 * ProgressBar — the bottom strip of the Learner Workspace.
 * Assembles XP, confidence, streak, checkpoints, and badges so progress is
 * always glanceable — "feel like a world-class trainer is tracking the journey".
 * Also doubles as the Study/Lab/Assessment/Roleplay mode switcher.
 */

import React from "react";
import { useLearner } from "@/lib/learner";
import type { LessonType } from "@/lib/types";

interface Props {
  mode: LessonType;
  onMode: (m: LessonType) => void;
}

export default function ProgressBar({ mode, onMode }: Props) {
  const { progress } = useLearner();
  const modes: LessonType[] = ["study", "lab", "assessment", "roleplay"];
  const labels: Record<LessonType, string> = {
    study: "Study",
    lab: "Lab",
    assessment: "Assessment",
    roleplay: "Roleplay",
  };
  const earned = progress.badges.filter((b) => b.earnedAt).length;

  return (
    <div className="learn-bottom">
      <div className="bp">
        <div className="bp-stat">
          <span className="v bp-xp">{progress.xp}<span className="u"> XP</span></span>
          <span className="l">Experience</span>
        </div>
        <div className="bp-sep" />
        <div className="bp-stat">
          <span className="v">{progress.confidence}<span style={{ fontSize: 11, color: "var(--muted)" }}>%</span></span>
          <span className="l">Confidence</span>
        </div>
        <div className="bp-sep" />
        <div className="bp-stat">
          <span className="v">{progress.streak}<span style={{ fontSize: 11, color: "var(--muted)" }}> day{progress.streak !== 1 ? "s" : ""}</span></span>
          <span className="l">Streak</span>
        </div>
        <div className="bp-sep" />
        <div className="bp-stat">
          <span className="v">{progress.checkpoints.length}</span>
          <span className="l">Checkpoints</span>
        </div>
        <div className="bp-sep" />
        <div className="bp-stat">
          <span className="v">{earned} / {progress.badges.length}</span>
          <span className="l">Badges</span>
        </div>

        <div className="bp-spacer" />

        <div className="bp-mode-switch">
          {modes.map((m) => (
            <button
              key={m}
              className={`bp-mode-btn ${mode === m ? "active" : ""}`}
              onClick={() => onMode(m)}
            >
              {labels[m]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}