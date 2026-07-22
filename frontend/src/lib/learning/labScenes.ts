/**
 * Scripted Lab Mode scenes — guaranteed-polished hero coaching sequences.
 *
 * These are authored so Lab Mode always delivers the "wow" in the hackathon
 * demo regardless of LLM variability, while keeping OpenAI Realtime powering the
 * voice/whiteboard Study Mode elsewhere.
 *
 * The User Story scenes mirror the exact example in the Ctrl+Teach spec:
 *   "As a [user] / I want [goal] / So that [benefit] … Given / When / Then …
 *    Missing benefit here."
 *
 * Selectors target the practice surface in components/lab/UserStoryBuilder.tsx.
 */

import type { LabScene } from "@/lib/types";

export const USER_STORY_FOUNDATION_SCENE: LabScene = {
  id: "us-foundation",
  title: "Write your first user story",
  surface: "user-story",
  steps: [
    {
      id: "s1",
      coachLine: "Welcome. Let's write a real user story together — I'll guide you field by field.",
      annotations: [
        { kind: "focus", selector: "[data-field='role']", tone: "info", delay: 200 },
        { kind: "label", selector: "[data-field='role']", text: "Start with WHO has the goal", tone: "info", delay: 600 },
      ],
      autoAdvanceMs: 4200,
    },
    {
      id: "s2",
      coachLine: "The role describes the person who gets value — not a job title. Try 'product manager' here.",
      annotations: [
        { kind: "hotspot", selector: "[data-field='role']", tone: "info" },
        { kind: "hint", selector: "[data-field='role']", text: "Ask: whose life gets better? That's the role.", tone: "info", delay: 300 },
      ],
      autoAdvanceMs: 5200,
    },
    {
      id: "s3",
      coachLine: "Now the goal — what does this person want to do? Make it an outcome, not a feature.",
      annotations: [
        { kind: "focus", selector: "[data-field='goal']", tone: "info" },
        { kind: "arrow", selector: "[data-field='goal']", fromSelector: "[data-coach='anchor']", tone: "info", delay: 200 },
        { kind: "label", selector: "[data-field='goal']", text: "Write the GOAL here", tone: "info", delay: 700 },
      ],
      autoAdvanceMs: 5200,
    },
    {
      id: "s4",
      coachLine: "Here's the part most stories miss — the benefit. Why does this matter? Let me point at exactly where.",
      annotations: [
        { kind: "focus", selector: "[data-field='benefit']", tone: "warning" },
        { kind: "circle", selector: "[data-field='benefit']", tone: "warning", delay: 300 },
        { kind: "hint", selector: "[data-field='benefit']", text: "Missing benefit here — the business value goes in this field.", tone: "warning", delay: 700 },
      ],
      autoAdvanceMs: 6000,
    },
    {
      id: "s5",
      coachLine: "Beautiful. 'So that I can prioritise the roadmap by value.' That's the benefit that makes the story valuable.",
      annotations: [
        { kind: "focus", selector: "[data-field='benefit']" },
        { kind: "celebrate", selector: "[data-field='benefit']", tone: "success", delay: 500 },
      ],
      autoAdvanceMs: 4500,
    },
    {
      id: "s6",
      coachLine: "Now acceptance criteria — three lines that prove done. Given, When, Then. Let's walk it together.",
      annotations: [
        { kind: "focus", selector: "[data-field='given']" },
        { kind: "label", selector: "[data-field='given']", text: "GIVEN — the starting state", tone: "info" },
        { kind: "label", selector: "[data-field='when']", text: "WHEN — the action", tone: "info", delay: 400 },
        { kind: "label", selector: "[data-field='then']", text: "THEN — the outcome", tone: "info", delay: 800 },
      ],
      autoAdvanceMs: 6000,
    },
    {
      id: "s7",
      coachLine: "And that's a great user story. Role, goal, benefit, and testable acceptance criteria. You just wrote it like a pro.",
      annotations: [
        { kind: "focus", selector: "[data-story-card='preview']" },
        { kind: "celebrate", selector: "[data-story-card='preview']", tone: "success", delay: 600 },
      ],
    },
  ],
};

export const USER_STORY_FIX_SCENE: LabScene = {
  id: "us-fix",
  title: "Fix my broken story — pixel-precise correction",
  surface: "user-story",
  steps: [
    {
      id: "f1",
      coachLine: "This story is close — but I can see exactly where to improve. Watch.",
      annotations: [
        { kind: "focus", selector: "[data-story-card='preview']" },
        { kind: "circle", selector: "[data-field='benefit']", tone: "warning", delay: 600 },
      ],
      autoAdvanceMs: 3800,
    },
    {
      id: "f2",
      coachLine: "The benefit is left undefined. '…so that …' tells us nothing. Let's fix it together.",
      annotations: [
        { kind: "circle", selector: "[data-field='benefit']", tone: "warning" },
        { kind: "hint", selector: "[data-field='benefit']", text: "Missing benefit here — highlight the gap so they FEEL seen.", tone: "warning" },
        { kind: "arrow", selector: "[data-field='benefit']", fromSelector: "[data-coach='anchor']", tone: "warning", delay: 400 },
      ],
      autoAdvanceMs: 5200,
    },
    {
      id: "f3",
      coachLine: "Now place your cursor in the benefit field and write the value. I'll show you exactly where to click.",
      annotations: [
        { kind: "hotspot", selector: "[data-field='benefit']", tone: "info" },
      ],
      autoAdvanceMs: 4200,
    },
    {
      id: "f4",
      coachLine: "There. 'So that I can make data-backed decisions.' That's the missing value. Story fixed.",
      annotations: [
        { kind: "focus", selector: "[data-field='benefit']" },
        { kind: "celebrate", selector: "[data-field='benefit']", tone: "success", delay: 400 },
      ],
    },
  ],
};

export function sceneForLesson(lessonId: string): LabScene | null {
  if (lessonId === "lsn-2") return USER_STORY_FOUNDATION_SCENE;
  if (lessonId === "lsn-8") return USER_STORY_FIX_SCENE;
  return USER_STORY_FOUNDATION_SCENE;
}