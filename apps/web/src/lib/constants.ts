/**
 * Shared constants for the Ctrl+Teach application.
 */

function requiredPublicUrl(name: string, value: string | undefined, protocols: string[]) {
    const configured = value?.trim();
    if (!configured) throw new Error(`${name} must be configured`);
    const url = new URL(configured);
    if (!protocols.includes(url.protocol)) {
        throw new Error(`${name} must use ${protocols.join(" or ")}`);
    }
    return configured.replace(/\/$/, "");
}

/** WebSocket backend URL configured by NEXT_PUBLIC_WS_URL */
export const WS_URL = requiredPublicUrl(
    "NEXT_PUBLIC_WS_URL",
    process.env.NEXT_PUBLIC_WS_URL,
    ["ws:", "wss:"],
);

/** HTTP API backend URL configured by NEXT_PUBLIC_API_URL */
export const API_URL = requiredPublicUrl(
    "NEXT_PUBLIC_API_URL",
    process.env.NEXT_PUBLIC_API_URL,
    ["http:", "https:"],
);

/** Interval (ms) between automatic canvas snapshots when connected */
export const SNAPSHOT_INTERVAL_MS = 5_000;

/** Audio sample rate for microphone capture (Live API input requirement) */
export const MIC_SAMPLE_RATE = 16_000;

/** Audio sample rate for AI voice playback (Live API output requirement) */
export const PLAYER_SAMPLE_RATE = 24_000;

/** Ring buffer size for the PCM player (~3 minutes) */
export const PLAYER_BUFFER_SIZE = PLAYER_SAMPLE_RATE * 180;
