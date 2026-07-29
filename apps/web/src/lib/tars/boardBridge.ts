export type TarsDrawCommand = {
  tool: "draw_on_screen" | "clear_screen_drawings";
  shape?: "circle" | "rectangle" | "triangle" | "highlight" | "underline" | "arrow" | "line" | "text";
  style?: "solid" | "dashed" | "dotted";
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
  visualSyncId?: string;
  annotationId?: string;
  provisional?: boolean;
  replace?: boolean;
  remove?: boolean;
  coordinateSource?: "dom" | "sol" | "sol_missing";
  groundingFailure?: string;
  coordinateSpace?: "screenshot" | "viewport";
};

export const TARS_BOARD_DRAW_EVENT = "ctrlteach:tars-board-draw";

export function dispatchBoardTarsDraw(command: TarsDrawCommand) {
  window.dispatchEvent(
    new CustomEvent<TarsDrawCommand>(TARS_BOARD_DRAW_EVENT, { detail: command }),
  );
}
