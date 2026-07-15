import type {
  Course,
  LearnerSkillProfile,
  LearningMemory,
  LearningMemoryKind,
  LearningMemorySignal,
  Lesson,
  OnboardingPrefs,
  SkillEvidence,
} from "@/lib/types";

export const MAX_LEARNING_MEMORIES = 60;

const MEMORY_KINDS = new Set<LearningMemoryKind>([
  "interest",
  "lesson",
  "assessment",
  "lab",
  "roleplay",
]);
const MEMORY_SIGNALS = new Set<LearningMemorySignal>([
  "interest",
  "progress",
  "strength",
  "growth",
]);

interface LearningContext {
  course: Course | null;
  lesson: Lesson | null;
  skills: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function uniqueStrings(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item, 120)).filter(Boolean))).slice(0, maxItems);
}

function memoryId(kind: LearningMemoryKind, courseId: string, lessonId: string, unique = false) {
  const base = `${kind}:${courseId || "course"}:${lessonId || "activity"}`;
  return unique ? `${base}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}` : base;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

function skillsForLesson(course: Course, lesson: Lesson): string[] {
  if (!course.skills.length) return [lesson.title];
  const lessonText = `${lesson.title} ${lesson.summary}`.toLowerCase();
  const matches = course.skills
    .map((skill) => ({
      skill,
      score: words(skill).reduce((total, word) => total + (lessonText.includes(word) ? 1 : 0), 0),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((match) => match.skill);
  if (matches.length) return matches.slice(0, 2);

  const lessons = course.modules.flatMap((module) => module.lessons);
  const lessonIndex = Math.max(0, lessons.findIndex((item) => item.id === lesson.id));
  return [course.skills[lessonIndex % course.skills.length]];
}

export function resolveLearningContext(
  courses: Course[],
  activeCourseId: string | null,
  lessonId: string,
  requestedCourseId?: string,
): LearningContext {
  const targetCourseId = requestedCourseId || activeCourseId;
  const matchingCourses = courses.filter((item) =>
    item.modules.some((module) => module.lessons.some((lesson) => lesson.id === lessonId))
  );
  const course = targetCourseId
    ? courses.find((item) => item.id === targetCourseId) ?? null
    : matchingCourses.length === 1
      ? matchingCourses[0]
      : null;
  const lesson = course?.modules
    .flatMap((module) => module.lessons)
    .find((item) => item.id === lessonId) ?? null;
  return {
    course,
    lesson,
    skills: course && lesson ? skillsForLesson(course, lesson) : [],
  };
}

export function createInterestMemory(prefs: OnboardingPrefs): LearningMemory | null {
  if (!prefs.interests.length) return null;
  return {
    id: "interest:learner-profile",
    kind: "interest",
    signal: "interest",
    title: "Shared learning interests",
    summary: `Interested in ${prefs.interests.slice(0, 4).join(", ")}.`,
    createdAt: Date.now(),
    skills: [],
    evidence: prefs.interests.slice(0, 6),
  };
}

export function createLessonMemory(context: LearningContext): LearningMemory | null {
  if (!context.course || !context.lesson) return null;
  const { course, lesson, skills } = context;
  const kind: LearningMemoryKind = lesson.type === "study" ? "lesson" : lesson.type;
  const activityLabel = lesson.type === "study"
    ? "lesson"
    : lesson.type === "assessment"
      ? "assessment"
      : lesson.type;
  return {
    id: memoryId(kind, course.id, lesson.id),
    kind,
    signal: "progress",
    title: `Completed ${lesson.title}`,
    summary: `Finished the ${activityLabel} in ${course.title}.`,
    createdAt: Date.now(),
    courseId: course.id,
    courseTitle: course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    skills,
    evidence: [`Completed ${lesson.type} activity`],
  };
}

export function createAssessmentMemory(
  context: LearningContext,
  result: { score: number; confidence?: number; correct: number; total: number },
): LearningMemory | null {
  if (!context.course || !context.lesson) return null;
  const { course, lesson, skills } = context;
  const score = clamp(Math.round(result.score), 0, 100);
  const confidence = typeof result.confidence === "number" && Number.isFinite(result.confidence)
    ? clamp(Math.round(result.confidence), 1, 5)
    : undefined;
  const signal: LearningMemorySignal = score >= 80 ? "strength" : score < 65 ? "growth" : "progress";
  const calibration = confidence === undefined ? null : Math.round(score / 20) - confidence;
  const calibrationText = calibration === null
    ? ""
    : calibration > 0
      ? " Performance was stronger than self-confidence."
      : calibration < 0
        ? " Confidence was ahead of the measured result."
        : " Confidence matched the measured result.";
  return {
    id: memoryId("assessment", course.id, lesson.id, true),
    kind: "assessment",
    signal,
    title: `${score}% on ${lesson.title}`,
    summary: `${result.correct} of ${result.total} correct.${calibrationText}`,
    createdAt: Date.now(),
    courseId: course.id,
    courseTitle: course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    skills,
    score,
    confidence,
    evidence: [
      `${result.correct}/${result.total} correct`,
      ...(confidence === undefined ? [] : [`Confidence ${confidence}/5`]),
    ],
  };
}

export function createPracticeMemory(
  context: LearningContext,
  kind: "lab" | "roleplay",
  summary: string,
  evidence: string[],
): LearningMemory | null {
  if (!context.course || !context.lesson) return null;
  const { course, lesson, skills } = context;
  return {
    id: memoryId(kind, course.id, lesson.id, true),
    kind,
    signal: "progress",
    title: kind === "lab" ? `Applied ${lesson.title}` : `Practiced ${lesson.title}`,
    summary: cleanText(summary, 320),
    createdAt: Date.now(),
    courseId: course.id,
    courseTitle: course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    skills,
    evidence: uniqueStrings(evidence, 5),
  };
}

export function createFeedbackMemory(
  context: LearningContext,
  feedback: string,
): LearningMemory | null {
  if (!context.course || !context.lesson) return null;
  const summary = cleanText(feedback, 400);
  if (!summary) return null;
  const reflectsStruggle = /\b(confus|difficult|hard|stuck|struggl|tough|unclear)\w*/i.test(summary);
  const { course, lesson, skills } = context;
  return {
    id: memoryId("lesson", course.id, lesson.id, true),
    kind: "lesson",
    signal: reflectsStruggle ? "growth" : "progress",
    title: `Reflected on ${lesson.title}`,
    summary,
    createdAt: Date.now(),
    courseId: course.id,
    courseTitle: course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    skills,
    evidence: ["Learner-submitted reflection"],
  };
}

export function appendLearningMemory(memories: LearningMemory[], memory: LearningMemory | null) {
  if (!memory) return memories;
  return [memory, ...memories.filter((item) => item.id !== memory.id)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_LEARNING_MEMORIES);
}

export function sanitizeLearningMemories(value: unknown): LearningMemory[] {
  if (!Array.isArray(value)) return [];
  const memories: LearningMemory[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const kind = cleanText(raw.kind, 24) as LearningMemoryKind;
    const signal = cleanText(raw.signal, 24) as LearningMemorySignal;
    const id = cleanText(raw.id, 220);
    const title = cleanText(raw.title, 180);
    const summary = cleanText(raw.summary, 400);
    const createdAt = Number(raw.createdAt);
    if (!id || !title || !summary || !MEMORY_KINDS.has(kind) || !MEMORY_SIGNALS.has(signal) || !Number.isFinite(createdAt)) continue;
    const score = Number(raw.score);
    const confidence = Number(raw.confidence);
    memories.push({
      id,
      kind,
      signal,
      title,
      summary,
      createdAt: clamp(Math.round(createdAt), 0, Date.now() + 5 * 60_000),
      courseId: cleanText(raw.courseId, 180) || undefined,
      courseTitle: cleanText(raw.courseTitle, 180) || undefined,
      lessonId: cleanText(raw.lessonId, 180) || undefined,
      lessonTitle: cleanText(raw.lessonTitle, 180) || undefined,
      skills: uniqueStrings(raw.skills),
      score: Number.isFinite(score) ? clamp(Math.round(score), 0, 100) : undefined,
      confidence: Number.isFinite(confidence) ? clamp(Math.round(confidence), 1, 5) : undefined,
      evidence: uniqueStrings(raw.evidence, 5),
    });
  }
  return mergeLearningMemories([], memories);
}

export function mergeLearningMemories(local: LearningMemory[], remote: LearningMemory[]) {
  const merged = new Map<string, LearningMemory>();
  for (const memory of [...remote, ...local]) {
    const existing = merged.get(memory.id);
    if (!existing || memory.createdAt >= existing.createdAt) merged.set(memory.id, memory);
  }
  return Array.from(merged.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_LEARNING_MEMORIES);
}

export function deriveSkillProfile(
  memories: LearningMemory[],
  prefs: OnboardingPrefs | null,
): LearnerSkillProfile {
  const aggregates = new Map<string, {
    name: string;
    count: number;
    weight: number;
    practical: number;
    scores: number[];
    lastObservedAt: number;
  }>();

  for (const memory of memories) {
    for (const name of new Set(memory.skills)) {
      const key = name.toLowerCase();
      const aggregate = aggregates.get(key) ?? {
        name,
        count: 0,
        weight: 0,
        practical: 0,
        scores: [],
        lastObservedAt: 0,
      };
      aggregate.count += 1;
      aggregate.weight += memory.kind === "assessment" ? 3 : memory.kind === "lab" || memory.kind === "roleplay" ? 2 : 1;
      aggregate.practical += memory.kind === "lab" || memory.kind === "roleplay" ? 1 : 0;
      if (typeof memory.score === "number") aggregate.scores.push(memory.score);
      aggregate.lastObservedAt = Math.max(aggregate.lastObservedAt, memory.createdAt);
      aggregates.set(key, aggregate);
    }
  }

  const skills: SkillEvidence[] = Array.from(aggregates.values()).map((aggregate) => {
    const averageScore = aggregate.scores.length
      ? Math.round(aggregate.scores.reduce((total, score) => total + score, 0) / aggregate.scores.length)
      : undefined;
    const hasRepeatedAssessmentEvidence = aggregate.scores.length >= 2;
    const hasBlendedEvidence = aggregate.scores.length >= 1 && aggregate.practical >= 1;
    const status = typeof averageScore === "number" && averageScore < 65
      ? "focus" as const
      : (typeof averageScore === "number" && averageScore >= 80 && (hasRepeatedAssessmentEvidence || hasBlendedEvidence))
          || (aggregate.practical >= 2 && aggregate.count >= 3)
        ? "strength" as const
        : "building" as const;
    const profileConfidence = Math.min(95, 20 + aggregate.weight * 12 + (aggregate.scores.length ? 10 : 0));
    const reason = status === "focus"
      ? `Assessment evidence averages ${averageScore}%. A focused review is recommended.`
      : status === "strength" && typeof averageScore === "number"
        ? `Assessment evidence averages ${averageScore}% across ${aggregate.scores.length} attempt${aggregate.scores.length === 1 ? "" : "s"}.`
        : status === "strength"
          ? `Applied in ${aggregate.practical} practical activities with consistent follow-through.`
          : `Observed in ${aggregate.count} learning activit${aggregate.count === 1 ? "y" : "ies"}; more evidence will sharpen the profile.`;
    return {
      name: aggregate.name,
      status,
      evidenceCount: aggregate.count,
      profileConfidence,
      lastObservedAt: aggregate.lastObservedAt,
      averageScore,
      reason,
    };
  }).sort((a, b) => b.profileConfidence - a.profileConfidence || b.lastObservedAt - a.lastObservedAt);

  return {
    interests: prefs?.interests ?? [],
    skills,
    strengths: skills.filter((skill) => skill.status === "strength"),
    building: skills.filter((skill) => skill.status === "building"),
    focusAreas: skills.filter((skill) => skill.status === "focus"),
    memoryCount: memories.length,
    assessmentCount: memories.filter((memory) => memory.kind === "assessment").length,
    practicalCount: memories.filter((memory) => memory.kind === "lab" || memory.kind === "roleplay").length,
    lastUpdatedAt: memories[0]?.createdAt ?? null,
  };
}
