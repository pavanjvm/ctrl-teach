import {Audio} from "@remotion/media";
import {AbsoluteFill, Sequence, staticFile} from "remotion";
import {BREAKTHROUGH_DURATION, BreakthroughVideo} from "./BreakthroughVideo";
import {CombinedPitchVideo} from "./CombinedPitchVideo";

const PACE = 1.25;
const ACT_ONE_FRAMES = Math.round(360 * PACE);
const ACT_TWO_FRAMES = Math.round(375 * PACE);
const BREAKTHROUGH_START = ACT_ONE_FRAMES + ACT_TWO_FRAMES;
export const COMBINED_PITCH_SLOW_DURATION = BREAKTHROUGH_START + BREAKTHROUGH_DURATION;

const Narration: React.FC<{from: number; name: string; src: string}> = ({
  from,
  name,
  src,
}) => (
  <Sequence name={name} from={from} layout="none">
    <Audio src={staticFile(`voiceover/combined-pitch/${src}`)} />
  </Sequence>
);

export const CombinedPitchSlowVoiceoverVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{background: "#050505"}}>
      <CombinedPitchVideo pace={PACE} uniformDemandBeats />
      <Sequence
        name="Act 3 - Breakthrough"
        from={BREAKTHROUGH_START}
        durationInFrames={BREAKTHROUGH_DURATION}
      >
        <BreakthroughVideo />
      </Sequence>

      <Narration
        name="World-class expertise"
        from={6}
        src="act-1-opening.mp3"
      />
      <Narration
        name="Every cohort adds a calendar"
        from={128}
        src="act-1-calendar.mp3"
      />
      <Narration
        name="Learner urgency"
        from={305}
        src="act-1-urgency.mp3"
      />

      <Narration
        name="Learners do not wait"
        from={ACT_ONE_FRAMES + 6}
        src="act-2-escape.mp3"
      />
      <Narration
        name="They search"
        from={ACT_ONE_FRAMES + 120}
        src="act-2-search.mp3"
      />
      <Narration
        name="They ask AI"
        from={ACT_ONE_FRAMES + 165}
        src="act-2-ai.mp3"
      />
      <Narration
        name="They go somewhere else"
        from={ACT_ONE_FRAMES + 222}
        src="act-2-elsewhere.mp3"
      />
      <Narration
        name="Delivery problem reframe"
        from={ACT_ONE_FRAMES + 318}
        src="act-2-reframe.mp3"
      />
    </AbsoluteFill>
  );
};
