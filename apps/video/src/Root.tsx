import "./index.css";
import {Composition} from "remotion";
import {TrainingCapacityVideo} from "./TrainingCapacityVideo";
import {MomentOfDemandVideo} from "./MomentOfDemandVideo";
import {ContentLockedCalendarVideo} from "./ContentLockedCalendarVideo";
import {DemandDoesNotWaitVideo} from "./DemandDoesNotWaitVideo";
import {CombinedPitchVideo} from "./CombinedPitchVideo";
import {CombinedPitchVoiceoverVideo} from "./CombinedPitchVoiceoverVideo";
import {CombinedPitchSlowVoiceoverVideo} from "./CombinedPitchSlowVoiceoverVideo";
import {BreakthroughVideo} from "./BreakthroughVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TrainingCapacity"
        component={TrainingCapacityVideo}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="MomentOfDemand"
        component={MomentOfDemandVideo}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ContentLockedCalendar"
        component={ContentLockedCalendarVideo}
        durationInFrames={480}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="DemandDoesNotWait"
        component={DemandDoesNotWaitVideo}
        durationInFrames={375}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CombinedPitch"
        component={CombinedPitchVideo}
        durationInFrames={735}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CombinedPitchVoiceover"
        component={CombinedPitchVoiceoverVideo}
        durationInFrames={735}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Breakthrough"
        component={BreakthroughVideo}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CombinedPitchSlowVoiceover"
        component={CombinedPitchSlowVoiceoverVideo}
        durationInFrames={1039}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
