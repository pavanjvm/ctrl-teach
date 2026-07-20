import assert from "node:assert/strict";
import test from "node:test";

import {
  duplicateBlock,
  moveBlock,
  moveLesson,
  moveModuleTo,
  updateLessonById,
} from "./courseEditor.ts";

function course() {
  return {
    id: "course-1",
    title: "Course",
    description: "Description",
    thumbnail: "",
    instructor: "Instructor",
    platform: "Ctrl+Teach",
    difficulty: "Beginner",
    duration: "1h",
    skills: [],
    rating: 0,
    ratingCount: 0,
    customMetadata: { preserved: true },
    modules: [
      {
        id: "module-1",
        title: "One",
        lessons: [
          {
            id: "lesson-1",
            title: "Lesson one",
            type: "study",
            duration: "10m",
            summary: "One",
            customLessonField: "keep-me",
            contentBlocks: [
              { id: "block-1", type: "content", heading: "First", paragraphs: ["First"] },
              { id: "block-2", type: "content", heading: "Second", paragraphs: ["Second"] },
            ],
          },
          { id: "lesson-2", title: "Lesson two", type: "study", duration: "10m", summary: "Two" },
        ],
      },
      { id: "module-2", title: "Two", lessons: [] },
    ],
  };
}

test("ID-based lesson update preserves unknown rich fields", () => {
  const updated = updateLessonById(course(), "module-1", "lesson-1", { title: "Changed" });
  assert.equal(updated.modules[0].lessons[0].title, "Changed");
  assert.equal(updated.modules[0].lessons[0].customLessonField, "keep-me");
  assert.deepEqual(updated.customMetadata, { preserved: true });
});

test("lesson can move between modules without changing its ID", () => {
  const updated = moveLesson(course(), "lesson-1", "module-1", "module-2");
  assert.deepEqual(updated.modules[0].lessons.map((lesson) => lesson.id), ["lesson-2"]);
  assert.deepEqual(updated.modules[1].lessons.map((lesson) => lesson.id), ["lesson-1"]);
});

test("modules and blocks reorder without mutation", () => {
  const original = course();
  const modulesMoved = moveModuleTo(original, "module-2", 0);
  const blocksMoved = moveBlock(original, "module-1", "lesson-1", "block-2", -1);

  assert.deepEqual(modulesMoved.modules.map((module) => module.id), ["module-2", "module-1"]);
  assert.deepEqual(blocksMoved.modules[0].lessons[0].contentBlocks.map((block) => block.id), ["block-2", "block-1"]);
  assert.deepEqual(original.modules.map((module) => module.id), ["module-1", "module-2"]);
});

test("duplicated blocks receive stable unique IDs", () => {
  const updated = duplicateBlock(course(), "module-1", "lesson-1", "block-1");
  const blocks = updated.modules[0].lessons[0].contentBlocks;
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].heading, "First");
  assert.notEqual(blocks[1].id, blocks[0].id);
});
