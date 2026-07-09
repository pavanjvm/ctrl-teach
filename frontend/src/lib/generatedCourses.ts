import { API_URL } from "@/lib/constants";
import type { Course } from "@/lib/types";

export type GeneratedCourseStatus =
  | "intake"
  | "researching"
  | "generating"
  | "generating_images"
  | "ready"
  | "failed";

export interface IntakeQuestion {
  id: string;
  prompt: string;
  kind: "single_select" | "multi_select" | "short_text";
  options: string[];
  required: boolean;
}

export interface GenerationProgress {
  stage: string;
  percent: number;
  message: string;
}

export interface GeneratedCourseJob {
  id: string;
  status: GeneratedCourseStatus;
  topic: string;
  summary: string;
  questions?: IntakeQuestion[];
  answers?: Record<string, string | string[]>;
  interviewComplete?: boolean;
  progress: GenerationProgress;
  course?: Course | null;
  partialCourse?: Course | null;
  error?: string | null;
  sourceType?: string;
  sourceLabel?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function assetUrl(path?: string | null): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function isGenerationActive(status: GeneratedCourseStatus): boolean {
  return ["researching", "generating", "generating_images"].includes(status);
}
