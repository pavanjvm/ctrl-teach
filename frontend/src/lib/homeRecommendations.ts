import type {
  Course,
  LearnerSkillProfile,
  OnboardingPrefs,
} from "@/lib/types";

export interface CprimeCourseRecommendation {
  id: string;
  title: string;
  summary: string;
  category: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  duration: string;
  tags: string[];
  prompt: string;
}

export interface RankedCourseRecommendation {
  course: Course;
  reason: string;
  score: number;
}

export interface RankedCprimeRecommendation {
  course: CprimeCourseRecommendation;
  reason: string;
  score: number;
}

interface RecommendationSignals {
  prefs: OnboardingPrefs | null;
  skillProfile: LearnerSkillProfile;
  activeCourse: Course | null;
  completedCourses: Course[];
}

const GENERIC_RECOMMENDATION_WORDS = new Set([
  "and",
  "building",
  "course",
  "for",
  "from",
  "fundamentals",
  "learning",
  "mastery",
  "practical",
  "that",
  "the",
  "with",
  "work",
]);

const MEANINGFUL_SHORT_WORDS = new Set(["ai", "ba", "bi", "ux"]);

export const CPRIME_COURSES: CprimeCourseRecommendation[] = [
  {
    id: "cprime-effective-user-stories",
    title: "Effective User Stories",
    summary: "Write focused stories, testable acceptance criteria, and clearer requirements with your team.",
    category: "Business analysis",
    difficulty: "Intermediate",
    duration: "1 day",
    tags: ["User Stories", "Acceptance Criteria", "Product Ownership", "Agile", "Requirements"],
    prompt: "Create a Cprime-style Effective User Stories course that teaches practical story writing, acceptance criteria, splitting techniques, and coached team exercises.",
  },
  {
    id: "cprime-agentic-openai",
    title: "Building Agentic Apps with the OpenAI SDK",
    summary: "Design reliable tool-using agents, structured workflows, guardrails, and production evaluations.",
    category: "Data and AI",
    difficulty: "Advanced",
    duration: "2 days",
    tags: ["AI", "Agents", "OpenAI", "LLM Tooling", "Structured Outputs", "Evals"],
    prompt: "Create a Cprime-style Building Agentic Apps with the OpenAI SDK course covering tool use, structured outputs, multi-step workflows, guardrails, evaluation, and a production capstone.",
  },
  {
    id: "cprime-jira-agile",
    title: "Jira and Agile Projects",
    summary: "Build practical Jira workflows that support backlogs, sprint delivery, reporting, and team collaboration.",
    category: "Atlassian",
    difficulty: "Beginner",
    duration: "1 day",
    tags: ["Jira", "Agile", "Scrum", "Backlog Grooming", "Sprint Planning", "Product Management"],
    prompt: "Create a Cprime-style Jira and Agile Projects course with guided practice for backlogs, boards, sprint workflows, issue types, filters, and reporting.",
  },
];

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => (
        !GENERIC_RECOMMENDATION_WORDS.has(token)
        && (token.length > 2 || MEANINGFUL_SHORT_WORDS.has(token))
      )),
  );
}

function overlaps(left: string[], right: string[]): boolean {
  const leftTokens = tokens(left.join(" "));
  const rightTokens = tokens(right.join(" "));
  return Array.from(leftTokens).some((token) => rightTokens.has(token));
}

function courseTerms(course: Course): string[] {
  return [course.title, ...course.skills];
}

function scoreTerms(terms: string[], signals: RecommendationSignals): { score: number; reason: string } {
  const completedMatch = signals.completedCourses.find((course) =>
    overlaps(terms, courseTerms(course)),
  );
  if (completedMatch) {
    return { score: 60, reason: `Because you completed ${completedMatch.title}` };
  }

  if (signals.activeCourse && overlaps(terms, courseTerms(signals.activeCourse))) {
    return { score: 50, reason: `Because you are studying ${signals.activeCourse.title}` };
  }

  const focusMatch = signals.skillProfile.focusAreas.find((skill) =>
    overlaps(terms, [skill.name]),
  );
  if (focusMatch) {
    return { score: 40, reason: `Strengthen your ${focusMatch.name} skills` };
  }

  const interestMatch = signals.prefs?.interests.find((interest) =>
    overlaps(terms, [interest]),
  );
  if (interestMatch) {
    return { score: 30, reason: `Matches your interest in ${interestMatch}` };
  }

  if (signals.prefs?.preparingFor && overlaps(terms, [signals.prefs.preparingFor])) {
    return { score: 20, reason: `Supports your goal: ${signals.prefs.preparingFor}` };
  }

  if (signals.prefs?.role && overlaps(terms, [signals.prefs.role])) {
    return { score: 10, reason: `Relevant to your work as ${signals.prefs.role}` };
  }

  return { score: 0, reason: "Featured for Ctrl+Teach learners" };
}

export function rankCourseRecommendations(
  courses: Course[],
  startedCourseIds: Set<string>,
  signals: RecommendationSignals,
  limit = 3,
): RankedCourseRecommendation[] {
  return courses
    .filter((course) => !startedCourseIds.has(course.id))
    .map((course) => ({ course, ...scoreTerms(courseTerms(course), signals) }))
    .sort((left, right) => (
      right.score - left.score
      || right.course.rating - left.course.rating
      || left.course.title.localeCompare(right.course.title)
    ))
    .slice(0, limit);
}

export function rankCprimeRecommendations(
  signals: RecommendationSignals,
): RankedCprimeRecommendation[] {
  return CPRIME_COURSES
    .map((course) => ({
      course,
      ...scoreTerms([course.title, ...course.tags], signals),
    }))
    .sort((left, right) => right.score - left.score || left.course.title.localeCompare(right.course.title));
}

export function cprimeDiscoverUrl(course: CprimeCourseRecommendation): string {
  return `/discover?prompt=${encodeURIComponent(course.prompt)}&source=cprime`;
}
