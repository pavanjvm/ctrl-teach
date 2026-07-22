import dagre, { Graph } from "@dagrejs/dagre";

import type {
  CanvasElement,
  StructuredDiagramEdge,
  StructuredDiagramElement,
  StructuredDiagramNode,
} from "../../types/whiteboard";

type TextMeasurer = (text: string, fontSize: number) => number;

interface DiagramLayoutOptions {
  maxWidth?: number;
  measureText?: TextMeasurer;
}

interface PreparedNode {
  source: StructuredDiagramNode;
  id: string;
  label: string;
  width: number;
  height: number;
}

interface PositionedGraph {
  graph: Graph;
  direction: "TB" | "LR";
  width: number;
  height: number;
}

const NODE_FONT_SIZE = 18;
const EDGE_FONT_SIZE = 14;
const TITLE_FONT_SIZE = 28;
const NODE_TEXT_MAX_WIDTH = 244;
const NODE_HORIZONTAL_PADDING = 44;
const NODE_VERTICAL_PADDING = 28;
const NODE_MIN_WIDTH = 176;
const NODE_MAX_WIDTH = NODE_TEXT_MAX_WIDTH + NODE_HORIZONTAL_PADDING;
const NODE_MIN_HEIGHT = 68;
const NODE_GAP = 48;
const RANK_GAP = 72;

const NODE_COLORS = ["#dbeafe", "#dcfce7", "#fef3c7", "#f3e8ff", "#ffe4e6"];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function defaultMeasureText(text: string, fontSize: number): number {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font = `${fontSize}px Virgil, "Comic Sans MS", cursive`;
      return context.measureText(text).width;
    }
  }
  return Array.from(text).reduce((width, character) => (
    width + (character === " " ? fontSize * 0.34 : fontSize * 0.58)
  ), 0);
}

function splitLongToken(token: string, maxWidth: number, measure: TextMeasurer): string[] {
  if (measure(token, NODE_FONT_SIZE) <= maxWidth) return [token];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of token) {
    const candidate = `${chunk}${character}`;
    if (chunk && measure(candidate, NODE_FONT_SIZE) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(
  value: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasurer,
): string {
  const words = value.trim().split(/\s+/).filter(Boolean).flatMap((word) => (
    fontSize === NODE_FONT_SIZE ? splitLongToken(word, maxWidth, measure) : [word]
  ));
  if (words.length === 0) return "Untitled";

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, fontSize) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function prepareNodes(
  element: StructuredDiagramElement,
  measure: TextMeasurer,
): PreparedNode[] {
  const prefix = element.id || "diagram";
  return element.nodes.slice(0, 10).map((node, index) => {
    const label = wrapText(node.label, NODE_TEXT_MAX_WIDTH, NODE_FONT_SIZE, measure);
    const lines = label.split("\n");
    const textWidth = Math.max(...lines.map((line) => measure(line, NODE_FONT_SIZE)));
    const lineHeight = Math.ceil(NODE_FONT_SIZE * 1.35);
    return {
      source: node,
      id: `${prefix}-node-${node.id || index + 1}`,
      label,
      width: clamp(textWidth + NODE_HORIZONTAL_PADDING, NODE_MIN_WIDTH, NODE_MAX_WIDTH),
      height: Math.max(NODE_MIN_HEIGHT, lines.length * lineHeight + NODE_VERTICAL_PADDING),
    };
  });
}

function buildGraph(
  prepared: PreparedNode[],
  edges: StructuredDiagramEdge[],
  direction: "TB" | "LR",
  addLayoutOnlyEdges: boolean,
  measure: TextMeasurer,
): PositionedGraph {
  const graph = new dagre.graphlib.Graph({ multigraph: true })
    .setGraph({
      rankdir: direction,
      nodesep: NODE_GAP,
      ranksep: RANK_GAP,
      marginx: 8,
      marginy: 8,
      ranker: "network-simplex",
    })
    .setDefaultEdgeLabel(() => ({}));

  prepared.forEach((node) => {
    graph.setNode(node.source.id, { width: node.width, height: node.height });
  });

  edges.forEach((edge, index) => {
    const label = String(edge.label || "");
    graph.setEdge(
      edge.from,
      edge.to,
      label
        ? {
            width: Math.min(180, measure(label, EDGE_FONT_SIZE) + 18),
            height: EDGE_FONT_SIZE * 1.5,
          }
        : {},
      `edge-${index}`,
    );
  });

  if (edges.length === 0 && addLayoutOnlyEdges) {
    for (let index = 0; index < prepared.length - 1; index += 1) {
      graph.setEdge(
        prepared[index].source.id,
        prepared[index + 1].source.id,
        { layoutOnly: true },
        `layout-${index}`,
      );
    }
  }

  dagre.layout(graph);
  const dimensions = graph.graph();
  return {
    graph,
    direction,
    width: Number(dimensions.width) || 0,
    height: Number(dimensions.height) || 0,
  };
}

function normalizeShape(shape: string | undefined): "rectangle" | "ellipse" | "diamond" {
  if (shape === "ellipse" || shape === "diamond") return shape;
  return "rectangle";
}

export function isStructuredDiagramElement(
  element: CanvasElement,
): element is StructuredDiagramElement {
  return element.type === "structured-diagram"
    && Array.isArray((element as StructuredDiagramElement).nodes)
    && Array.isArray((element as StructuredDiagramElement).edges);
}

export function compileStructuredDiagram(
  element: StructuredDiagramElement,
  options: DiagramLayoutOptions = {},
): CanvasElement[] {
  const measure = options.measureText ?? defaultMeasureText;
  const availableWidth = clamp(Number(options.maxWidth) || 760, 340, 1080);
  const prepared = prepareNodes(element, measure);
  if (prepared.length === 0) return [];

  const requestedDirection = element.direction === "LR" ? "LR" : "TB";
  const listLike = ["list", "comparison_table", "equation"].includes(element.diagramType);
  let positioned = buildGraph(prepared, element.edges, requestedDirection, listLike, measure);
  if (positioned.direction === "LR" && positioned.width > availableWidth && prepared.length > 3) {
    positioned = buildGraph(prepared, element.edges, "TB", listLike, measure);
  }

  const originX = Number(element.x) || 72;
  const originY = Number(element.y) || 60;
  const output: CanvasElement[] = [];
  const showTitle = Boolean(element.title?.trim()) && element.diagramType !== "mindmap";
  let graphY = originY;

  if (showTitle) {
    const wrappedTitle = wrapText(
      element.title || "",
      Math.min(availableWidth, 680),
      TITLE_FONT_SIZE,
      measure,
    );
    const titleLines = wrappedTitle.split("\n");
    const titleHeight = titleLines.length * Math.ceil(TITLE_FONT_SIZE * 1.3);
    output.push({
      type: "text",
      id: `${element.id}-title`,
      x: originX,
      y: originY,
      text: wrappedTitle,
      fontSize: TITLE_FONT_SIZE,
      fontFamily: 1,
      strokeColor: "#1864ab",
      width: Math.min(availableWidth, 680),
      height: titleHeight,
      autoResize: false,
    });
    graphY += titleHeight + 34;
  }

  const graphX = originX + Math.max(0, (availableWidth - positioned.width) / 2);
  const nodeIds = new Map(prepared.map((node) => [node.source.id, node.id]));

  prepared.forEach((node, index) => {
    const position = positioned.graph.node(node.source.id);
    if (!position) return;
    output.push({
      type: normalizeShape(node.source.shape),
      id: node.id,
      x: graphX + position.x - node.width / 2,
      y: graphY + position.y - node.height / 2,
      width: node.width,
      height: node.height,
      strokeColor: index === 0 && element.diagramType === "mindmap" ? "#1864ab" : "#4b5563",
      backgroundColor: NODE_COLORS[index % NODE_COLORS.length],
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      label: {
        text: node.label,
        fontSize: NODE_FONT_SIZE,
        fontFamily: 1,
        strokeColor: "#1f2937",
        textAlign: "center",
        verticalAlign: "middle",
      },
    });
  });

  element.edges.slice(0, 16).forEach((edge, index) => {
    const sourceId = nodeIds.get(edge.from);
    const targetId = nodeIds.get(edge.to);
    if (!sourceId || !targetId) return;
    const graphEdge = positioned.graph.edge({
      v: edge.from,
      w: edge.to,
      name: `edge-${index}`,
    });
    const points = Array.isArray(graphEdge?.points) ? graphEdge.points : [];
    if (points.length < 2) return;
    const first = points[0];
    output.push({
      type: "arrow",
      id: `${element.id}-edge-${index + 1}`,
      x: graphX + first.x,
      y: graphY + first.y,
      points: points.map((point: { x: number; y: number }) => [
        point.x - first.x,
        point.y - first.y,
      ]),
      strokeColor: "#5f6b76",
      strokeWidth: 2,
      roughness: 1,
      start: { id: sourceId },
      end: { id: targetId },
      label: edge.label
        ? {
            text: edge.label,
            fontSize: EDGE_FONT_SIZE,
            fontFamily: 1,
            strokeColor: "#374151",
          }
        : undefined,
    });
  });

  return output;
}

export function compileStructuredDiagrams(
  elements: CanvasElement[],
  options: DiagramLayoutOptions = {},
): CanvasElement[] {
  return elements.flatMap((element) => (
    isStructuredDiagramElement(element)
      ? compileStructuredDiagram(element, options)
      : [element]
  ));
}
