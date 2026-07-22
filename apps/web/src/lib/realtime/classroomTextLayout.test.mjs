import assert from "node:assert/strict";
import test from "node:test";

import { layoutClassroomViewportText } from "./classroomTextLayout.ts";

const measure = (text, fontSize) => text.length * fontSize * 0.5;

test("wraps tagged classroom notes inside the visible right boundary", () => {
  const [result] = layoutClassroomViewportText([{
    type: "text",
    x: 70,
    y: 40,
    text: "Computer systems doing tasks linked to human intelligence",
    fontSize: 20,
    height: 32,
    viewportWrap: true,
  }], {
    rightBoundary: 360,
    rightMargin: 40,
    measureText: measure,
  });

  const lines = result.text.split("\n");
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => measure(line, 20) <= 250));
});

test("moves following tagged lines down when an earlier line reflows", () => {
  const results = layoutClassroomViewportText([
    {
      type: "text",
      x: 70,
      y: 40,
      text: "one two three four five six seven eight",
      fontSize: 20,
      height: 32,
      viewportWrap: true,
    },
    {
      type: "text",
      x: 70,
      y: 72,
      text: "following line",
      fontSize: 20,
      height: 32,
      viewportWrap: true,
    },
  ], {
    rightBoundary: 250,
    rightMargin: 40,
    measureText: measure,
  });

  assert.ok(results[0].text.includes("\n"));
  assert.ok(results[1].y > 72);
});

test("does not change other Excalidraw text", () => {
  const source = { type: "text", x: 70, y: 40, text: "diagram title", fontSize: 28 };
  const [result] = layoutClassroomViewportText([source], {
    rightBoundary: 180,
    measureText: measure,
  });
  assert.deepEqual(result, source);
});
