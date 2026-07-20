"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Layers3,
  Loader2,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import BrowserLabPreview from "@/components/courses/BrowserLabPreview";
import CourseBlockRenderer from "@/components/courses/CourseBlockRenderer";
import CourseLessonView, { type CourseLessonTextField } from "@/components/courses/CourseLessonView";
import CourseOverviewView, { type CourseOverviewTextField } from "@/components/courses/CourseOverviewView";
import {
  createContentBlock,
  createLesson,
  createModule,
  duplicateBlock,
  moveBlock,
  moveBlockTo,
  moveLesson,
  moveLessonWithinModule,
  moveModule,
  moveModuleTo,
  removeBlockById,
  removeLessonById,
  removeModuleById,
  updateBlockById,
  updateLessonById,
  updateModuleById,
  type CourseEditorSelection,
} from "@/lib/courseEditor";
import type {
  BrowserLabBlueprint,
  Course,
  CourseContentBlock,
  GeneratedImageAsset,
  LabBlueprint,
  LearningResource,
  Lesson,
  LessonType,
  RoleplayScenario,
  WhiteboardTeachingPlan,
} from "@/lib/types";

import ContentBlockEditor from "./ContentBlockEditor";
import InlineTextField from "./InlineTextField";
import "./course-editor.css";

type CourseStatus = "draft" | "published";
type BusyAction = "save" | "publish" | "unpublish" | null;
type DragItem =
  | { kind: "module"; moduleId: string }
  | { kind: "lesson"; moduleId: string; lessonId: string }
  | { kind: "block"; moduleId: string; lessonId: string; blockId: string }
  | null;

const BLOCK_TYPES: Array<{ type: CourseContentBlock["type"]; label: string }> = [
  { type: "content", label: "Text" },
  { type: "grid_cards", label: "Card grid" },
  { type: "info_tabs", label: "Tabs" },
  { type: "flip_cards", label: "Flip cards" },
  { type: "numbered_list", label: "Numbered list" },
  { type: "quiz", label: "Quiz" },
  { type: "image", label: "Image" },
  { type: "html", label: "Interactive HTML" },
];

function defaultOverview(course: Course) {
  return {
    audience: course.overview?.audience ?? "",
    outcomes: course.overview?.outcomes ?? [],
    prerequisites: course.overview?.prerequisites ?? [],
    estimatedTime: course.overview?.estimatedTime || course.duration,
  };
}

function defaultCover(course: Course): GeneratedImageAsset {
  return course.coverImage ?? {
    id: `cover-${course.id}`,
    status: "ready",
    url: course.thumbnail,
    alt: `Cover for ${course.title}`,
    caption: "",
    prompt: "",
    width: 1536,
    height: 1024,
    contentType: "image/webp",
    sizeBytes: 0,
  };
}

function splitLines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export default function AdminCourseEditor({
  course,
  status,
  updatedLabel,
  dirty,
  busy,
  notice,
  error,
  onChange,
  onBack,
  onSave,
  onPublish,
  onUnpublish,
}: {
  course: Course;
  status: CourseStatus;
  updatedLabel: string;
  dirty: boolean;
  busy: BusyAction;
  notice: string | null;
  error: string | null;
  onChange: (course: Course) => void;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const [selection, setSelection] = useState<CourseEditorSelection>({ kind: "overview" });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [settings, setSettings] = useState<"course" | "lesson" | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    setSelection({ kind: "overview" });
    setMode("edit");
    setSettings(null);
    setActiveBlockId(null);
  }, [course.id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const lessons = useMemo(() => course.modules.flatMap((module) => module.lessons), [course]);
  const selectedModule = selection.kind === "lesson"
    ? course.modules.find((module) => module.id === selection.moduleId) ?? null
    : null;
  const selectedLesson = selection.kind === "lesson"
    ? selectedModule?.lessons.find((lesson) => lesson.id === selection.lessonId) ?? null
    : null;
  const selectedLessonIndex = selectedLesson ? lessons.findIndex((lesson) => lesson.id === selectedLesson.id) : -1;

  useEffect(() => {
    if (selection.kind === "lesson" && !selectedLesson) setSelection({ kind: "overview" });
  }, [selectedLesson, selection.kind]);

  function updateCourse(patch: Partial<Course>) {
    onChange({ ...course, ...patch });
  }

  function updateOverview(patch: Partial<NonNullable<Course["overview"]>>) {
    updateCourse({ overview: { ...defaultOverview(course), ...patch } });
  }

  function updateSelectedLesson(patch: Partial<Lesson>) {
    if (selection.kind !== "lesson") return;
    onChange(updateLessonById(course, selection.moduleId, selection.lessonId, patch));
  }

  function announce(message: string) {
    setAnnouncement(message);
    window.setTimeout(() => setAnnouncement(""), 1200);
  }

  function renderOverviewText(field: CourseOverviewTextField) {
    if (mode === "preview") return field.value;
    const change = (value: string) => {
      if (field.key === "title") updateCourse({ title: value });
      else if (field.key === "description") updateCourse({ description: value });
      else if (field.key === "estimatedTime") updateOverview({ estimatedTime: value });
      else if (field.key === "audience") updateOverview({ audience: value });
      else if (field.key === "moduleTitle" && field.moduleId) onChange(updateModuleById(course, field.moduleId, { title: value }));
      else if (field.key === "lessonTitle" && field.moduleId && field.lessonId) onChange(updateLessonById(course, field.moduleId, field.lessonId, { title: value }));
      else if (field.key === "outcome" && field.index !== undefined) {
        const outcomes = [...defaultOverview(course).outcomes];
        outcomes[field.index] = value;
        updateOverview({ outcomes });
      } else if (field.key === "prerequisite" && field.index !== undefined) {
        const prerequisites = [...defaultOverview(course).prerequisites];
        prerequisites[field.index] = value;
        updateOverview({ prerequisites });
      }
    };
    return <InlineTextField value={field.value} onChange={change} ariaLabel={`Edit course ${field.key}`} multiline={field.multiline} className={`admin-inline-${field.key}`} />;
  }

  function renderLessonText(field: CourseLessonTextField) {
    if (mode === "preview") return field.value;
    if (field.key === "courseTitle") return course.title;
    return (
      <InlineTextField
        value={field.value}
        onChange={(value) => updateSelectedLesson(field.key === "lessonTitle" ? { title: value } : { summary: value })}
        ariaLabel={`Edit ${field.key}`}
        multiline={field.multiline}
        className={`admin-inline-${field.key}`}
      />
    );
  }

  function selectLesson(moduleId: string, lessonId: string) {
    setSelection({ kind: "lesson", moduleId, lessonId });
    setSettings(null);
    setActiveBlockId(null);
  }

  function addLesson(moduleId: string) {
    const module = course.modules.find((item) => item.id === moduleId);
    if (!module) return;
    const lesson = createLesson();
    onChange(updateModuleById(course, moduleId, { lessons: [...module.lessons, lesson] }));
    selectLesson(moduleId, lesson.id);
  }

  function deleteLesson(moduleId: string, lessonId: string, title: string) {
    if (!window.confirm(`Delete lesson “${title}”?`)) return;
    onChange(removeLessonById(course, moduleId, lessonId));
    if (selection.kind === "lesson" && selection.lessonId === lessonId) setSelection({ kind: "overview" });
  }

  function deleteModule(moduleId: string, title: string) {
    if (!window.confirm(`Delete module “${title}” and every lesson inside it?`)) return;
    onChange(removeModuleById(course, moduleId));
    if (selection.kind === "lesson" && selection.moduleId === moduleId) setSelection({ kind: "overview" });
  }

  function addBlock(type: CourseContentBlock["type"]) {
    if (!selectedLesson || selection.kind !== "lesson") return;
    const block = createContentBlock(type);
    updateSelectedLesson({ contentBlocks: [...(selectedLesson.contentBlocks ?? []), block] });
    setActiveBlockId(block.id);
  }

  function dropOnModule(moduleId: string, moduleIndex: number) {
    if (!dragItem) return;
    if (dragItem.kind === "module") {
      onChange(moveModuleTo(course, dragItem.moduleId, moduleIndex));
      announce("Module moved.");
    } else if (dragItem.kind === "lesson") {
      onChange(moveLesson(course, dragItem.lessonId, dragItem.moduleId, moduleId));
      setSelection({ kind: "lesson", moduleId, lessonId: dragItem.lessonId });
      announce("Lesson moved to module.");
    }
    setDragItem(null);
  }

  const toolbar = (
    <header className="admin-course-toolbar">
      <button type="button" className="admin-course-back" onClick={onBack}><ArrowLeft size={14} /> Course library</button>
      <div className="admin-course-toolbar-title">
        <span className={`admin-status-pill ${status}`}>{status === "published" && <Check size={12} />}{status}</span>
        <strong>{course.title || "Untitled course"}</strong>
        <small>{dirty ? "Unsaved changes" : updatedLabel}</small>
      </div>
      <div className="admin-view-switch" aria-label="Course editor view">
        <button type="button" className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><FileText size={14} /> Edit</button>
        <button type="button" className={mode === "preview" ? "active" : ""} onClick={() => { setMode("preview"); setSettings(null); setActiveBlockId(null); }}><Eye size={14} /> Learner view</button>
      </div>
      <div className="admin-course-toolbar-actions">
        {mode === "edit" && <button type="button" onClick={() => setSettings(selection.kind === "lesson" ? "lesson" : "course")}><Settings2 size={15} /> Settings</button>}
        <button type="button" onClick={onSave} disabled={Boolean(busy)}>{busy === "save" ? <Loader2 className="admin-spin" size={15} /> : <Save size={15} />} Save</button>
        {status === "published" ? (
          <button type="button" className="danger" onClick={onUnpublish} disabled={Boolean(busy)}>{busy === "unpublish" ? <Loader2 className="admin-spin" size={15} /> : <EyeOff size={15} />} Unpublish</button>
        ) : (
          <button type="button" className="primary" onClick={onPublish} disabled={Boolean(busy)}>{busy === "publish" ? <Loader2 className="admin-spin" size={15} /> : <Send size={15} />} Publish</button>
        )}
      </div>
    </header>
  );

  return (
    <div className={`admin-course-authoring ${mode === "preview" ? "preview" : "edit"}`}>
      {toolbar}
      <div className="admin-authoring-body">
        <aside className="admin-course-outline">
          <button type="button" className={selection.kind === "overview" ? "active admin-overview-item" : "admin-overview-item"} onClick={() => { setSelection({ kind: "overview" }); setSettings(null); setActiveBlockId(null); }}>
            <BookOpen size={14} /><span><strong>Course overview</strong><small>Landing page</small></span>
          </button>

          <nav aria-label="Course outline">
            {course.modules.map((module, moduleIndex) => (
              <section
                key={module.id}
                draggable={mode === "edit"}
                onDragStart={() => setDragItem({ kind: "module", moduleId: module.id })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOnModule(module.id, moduleIndex)}
              >
                <header>
                  {mode === "edit" && <GripVertical size={14} aria-hidden="true" />}
                  {mode === "edit" ? (
                    <input value={module.title} aria-label={`Module ${moduleIndex + 1} title`} onChange={(event) => onChange(updateModuleById(course, module.id, { title: event.target.value }))} />
                  ) : <strong>{module.title}</strong>}
                  {mode === "edit" && (
                    <div>
                      <button type="button" disabled={moduleIndex === 0} onClick={() => { onChange(moveModule(course, module.id, -1)); announce("Module moved up."); }} aria-label={`Move ${module.title} up`}><ArrowUp size={12} /></button>
                      <button type="button" disabled={moduleIndex === course.modules.length - 1} onClick={() => { onChange(moveModule(course, module.id, 1)); announce("Module moved down."); }} aria-label={`Move ${module.title} down`}><ArrowDown size={12} /></button>
                      <button type="button" onClick={() => deleteModule(module.id, module.title)} aria-label={`Delete ${module.title}`}><Trash2 size={12} /></button>
                    </div>
                  )}
                </header>
                <div>
                  {module.lessons.map((lesson, lessonIndex) => (
                    <div
                      key={lesson.id}
                      className={`admin-outline-lesson ${selection.kind === "lesson" && selection.lessonId === lesson.id ? "active" : ""}`}
                      draggable={mode === "edit"}
                      onDragStart={(event) => { event.stopPropagation(); setDragItem({ kind: "lesson", moduleId: module.id, lessonId: lesson.id }); }}
                    >
                      {mode === "edit" && <GripVertical size={12} aria-hidden="true" />}
                      <button type="button" onClick={() => selectLesson(module.id, lesson.id)}>
                        <span>{moduleIndex + 1}.{lessonIndex + 1}</span><b>{lesson.title}</b><small>{lesson.duration}</small>
                      </button>
                      {mode === "edit" && (
                        <div className="admin-outline-lesson-actions">
                          <button type="button" disabled={lessonIndex === 0} onClick={() => { onChange(moveLessonWithinModule(course, module.id, lesson.id, -1)); announce("Lesson moved up."); }} aria-label={`Move ${lesson.title} up`}><ArrowUp size={11} /></button>
                          <button type="button" disabled={lessonIndex === module.lessons.length - 1} onClick={() => { onChange(moveLessonWithinModule(course, module.id, lesson.id, 1)); announce("Lesson moved down."); }} aria-label={`Move ${lesson.title} down`}><ArrowDown size={11} /></button>
                          <button type="button" onClick={() => deleteLesson(module.id, lesson.id, lesson.title)} aria-label={`Delete ${lesson.title}`}><Trash2 size={11} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {mode === "edit" && <button type="button" className="admin-outline-add" onClick={() => addLesson(module.id)}><Plus size={12} /> Add lesson</button>}
              </section>
            ))}
          </nav>
          {mode === "edit" && <button type="button" className="admin-outline-add-module" onClick={() => updateCourse({ modules: [...course.modules, createModule()] })}><Plus size={13} /> Add module</button>}
        </aside>

        <section className="admin-course-canvas">
          {(notice || error) && <div className={`admin-authoring-message ${error ? "error" : ""}`} role="status">{error || notice}</div>}
          {selection.kind === "overview" ? (
            <CourseOverviewView
              course={course}
              completed={0}
              showProgress={false}
              onStart={lessons[0] ? () => {
                const firstModule = course.modules.find((module) => module.lessons.some((lesson) => lesson.id === lessons[0].id));
                if (firstModule) selectLesson(firstModule.id, lessons[0].id);
              } : undefined}
              startLabel={mode === "edit" ? "Open first lesson" : "Start course"}
              onSelectLesson={selectLesson}
              renderText={mode === "edit" ? renderOverviewText : undefined}
              coverActions={mode === "edit" ? <button type="button" className="admin-cover-edit" onClick={() => setSettings("course")}><Settings2 size={14} /> Edit cover</button> : null}
            />
          ) : selectedLesson ? (
            <CourseLessonView
              course={course}
              lesson={selectedLesson}
              lessonIndex={selectedLessonIndex}
              showOutline={false}
              renderText={mode === "edit" ? renderLessonText : undefined}
              footer={(
                <footer className="rich-lesson-actions">
                  <button type="button" className="rich-secondary" disabled={selectedLessonIndex <= 0} onClick={() => {
                    const previous = lessons[selectedLessonIndex - 1];
                    const module = course.modules.find((item) => item.lessons.some((lesson) => lesson.id === previous?.id));
                    if (previous && module) selectLesson(module.id, previous.id);
                  }}><ChevronLeft size={15} /> Previous</button>
                  <div>
                    {mode === "edit" && <small>Preview controls never update learner progress.</small>}
                    <button type="button" className="rich-primary" disabled={selectedLessonIndex >= lessons.length - 1} onClick={() => {
                      const next = lessons[selectedLessonIndex + 1];
                      const module = course.modules.find((item) => item.lessons.some((lesson) => lesson.id === next?.id));
                      if (next && module) selectLesson(module.id, next.id);
                    }}>Next lesson <ChevronRight size={15} /></button>
                  </div>
                </footer>
              )}
            >
              {selectedLesson.browserLab ? (
                <BrowserLabPreview browserLab={selectedLesson.browserLab} />
              ) : selectedLesson.contentBlocks?.length ? selectedLesson.contentBlocks.map((block, blockIndex) => (
                <article
                  key={block.id}
                  className={`admin-editable-block ${activeBlockId === block.id ? "active" : ""}`}
                  draggable={mode === "edit"}
                  onDragStart={() => setDragItem({ kind: "block", moduleId: selection.moduleId, lessonId: selection.lessonId, blockId: block.id })}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragItem?.kind !== "block" || dragItem.lessonId !== selection.lessonId) return;
                    onChange(moveBlockTo(course, selection.moduleId, selection.lessonId, dragItem.blockId, blockIndex));
                    setDragItem(null);
                    announce("Content block moved.");
                  }}
                >
                  {mode === "edit" && (
                    <div className="admin-block-toolbar">
                      <GripVertical size={14} />
                      <span>{BLOCK_TYPES.find((item) => item.type === block.type)?.label}</span>
                      <button type="button" disabled={blockIndex === 0} onClick={() => { onChange(moveBlock(course, selection.moduleId, selection.lessonId, block.id, -1)); announce("Content block moved up."); }} aria-label="Move block up"><ArrowUp size={12} /></button>
                      <button type="button" disabled={blockIndex === (selectedLesson.contentBlocks?.length ?? 0) - 1} onClick={() => { onChange(moveBlock(course, selection.moduleId, selection.lessonId, block.id, 1)); announce("Content block moved down."); }} aria-label="Move block down"><ArrowDown size={12} /></button>
                      <button type="button" onClick={() => onChange(duplicateBlock(course, selection.moduleId, selection.lessonId, block.id))} aria-label="Duplicate block"><Copy size={12} /></button>
                      <button type="button" className={activeBlockId === block.id ? "active" : ""} onClick={() => setActiveBlockId(activeBlockId === block.id ? null : block.id)}><Settings2 size={12} /> Edit</button>
                      <button type="button" onClick={() => { if (window.confirm("Delete this content block?")) onChange(removeBlockById(course, selection.moduleId, selection.lessonId, block.id)); }} aria-label="Delete block"><Trash2 size={12} /></button>
                    </div>
                  )}
                  <CourseBlockRenderer block={block} citations={course.citations ?? []} />
                  {mode === "edit" && activeBlockId === block.id && (
                    <ContentBlockEditor
                      block={block}
                      citations={course.citations ?? []}
                      onChange={(next) => onChange(updateBlockById(course, selection.moduleId, selection.lessonId, block.id, next))}
                    />
                  )}
                </article>
              )) : <LessonModePreview lesson={selectedLesson} />}

              {mode === "edit" && !selectedLesson.browserLab && (
                <div className="admin-add-blocks">
                  <span>Add content block</span>
                  <div>{BLOCK_TYPES.map((item) => <button key={item.type} type="button" onClick={() => addBlock(item.type)}><Plus size={12} /> {item.label}</button>)}</div>
                </div>
              )}
            </CourseLessonView>
          ) : null}
        </section>

        {settings && mode === "edit" && (
          <SettingsPanel
            kind={settings}
            course={course}
            lesson={selectedLesson}
            onCourseChange={onChange}
            onLessonChange={updateSelectedLesson}
            onClose={() => setSettings(null)}
          />
        )}
      </div>
      <div className="admin-editor-announcement" aria-live="polite">{announcement}</div>
    </div>
  );
}

function SettingsPanel({
  kind,
  course,
  lesson,
  onCourseChange,
  onLessonChange,
  onClose,
}: {
  kind: "course" | "lesson";
  course: Course;
  lesson: Lesson | null;
  onCourseChange: (course: Course) => void;
  onLessonChange: (patch: Partial<Lesson>) => void;
  onClose: () => void;
}) {
  const overview = defaultOverview(course);
  const cover = defaultCover(course);
  const updateCourse = (patch: Partial<Course>) => onCourseChange({ ...course, ...patch });
  const updateOverview = (patch: Partial<NonNullable<Course["overview"]>>) => updateCourse({ overview: { ...overview, ...patch } });
  const updateCover = (patch: Partial<GeneratedImageAsset>) => updateCourse({ coverImage: { ...cover, ...patch } });

  return (
    <aside className="admin-settings-panel" aria-label={kind === "course" ? "Course settings" : "Lesson settings"}>
      <header><div><span>{kind === "course" ? "Course settings" : "Lesson settings"}</span><strong>{kind === "course" ? course.title : lesson?.title}</strong></div><button type="button" onClick={onClose} aria-label="Close settings"><X size={16} /></button></header>
      <div className="admin-settings-scroll">
        {kind === "course" ? (
          <>
            <SettingsSection title="Catalog details">
              <label><span>Instructor</span><input value={course.instructor} onChange={(event) => updateCourse({ instructor: event.target.value })} /></label>
              <label><span>Difficulty</span><select value={course.difficulty} onChange={(event) => updateCourse({ difficulty: event.target.value as Course["difficulty"] })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
              <label><span>Duration</span><input value={course.duration} onChange={(event) => updateCourse({ duration: event.target.value })} /></label>
              <label><span>Skills <small>Comma separated</small></span><textarea rows={3} value={course.skills.join(", ")} onChange={(event) => updateCourse({ skills: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
            </SettingsSection>
            <SettingsSection title="Cover image">
              <label><span>Image URL or CSS gradient</span><textarea rows={3} value={cover.url} onChange={(event) => updateCover({ url: event.target.value })} /></label>
              <label><span>Alt text</span><input value={cover.alt} onChange={(event) => updateCover({ alt: event.target.value })} /></label>
              <label><span>Caption</span><input value={cover.caption} onChange={(event) => updateCover({ caption: event.target.value })} /></label>
            </SettingsSection>
            <SettingsSection title="Overview lists">
              <StringListEditor label="Outcomes" values={overview.outcomes} onChange={(outcomes) => updateOverview({ outcomes })} />
              <StringListEditor label="Prerequisites" values={overview.prerequisites} onChange={(prerequisites) => updateOverview({ prerequisites })} />
            </SettingsSection>
            <SettingsSection title="Sources">
              {(course.citations ?? []).map((citation, index) => (
                <div className="admin-settings-row" key={citation.id}>
                  <input value={citation.title} aria-label={`Source ${index + 1} title`} onChange={(event) => {
                    const citations = [...(course.citations ?? [])]; citations[index] = { ...citation, title: event.target.value }; updateCourse({ citations });
                  }} />
                  <input value={citation.url} aria-label={`Source ${index + 1} URL`} onChange={(event) => {
                    const citations = [...(course.citations ?? [])]; citations[index] = { ...citation, url: event.target.value }; updateCourse({ citations });
                  }} />
                  <button type="button" onClick={() => updateCourse({ citations: (course.citations ?? []).filter((_, position) => position !== index) })}><Trash2 size={13} /></button>
                </div>
              ))}
              <button type="button" className="admin-settings-add" onClick={() => updateCourse({ citations: [...(course.citations ?? []), { id: `src-${(course.citations?.length ?? 0) + 1}`, title: "New source", url: "https://" }] })}><Plus size={13} /> Add source</button>
            </SettingsSection>
            <SettingsSection title="Certificate">
              <label><span>Certificate title</span><input value={course.certificateCriteria?.title ?? ""} onChange={(event) => updateCourse({ certificateCriteria: { title: event.target.value, requiredScore: course.certificateCriteria?.requiredScore ?? 80, requiredArtifacts: course.certificateCriteria?.requiredArtifacts ?? [], skills: course.certificateCriteria?.skills ?? course.skills, statement: course.certificateCriteria?.statement ?? "" } })} /></label>
              <label><span>Required score</span><input type="number" min={0} max={100} value={course.certificateCriteria?.requiredScore ?? 80} onChange={(event) => updateCourse({ certificateCriteria: { title: course.certificateCriteria?.title ?? "Course completion", requiredScore: Number(event.target.value), requiredArtifacts: course.certificateCriteria?.requiredArtifacts ?? [], skills: course.certificateCriteria?.skills ?? course.skills, statement: course.certificateCriteria?.statement ?? "" } })} /></label>
              <label><span>Statement</span><textarea rows={3} value={course.certificateCriteria?.statement ?? ""} onChange={(event) => updateCourse({ certificateCriteria: { title: course.certificateCriteria?.title ?? "Course completion", requiredScore: course.certificateCriteria?.requiredScore ?? 80, requiredArtifacts: course.certificateCriteria?.requiredArtifacts ?? [], skills: course.certificateCriteria?.skills ?? course.skills, statement: event.target.value } })} /></label>
            </SettingsSection>
          </>
        ) : lesson ? <LessonSettings lesson={lesson} onChange={onLessonChange} /> : null}
      </div>
    </aside>
  );
}

function LessonSettings({ lesson, onChange }: { lesson: Lesson; onChange: (patch: Partial<Lesson>) => void }) {
  const roleplay: RoleplayScenario = lesson.roleplay ?? { name: "", role: "", initials: "", opener: "", followUps: [], critique: [] };
  const lab: LabBlueprint = lesson.lab ?? { scenario: "", task: "", starterContext: "", deliverable: "", successCriteria: [] };
  const plan: WhiteboardTeachingPlan = lesson.whiteboardPlan ?? { objective: "", beats: [], visualElements: [] };

  return (
    <>
      <SettingsSection title="Lesson details">
        <label><span>Mode</span><select value={lesson.type} onChange={(event) => onChange({ type: event.target.value as LessonType })}><option value="study">Study</option><option value="lab">Lab</option><option value="assessment">Assessment</option><option value="roleplay">Roleplay</option></select></label>
        <label><span>Duration</span><input value={lesson.duration} onChange={(event) => onChange({ duration: event.target.value })} /></label>
        <label><span>Summary</span><textarea rows={4} value={lesson.summary} onChange={(event) => onChange({ summary: event.target.value })} /></label>
      </SettingsSection>
      <SettingsSection title="Teaching plan">
        <label><span>Objective</span><textarea rows={3} value={plan.objective} onChange={(event) => onChange({ whiteboardPlan: { ...plan, objective: event.target.value } })} /></label>
        <label><span>Teaching beats <small>One per line</small></span><textarea rows={5} value={plan.beats.join("\n")} onChange={(event) => onChange({ whiteboardPlan: { ...plan, beats: splitLines(event.target.value) } })} /></label>
        <label><span>Visual elements <small>One per line</small></span><textarea rows={4} value={plan.visualElements.join("\n")} onChange={(event) => onChange({ whiteboardPlan: { ...plan, visualElements: splitLines(event.target.value) } })} /></label>
      </SettingsSection>
      <SettingsSection title="Resources">
        {(lesson.resources ?? []).map((resource, index) => (
          <div className="admin-settings-row" key={resource.id}>
            <input value={resource.title} aria-label={`Resource ${index + 1} title`} onChange={(event) => {
              const resources = [...(lesson.resources ?? [])]; resources[index] = { ...resource, title: event.target.value }; onChange({ resources });
            }} />
            <input value={resource.url} aria-label={`Resource ${index + 1} URL`} onChange={(event) => {
              const resources = [...(lesson.resources ?? [])]; resources[index] = { ...resource, url: event.target.value }; onChange({ resources });
            }} />
            <button type="button" onClick={() => onChange({ resources: (lesson.resources ?? []).filter((_, position) => position !== index) })}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" className="admin-settings-add" onClick={() => onChange({ resources: [...(lesson.resources ?? []), { id: `resource-${crypto.randomUUID().slice(0, 8)}`, title: "New resource", provider: "", kind: "article", url: "https://" } satisfies LearningResource] })}><Plus size={13} /> Add resource</button>
      </SettingsSection>
      {lesson.type === "lab" && (
        <SettingsSection title="Lab brief">
          <label><span>Scenario</span><textarea rows={3} value={lab.scenario} onChange={(event) => onChange({ lab: { ...lab, scenario: event.target.value } })} /></label>
          <label><span>Task</span><textarea rows={3} value={lab.task} onChange={(event) => onChange({ lab: { ...lab, task: event.target.value } })} /></label>
          <label><span>Starter context</span><textarea rows={3} value={lab.starterContext} onChange={(event) => onChange({ lab: { ...lab, starterContext: event.target.value } })} /></label>
          <label><span>Deliverable</span><textarea rows={3} value={lab.deliverable} onChange={(event) => onChange({ lab: { ...lab, deliverable: event.target.value } })} /></label>
          <label><span>Success criteria <small>One per line</small></span><textarea rows={4} value={lab.successCriteria.join("\n")} onChange={(event) => onChange({ lab: { ...lab, successCriteria: splitLines(event.target.value) } })} /></label>
        </SettingsSection>
      )}
      {lesson.type === "roleplay" && (
        <SettingsSection title="Roleplay scenario">
          <label><span>Persona name</span><input value={roleplay.name} onChange={(event) => onChange({ roleplay: { ...roleplay, name: event.target.value } })} /></label>
          <label><span>Persona role</span><input value={roleplay.role} onChange={(event) => onChange({ roleplay: { ...roleplay, role: event.target.value } })} /></label>
          <label><span>Opener</span><textarea rows={3} value={roleplay.opener} onChange={(event) => onChange({ roleplay: { ...roleplay, opener: event.target.value } })} /></label>
          <label><span>Follow-ups <small>One per line</small></span><textarea rows={4} value={roleplay.followUps.join("\n")} onChange={(event) => onChange({ roleplay: { ...roleplay, followUps: splitLines(event.target.value) } })} /></label>
          <label><span>Critique points <small>One per line</small></span><textarea rows={4} value={roleplay.critique.join("\n")} onChange={(event) => onChange({ roleplay: { ...roleplay, critique: splitLines(event.target.value) } })} /></label>
        </SettingsSection>
      )}
      {lesson.browserLab && <BrowserLabSettings browserLab={lesson.browserLab} onChange={(browserLab) => onChange({ browserLab })} />}
    </>
  );
}

function BrowserLabSettings({ browserLab, onChange }: { browserLab: BrowserLabBlueprint; onChange: (browserLab: BrowserLabBlueprint) => void }) {
  return (
    <SettingsSection title="Browser lab">
      <label><span>Platform</span><input value={browserLab.platform ?? browserLab.platformId} onChange={(event) => onChange({ ...browserLab, platform: event.target.value })} /></label>
      <label><span>Launch URL</span><input value={browserLab.launchUrl} onChange={(event) => onChange({ ...browserLab, launchUrl: event.target.value })} /></label>
      <label><span>Objective</span><textarea rows={4} value={browserLab.objective} onChange={(event) => onChange({ ...browserLab, objective: event.target.value })} /></label>
      <label><span>Prerequisites <small>One per line</small></span><textarea rows={4} value={(browserLab.prerequisites ?? []).join("\n")} onChange={(event) => onChange({ ...browserLab, prerequisites: splitLines(event.target.value) })} /></label>
      <label><span>Success criteria <small>One per line</small></span><textarea rows={4} value={browserLab.successCriteria.join("\n")} onChange={(event) => onChange({ ...browserLab, successCriteria: splitLines(event.target.value) })} /></label>
    </SettingsSection>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="admin-settings-section"><h3>{title}</h3>{children}</section>;
}

function StringListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <div className="admin-string-list">
      <span>{label}</span>
      {values.map((value, index) => (
        <div key={`${label}-${index}`}><textarea rows={2} value={value} onChange={(event) => { const next = [...values]; next[index] = event.target.value; onChange(next); }} /><button type="button" onClick={() => onChange(values.filter((_, position) => position !== index))}><Trash2 size={13} /></button></div>
      ))}
      <button type="button" className="admin-settings-add" onClick={() => onChange([...values, "New item"])}><Plus size={13} /> Add {label.toLowerCase().replace(/s$/, "")}</button>
    </div>
  );
}

function LessonModePreview({ lesson }: { lesson: Lesson }) {
  if (lesson.assessment?.length) {
    return <CourseBlockRenderer block={{ id: `${lesson.id}-assessment`, type: "quiz", heading: "Assessment", questions: lesson.assessment }} citations={[]} />;
  }
  if (lesson.lab) {
    return (
      <section className="rich-block admin-mode-preview">
        <span>Hands-on lab</span><h2>{lesson.lab.scenario || lesson.title}</h2><p>{lesson.lab.task}</p>
        <dl><div><dt>Starter context</dt><dd>{lesson.lab.starterContext}</dd></div><div><dt>Deliverable</dt><dd>{lesson.lab.deliverable}</dd></div></dl>
        {!!lesson.lab.successCriteria.length && <ul>{lesson.lab.successCriteria.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>
    );
  }
  if (lesson.roleplay) {
    return (
      <section className="rich-block admin-mode-preview">
        <span>Roleplay scenario</span><h2>{lesson.roleplay.name}</h2><p><strong>{lesson.roleplay.role}</strong></p><blockquote>{lesson.roleplay.opener}</blockquote>
        {!!lesson.roleplay.critique.length && <ul>{lesson.roleplay.critique.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>
    );
  }
  if (lesson.whiteboardPlan || lesson.resources?.length) {
    return (
      <section className="rich-block admin-mode-preview">
        <span>Guided study</span><h2>{lesson.whiteboardPlan?.objective || lesson.title}</h2>
        {!!lesson.whiteboardPlan?.beats.length && <ol>{lesson.whiteboardPlan.beats.map((item) => <li key={item}>{item}</li>)}</ol>}
        {!!lesson.resources?.length && <div className="admin-preview-resources">{lesson.resources.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a>)}</div>}
      </section>
    );
  }
  return <div className="admin-empty-lesson"><Layers3 size={22} /><strong>This lesson has no content yet.</strong><span>Add a content block below or configure lesson settings.</span></div>;
}
