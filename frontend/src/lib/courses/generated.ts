import axios from "axios";
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
  archivedAt?: string | null;
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

/** Load either a learner-owned generation or a published platform course. */
export async function fetchAvailableCourse(
  courseId: string,
  authorization?: string | null,
  allowPartial = false,
): Promise<Course | null> {
  try {
    const generated = await axios.get<GeneratedCourseJob>(
      `${API_URL}/api/generated-courses/${courseId}`,
      { headers: authorization ? { Authorization: authorization } : undefined },
    );
    if (generated.data.course) return generated.data.course;
    return allowPartial ? generated.data.partialCourse ?? null : null;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : null;
    if (status !== 403 && status !== 404) throw error;
  }

  const published = await axios.get<{ course: Course }>(
    `${API_URL}/api/platform-courses/${courseId}`,
  );
  return published.data.course ?? null;
}
