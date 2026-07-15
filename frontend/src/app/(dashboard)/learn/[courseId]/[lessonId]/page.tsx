"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import BrowserLabPanel from "@/components/learn/BrowserLabPanel";
import { API_URL } from "@/lib/constants";
import { assetUrl, type GeneratedCourseJob } from "@/lib/generatedCourses";
import { useLearner } from "@/lib/learner";
import type {
  Course,
  CourseCitation,
  CourseContentBlock,
  FlipCardsContentBlock,
  InfoTabsContentBlock,
  QuizContentBlock,
} from "@/lib/types";

import "../rich-course.css";

type QuizProgress = {
  answered: number;
  correct: number;
  total: number;
};

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
      const response = await axios.get<GeneratedCourseJob>(
        `${API_URL}/api/generated-courses/${params.courseId}`,
        { headers: token ? { Authorization: token } : undefined }
      );
      if (response.data.status !== "ready" || !response.data.course) {
        router.replace(`/discover?generation=${params.courseId}`);
        return;
      }
      setCourse(response.data.course);
      const hydrationKey = `${response.data.course.id}:${params.lessonId}`;
      if (hydratedRef.current !== hydrationKey) {
        hydratedRef.current = hydrationKey;
        addCourse(response.data.course);
        setActiveCourse(response.data.course.id, params.lessonId);
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
    ? lessonAlreadyComplete || browserLabVerified
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
    <div className="rich-reader-shell">
      <aside className="rich-reader-nav">
        <button type="button" className="rich-reader-back" onClick={() => router.push(`/learn/${course.id}`)}>
          <ArrowLeft size={13} /> Course overview
        </button>
        <div className="rich-reader-course">
          <span>{course.difficulty} · {course.duration}</span>
          <strong>{course.title}</strong>
          <div><i style={{ width: `${completion}%` }} /></div>
        </div>
        <nav>
          {course.modules.map((module, moduleIndex) => (
            <section key={module.id}>
              <span>{String(moduleIndex + 1).padStart(2, "0")} / {module.title}</span>
              {module.lessons.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === lesson.id ? "active" : ""}
                  onClick={() => goTo(item.id)}
                >
                  <i>{isLessonComplete(course.id, item.id) ? <Check size={10} /> : null}</i>
                  <b>{item.title}</b>
                  <small>{item.duration}</small>
                </button>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <main className="rich-lesson">
        <header className="rich-lesson-head">
          <span>Lesson {lessonIndex + 1} of {lessons.length}</span>
          <h1>{lesson.title}</h1>
          <p>{lesson.summary}</p>
          <div className="rich-lesson-rule" />
        </header>

        <div className="rich-blocks">
          {lesson.browserLab ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <BrowserLabPanel
                courseId={params.courseId}
                lessonId={lesson.id}
                browserLab={lesson.browserLab}
                completed={lessonAlreadyComplete || browserLabVerified}
                getToken={getToken}
                onVerified={() => {
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
              <CourseBlock
                block={block}
                citations={course.citations ?? []}
                onQuizProgress={(progress) => setQuizProgress((current) => ({ ...current, [block.id]: progress }))}
              />
            </motion.div>
          ))}
        </div>

        {!!course.citations?.length && (
          <section className="rich-sources">
            <span>Sources used in this course</span>
            <div>
              {course.citations.map((citation) => (
                <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">
                  {citation.title} <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </section>
        )}

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
      </main>
    </div>
  );
}

function CourseBlock({
  block,
  citations,
  onQuizProgress,
}: {
  block: CourseContentBlock;
  citations: CourseCitation[];
  onQuizProgress: (progress: QuizProgress) => void;
}) {
  if (block.type === "content") {
    return (
      <section className="rich-block rich-content-block">
        <h2>{block.heading}</h2>
        {block.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "grid_cards") {
    return (
      <section className="rich-block">
        <h2>{block.heading}</h2>
        <div className="rich-grid-cards">
          {block.cards.map((card, index) => <article key={`${card.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h3>{card.title}</h3><p>{card.body}</p></article>)}
        </div>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "info_tabs") return <InfoTabs block={block} citations={citations} />;
  if (block.type === "flip_cards") return <FlipCards block={block} />;
  if (block.type === "quiz") return <QuizBlockView block={block} citations={citations} onProgress={onQuizProgress} />;
  if (block.type === "numbered_list") {
    return (
      <section className="rich-block">
        <h2>{block.heading}</h2>
        <ol className="rich-numbered-list">
          {block.items.map((item, index) => <li key={`${item.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}
        </ol>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "html") {
    const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;background:#faf8f2;color:#23221f;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}body{padding:20px}svg{max-width:100%;height:auto}</style></head><body>${block.html}</body></html>`;
    return (
      <section className="rich-block rich-html-block">
        <h2>{block.heading}</h2>
        <iframe title={block.heading} sandbox="" srcDoc={document} style={{ height: block.height }} />
        <p className="rich-accessibility"><BookOpen size={12} /> {block.accessibilitySummary}</p>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  return (
    <figure className="rich-block rich-image-block">
      <img src={assetUrl(block.asset.url)} alt={block.asset.alt} />
      <figcaption>{block.asset.caption}</figcaption>
      <BlockSources ids={block.citationIds} citations={citations} />
    </figure>
  );
}

function InfoTabs({ block, citations }: { block: InfoTabsContentBlock; citations: CourseCitation[] }) {
  const [active, setActive] = useState(0);
  return (
    <section className="rich-block rich-tabs-block">
      <h2>{block.heading}</h2>
      <div className="rich-tab-list" role="tablist">
        {block.tabs.map((tab, index) => (
          <button key={tab.label} type="button" role="tab" aria-selected={active === index} className={active === index ? "active" : ""} onClick={() => setActive(index)}>{tab.label}</button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={active} className="rich-tab-panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
          {block.tabs[active]?.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </motion.div>
      </AnimatePresence>
      <BlockSources ids={block.citationIds} citations={citations} />
    </section>
  );
}

function FlipCards({ block }: { block: FlipCardsContentBlock }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <section className="rich-block">
      <h2>{block.heading}</h2>
      <div className="rich-flip-grid">
        {block.cards.map((card, index) => (
          <button key={`${card.front}-${index}`} type="button" className={flipped[index] ? "flipped" : ""} onClick={() => setFlipped((current) => ({ ...current, [index]: !current[index] }))}>
            <span className="rich-flip-front"><small>Tap to reveal</small><strong>{card.front}</strong><RotateCcw size={14} /></span>
            <span className="rich-flip-back"><small>Answer</small><strong>{card.back}</strong><RotateCcw size={14} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuizBlockView({
  block,
  citations,
  onProgress,
}: {
  block: QuizContentBlock;
  citations: CourseCitation[];
  onProgress: (progress: QuizProgress) => void;
}) {
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const question = block.questions[active];

  function choose(choice: number) {
    const next = { ...answers, [active]: choice };
    setAnswers(next);
    onProgress({
      answered: Object.keys(next).length,
      correct: Object.entries(next).filter(([questionIndex, answer]) => (
        block.questions[Number(questionIndex)]?.answerIndex === answer
      )).length,
      total: block.questions.length,
    });
  }

  const selected = answers[active];
  const answered = selected !== undefined;
  if (!question) {
    return (
      <section className="rich-block rich-quiz-block">
        <div className="rich-quiz-head"><span>Knowledge check</span><h2>{block.heading}</h2></div>
        <p>This knowledge check has no questions yet.</p>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  return (
    <section className="rich-block rich-quiz-block">
      <div className="rich-quiz-head"><span>Knowledge check</span><h2>{block.heading}</h2></div>
      <div className="rich-quiz-numbers">
        {block.questions.map((item, index) => (
          <button key={item.id} type="button" className={`${active === index ? "active" : ""} ${answers[index] !== undefined ? "answered" : ""}`} onClick={() => setActive(index)}>{index + 1}</button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={question.id} className="rich-quiz-question" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
          <h3>{question.question}</h3>
          <div>
            {question.choices.map((choice, index) => {
              const correct = answered && index === question.answerIndex;
              const wrong = answered && index === selected && selected !== question.answerIndex;
              return <button key={choice} type="button" className={`${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`} disabled={answered} onClick={() => choose(index)}><span>{String.fromCharCode(65 + index)}</span>{choice}{correct && <Check size={14} />}</button>;
            })}
          </div>
          {answered && (
            <div className={`rich-quiz-feedback ${selected === question.answerIndex ? "correct" : "wrong"}`}>
              <strong>{selected === question.answerIndex ? "Correct" : "Not quite"}</strong>
              <p>{question.explanation}</p>
              {active < block.questions.length - 1 && <button type="button" onClick={() => setActive(active + 1)}>Next question <ArrowRight size={12} /></button>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <BlockSources ids={block.citationIds} citations={citations} />
    </section>
  );
}

function BlockSources({ ids = [], citations }: { ids?: string[]; citations: CourseCitation[] }) {
  const matches = ids.map((id) => citations.find((citation) => citation.id === id)).filter((item): item is CourseCitation => Boolean(item));
  if (!matches.length) return null;
  return <div className="rich-block-sources">{matches.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.id.replace("src-", "Source ")} <ExternalLink size={9} /></a>)}</div>;
}
