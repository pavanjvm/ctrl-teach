import type { Course, CourseContentBlock, Lesson, Module } from "@/lib/types";

export type CourseEditorSelection =
  | { kind: "overview" }
  | { kind: "lesson"; moduleId: string; lessonId: string };

export function editorId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function cloneCourse(course: Course): Course {
  return JSON.parse(JSON.stringify(course));
}

export function createLesson(): Lesson {
  return {
    id: editorId("lesson"),
    title: "New lesson",
    type: "study",
    duration: "15m",
    summary: "Add a concise description of what learners will do in this lesson.",
    contentBlocks: [createContentBlock("content")],
  };
}

export function createModule(): Module {
  return {
    id: editorId("module"),
    title: "New module",
    lessons: [createLesson()],
  };
}

export function createContentBlock(type: CourseContentBlock["type"]): CourseContentBlock {
  const id = editorId("block");
  if (type === "grid_cards") return { id, type, heading: "Key ideas", cards: [{ title: "First idea", body: "Explain this idea." }] };
  if (type === "info_tabs") return { id, type, heading: "Explore the topic", tabs: [{ label: "Overview", paragraphs: ["Add tab content."] }] };
  if (type === "flip_cards") return { id, type, heading: "Check your recall", cards: [{ front: "Concept", back: "Explanation" }] };
  if (type === "quiz") return {
    id,
    type,
    heading: "Knowledge check",
    questions: [{ id: editorId("question"), question: "New question", choices: ["Choice one", "Choice two"], answerIndex: 0, explanation: "Explain the correct answer." }],
  };
  if (type === "numbered_list") return { id, type, heading: "Step by step", items: [{ title: "First step", body: "Describe this step." }] };
  if (type === "html") return { id, type, heading: "Interactive example", html: "<p>Add safe interactive HTML.</p>", accessibilitySummary: "Text description of this interactive example.", height: 280 };
  if (type === "image") return {
    id,
    type,
    asset: {
      id: editorId("image"),
      status: "ready",
      url: "",
      alt: "",
      caption: "",
      prompt: "",
      width: 1536,
      height: 1024,
      contentType: "image/webp",
      sizeBytes: 0,
    },
  };
  return { id, type: "content", heading: "New content section", paragraphs: ["Add lesson content here."] };
}

export function updateModuleById(course: Course, moduleId: string, patch: Partial<Module>): Course {
  return {
    ...course,
    modules: course.modules.map((module) => module.id === moduleId ? { ...module, ...patch } : module),
  };
}

export function updateLessonById(course: Course, moduleId: string, lessonId: string, patch: Partial<Lesson>): Course {
  return {
    ...course,
    modules: course.modules.map((module) => module.id === moduleId ? {
      ...module,
      lessons: module.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, ...patch } : lesson),
    } : module),
  };
}

export function removeModuleById(course: Course, moduleId: string): Course {
  return { ...course, modules: course.modules.filter((module) => module.id !== moduleId) };
}

export function removeLessonById(course: Course, moduleId: string, lessonId: string): Course {
  return updateModuleById(course, moduleId, {
    lessons: course.modules.find((module) => module.id === moduleId)?.lessons.filter((lesson) => lesson.id !== lessonId) ?? [],
  });
}

export function moveModule(course: Course, moduleId: string, direction: -1 | 1): Course {
  const index = course.modules.findIndex((module) => module.id === moduleId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= course.modules.length) return course;
  const modules = [...course.modules];
  [modules[index], modules[destination]] = [modules[destination], modules[index]];
  return { ...course, modules };
}

export function moveModuleTo(course: Course, moduleId: string, destinationIndex: number): Course {
  const index = course.modules.findIndex((module) => module.id === moduleId);
  if (index < 0) return course;
  const modules = [...course.modules];
  const [module] = modules.splice(index, 1);
  const destination = Math.max(0, Math.min(destinationIndex, modules.length));
  modules.splice(destination, 0, module);
  return { ...course, modules };
}

export function moveLesson(
  course: Course,
  lessonId: string,
  fromModuleId: string,
  toModuleId: string,
  destinationIndex?: number,
): Course {
  const fromModule = course.modules.find((module) => module.id === fromModuleId);
  const lesson = fromModule?.lessons.find((item) => item.id === lessonId);
  if (!fromModule || !lesson || !course.modules.some((module) => module.id === toModuleId)) return course;

  return {
    ...course,
    modules: course.modules.map((module) => {
      const withoutLesson = module.lessons.filter((item) => item.id !== lessonId);
      if (module.id !== toModuleId) return module.id === fromModuleId ? { ...module, lessons: withoutLesson } : module;
      const lessons = module.id === fromModuleId ? withoutLesson : [...module.lessons];
      const index = Math.max(0, Math.min(destinationIndex ?? lessons.length, lessons.length));
      lessons.splice(index, 0, lesson);
      return { ...module, lessons };
    }),
  };
}

export function moveLessonWithinModule(course: Course, moduleId: string, lessonId: string, direction: -1 | 1): Course {
  const module = course.modules.find((item) => item.id === moduleId);
  if (!module) return course;
  const index = module.lessons.findIndex((lesson) => lesson.id === lessonId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= module.lessons.length) return course;
  const lessons = [...module.lessons];
  [lessons[index], lessons[destination]] = [lessons[destination], lessons[index]];
  return updateModuleById(course, moduleId, { lessons });
}

export function updateBlockById(course: Course, moduleId: string, lessonId: string, blockId: string, block: CourseContentBlock): Course {
  const lesson = course.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
  if (!lesson) return course;
  return updateLessonById(course, moduleId, lessonId, {
    contentBlocks: (lesson.contentBlocks ?? []).map((item) => item.id === blockId ? block : item),
  });
}

export function removeBlockById(course: Course, moduleId: string, lessonId: string, blockId: string): Course {
  const lesson = course.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
  if (!lesson) return course;
  return updateLessonById(course, moduleId, lessonId, {
    contentBlocks: (lesson.contentBlocks ?? []).filter((block) => block.id !== blockId),
  });
}

export function moveBlock(course: Course, moduleId: string, lessonId: string, blockId: string, direction: -1 | 1): Course {
  const lesson = course.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
  if (!lesson) return course;
  const blocks = [...(lesson.contentBlocks ?? [])];
  const index = blocks.findIndex((block) => block.id === blockId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= blocks.length) return course;
  [blocks[index], blocks[destination]] = [blocks[destination], blocks[index]];
  return updateLessonById(course, moduleId, lessonId, { contentBlocks: blocks });
}

export function moveBlockTo(course: Course, moduleId: string, lessonId: string, blockId: string, destinationIndex: number): Course {
  const lesson = course.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
  if (!lesson) return course;
  const blocks = [...(lesson.contentBlocks ?? [])];
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return course;
  const [block] = blocks.splice(index, 1);
  const destination = Math.max(0, Math.min(destinationIndex, blocks.length));
  blocks.splice(destination, 0, block);
  return updateLessonById(course, moduleId, lessonId, { contentBlocks: blocks });
}

export function duplicateBlock(course: Course, moduleId: string, lessonId: string, blockId: string): Course {
  const lesson = course.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
  const blocks = [...(lesson?.contentBlocks ?? [])];
  const index = blocks.findIndex((block) => block.id === blockId);
  if (!lesson || index < 0) return course;
  const duplicate = { ...JSON.parse(JSON.stringify(blocks[index])), id: editorId("block") } as CourseContentBlock;
  blocks.splice(index + 1, 0, duplicate);
  return updateLessonById(course, moduleId, lessonId, { contentBlocks: blocks });
}
