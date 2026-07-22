import type { CanvasElement } from "../../types/whiteboard";

type TextMeasurer = (text: string, fontSize: number) => number;

interface ViewportTextLayoutOptions {
  rightBoundary: number;
  rightMargin?: number;
  measureText?: TextMeasurer;
}

const DEFAULT_RIGHT_MARGIN = 48;
const MIN_TEXT_WIDTH = 140;
const LINE_HEIGHT_RATIO = 1.6;

function defaultMeasureText(text: string, fontSize: number): number {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font = `${fontSize}px Virgil, "Comic Sans MS", cursive`;
      return context.measureText(text).width;
    }
  }
  return Array.from(text).reduce(
    (width, character) => width + (character === " " ? fontSize * 0.38 : fontSize * 0.64),
    0,
  );
}

function splitLongToken(
  token: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasurer,
): string[] {
  if (measure(token, fontSize) <= maxWidth) return [token];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of token) {
    const candidate = `${chunk}${character}`;
    if (chunk && measure(candidate, fontSize) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapLine(
  line: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasurer,
): string[] {
  const words = line
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitLongToken(word, maxWidth, fontSize, measure));
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Reflow only tutor notes explicitly tagged by the classroom backend. */
export function layoutClassroomViewportText(
  elements: CanvasElement[],
  options: ViewportTextLayoutOptions,
): CanvasElement[] {
  const measure = options.measureText ?? defaultMeasureText;
  const rightMargin = options.rightMargin ?? DEFAULT_RIGHT_MARGIN;
  let accumulatedYOffset = 0;

  return elements.map((element) => {
    if (element.type !== "text" || element.viewportWrap !== true) return element;

    const fontSize = Math.max(8, Number(element.fontSize) || 20);
    const x = Number(element.x) || 0;
    const maxWidth = Math.max(MIN_TEXT_WIDTH, options.rightBoundary - x - rightMargin);
    const sourceText = String(element.text || "");
    const sourceLines = sourceText.split("\n");
    const wrappedLines = sourceLines.flatMap((line) => wrapLine(line, maxWidth, fontSize, measure));
    const lineHeight = fontSize * LINE_HEIGHT_RATIO;
    const sourceHeight = Math.max(lineHeight, Number(element.height) || sourceLines.length * lineHeight);
    const wrappedHeight = Math.max(lineHeight, wrappedLines.length * lineHeight);

    const laidOut: CanvasElement = {
      ...element,
      y: (Number(element.y) || 0) + accumulatedYOffset,
      text: wrappedLines.join("\n"),
      autoResize: true,
    };
    accumulatedYOffset += Math.max(0, wrappedHeight - sourceHeight);
    return laidOut;
  });
}
