/**
 * Seed course catalog for Ctrl+Teach.
 *
 * Mock content is acceptable for the MVP (per the spec). These courses are
 * hand-authored so the workspace always has rich, navigable content to demo
 * every learning mode (study / lab / assessment / roleplay) without depending
 * on a live search.
 *
 * The discovery endpoint (/api/discover) can surface additional ranked results
 * from the web/LLM; anything saved by the learner merges on top of this seed.
 */

import type { Course } from "@/lib/types";

// Thumbnails are CSS gradients so we depend on no external assets.
const G = {
  pm: "linear-gradient(135deg,#ff8a3d 0%,#ff5d8f 50%,#7c3aed 100%)",
  sd: "linear-gradient(135deg,#0ea5e9 0%,#2563eb 50%,#1e1b4b 100%)",
  py: "linear-gradient(135deg,#facc15 0%,#f97316 50%,#7c2d12 100%)",
  ai: "linear-gradient(135deg,#34d399 0%,#06b6d4 50%,#4338ca 100%)",
  sc: "linear-gradient(135deg,#a78bfa 0%,#7c3aed 50%,#312e81 100%)",
  ux: "linear-gradient(135deg,#f472b6 0%,#ec4899 50%,#be185d 100%)",
};

export const SEED_COURSES: Course[] = [
  {
    id: "pm-user-stories",
    title: "Agile Product Management: User Stories That Work",
    description:
      "Master the art of writing crisp, valuable user stories with acceptance criteria. The AI companion teaches, then coaches you pixel-by-pixel as you write your first stories.",
    thumbnail: G.pm,
    instructor: "Maya Rodriguez",
    platform: "LinkedIn Learning",
    difficulty: "Beginner",
    duration: "4h 15m",
    skills: ["User Stories", "Acceptance Criteria", "Backlog Grooming", "Product Ownership"],
    rating: 4.8,
    ratingCount: 1240,
    modules: [
      {
        id: "mod-1",
        title: "Foundations of User Stories",
        lessons: [
          { id: "lsn-1", title: "What is a User Story?", type: "study", duration: "12m", summary: "As a / I want / So that — the structure behind every story." },
          { id: "lsn-2", title: "Writing Your First Story", type: "lab", duration: "18m", summary: "The AI coach guides you, pixel-precise, to write a real user story." },
          { id: "lsn-3", title: "Anatomy Check", type: "assessment", duration: "8m", summary: "Identify the role, goal, and benefit in real-world stories." },
        ],
      },
      {
        id: "mod-2",
        title: "Acceptance Criteria & Given-When-Then",
        lessons: [
          { id: "lsn-4", title: "Given-When-Then Explained", type: "study", duration: "14m", summary: "Expressing done as testable conditions." },
          { id: "lsn-5", title: "Coach Me: Acceptance Criteria", type: "lab", duration: "20m", summary: "Add acceptance criteria to a story with live visual guidance." },
          { id: "lsn-6", title: "Talking to a Product Owner", type: "roleplay", duration: "15m", summary: "Refine stories with a simulated stakeholder." },
        ],
      },
      {
        id: "mod-3",
        title: "Refinement & Anti-patterns",
        lessons: [
          { id: "lsn-7", title: "Common Story Smells", type: "study", duration: "10m", summary: "Missing benefit, technical tasks disguised as stories, and more." },
          { id: "lsn-8", title: "Fix My Story", type: "lab", duration: "16m", summary: "The coach points at exactly what's wrong and how to fix it." },
          { id: "lsn-9", title: "Certification Checkpoint", type: "assessment", duration: "12m", summary: "Final knowledge check to unlock your certificate." },
        ],
      },
    ],
  },
  {
    id: "sd-fundamentals",
    title: "System Design Fundamentals",
    description:
      "From single servers to globally distributed systems. Learn to design scalable architectures with live whiteboard diagrams and design reviews.",
    thumbnail: G.sd,
    instructor: "Anil Kapadia",
    platform: "Udemy",
    difficulty: "Intermediate",
    duration: "8h 40m",
    skills: ["Scalability", "Load Balancing", "Caching", "Database Sharding", "CAP Theorem"],
    rating: 4.7,
    ratingCount: 3820,
    modules: [
      {
        id: "mod-1",
        title: "Building Blocks",
        lessons: [
          { id: "lsn-1", title: "The Request Lifecycle", type: "study", duration: "16m", summary: "DNS, CDN, load balancers, app servers, databases." },
          { id: "lsn-2", title: "Draw the Stack", type: "lab", duration: "22m", summary: "Visually assemble a 3-tier architecture with the coach." },
          { id: "lsn-3", title: "Components Quiz", type: "assessment", duration: "8m", summary: "Match responsibilities to components." },
        ],
      },
      {
        id: "mod-2",
        title: "Scaling & Caching",
        lessons: [
          { id: "lsn-4", title: "Horizontal vs Vertical Scaling", type: "study", duration: "14m", summary: "When to scale out vs up." },
          { id: "lsn-5", title: "Caching Strategies", type: "study", duration: "15m", summary: "Write-through, write-back, eviction policies." },
          { id: "lsn-6", title: "Design Review with a Staff Engineer", type: "roleplay", duration: "18m", summary: "Defend your design decisions." },
        ],
      },
      {
        id: "mod-3",
        title: "Distributed Data",
        lessons: [
          { id: "lsn-7", title: "Sharding & Replication", type: "study", duration: "18m", summary: "Partitioning strategies and consistency trade-offs." },
          { id: "lsn-8", title: "CAP & Consistency Models", type: "assessment", duration: "10m", summary: "Choose the right consistency for the workload." },
        ],
      },
    ],
  },
  {
    id: "py-python",
    title: "Python for the Practical Developer",
    description:
      "Hands-on Python from first principles to clean, idiomatic code. Practice in a guided editor while the AI coach points at your mistakes.",
    thumbnail: G.py,
    instructor: "Lena Fischer",
    platform: "YouTube",
    difficulty: "Beginner",
    duration: "6h 5m",
    skills: ["Python Syntax", "Data Structures", "Functions", "Error Handling"],
    rating: 4.6,
    ratingCount: 2110,
    modules: [
      {
        id: "mod-1",
        title: "First Programs",
        lessons: [
          { id: "lsn-1", title: "Variables & Types", type: "study", duration: "12m", summary: "Dynamic typing, numbers, strings, bools." },
          { id: "lsn-2", title: "Write Your First Function", type: "lab", duration: "20m", summary: "The coach visually guides you through a function." },
          { id: "lsn-3", title: "Syntax Check", type: "assessment", duration: "8m", summary: "Spot the bugs." },
        ],
      },
      {
        id: "mod-2",
        title: "Data Structures",
        lessons: [
          { id: "lsn-4", title: "Lists, Dicts, Sets", type: "study", duration: "16m", summary: "When to reach for each." },
          { id: "lsn-5", title: "Debug My Loop", type: "lab", duration: "18m", summary: "Coached debugging of an off-by-one error." },
          { id: "lsn-6", title: "Data Structures Quiz", type: "assessment", duration: "10m", summary: "Pick the right structure." },
        ],
      },
    ],
  },
  {
    id: "ai-eng",
    title: "AI Engineering: Building with LLMs",
    description:
      "Move from prompting to engineering. Tool use, structured outputs, evaluation, and production patterns — all on a live whiteboard.",
    thumbnail: G.ai,
    instructor: "Dr. Sana Iqbal",
    platform: "Documentation",
    difficulty: "Advanced",
    duration: "7h 30m",
    skills: ["LLM Tooling", "Structured Outputs", "Evals", "Agents", "Retrieval"],
    rating: 4.9,
    ratingCount: 960,
    modules: [
      {
        id: "mod-1",
        title: "From Prompting to Engineering",
        lessons: [
          { id: "lsn-1", title: "The Anatomy of an LLM Call", type: "study", duration: "18m", summary: "Tokens, context, sampling, system prompts." },
          { id: "lsn-2", title: "Design a Tool-Use Agent", type: "lab", duration: "24m", summary: "Visually wire function calls together." },
          { id: "lsn-3", title: "Concepts Checkpoint", type: "assessment", duration: "10m", summary: "Core LLM engineering." },
        ],
      },
      {
        id: "mod-2",
        title: "Structured & Evaluated",
        lessons: [
          { id: "lsn-4", title: "Structured Outputs & Schemas", type: "study", duration: "16m", summary: "Constraining the model." },
          { id: "lsn-5", title: "Designing an Eval Harness", type: "lab", duration: "20m", summary: "Measure quality the right way." },
          { id: "lsn-6", title: "Stakeholder Buy-in", type: "roleplay", duration: "14m", summary: "Justify your AI spend." },
        ],
      },
    ],
  },
  {
    id: "sc-scrum",
    title: "Scrum Mastery: Running Ceremonies That Work",
    description:
      "Live the Scrum framework. Practice facilitating ceremonies through realistic roleplay with your AI coach.",
    thumbnail: G.sc,
    instructor: "Marco Bianchi",
    platform: "Udemy",
    difficulty: "Intermediate",
    duration: "5h 50m",
    skills: ["Scrum", "Sprint Planning", "Retrospectives", "Facilitation"],
    rating: 4.5,
    ratingCount: 540,
    modules: [
      {
        id: "mod-1",
        title: "The Framework",
        lessons: [
          { id: "lsn-1", title: "Scrum in 10 Minutes", type: "study", duration: "10m", summary: "Roles, events, artifacts." },
          { id: "lsn-2", title: "Run a Daily Scrum", type: "roleplay", duration: "16m", summary: "Facilitate the daily with the team." },
          { id: "lsn-3", title: "Ceremonies Quiz", type: "assessment", duration: "8m", summary: "Know your events." },
        ],
      },
    ],
  },
  {
    id: "ux-research",
    title: "UX Research Methods for Product Teams",
    description:
      "Choose and run the right research method. Interviews, usability tests, and surveys — coached end to end.",
    thumbnail: G.ux,
    instructor: "Priya Nair",
    platform: "Articles",
    difficulty: "Intermediate",
    duration: "4h 40m",
    skills: ["User Interviews", "Usability Testing", "Synthesis", "Survey Design"],
    rating: 4.7,
    ratingCount: 410,
    modules: [
      {
        id: "mod-1",
        title: "Talking to Users",
        lessons: [
          { id: "lsn-1", title: "The Interview Script", type: "study", duration: "12m", summary: "Open-ended, non-leading questions." },
          { id: "lsn-2", title: "Interview a User", type: "roleplay", duration: "18m", summary: "Practice a discovery interview." },
        ],
      },
    ],
  },
];

export function findCourse(id: string): Course | undefined {
  return SEED_COURSES.find((c) => c.id === id);
}

export function flattenLessons(course: Course) {
  const out: { module: string; moduleId: string; lessonId: string; title: string; type: string; duration: string }[] = [];
  for (const m of course.modules) {
    for (const l of m.lessons) {
      out.push({ module: m.title, moduleId: m.id, lessonId: l.id, title: l.title, type: l.type, duration: l.duration });
    }
  }
  return out;
}

export function nextLesson(course: Course, currentLessonId: string | null) {
  const flat = flattenLessons(course);
  if (!currentLessonId) return flat[0] ?? null;
  const idx = flat.findIndex((l) => l.lessonId === currentLessonId);
  if (idx === -1) return flat[0] ?? null;
  return flat[idx + 1] ?? null;
}