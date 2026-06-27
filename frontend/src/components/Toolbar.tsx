"use client";

/**
 * Toolbar — top bar with branding, session status, and controls.
 */

import type { ConnectionStatus } from "@/hooks/useWebSocket";

interface Props {
  status: ConnectionStatus;
  isRecording: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMic: () => void;
  onSendSnapshot: () => void;
}

export default function Toolbar({
  status,
  isRecording,
  onConnect,
  onDisconnect,
  onToggleMic,
  onSendSnapshot,
}: Props) {
  const connected = status === "connected";

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <div className="brand-icon">🎨</div>
        <div className="brand-text">
          <span className="brand-name">Magic Whiteboard</span>
          <span className="brand-sub">AI Tutor</span>
        </div>
      </div>

      <div className="toolbar-center">
        <div className={`status-pill ${status}`}>
          <span className="status-dot-inner" />
          <span>
            {status === "connected"
              ? "Live Session"
              : status === "connecting"
              ? "Connecting…"
              : "No Session"}
          </span>
        </div>
      </div>

      <div className="toolbar-right">
        {!connected ? (
          <button
            className="btn btn-start"
            onClick={onConnect}
            disabled={status === "connecting"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {status === "connecting" ? "Connecting…" : "Start Session"}
          </button>
        ) : (
          <>
            <button
              className="toolbar-action-btn"
              onClick={onSendSnapshot}
              title="Send canvas snapshot to tutor"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Snapshot</span>
            </button>

            <button
              className={`toolbar-mic-btn ${isRecording ? "active" : ""}`}
              onClick={onToggleMic}
              title={isRecording ? "Mute microphone" : "Unmute microphone"}
            >
              {isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
              <span>{isRecording ? "Listening" : "Muted"}</span>
            </button>

            <button className="toolbar-action-btn danger" onClick={onDisconnect}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
              <span>End</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
