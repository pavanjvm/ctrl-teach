/**
 * Shared utility functions for the BoardyBoo application.
 */

/**
 * Generates a short random alphanumeric ID.
 * Used for userId/sessionId in board sessions.
 */
export function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Converts a base64 (or base64url) string to an ArrayBuffer.
 * Handles base64url → standard base64 padding automatically.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Normalise base64url → standard base64
    let std = base64.replace(/-/g, "+").replace(/_/g, "/");
    while (std.length % 4) std += "=";
    const binary = atob(std);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
