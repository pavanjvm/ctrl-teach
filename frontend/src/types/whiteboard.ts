/**
 * Shared TypeScript types for the BoardyBoo whiteboard application.
 * Import these instead of importing from individual hooks.
 */

// ── Transcript ────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
    id: string;
    role: "user" | "agent";
    text: string;
    agentName?: string;
    partial: boolean;
    timestamp: number;
}

// ── Canvas ────────────────────────────────────────────────────────────────────

export interface AnimationGroup {
    /** Start index (inclusive) in the elements array. */
    start: number;
    /** End index (exclusive) in the elements array. */
    end: number;
    /** Delay in ms from the start of the animation before this group appears. */
    delay: number;
}

export interface CanvasCommand {
    tool: string;
    action: "add" | "replace" | "clear";
    elements: CanvasElement[];
    files?: Record<string, CanvasFileData>;
    /** When present, elements are rendered progressively in groups. */
    animation?: AnimationGroup[];
}

export interface CanvasFileData {
    id: string;
    dataURL: string;
    mimeType: string;
    created: number;
}

export interface CanvasElement {
    type: "text" | "rectangle" | "ellipse" | "arrow" | "line" | "freedraw" | "image" | string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    text?: string;
    fontSize?: number;
    fontFamily?: number;
    strokeColor?: string;
    backgroundColor?: string;
    fillStyle?: string;
    opacity?: number;
    points?: [number, number][];
    // Image-specific fields
    fileId?: string;
    status?: "pending" | "saved" | "error";
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ConnectOptions {
    onAudio?: (pcmBytes: ArrayBuffer) => void;
    onInterrupt?: () => void;
    /** When a tool returns audio_b64 (e.g. "image generated" confirmation), play it. */
    onToolAudio?: (base64Data: string, mimeType: string) => void;
}
