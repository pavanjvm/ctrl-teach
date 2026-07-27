import { AbsoluteFill, Sequence } from "remotion";
import { ExtendedPitchVideo } from "./ExtendedPitchVideo";
import { PRODUCT_DEMO_DURATION, ProductDemoVideo } from "./ProductDemoVideo";
import {
  LIVE_TARS_DURATION,
  LiveClassroomTarsVideo,
} from "./LiveClassroomTarsVideo";

// Cut one 30fps frame before 0:36 to remove the tail of the title narration.
const INTRO_CUT_FRAME = 36 * 30 - 1;
// Resume at the start of the Admin Portal scene so its opening narration stays intact.
const PRODUCT_RESUME_FRAME = 0;

export const PREVIOUS_DEMO_DURATION =
  INTRO_CUT_FRAME + PRODUCT_DEMO_DURATION - PRODUCT_RESUME_FRAME;
export const FULL_DEMO_THROUGH_TARS_DURATION =
  PREVIOUS_DEMO_DURATION + LIVE_TARS_DURATION;

export const FullDemoThroughTarsVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#050505" }}>
    <Sequence
      name="Problem through Introducing Ctrl+Teach"
      durationInFrames={INTRO_CUT_FRAME}
    >
      <ExtendedPitchVideo />
    </Sequence>
    <Sequence
      name="Admin portal through roadmap"
      from={INTRO_CUT_FRAME}
      durationInFrames={PRODUCT_DEMO_DURATION - PRODUCT_RESUME_FRAME}
    >
      <Sequence from={-PRODUCT_RESUME_FRAME}>
        <ProductDemoVideo />
      </Sequence>
    </Sequence>
    <Sequence
      name="Live Classroom through browser-wide Tars"
      from={PREVIOUS_DEMO_DURATION}
    >
      <LiveClassroomTarsVideo />
    </Sequence>
  </AbsoluteFill>
);
