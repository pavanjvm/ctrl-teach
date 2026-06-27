"use client";

/**
 * LabMode — the signature experience of Ctrl+Teach.
 *
 * Renders a practice surface (UserStoryBuilder) and overlays the LabCoach
 * pixel-precise guidance engine — the hero. Pre-seeds a "broken" story for the
 * Fix-My-Story scene so the coach's first move ("I can see exactly where to
 * improve") lands truthfully. On completion, awards XP/badges.
 */

import React, { useMemo, useState } from "react";
import LabCoach from "@/components/LabCoach";
import UserStoryBuilder from "@/components/lab/UserStoryBuilder";
import { useLearner } from "@/lib/learner";
import { USER_STORY_FOUNDATION_SCENE, USER_STORY_FIX_SCENE, sceneForLesson } from "@/lib/labScenes";
import type { Lesson } from "@/lib/types";

interface Props { lesson: Lesson | null; onComplete: () => void; }

const seedForScene = (sceneId: string) => {
  if (sceneId === "us-fix") return { role: "team lead", goal: "blockers dashboard", benefit: "", given: "", when: "", then: "" };
  return { role: "", goal: "", benefit: "", given: "", when: "", then: "" };
};

export default function LabMode({ lesson, onComplete }: Props) {
  const { earnBadge, addXp, completeLesson } = useLearner();
  const scene = useMemo(() => sceneForLesson(lesson?.id ?? "") ?? USER_STORY_FOUNDATION_SCENE, [lesson?.id]);
  const [values, setValues] = useState<Record<string, string>>(() => seedForScene(scene.id));
  const [done, setDone] = useState(false);

  const setField = (f: string, v: string) => setValues((prev) => ({ ...prev, [f]: v }));

  return (
    <div className="lab-wrap">
      <div className="lab-coach-banner">
        <span className="lab-coach-dot" />
        <span className="lab-coach-text">AI COACH LIVE · {scene.title}</span>
      </div>

      <div className="lab-surface">
        <UserStoryBuilder values={values} onChange={setField} />
      </div>

      {/* The coach overlay is a sibling — it positions annotations against the
          fields above using their data-* selectors. */}
      {!done && (
        <LabCoach
          scene={scene}
          onComplete={() => {
            setDone(true);
            addXp(120);
            earnBadge("lab-master");
            if (lesson) completeLesson(lesson.id);
            onComplete();
          }}
        />
      )}

      {done && (
        <div className="cp-proactive" style={{ marginTop: 18 }}>
          <span className="tag" style={{ color: "var(--accent)" }}>Coach</span>
          That's a wrap on the lab. Your story has all three parts and testable acceptance criteria. Try the assessment next to lock it in.
        </div>
      )}
    </div>
  );
}