/**
 * Shared domain types for Ctrl+Teach.
 *
 * These are the contracts every feature (onboarding, discovery, the workspace,
 * the learning modes, completion) builds on. Keep them framework-agnostic.
 */

// ── Onboarding preferences ────────────────────────────────────────────────────

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

export type LearningStyle =
  | "Visual learner"
  | "Hands-on learner"
  | "Reading focused"
  | "Conversational"
  | "Project based";

export type TeachingStyle =
  | "Friendly mentor"
  | "Professor"
  | "Technical trainer"
  | "Coach"
  | "Socratic teacher";

export type ContentPlatform =
  | "Ctrl+Teach"
  | "LinkedIn Learning"
  | "Udemy"
  | "YouTube"
  | "GitHub"
  | "freeCodeCamp"
  | "MIT OpenCourseWare"
  | "Documentation"
  | "Blogs"
  | "Articles";

/**
 * Generic onboarding preferences — collected ONCE right after signup.
 *
 * Captures WHO the learner is, WHAT they care about, and WHY they're here.
 * This shapes the empty dashboard, suggested topics, and the clicky
 * assistant's greeting. Course-specific preferences (level, sources, pace,
 * testing style, …) live separately in `CourseOnboardingPrefs` and are
 * collected the first time a learner launches a course.
 */
export interface OnboardingPrefs {
  /** Display name (free text). */
  name: string;
  /** Current role / identity ("Product Manager", "Engineer", "Student", …). */
  role: string;
  /** Topics the learner is interested in — drives suggested-topics + discovery seeds. */
  interests: string[];
  /** What the learner is preparing for — career goal, interview, certification, etc. */
  preparingFor: string;
  /** Set to true once the generic onboarding wizard is complete. */
  onboarded: boolean;
}

/**
 * Course-specific onboarding preferences — collected the first time a
 * learner launches a particular course, then remembered per course.
 *
 * These shape how the workspace is calibrated for THAT course (depth, pace,
 * testing style, content sources to pull from inside lessons).
 */
export interface CourseOnboardingPrefs {
  /** Self-assessed prior knowledge for this course. */
  priorKnowledge: SkillLevel;
  /** Why the learner is taking this specific course. */
  goal: string;
  /** Preferred content sources for this course. */
  sources: ContentPlatform[];
  /** Pace — sessions per week the learner wants. */
  pace: "1–2" | "3–4" | "5+" | "Daily";
  /** Session length in minutes. */
  sessionLength: "15" | "30" | "45" | "60";
  /** How the learner wants to be assessed. */
  testingPref: "Quiz" | "Roleplay" | "Project" | "Mixed";
  /** How the companion should teach this course. */
  teachingStyle: TeachingStyle;
  /** Accountability rituals the learner opted into for this course. */
  accountability: string[];
}

// ── Course catalog ────────────────────────────────────────────────────────────

export type LessonType = "study" | "lab" | "assessment" | "roleplay";

export type LearningResourceKind =
  | "video"
  | "documentation"
  | "article"
  | "course"
  | "repository";

export interface LearningResource {
  id: string;
  title: string;
  provider: string;
  kind: LearningResourceKind;
  url: string;
  description?: string;
  reason?: string;
}

export interface RoleplayScenario {
  name: string;
  role: string;
  initials: string;
  opener: string;
  followUps: string[];
  critique: string[];
}

export interface WhiteboardTeachingPlan {
  objective: string;
  beats: string[];
  visualElements: string[];
}

export interface LabBlueprint {
  scenario: string;
  task: string;
  starterContext: string;
  deliverable: string;
  successCriteria: string[];
}

export interface CertificateCriteria {
  title: string;
  requiredScore: number;
  requiredArtifacts: string[];
  skills: string[];
  statement: string;
}

export interface CourseSource {
  type: "url" | "syllabus" | "prompt" | "curriculum";
  label: string;
  url?: string | null;
}

export interface CourseCitation {
  id: string;
  title: string;
  url: string;
}

export interface GeneratedImageAsset {
  id: string;
  status: "ready";
  url: string;
  alt: string;
  caption: string;
  prompt: string;
  width: number;
  height: number;
  contentType: "image/webp" | string;
  sizeBytes: number;
}

interface ContentBlockBase {
  id: string;
  heading?: string;
  citationIds?: string[];
}

export interface TextContentBlock extends ContentBlockBase {
  type: "content";
  heading: string;
  paragraphs: string[];
}

export interface GridCardsContentBlock extends ContentBlockBase {
  type: "grid_cards";
  heading: string;
  cards: { title: string; body: string }[];
}

export interface InfoTabsContentBlock extends ContentBlockBase {
  type: "info_tabs";
  heading: string;
  tabs: { label: string; paragraphs: string[] }[];
}

export interface FlipCardsContentBlock extends ContentBlockBase {
  type: "flip_cards";
  heading: string;
  cards: { front: string; back: string }[];
}

export interface QuizContentBlock extends ContentBlockBase {
  type: "quiz";
  heading: string;
  questions: QuizQuestion[];
}

export interface NumberedListContentBlock extends ContentBlockBase {
  type: "numbered_list";
  heading: string;
  items: { title: string; body: string }[];
}

export interface HtmlContentBlock extends ContentBlockBase {
  type: "html";
  heading: string;
  html: string;
  accessibilitySummary: string;
  height: number;
}

export interface ImageContentBlock extends ContentBlockBase {
  type: "image";
  asset: GeneratedImageAsset;
}

export type CourseContentBlock =
  | TextContentBlock
  | GridCardsContentBlock
  | InfoTabsContentBlock
  | FlipCardsContentBlock
  | QuizContentBlock
  | NumberedListContentBlock
  | HtmlContentBlock
  | ImageContentBlock;

export interface RichCourseOverview {
  audience: string;
  outcomes: string[];
  prerequisites: string[];
  estimatedTime: string;
}

export interface Lesson {
  id: string;
  title: string;
  type: LessonType;
  duration: string;
  summary: string;
  resources?: LearningResource[];
  assessment?: QuizQuestion[];
  roleplay?: RoleplayScenario;
  whiteboardPlan?: WhiteboardTeachingPlan;
  lab?: LabBlueprint;
  contentBlocks?: CourseContentBlock[];
  done?: boolean;
  bookmarked?: boolean;
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  instructor: string;
  platform: ContentPlatform;
  difficulty: SkillLevel;
  duration: string;
  skills: string[];
  rating: number;
  ratingCount: number;
  url?: string;
  sourceCount?: number;
  goal?: string;
  source?: CourseSource;
  status?: "draft" | "published" | "ready";
  format?: "rich";
  overview?: RichCourseOverview;
  citations?: CourseCitation[];
  coverImage?: GeneratedImageAsset;
  certificateCriteria?: CertificateCriteria;
  modules: Module[];
}

// ── Transcript / chat ──────────────────────────────────────────────────────────

export interface TranscriptEntry {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  agentName?: string;
  partial?: boolean;
  timestamp: number;
}

// ── Assessment ─────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

// ── Lab Mode coaching scenes (the hero) ──────────────────────────────────────
//
// A Lab scene is a sequence of coaching "steps" the AI coach walks through.
// Each step targets a DOM element (by CSS selector) and renders pixel-precise
// annotations: arrows, circles, pulsing hotspots, hint cards, dim/focus, etc.
// Inspired by Clicky's `[POINT:x,y:label]` + bezier-arc flight, but ported to
// the browser: targets are resolved from live element rects so they stay
// pixel-accurate even as the practice surface reflows.

export type AnnotationKind =
  | "arrow"
  | "circle"
  | "hotspot"
  | "label"
  | "hint"
  | "focus"
  | "celebrate"
  | "dim";

export interface Annotation {
  kind: AnnotationKind;
  /** CSS selector of the target element. */
  selector: string;
  /** For arrows: the source selector (defaults to the coach cursor). */
  fromSelector?: string;
  /** Label text for labels / hint cards / mistakes. */
  text?: string;
  /** Optional sub-kind, e.g. "missing", "success", "tip". */
  tone?: "neutral" | "success" | "warning" | "info";
  /** Delay (ms) before this annotation appears, for staggered reveals. */
  delay?: number;
}

export interface LabStep {
  id: string;
  /** Coach spoken line, shown in the companion bubble + stepper. */
  coachLine: string;
  annotations: Annotation[];
  /** Auto-advance after this many ms (undefined = wait for user action). */
  autoAdvanceMs?: number;
}

export interface LabScene {
  id: string;
  title: string;
  /** Practice surface id — which mock app to render. */
  surface: "user-story" | "jira-board" | "code-editor";
  steps: LabStep[];
}

// ── Progress / gamification ───────────────────────────────────────────────────

export interface ProgressState {
  xp: number;
  streak: number;
  confidence: number;
  completedLessons: string[];
  checkpoints: string[];
  badges: Badge[];
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  earnedAt?: number;
}
