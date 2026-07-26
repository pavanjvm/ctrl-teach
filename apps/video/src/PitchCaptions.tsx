import type {Caption} from "@remotion/captions";
import {useCallback, useEffect, useState} from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const PitchCaptions: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender("Loading pitch captions"));

  const loadCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("captions/combined-pitch.json"));
      if (!response.ok) {
        throw new Error(`Unable to load captions: ${response.status}`);
      }
      const data = (await response.json()) as Caption[];
      setCaptions(data);
      continueRender(handle);
    } catch (error) {
      cancelRender(error);
    }
  }, [cancelRender, continueRender, handle]);

  useEffect(() => {
    loadCaptions();
  }, [loadCaptions]);

  if (!captions) {
    return null;
  }

  const currentTimeMs = (frame / fps) * 1000;
  const activeCaption = captions.find(
    (caption) =>
      currentTimeMs >= caption.startMs && currentTimeMs < caption.endMs,
  );

  if (!activeCaption) {
    return null;
  }

  const fadeDurationMs = Math.min(
    130,
    (activeCaption.endMs - activeCaption.startMs) / 5,
  );

  return (
    <AbsoluteFill
      style={{
        zIndex: 100,
        pointerEvents: "none",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 120px 62px",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          padding: "16px 30px 18px",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 12,
          background: "rgba(4,4,4,0.82)",
          boxShadow: "0 18px 55px rgba(0,0,0,0.58)",
          color: "#f6f4ed",
          fontSize: 38,
          fontWeight: 750,
          lineHeight: 1.24,
          letterSpacing: "-0.018em",
          textAlign: "center",
          whiteSpace: "pre-line",
          opacity: interpolate(
            currentTimeMs,
            [
              activeCaption.startMs,
              activeCaption.startMs + fadeDurationMs,
              activeCaption.endMs - fadeDurationMs,
              activeCaption.endMs,
            ],
            [0, 1, 1, 0],
            {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)},
          ),
          translate: `0 ${interpolate(
            currentTimeMs,
            [activeCaption.startMs, activeCaption.startMs + fadeDurationMs],
            [10, 0],
            {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)},
          )}px`,
        }}
      >
        {activeCaption.text}
      </div>
    </AbsoluteFill>
  );
};
