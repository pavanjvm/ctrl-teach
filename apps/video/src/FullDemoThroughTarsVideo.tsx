import {AbsoluteFill, Sequence} from "remotion";
import {ExtendedPitchVideo, OPENING_DURATION} from "./ExtendedPitchVideo";
import {PRODUCT_DEMO_DURATION} from "./ProductDemoVideo";
import {LIVE_TARS_DURATION, LiveClassroomTarsVideo} from "./LiveClassroomTarsVideo";

export const PREVIOUS_DEMO_DURATION = OPENING_DURATION + PRODUCT_DEMO_DURATION;
export const FULL_DEMO_THROUGH_TARS_DURATION = PREVIOUS_DEMO_DURATION + LIVE_TARS_DURATION;

export const FullDemoThroughTarsVideo: React.FC = () => (
  <AbsoluteFill style={{background: "#050505"}}>
    <Sequence name="Problem through roadmap" durationInFrames={PREVIOUS_DEMO_DURATION}>
      <ExtendedPitchVideo />
    </Sequence>
    <Sequence name="Live Classroom through browser-wide Tars" from={PREVIOUS_DEMO_DURATION}>
      <LiveClassroomTarsVideo />
    </Sequence>
  </AbsoluteFill>
);
