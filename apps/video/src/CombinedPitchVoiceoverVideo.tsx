import {Audio} from "@remotion/media";
import {AbsoluteFill, Sequence, staticFile} from "remotion";
import {CombinedPitchVideo} from "./CombinedPitchVideo";

const ACT_ONE_FRAMES = 360;
const ACT_TWO_FRAMES = 375;

export const CombinedPitchVoiceoverVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{background: "#050505"}}>
      <CombinedPitchVideo />
      <Sequence name="Act 1 reference narration" durationInFrames={ACT_ONE_FRAMES}>
        <Audio
          src={staticFile("voiceover/combined-pitch/act-1.mp3")}
          playbackRate={1.18}
        />
      </Sequence>
      <Sequence
        name="Act 2 reference narration"
        from={ACT_ONE_FRAMES}
        durationInFrames={ACT_TWO_FRAMES}
      >
        <Audio src={staticFile("voiceover/combined-pitch/act-2.mp3")} />
      </Sequence>
    </AbsoluteFill>
  );
};
