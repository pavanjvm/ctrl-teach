/**
 * Shared constants for the BoardyBoo application.
 */

/** WebSocket backend URL — override via NEXT_PUBLIC_WS_URL env var */
export const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

/** HTTP API backend URL — override via NEXT_PUBLIC_API_URL env var */
export const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Interval (ms) between automatic canvas snapshots when connected */
export const SNAPSHOT_INTERVAL_MS = 5_000;

/** Audio sample rate for microphone capture (Live API input requirement) */
export const MIC_SAMPLE_RATE = 16_000;

/** Audio sample rate for AI voice playback (Live API output requirement) */
export const PLAYER_SAMPLE_RATE = 24_000;

/** Ring buffer size for the PCM player (~3 minutes) */
export const PLAYER_BUFFER_SIZE = PLAYER_SAMPLE_RATE * 180;
