export type ClickyDrawCommand = {
  tool: "draw_on_screen" | "clear_screen_drawings";
  shape?: "circle" | "rectangle" | "highlight" | "underline" | "arrow" | "line";
  targetId?: string | null;
  fromTargetId?: string | null;
  toTargetId?: string | null;
  x?: number | null;
  y?: number | null;
  endX?: number | null;
  endY?: number | null;
  label?: string;
  color?: "blue" | "teal" | "red" | "amber" | "purple";
  id: string;
  coordinateSpace?: "screenshot" | "viewport";
};

export const CLICKY_BOARD_DRAW_EVENT = "ctrlteach:clicky-board-draw";

export function dispatchBoardClickyDraw(command: ClickyDrawCommand) {
  window.dispatchEvent(
    new CustomEvent<ClickyDrawCommand>(CLICKY_BOARD_DRAW_EVENT, { detail: command }),
  );
}
