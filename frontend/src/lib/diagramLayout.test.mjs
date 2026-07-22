import assert from "node:assert/strict";
import test from "node:test";

import { compileStructuredDiagram } from "./diagramLayout.ts";

const measureText = (text, fontSize) => Array.from(text).length * fontSize * 0.56;

function overlaps(left, right) {
  return !(
    left.x + left.width <= right.x
    || right.x + right.width <= left.x
    || left.y + left.height <= right.y
    || right.y + right.height <= left.y
  );
}

function diagram(overrides = {}) {
  return {
    type: "structured-diagram",
    id: "diagram-test",
    x: 72,
    y: 60,
    diagramType: "flowchart",
    title: "Request lifecycle",
    direction: "TB",
    nodes: [
      { id: "receive", label: "Receive request", shape: "rectangle" },
      { id: "validate", label: "Validate request", shape: "diamond" },
      { id: "respond", label: "Return response", shape: "rectangle" },
    ],
    edges: [
      { from: "receive", to: "validate" },
      { from: "validate", to: "respond", label: "valid" },
    ],
    ...overrides,
  };
}

test("lays out nodes without overlap and binds every arrow", () => {
  const elements = compileStructuredDiagram(diagram(), { maxWidth: 620, measureText });
  const nodes = elements.filter((element) => ["rectangle", "ellipse", "diamond"].includes(element.type));
  const arrows = elements.filter((element) => element.type === "arrow");

  assert.equal(nodes.length, 3);
  assert.equal(arrows.length, 2);
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      assert.equal(overlaps(nodes[left], nodes[right]), false);
    }
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  arrows.forEach((arrow) => {
    assert.ok(nodeIds.has(arrow.start.id));
    assert.ok(nodeIds.has(arrow.end.id));
    assert.ok(arrow.points.length >= 2);
  });
});

test("wraps long labels inside bounded nodes", () => {
  const elements = compileStructuredDiagram(diagram({
    nodes: [{
      id: "long",
      label: "ValidateAnExtremelyLongUnbrokenIdentifierBeforeContinuing with several additional explanation words",
      shape: "rectangle",
    }],
    edges: [],
  }), { maxWidth: 440, measureText });
  const node = elements.find((element) => element.type === "rectangle");

  assert.ok(node);
  assert.ok(node.width <= 288);
  assert.ok(node.height > 68);
  assert.match(node.label.text, /\n/);
});

test("falls back to a vertical layout when a wide graph exceeds the viewport", () => {
  const nodes = Array.from({ length: 6 }, (_, index) => ({
    id: `node-${index + 1}`,
    label: `Stage ${index + 1}`,
    shape: "rectangle",
  }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1].id,
  }));
  const elements = compileStructuredDiagram(diagram({
    direction: "LR",
    nodes,
    edges,
  }), { maxWidth: 420, measureText });
  const positioned = elements.filter((element) => element.type === "rectangle");
  const distinctRows = new Set(positioned.map((node) => Math.round(node.y)));

  assert.ok(distinctRows.size > 1);
  assert.ok(Math.max(...positioned.map((node) => node.x + node.width)) <= 72 + 420);
});

test("produces stable geometry for the same semantic graph", () => {
  const first = compileStructuredDiagram(diagram(), { maxWidth: 620, measureText });
  const second = compileStructuredDiagram(diagram(), { maxWidth: 620, measureText });
  assert.deepEqual(second, first);
});
