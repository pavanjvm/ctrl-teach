import {AbsoluteFill, Sequence} from "remotion";
import {
  COMBINED_PITCH_SLOW_DURATION,
  CombinedPitchSlowVoiceoverVideo,
} from "./CombinedPitchSlowVoiceoverVideo";
import {ProductDemoVideo} from "./ProductDemoVideo";

export const OPENING_DURATION = COMBINED_PITCH_SLOW_DURATION;

export const ExtendedPitchVideo: React.FC = () => (
  <AbsoluteFill style={{background: "#050505"}}>
    <Sequence name="Problem and breakthrough" durationInFrames={OPENING_DURATION}>
      <CombinedPitchSlowVoiceoverVideo />
    </Sequence>
    <Sequence name="Admin to roadmap product demo" from={OPENING_DURATION}>
      <ProductDemoVideo />
    </Sequence>
  </AbsoluteFill>
);
