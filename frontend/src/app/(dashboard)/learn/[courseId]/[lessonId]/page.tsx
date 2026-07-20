"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CircleAlert, Loader2 } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import CourseBlockRenderer, { type QuizProgress } from "@/components/courses/CourseBlockRenderer";
import CourseLessonView from "@/components/courses/CourseLessonView";
import BrowserLabPanel from "@/components/learn/BrowserLabPanel";
import { fetchAvailableCourse } from "@/lib/generatedCourses";
import { useLearner } from "@/lib/learner";
import type { BrowserLabAttempt, BrowserLabRecoveryMemory, Course } from "@/lib/types";

import "../rich-course.css";

function recoveryMemory(attempt: BrowserLabAttempt): BrowserLabRecoveryMemory | undefined {
  const cycles = (attempt.recoveryHistory ?? []).map((recovery) => ({
    recoveryId: recovery.id,
    gapKey: recovery.gapKey,
    failedStepId: recovery.failedStep.id,
    failedStepInstruction: recovery.failedStep.instruction,
    misconception: recovery.misconception.title,
    practiceAttempts: recovery.practiceAttempts.length,
    finalOutcome: recovery.finalOutcome || recovery.status,
  }));
  if (!cycles.length) return undefined;
  return {
    type: "browser_lab",
    attemptId: attempt.id,
    finalOutcome: attempt.status,
    cycles,
  };
}

export default function RichLessonPage() {
  const params = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const {
    addCourse,
    setActiveCourse,
    setActiveLesson,
    completeLesson,
    isLessonComplete,
    recordAssessmentResult,
    recordPracticeResult,
  } = useLearner();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quizProgress, setQuizProgress] = useState<Record<string, QuizProgress>>({});
  const [browserLabVerified, setBrowserLabVerified] = useState(false);
  const hydratedRef = useRef("");

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const nextCourse = await fetchAvailableCourse(params.courseId, token);
      if (!nextCourse) {
        router.replace(`/library?generation=${params.courseId}`);
        return;
      }
      setCourse(nextCourse);
      const hydrationKey = `${nextCourse.id}:${params.lessonId}`;
      if (hydratedRef.current !== hydrationKey) {
        hydratedRef.current = hydrationKey;
        addCourse(nextCourse);
        setActiveCourse(nextCourse.id, params.lessonId);
      }
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) ? String(loadError.response?.data?.detail || "Lesson not found.") : "Lesson not found.");
    } finally {
      setLoading(false);
    }
  }, [getToken, params.courseId, params.lessonId, router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setQuizProgress({});
    setBrowserLabVerified(false);
  }, [params.lessonId]);

  const lessons = useMemo(() => course?.modules.flatMap((module) => module.lessons) ?? [], [course]);
  const lessonIndex = lessons.findIndex((item) => item.id === params.lessonId);
  const lesson = lessonIndex >= 0 ? lessons[lessonIndex] : null;
  const previous = lessonIndex > 0 ? lessons[lessonIndex - 1] : null;
  const next = lessonIndex >= 0 && lessonIndex < lessons.length - 1 ? lessons[lessonIndex + 1] : null;
  const isBrowserLab = Boolean(lesson?.browserLab);
  const quizBlocks = lesson?.contentBlocks?.filter((block) => block.type === "quiz") ?? [];
  const lessonAlreadyComplete = Boolean(lesson && course && isLessonComplete(course.id, lesson.id));
  const quizzesDone = isBrowserLab
    ? browserLabVerified
    : lessonAlreadyComplete || quizBlocks.every((block) => (
        block.questions.length > 0
        && quizProgress[block.id]?.answered === block.questions.length
      ));

  function goTo(lessonId: string) {
    setActiveLesson(lessonId);
    router.push(`/learn/${params.courseId}/${lessonId}`);
  }

  function finishLesson() {
    if (!course || !lesson || !quizzesDone) return;
    const quizResult = Object.values(quizProgress).reduce<QuizProgress>(
      (total, result) => ({
        answered: total.answered + result.answered,
        correct: total.correct + result.correct,
        total: total.total + result.total,
      }),
      { answered: 0, correct: 0, total: 0 },
    );
    if (!lessonAlreadyComplete && quizResult.total > 0) {
      recordAssessmentResult({
        courseId: course.id,
        lessonId: lesson.id,
        score: Math.round((quizResult.correct / quizResult.total) * 100),
        correct: quizResult.correct,
        total: quizResult.total,
      });
    }
    completeLesson(lesson.id);
    if (next) goTo(next.id);
    else router.push("/learn/completion");
  }

  if (loading) return <div className="rich-load"><Loader2 className="rich-spin" size={25} /> Loading lesson…</div>;
  if (error || !course || !lesson) return <div className="rich-load rich-load-error"><CircleAlert size={22} /> {error || "Lesson not found."}</div>;

  const completion = lessons.length
    ? Math.round((lessons.filter((item) => isLessonComplete(course.id, item.id)).length / lessons.length) * 100)
    : 0;

  return (
    <CourseLessonView
      course={course}
      lesson={lesson}
      lessonIndex={lessonIndex}
      completion={completion}
      isLessonComplete={(lessonId) => isLessonComplete(course.id, lessonId)}
      onOverview={() => router.push(`/learn/${course.id}`)}
      onSelectLesson={goTo}
      footer={(
        <footer className="rich-lesson-actions">
          <button type="button" className="rich-secondary" disabled={!previous} onClick={() => previous && goTo(previous.id)}>
            <ChevronLeft size={15} /> Previous
          </button>
          <div>
            {!quizzesDone && <small>{isBrowserLab ? "Complete the lab and cleanup after backend verification." : "Answer every quiz question to complete this lesson."}</small>}
            <button type="button" className="rich-primary" disabled={!quizzesDone} onClick={finishLesson}>
              {next ? "Complete & continue" : "Complete course"} <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      )}
    >
      {lesson.browserLab ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <BrowserLabPanel
            courseId={params.courseId}
            lessonId={lesson.id}
            browserLab={lesson.browserLab}
            getToken={getToken}
            onVerified={(attempt) => {
              const recovery = recoveryMemory(attempt);
              const recoveryCount = recovery?.cycles.length ?? 0;
              const evidenceCount = attempt.evidenceCount ?? attempt.verification?.evidenceCount ?? 0;
              recordPracticeResult({
                courseId: course.id,
                lessonId: lesson.id,
                kind: "lab",
                activityId: attempt.id,
                summary: recoveryCount
                  ? `Recovered from ${recoveryCount} browser-lab gap${recoveryCount === 1 ? "" : "s"}, then passed the original task and cleanup.`
                  : "Completed the original browser task and required cleanup after backend verification.",
                evidence: [
                  `${evidenceCount} browser evidence events verified`,
                  ...(recoveryCount ? [`${recoveryCount} targeted recover${recoveryCount === 1 ? "y" : "ies"} completed`] : []),
                  "Original success criteria and cleanup verified",
                ],
                recovery,
              });
              setBrowserLabVerified(true);
              completeLesson(lesson.id);
            }}
          />
        </motion.div>
      ) : lesson.contentBlocks?.map((block, index) => (
        <motion.div
          key={block.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index * .045, .3) }}
        >
          <CourseBlockRenderer
            block={block}
            citations={course.citations ?? []}
            onQuizProgress={(progress) => setQuizProgress((current) => ({ ...current, [block.id]: progress }))}
          />
        </motion.div>
      ))}
    </CourseLessonView>
  );
}
