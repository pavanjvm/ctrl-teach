/**
 * Built-in course catalog.
 *
 * Courses are intentionally empty until the replacement Cprime catalog is
 * ready. Admin-published and learner-generated courses are loaded separately.
 */

import type { Course } from "@/lib/types";

export const SEED_COURSES: Course[] = [];

export function findCourse(id: string): Course | undefined {
  return SEED_COURSES.find((course) => course.id === id);
}

export function flattenLessons(course: Course) {
  const lessons: {
    module: string;
    moduleId: string;
    lessonId: string;
    title: string;
    type: string;
    duration: string;
  }[] = [];

  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      lessons.push({
        module: module.title,
        moduleId: module.id,
        lessonId: lesson.id,
        title: lesson.title,
        type: lesson.type,
        duration: lesson.duration,
      });
    }
  }

  return lessons;
}

export function nextLesson(course: Course, currentLessonId: string | null) {
  const lessons = flattenLessons(course);
  if (!currentLessonId) return lessons[0] ?? null;
  const currentIndex = lessons.findIndex((lesson) => lesson.lessonId === currentLessonId);
  if (currentIndex === -1) return lessons[0] ?? null;
  return lessons[currentIndex + 1] ?? null;
}
