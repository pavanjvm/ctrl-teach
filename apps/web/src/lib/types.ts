/**
 * Shared domain types for Ctrl+Teach.
 *
 * These are the contracts every feature (onboarding, discovery, the workspace,
 * the learning modes, completion) builds on. Keep them framework-agnostic.
 */

// ── Onboarding preferences ────────────────────────────────────────────────────

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

export type LearningPreference =
  | "Visual explanations"
  | "Hands-on practice"
  | "Reading"
  | "Live, interactive teaching";

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
  | "Cprime Learning"
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
 * This shapes the empty dashboard, suggested topics, and the tars
 * assistant's greeting. Course-specific preferences (level, sources, pace,
 * testing style, …) live separately in `CourseOnboardingPrefs` and are
 * collected the first time a learner launches a course.
 */
export interface OnboardingPrefs {
  /** Display name (free text). */
  name: string;
  /** Current role / identity ("Product Manager", "Engineer", "Student", …). */
  role: string;
  /** Self-described experience used to calibrate roadmap recommendations. */
  experienceLevel: SkillLevel | "";
  /** The outcome the learner wants, expressed in their own words. */
  careerGoal: string;
  /** Preferred learning formats; multiple selections are allowed. */
  learningPreferences: LearningPreference[];
  /** Realistic weekly time available for this goal. */
  availableHoursPerWeek: number;
  /** Topics the learner is interested in — drives suggested-topics + discovery seeds. */
  interests: string[];
  /** What the learner is preparing for — career goal, interview, certification, etc. */
  preparingFor: string;
  /** Set to true once the generic onboarding wizard is complete. */
  onboarded: boolean;
}

// ── Learner memory + skill profile ──────────────────────────────────────────

/** A truthful observation captured from an activity the learner completed. */
export type LearningMemoryKind =
  | "interest"
  | "lesson"
  | "assessment"
  | "lab"
  | "roleplay";

export type LearningMemorySignal =
  | "interest"
  | "progress"
  | "strength"
  | "growth";

export interface LearningMemory {
  id: string;
  /** Stable source activity id used to upsert server-backed observations. */
  activityId?: string;
  kind: LearningMemoryKind;
  signal: LearningMemorySignal;
  title: string;
  summary: string;
  createdAt: number;
  courseId?: string;
  courseTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  skills: string[];
  score?: number;
  confidence?: number;
  evidence?: string[];
  recovery?: BrowserLabRecoveryMemory;
}

export interface BrowserLabRecoveryMemoryCycle {
  recoveryId: string;
  gapKey: string;
  failedStepId: string;
  failedStepInstruction: string;
  misconception: string;
  practiceAttempts: number;
  finalOutcome: string;
}

/** Structured browser-lab evidence retained alongside the readable memory. */
export interface BrowserLabRecoveryMemory {
  type: "browser_lab";
  attemptId: string;
  finalOutcome: string;
  cycles: BrowserLabRecoveryMemoryCycle[];
}

export type SkillEvidenceStatus = "strength" | "building" | "focus";

/** A derived view of the evidence log. This is never stored as ground truth. */
export interface SkillEvidence {
  name: string;
  status: SkillEvidenceStatus;
  evidenceCount: number;
  profileConfidence: number;
  lastObservedAt: number;
  averageScore?: number;
  reason: string;
}

export interface LearnerSkillProfile {
  interests: string[];
  skills: SkillEvidence[];
  strengths: SkillEvidence[];
  building: SkillEvidence[];
  focusAreas: SkillEvidence[];
  memoryCount: number;
  assessmentCount: number;
  practicalCount: number;
  lastUpdatedAt: number | null;
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

export interface BrowserLabAssertion {
  id: string;
  kind:
    | "visit_host"
    | "url_contains"
    | "click_text"
    | "input_changed"
    | "page_text"
    | "interaction_observed"
    | "structured_state";
  value?: string;
  description: string;
}

export interface BrowserLabStep {
  id: string;
  instruction: string;
  expectedEvidence: string;
  assertionIds?: string[];
}

export interface BrowserLabBlueprint {
  workflow?: string;
  platformId: string;
  platform?: string;
  launchUrl: string;
  allowedHosts: string[];
  objective: string;
  prerequisites?: string[];
  steps: BrowserLabStep[];
  successCriteria: string[];
  cleanupSteps: BrowserLabStep[];
  taskAssertions: BrowserLabAssertion[];
  cleanupAssertions: BrowserLabAssertion[];
  estimatedDuration?: string;
}

export type BrowserLabRecoveryStatus =
  | "practicing"
  | "retry_ready"
  | "retrying"
  | "resolved"
  | "retry_failed"
  | string;

export interface BrowserLabRecoveryPracticeAttempt {
  id: string;
  correct: boolean;
  feedback: string;
  createdAt: string;
}

export interface BrowserLabRecovery {
  id: string;
  status: BrowserLabRecoveryStatus;
  failedStep: BrowserLabStep;
  gapKey: string;
  misconception: {
    title: string;
    explanation: string;
    evidenceSummary: string;
  };
  microLesson: WhiteboardTeachingPlan;
  practiceTask: {
    prompt: string;
    options: Array<{ id: string; label: string }>;
  };
  practiceAttempts: BrowserLabRecoveryPracticeAttempt[];
  missingAssertionIds: string[];
  finalOutcome?: string | null;
}

export interface BrowserLabAttemptVerification {
  taskComplete?: boolean;
  cleanupComplete?: boolean;
  evidenceCount?: number;
  taskAssertions?: Record<string, boolean>;
  cleanupAssertions?: Record<string, boolean>;
}

export interface BrowserLabAttempt {
  id: string;
  status: "running" | "recovering" | "needs_cleanup" | "verified" | string;
  launchUrl: string;
  plan: BrowserLabBlueprint;
  verification?: BrowserLabAttemptVerification;
  evidenceCount?: number;
  activeRecovery?: BrowserLabRecovery | null;
  recoveryHistory?: BrowserLabRecovery[];
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
  status: "ready" | "pending";
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
  status?: "pending";
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
  browserLab?: BrowserLabBlueprint;
  sourceLessonId?: string;
  contentBlocks?: CourseContentBlock[];
  status?: "ready" | "pending";
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
  status?: "draft" | "published" | "ready" | "generating";
  partial?: boolean;
  completedLessonCount?: number;
  totalLessonCount?: number;
  estimatedMinutes?: number;
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
// Inspired by Tars's `[POINT:x,y:label]` + bezier-arc flight, but ported to
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
  /** Local calendar date of the most recent completed lesson (YYYY-MM-DD). */
  lastActivityDate?: string;
  /** First completion timestamp for each course, keyed by course id. */
  courseCompletedAt?: Record<string, number>;
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
