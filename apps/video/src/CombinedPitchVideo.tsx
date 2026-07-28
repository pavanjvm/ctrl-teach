import {AbsoluteFill, Sequence} from "remotion";
import {DemandDoesNotWaitVideo} from "./DemandDoesNotWaitVideo";
import {TrainingCapacityVideo} from "./TrainingCapacityVideo";

const ACT_ONE_FRAMES = 360;
const ACT_TWO_FRAMES = 375;

export const CombinedPitchVideo: React.FC<{
  pace?: number;
  uniformDemandBeats?: boolean;
}> = ({pace = 1, uniformDemandBeats = false}) => {
  const actOneFrames = Math.round(ACT_ONE_FRAMES * pace);
  const actTwoFrames = Math.round(ACT_TWO_FRAMES * pace);

  return (
    <AbsoluteFill style={{background: "#050505"}}>
      <Sequence name="Act 1 - Calendar trap" durationInFrames={actOneFrames}>
        <TrainingCapacityVideo pace={pace} />
      </Sequence>
      <Sequence
        name="Act 2 - Demand does not wait"
        from={actOneFrames}
        durationInFrames={actTwoFrames}
      >
        <DemandDoesNotWaitVideo
          pace={pace}
          uniformDemandBeats={uniformDemandBeats}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
