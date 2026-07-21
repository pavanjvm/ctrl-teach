"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { CircleAlert, Loader2 } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import CourseOverviewView from "@/components/courses/CourseOverviewView";
import { useLearner } from "@/lib/learner";
import { fetchAvailableCourse } from "@/lib/generatedCourses";
import type { Course } from "@/lib/types";

import "./rich-course.css";

export default function RichCourseOverviewPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { addCourse, setActiveCourse, isLessonComplete } = useLearner();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const nextCourse = await fetchAvailableCourse(params.courseId, token, true);
      if (!nextCourse) {
        router.replace(`/library?generation=${params.courseId}`);
        return;
      }
      setCourse(nextCourse);
      setError(null);
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) ? String(loadError.response?.data?.detail || "Course not found.") : "Course not found.");
    } finally {
      setLoading(false);
    }
  }, [getToken, params.courseId, router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!course?.partial) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [course?.partial, load]);

  const lessons = useMemo(() => course?.modules.flatMap((module) => module.lessons) ?? [], [course]);
  const completed = course
    ? lessons.filter((lesson) => isLessonComplete(course.id, lesson.id)).length
    : 0;
  const firstIncomplete = course
    ? lessons.find((lesson) => lesson.status !== "pending" && !isLessonComplete(course.id, lesson.id))
      ?? lessons.find((lesson) => lesson.status !== "pending")
    : lessons[0];
  const allComplete = lessons.length > 0 && completed === lessons.length;

  function start() {
    if (!course || !firstIncomplete) return;
    addCourse(course);
    setActiveCourse(course.id, firstIncomplete.id);
    router.push(allComplete ? "/learn/completion" : `/learn/${course.id}/${firstIncomplete.id}`);
  }

  if (loading) return <div className="rich-load"><Loader2 className="rich-spin" size={25} /> Loading your course…</div>;
  if (error || !course) return <div className="rich-load rich-load-error"><CircleAlert size={22} /> {error || "Course not found."}</div>;

  return (
    <CourseOverviewView
      course={course}
      completed={completed}
      isLessonComplete={(lessonId) => isLessonComplete(course.id, lessonId)}
      onBack={() => router.push("/library")}
      onStart={start}
      onSelectLesson={(_, lessonId) => {
        const selected = lessons.find((lesson) => lesson.id === lessonId);
        if (selected?.status !== "pending") router.push(`/learn/${course.id}/${lessonId}`);
      }}
    />
  );
}
