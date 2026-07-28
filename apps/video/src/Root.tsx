import "./index.css";
import {Composition} from "remotion";
import {TrainingCapacityVideo} from "./TrainingCapacityVideo";
import {MomentOfDemandVideo} from "./MomentOfDemandVideo";
import {ContentLockedCalendarVideo} from "./ContentLockedCalendarVideo";
import {DemandDoesNotWaitVideo} from "./DemandDoesNotWaitVideo";
import {CombinedPitchVideo} from "./CombinedPitchVideo";
import {CombinedPitchVoiceoverVideo} from "./CombinedPitchVoiceoverVideo";
import {
  COMBINED_PITCH_SLOW_DURATION,
  CombinedPitchSlowVoiceoverVideo,
} from "./CombinedPitchSlowVoiceoverVideo";
import {BREAKTHROUGH_DURATION, BreakthroughVideo} from "./BreakthroughVideo";
import {
  PRODUCT_DEMO_DURATION,
  ProductDemoVideo,
} from "./ProductDemoVideo";
import {ExtendedPitchVideo, OPENING_DURATION} from "./ExtendedPitchVideo";
import {
  LIVE_TARS_DURATION,
  LiveClassroomTarsVideo,
} from "./LiveClassroomTarsVideo";
import {
  FULL_DEMO_THROUGH_TARS_DURATION,
  FullDemoThroughTarsVideo,
} from "./FullDemoThroughTarsVideo";

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
        durationInFrames={BREAKTHROUGH_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CombinedPitchSlowVoiceover"
        component={CombinedPitchSlowVoiceoverVideo}
        durationInFrames={COMBINED_PITCH_SLOW_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ProductDemoThroughRoadmap"
        component={ProductDemoVideo}
        durationInFrames={PRODUCT_DEMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CtrlTeachThroughRoadmap"
        component={ExtendedPitchVideo}
        durationInFrames={OPENING_DURATION + PRODUCT_DEMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LiveClassroomThroughTars"
        component={LiveClassroomTarsVideo}
        durationInFrames={LIVE_TARS_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CtrlTeachThroughTars"
        component={FullDemoThroughTarsVideo}
        durationInFrames={FULL_DEMO_THROUGH_TARS_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
