"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  EyeOff,
  Layers3,
  Loader2,
  LogOut,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import AdminCourseEditor from "@/components/admin/course-editor/AdminCourseEditor";
import { API_URL } from "@/lib/constants";
import { assetUrl, isGenerationActive, type GeneratedCourseJob } from "@/lib/generatedCourses";
import type { Course, CourseContentBlock, Lesson, LessonType, Module } from "@/lib/types";
import CourseBuilder from "../../(dashboard)/discover/page";
import "../../(dashboard)/learn/[courseId]/rich-course.css";
import "../admin.css";

type CourseStatus = "draft" | "published";

interface AdminCourseRecord {
  id: string;
  status: CourseStatus;
  course: Course;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
}

function localId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function newLesson(): Lesson {
  return {
    id: localId("lesson"),
    title: "New lesson",
    type: "study",
    duration: "15m",
    summary: "",
  };
}

function newModule(): Module {
  return {
    id: localId("module"),
    title: "New module",
    lessons: [newLesson()],
  };
}

function newContentBlock(): CourseContentBlock {
  return {
    id: localId("block"),
    type: "content",
    heading: "New content section",
    paragraphs: ["Add the lesson content learners should read here."],
  };
}

function contentBlockLabel(block: CourseContentBlock): string {
  if (block.type === "grid_cards") return "Card grid";
  if (block.type === "info_tabs") return "Information tabs";
  if (block.type === "flip_cards") return "Flip cards";
  if (block.type === "numbered_list") return "Numbered list";
  if (block.type === "quiz") return "Knowledge check";
  if (block.type === "html") return "Interactive HTML";
  if (block.type === "image") return "Generated image";
  return "Article content";
}

function splitParagraphs(value: string): string[] {
  return value.split(/\n\s*\n/);
}

function ContentBlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: CourseContentBlock;
  onChange: (next: CourseContentBlock) => void;
  onRemove: () => void;
}) {
  const update = (patch: Record<string, unknown>) => onChange({ ...block, ...patch } as CourseContentBlock);

  return (
    <article className="admin-content-block">
      <header>
        <span>{contentBlockLabel(block)}</span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${contentBlockLabel(block)}`}><Trash2 size={13} /></button>
      </header>

      {block.type !== "image" && (
        <label>
          <span>Section heading</span>
          <input value={block.heading} onChange={(event) => update({ heading: event.target.value })} />
        </label>
      )}

      {block.type === "content" && (
        <label>
          <span>Paragraphs <small>Separate paragraphs with a blank line</small></span>
          <textarea rows={6} value={block.paragraphs.join("\n\n")} onChange={(event) => update({ paragraphs: splitParagraphs(event.target.value) })} />
        </label>
      )}

      {(block.type === "grid_cards" || block.type === "numbered_list") && (
        <div className="admin-content-items">
          {(block.type === "grid_cards" ? block.cards : block.items).map((item, index) => (
            <div key={`${block.id}:${index}`}>
              <input
                value={item.title}
                aria-label={`${contentBlockLabel(block)} item ${index + 1} title`}
                onChange={(event) => {
                  const items = [...(block.type === "grid_cards" ? block.cards : block.items)];
                  items[index] = { ...items[index], title: event.target.value };
                  update(block.type === "grid_cards" ? { cards: items } : { items });
                }}
              />
              <textarea
                rows={2}
                value={item.body}
                aria-label={`${contentBlockLabel(block)} item ${index + 1} body`}
                onChange={(event) => {
                  const items = [...(block.type === "grid_cards" ? block.cards : block.items)];
                  items[index] = { ...items[index], body: event.target.value };
                  update(block.type === "grid_cards" ? { cards: items } : { items });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const items = (block.type === "grid_cards" ? block.cards : block.items).filter((_, position) => position !== index);
                  update(block.type === "grid_cards" ? { cards: items } : { items });
                }}
                aria-label={`Remove item ${index + 1}`}
              ><Trash2 size={12} /></button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const items = [...(block.type === "grid_cards" ? block.cards : block.items), { title: "New item", body: "" }];
              update(block.type === "grid_cards" ? { cards: items } : { items });
            }}
          ><Plus size={12} /> Add item</button>
        </div>
      )}

      {block.type === "info_tabs" && (
        <div className="admin-content-items">
          {block.tabs.map((tab, index) => (
            <div key={`${block.id}:${index}`}>
              <input
                value={tab.label}
                aria-label={`Tab ${index + 1} label`}
                onChange={(event) => {
                  const tabs = [...block.tabs];
                  tabs[index] = { ...tab, label: event.target.value };
                  update({ tabs });
                }}
              />
              <textarea
                rows={3}
                value={tab.paragraphs.join("\n\n")}
                aria-label={`Tab ${index + 1} content`}
                onChange={(event) => {
                  const tabs = [...block.tabs];
                  tabs[index] = { ...tab, paragraphs: splitParagraphs(event.target.value) };
                  update({ tabs });
                }}
              />
              <button type="button" onClick={() => update({ tabs: block.tabs.filter((_, position) => position !== index) })} aria-label={`Remove tab ${index + 1}`}><Trash2 size={12} /></button>
            </div>
          ))}
          <button type="button" onClick={() => update({ tabs: [...block.tabs, { label: "New tab", paragraphs: [""] }] })}><Plus size={12} /> Add tab</button>
        </div>
      )}

      {block.type === "flip_cards" && (
        <div className="admin-content-items">
          {block.cards.map((card, index) => (
            <div key={`${block.id}:${index}`}>
              <input
                value={card.front}
                aria-label={`Flip card ${index + 1} front`}
                onChange={(event) => {
                  const cards = [...block.cards];
                  cards[index] = { ...card, front: event.target.value };
                  update({ cards });
                }}
              />
              <textarea
                rows={2}
                value={card.back}
                aria-label={`Flip card ${index + 1} back`}
                onChange={(event) => {
                  const cards = [...block.cards];
                  cards[index] = { ...card, back: event.target.value };
                  update({ cards });
                }}
              />
              <button type="button" onClick={() => update({ cards: block.cards.filter((_, position) => position !== index) })} aria-label={`Remove flip card ${index + 1}`}><Trash2 size={12} /></button>
            </div>
          ))}
          <button type="button" onClick={() => update({ cards: [...block.cards, { front: "New concept", back: "" }] })}><Plus size={12} /> Add card</button>
        </div>
      )}

      {block.type === "quiz" && (
        <div className="admin-quiz-items">
          {block.questions.map((question, index) => (
            <fieldset key={question.id}>
              <legend>Question {index + 1}</legend>
              <input
                value={question.question}
                aria-label={`Question ${index + 1}`}
                onChange={(event) => {
                  const questions = [...block.questions];
                  questions[index] = { ...question, question: event.target.value };
                  update({ questions });
                }}
              />
              <label><span>Choices <small>One per line</small></span><textarea rows={4} value={question.choices.join("\n")} onChange={(event) => {
                const questions = [...block.questions];
                questions[index] = { ...question, choices: event.target.value.split("\n") };
                update({ questions });
              }} /></label>
              <div>
                <label><span>Correct choice</span><select value={question.answerIndex} onChange={(event) => {
                  const questions = [...block.questions];
                  questions[index] = { ...question, answerIndex: Number(event.target.value) };
                  update({ questions });
                }}>{question.choices.map((choice, choiceIndex) => <option key={choiceIndex} value={choiceIndex}>{choiceIndex + 1}. {choice || "Untitled choice"}</option>)}</select></label>
                <label><span>Explanation</span><textarea rows={2} value={question.explanation} onChange={(event) => {
                  const questions = [...block.questions];
                  questions[index] = { ...question, explanation: event.target.value };
                  update({ questions });
                }} /></label>
              </div>
              <button type="button" onClick={() => update({ questions: block.questions.filter((_, position) => position !== index) })}><Trash2 size={12} /> Remove question</button>
            </fieldset>
          ))}
          <button type="button" onClick={() => update({ questions: [...block.questions, { id: localId("question"), question: "New question", choices: ["Choice one", "Choice two"], answerIndex: 0, explanation: "" }] })}><Plus size={12} /> Add question</button>
        </div>
      )}

      {block.type === "html" && (
        <div className="admin-html-fields">
          <label><span>HTML</span><textarea rows={8} value={block.html} onChange={(event) => update({ html: event.target.value })} /></label>
          <label><span>Accessibility summary</span><textarea rows={3} value={block.accessibilitySummary} onChange={(event) => update({ accessibilitySummary: event.target.value })} /></label>
          <label><span>Canvas height</span><input type="number" min={160} value={block.height} onChange={(event) => update({ height: Number(event.target.value) })} /></label>
        </div>
      )}

      {block.type === "image" && (
        <div className="admin-image-fields">
          <i style={{ backgroundImage: `url(${block.asset.url})` }} />
          <label><span>Image URL</span><input value={block.asset.url} onChange={(event) => update({ asset: { ...block.asset, url: event.target.value } })} /></label>
          <label><span>Alt text</span><input value={block.asset.alt} onChange={(event) => update({ asset: { ...block.asset, alt: event.target.value } })} /></label>
          <label><span>Caption</span><textarea rows={2} value={block.asset.caption} onChange={(event) => update({ asset: { ...block.asset, caption: event.target.value } })} /></label>
        </div>
      )}
    </article>
  );
}

function cloneCourse(course: Course): Course {
  return JSON.parse(JSON.stringify(course));
}

function courseCoverStyle(course: Course): CSSProperties {
  const cover = course.coverImage?.url || course.thumbnail;
  if (!cover) return {};
  if (cover.includes("gradient(")) return { backgroundImage: cover };
  return { backgroundImage: `url("${assetUrl(cover)}")` };
}

function formatUpdated(value: string | null): string {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminCoursesPage() {
  const router = useRouter();
  const { user, loading: authLoading, getToken, logout } = useAuth();
  const [courses, setCourses] = useState<AdminCourseRecord[]>([]);
  const [jobs, setJobs] = useState<GeneratedCourseJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Course | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "publish" | "unpublish" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.isAdmin) router.replace("/admin/login");
  }, [authLoading, router, user]);

  const loadCourses = useCallback(async (silent = false) => {
    if (!user?.isAdmin) return;
    try {
      if (!silent) setLoading(true);
      const token = await getToken();
      const headers = { Authorization: token };
      const [catalogResponse, jobsResponse] = await Promise.all([
        axios.get<{ courses: AdminCourseRecord[] }>(`${API_URL}/api/admin/courses`, { headers }),
        axios.get<{ courses: GeneratedCourseJob[] }>(`${API_URL}/api/generated-courses`, { headers }),
      ]);
      const next = catalogResponse.data.courses ?? [];
      setCourses(next);
      setJobs(jobsResponse.data.courses ?? []);
      setError(null);
    } catch (caught: any) {
      if (caught?.response?.status === 401 || caught?.response?.status === 403) {
        await logout();
        router.replace("/admin/login");
        return;
      }
      setError(caught?.response?.data?.detail || "The course catalog could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getToken, logout, router, user?.isAdmin]);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("create") || params.has("generation")) setBuilderOpen(true);
  }, []);

  useEffect(() => {
    if (!jobs.some((job) => isGenerationActive(job.status))) return;
    const timer = window.setInterval(() => void loadCourses(true), 3500);
    return () => window.clearInterval(timer);
  }, [jobs, loadCourses]);

  const selectedRecord = courses.find((course) => course.id === selectedId) ?? null;
  const isDirty = Boolean(draft && JSON.stringify(draft) !== savedSnapshot);
  const lessonCount = useMemo(
    () => draft?.modules.reduce((total, module) => total + module.lessons.length, 0) ?? 0,
    [draft],
  );
  const importedJobIds = useMemo(
    () => new Set(courses.map((record) => (
      record.course as Course & { sourceGeneratedCourseId?: string }
    )).map((course) => course.sourceGeneratedCourseId).filter((id): id is string => Boolean(id))),
    [courses],
  );
  const pendingJobs = useMemo(
    () => jobs.filter((job) => !importedJobIds.has(job.id)),
    [importedJobIds, jobs],
  );
  const publishedCount = courses.filter((record) => record.status === "published").length;
  const draftCount = courses.length - publishedCount;

  function selectCourse(record: AdminCourseRecord) {
    if (isDirty && record.id !== selectedId && !window.confirm("Discard your unsaved course changes?")) return;
    const next = cloneCourse(record.course);
    setSelectedId(record.id);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
    setNotice(null);
    setError(null);
    setBuilderOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("generation");
    url.searchParams.delete("prompt");
    window.history.replaceState({}, "", url);
  }

  function startNewCourse(suggestedPrompt = "") {
    const url = new URL(window.location.href);
    url.searchParams.delete("generation");
    url.searchParams.set("create", "1");
    if (suggestedPrompt.trim()) url.searchParams.set("prompt", suggestedPrompt.trim());
    else url.searchParams.delete("prompt");
    window.history.pushState({}, "", url);
    setSelectedId(null);
    setDraft(null);
    setSavedSnapshot("");
    setBuilderOpen(true);
    setNotice(null);
    setError(null);
  }

  function resumeGeneration(jobId: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("prompt");
    url.searchParams.set("generation", jobId);
    window.history.pushState({}, "", url);
    setSelectedId(null);
    setDraft(null);
    setSavedSnapshot("");
    setBuilderOpen(true);
    setNotice(null);
    setError(null);
  }

  function closeBuilder() {
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("generation");
    url.searchParams.delete("prompt");
    window.history.pushState({}, "", url);
    setBuilderOpen(false);
    void loadCourses(true);
  }

  function openLibrary() {
    if (isDirty && !window.confirm("Discard your unsaved course changes?")) return;
    setSelectedId(null);
    setDraft(null);
    setSavedSnapshot("");
    setNotice(null);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("generation");
    url.searchParams.delete("prompt");
    window.history.pushState({}, "", url);
  }

  const acceptImportedCourse = useCallback((record: AdminCourseRecord) => {
    setCourses((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    const next = cloneCourse(record.course);
    setSelectedId(record.id);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
    setBuilderOpen(false);
    setPromptDraft("");
    setError(null);
    setNotice("Generated course imported as an editable draft. Review it, then publish when ready.");
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.searchParams.delete("generation");
    window.history.replaceState({}, "", url);
  }, []);

  useEffect(() => {
    const handleImport = (event: Event) => {
      acceptImportedCourse((event as CustomEvent<AdminCourseRecord>).detail);
    };
    window.addEventListener("ctrlteach:admin-course-imported", handleImport);
    return () => window.removeEventListener("ctrlteach:admin-course-imported", handleImport);
  }, [acceptImportedCourse]);

  function replaceRecord(record: AdminCourseRecord) {
    setCourses((current) => [
      record,
      ...current.filter((item) => item.id !== record.id),
    ]);
    const next = cloneCourse(record.course);
    setSelectedId(record.id);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
  }

  async function persistCourse(): Promise<AdminCourseRecord | null> {
    if (!draft) return null;
    const token = await getToken();
    if (!token) throw new Error("Your admin session has expired.");
    const endpoint = selectedId
      ? `${API_URL}/api/admin/courses/${selectedId}`
      : `${API_URL}/api/admin/courses`;
    const response = selectedId
      ? await axios.put<AdminCourseRecord>(endpoint, draft, { headers: { Authorization: token } })
      : await axios.post<AdminCourseRecord>(endpoint, draft, { headers: { Authorization: token } });
    replaceRecord(response.data);
    return response.data;
  }

  async function saveCourse() {
    try {
      setBusy("save");
      setError(null);
      const saved = await persistCourse();
      if (saved) setNotice(saved.status === "published" ? "Published course updated." : "Draft saved.");
    } catch (caught: any) {
      setError(caught?.response?.data?.detail || caught?.message || "The course could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function changePublishing(action: "publish" | "unpublish") {
    try {
      setBusy(action);
      setError(null);
      let record = selectedRecord;
      if (!record || isDirty) record = await persistCourse();
      if (!record) return;
      const token = await getToken();
      const response = await axios.post<AdminCourseRecord>(
        `${API_URL}/api/admin/courses/${record.id}/${action}`,
        {},
        { headers: { Authorization: token } },
      );
      replaceRecord(response.data);
      setNotice(action === "publish" ? "Course is now live in Learn." : "Course moved back to drafts.");
    } catch (caught: any) {
      setError(caught?.response?.data?.detail || caught?.message || `The course could not be ${action}ed.`);
    } finally {
      setBusy(null);
    }
  }

  function updateField<K extends keyof Course>(field: K, value: Course[K]) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateModule(moduleIndex: number, patch: Partial<Module>) {
    setDraft((current) => {
      if (!current) return current;
      const modules = current.modules.map((module, index) => (
        index === moduleIndex ? { ...module, ...patch } : module
      ));
      return { ...current, modules };
    });
  }

  function updateLesson(moduleIndex: number, lessonIndex: number, patch: Partial<Lesson>) {
    setDraft((current) => {
      if (!current) return current;
      const modules = current.modules.map((module, index) => {
        if (index !== moduleIndex) return module;
        return {
          ...module,
          lessons: module.lessons.map((lesson, position) => (
            position === lessonIndex ? { ...lesson, ...patch } : lesson
          )),
        };
      });
      return { ...current, modules };
    });
  }

  function updateContentBlock(moduleIndex: number, lessonIndex: number, blockIndex: number, next: CourseContentBlock | null) {
    const lesson = draft?.modules[moduleIndex]?.lessons[lessonIndex];
    if (!lesson) return;
    const blocks = [...(lesson.contentBlocks ?? [])];
    if (next) blocks[blockIndex] = next;
    else blocks.splice(blockIndex, 1);
    updateLesson(moduleIndex, lessonIndex, { contentBlocks: blocks });
  }

  async function signOut() {
    await logout();
    router.replace("/admin/login");
  }

  if (authLoading || !user?.isAdmin) {
    return <div className="admin-loading">Checking admin access…</div>;
  }

  return (
    <main className={`admin-studio ${builderOpen || !draft ? "admin-library-mode" : "admin-authoring-mode"}`}>
      <header className="admin-studio-header">
        <Link href="/admin/dashboard" className="admin-wordmark" aria-label="Admin dashboard">Ctrl<span>+</span>Teach</Link>
        <div className="admin-studio-title">
          <span>Admin</span>
          <nav className="admin-section-nav" aria-label="Admin sections">
            <Link href="/admin/dashboard">Dashboard</Link>
            <Link href="/admin/courses" className="active">Manage courses</Link>
            <Link href="/admin/tars">Tars analytics</Link>
          </nav>
        </div>
        <div className="admin-header-actions">
          <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>

      <section className="admin-editor">
        {builderOpen ? (
          <div className="admin-course-builder">
            <div className="admin-course-builder-bar">
              <button type="button" onClick={closeBuilder}><ArrowLeft size={14} /> Back to library</button>
              <div><span>Generate from prompt</span><strong>Editing unlocks after the complete course has been generated.</strong></div>
            </div>
            <CourseBuilder />
          </div>
        ) : !draft ? (
          <div className="admin-course-library">
            <header className="admin-library-intro">
              <div>
                <span>Course library</span>
                <h1>Create, edit, and publish courses<span>.</span></h1>
                <p>Generate a complete course from a prompt, then edit its modules, lessons, quizzes, and content sections before publishing.</p>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); if (promptDraft.trim()) startNewCourse(promptDraft); }}>
                <label htmlFor="admin-course-prompt">What should the course teach?</label>
                <textarea
                  id="admin-course-prompt"
                  rows={4}
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  placeholder="Example: Create an intermediate cybersecurity course on threat modeling with practical labs and assessments."
                />
                <div>
                  <small>The full course is generated first. Content editing becomes available when it is ready.</small>
                  <button type="submit" disabled={!promptDraft.trim()}><Sparkles size={15} /> Generate course</button>
                </div>
              </form>
            </header>

            <div className="admin-library-summary" aria-label="Course library summary">
              <div><span>All courses</span><strong>{courses.length}</strong></div>
              <div><span>Published</span><strong>{publishedCount}</strong></div>
              <div><span>Drafts</span><strong>{draftCount}</strong></div>
              <div><span>Generating</span><strong>{pendingJobs.filter((job) => job.status !== "ready" && job.status !== "failed").length}</strong></div>
            </div>

            {pendingJobs.length > 0 && (
              <section className="admin-library-section" aria-labelledby="admin-generations-title">
                <div className="admin-library-section-head">
                  <div><span>Course generation</span><h2 id="admin-generations-title">Work in progress</h2></div>
                  <p>In-progress courses stay locked. Ready courses can be opened for editing.</p>
                </div>
                <div className="admin-generation-grid">
                  {pendingJobs.map((job) => {
                    const course = job.course || job.partialCourse;
                    const ready = job.status === "ready" && Boolean(job.course);
                    return (
                      <article key={job.id} className={`admin-generation-card ${job.status}`}>
                        <div className="admin-generation-cover" style={course ? courseCoverStyle(course) : undefined}>
                          <Sparkles size={24} />
                          <span>{ready ? "Ready" : job.status === "failed" ? "Needs attention" : job.status === "intake" ? "Needs answers" : "Generating"}</span>
                        </div>
                        <div>
                          <small>{job.progress?.stage || "Course setup"}</small>
                          <h3>{course?.title || job.topic}</h3>
                          <p>{job.progress?.message || job.summary}</p>
                          {!ready && job.status !== "failed" && (
                            <div className="admin-generation-progress" aria-label={`${job.progress?.percent ?? 0}% generated`}><i style={{ width: `${job.progress?.percent ?? 0}%` }} /></div>
                          )}
                          <button type="button" onClick={() => resumeGeneration(job.id)}>
                            {ready ? "Open editable course" : job.status === "failed" ? "Review generation" : job.status === "intake" ? "Continue setup" : "View progress"}
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="admin-library-section" aria-labelledby="admin-platform-courses-title">
              <div className="admin-library-section-head">
                <div><span>Platform catalog</span><h2 id="admin-platform-courses-title">Your courses</h2></div>
                <button type="button" onClick={() => startNewCourse()}><Plus size={14} /> Generate from prompt</button>
              </div>

              {loading ? (
                <div className="admin-library-state"><Loader2 className="admin-spin" size={18} /> Loading course library</div>
              ) : error ? (
                <div className="admin-library-state error"><CircleAlert size={18} /> {error}</div>
              ) : courses.length === 0 ? (
                <div className="admin-library-empty">
                  <BookOpen size={22} />
                  <div><strong>No platform courses yet</strong><span>Use the prompt above to generate your first complete course.</span></div>
                </div>
              ) : (
                <div className="admin-library-grid">
                  {courses.map((record) => {
                    const count = record.course.modules.reduce((total, module) => total + module.lessons.length, 0);
                    return (
                      <article key={record.id} className="admin-library-card">
                        <button type="button" onClick={() => selectCourse(record)} aria-label={`Edit ${record.course.title}`}>
                          <div className="admin-library-cover" style={courseCoverStyle(record.course)}>
                            <BookOpen size={25} />
                            <span className={record.status}>{record.status}</span>
                          </div>
                          <div className="admin-library-card-body">
                            <small><span>{record.course.difficulty}</span><span>{record.course.modules.length} modules</span><span>{count} lessons</span></small>
                            <h3>{record.course.title}</h3>
                            <p>{record.course.description}</p>
                            <footer><span>Edit course content</span><ArrowRight size={14} /></footer>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          <AdminCourseEditor
            course={draft}
            status={selectedRecord?.status ?? "draft"}
            updatedLabel={formatUpdated(selectedRecord?.updatedAt ?? null)}
            dirty={isDirty}
            busy={busy}
            notice={notice}
            error={error}
            onChange={setDraft}
            onBack={openLibrary}
            onSave={saveCourse}
            onPublish={() => changePublishing("publish")}
            onUnpublish={() => changePublishing("unpublish")}
          />
        )}
      </section>
    </main>
  );
}
