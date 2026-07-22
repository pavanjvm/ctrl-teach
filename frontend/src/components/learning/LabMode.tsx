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
import { Check, CheckCircle2, ClipboardList, Send, Sparkles } from "lucide-react";
import LabCoach from "@/components/labs/LabCoach";
import UserStoryBuilder from "@/components/labs/UserStoryBuilder";
import { useLearner } from "@/lib/learning/provider";
import { USER_STORY_FOUNDATION_SCENE, USER_STORY_FIX_SCENE, sceneForLesson } from "@/lib/learning/labScenes";
import type { Lesson } from "@/lib/types";

interface Props { lesson: Lesson | null; onComplete: () => void; }

const seedForScene = (sceneId: string) => {
  if (sceneId === "us-fix") return { role: "team lead", goal: "blockers dashboard", benefit: "", given: "", when: "", then: "" };
  return { role: "", goal: "", benefit: "", given: "", when: "", then: "" };
};

export default function LabMode(props: Props) {
  if (props.lesson?.lab) return <GeneratedLabMode {...props} lesson={props.lesson} />;
  return <ScriptedLabMode {...props} />;
}

function ScriptedLabMode({ lesson, onComplete }: Props) {
  const { earnBadge, awardActivity, completeLesson, recordPracticeResult } = useLearner();
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
            if (lesson) awardActivity({ lessonId: lesson.id, kind: "lab", xp: 120 });
            earnBadge("lab-master");
            if (lesson) {
              const completedFields = Object.values(values).filter((value) => value.trim()).length;
              recordPracticeResult({
                lessonId: lesson.id,
                kind: "lab",
                summary: `Completed the guided ${scene.title} practice with Tars coaching on the work surface.`,
                evidence: [
                  "Finished the guided coaching sequence",
                  `${completedFields} practice fields completed`,
                ],
              });
              completeLesson(lesson.id);
            }
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

function GeneratedLabMode({ lesson, onComplete }: { lesson: Lesson; onComplete: () => void }) {
  const { earnBadge, awardActivity, completeLesson, recordPracticeResult } = useLearner();
  const lab = lesson.lab!;
  const [artifact, setArtifact] = useState("");
  const [criteria, setCriteria] = useState<boolean[]>(() => lab.successCriteria.map(() => false));
  const [reviewed, setReviewed] = useState(false);
  const [done, setDone] = useState(false);

  const metCount = criteria.filter(Boolean).length;
  const artifactReady = artifact.trim().length >= 80;
  const criteriaReady = criteria.length === 0 || metCount === criteria.length;
  const ready = artifactReady && criteriaReady;

  function toggleCriterion(index: number) {
    setCriteria((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value));
    setReviewed(false);
  }

  function review() {
    setReviewed(true);
  }

  function finish() {
    if (done) return;
    setDone(true);
    awardActivity({ lessonId: lesson.id, kind: "lab", xp: 120 });
    earnBadge("lab-master");
    recordPracticeResult({
      lessonId: lesson.id,
      kind: "lab",
      summary: `Built and reviewed a ${artifact.trim().length}-character artifact for ${lesson.title}.`,
      evidence: [
        `${metCount}/${lab.successCriteria.length} criteria self-checked`,
        "Artifact reviewed with Tars",
      ],
    });
    completeLesson(lesson.id);
    onComplete();
  }

  return (
    <div className="lab-wrap generated-lab-wrap">
      <div className="lab-coach-banner">
        <span className="lab-coach-dot" />
        <span className="lab-coach-text">TARS LAB COACH · LIVE ARTIFACT REVIEW</span>
      </div>

      <div className="generated-lab-grid">
        <section className="generated-lab-brief">
          <span className="generated-lab-kicker">Scenario</span>
          <h3>{lesson.title}</h3>
          <p>{lab.scenario}</p>

          <div className="generated-lab-task">
            <ClipboardList size={17} />
            <div><span>Your task</span><p>{lab.task}</p></div>
          </div>

          <div className="generated-lab-context">
            <span>Starter context</span>
            <p>{lab.starterContext}</p>
          </div>

          <span className="generated-lab-kicker">Success criteria</span>
          <div className="generated-lab-criteria">
            {lab.successCriteria.map((criterion, index) => (
              <button
                type="button"
                key={criterion}
                className={criteria[index] ? "met" : ""}
                onClick={() => toggleCriterion(index)}
              >
                <span>{criteria[index] && <Check size={12} />}</span>
                {criterion}
              </button>
            ))}
          </div>
        </section>

        <section className="generated-lab-workspace">
          <div className="generated-lab-workspace-head">
            <div><span>Deliverable</span><strong>{lab.deliverable}</strong></div>
            <small>{artifact.trim().length} characters</small>
          </div>
          <textarea
            value={artifact}
            onChange={(event) => { setArtifact(event.target.value); setReviewed(false); }}
            placeholder="Build your artifact here. State the outcome, assumptions, decisions, and evidence…"
          />

          {reviewed && (
            <div className={`generated-lab-review ${ready ? "ready" : "needs-work"}`}>
              <Sparkles size={17} />
              <div>
                <strong>{ready ? "Tars found a reviewable artifact" : "Tars needs a little more evidence"}</strong>
                <p>
                  {ready
                    ? `${metCount} of ${lab.successCriteria.length} criteria are marked. Your reasoning is visible; tighten one measurable success signal before sharing.`
                    : !artifactReady
                      ? "Add the intended outcome, one important assumption, and the decision you made. Then I can check it against the criteria."
                      : `Review and mark all ${lab.successCriteria.length} success criteria before completing the lab.`}
                </p>
              </div>
            </div>
          )}

          <div className="generated-lab-actions">
            <button type="button" className="generated-lab-review-btn" onClick={review}>
              <Send size={14} /> Ask Tars to review
            </button>
            <button type="button" className="generated-lab-complete-btn" onClick={finish} disabled={!reviewed || !ready || done}>
              {done ? <CheckCircle2 size={14} /> : <Check size={14} />}
              {done ? "Lab completed" : "Complete lab"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
