import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
const FPS = 30;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const PRODUCT_DEMO_SCENES = {
  adminIntro: 225,
  adminCreate: 360,
  adminReview: 270,
  adminPublish: 165,
  learnerIntro: 270,
  learnerProfile: 270,
  roadmapMatch: 315,
  roadmapStages: 285,
  roadmapLearn: 285,
  roadmapOptions: 285,
} as const;

export const PRODUCT_DEMO_DURATION = Object.values(PRODUCT_DEMO_SCENES).reduce(
  (total, duration) => total + duration,
  0,
);

const asset = (name: string) => staticFile(`product-demo/${name}`);
const voice = (name: string) =>
  staticFile(`voiceover/combined-pitch/${name}`);
const clickSound = () => staticFile("sfx/mouse-click.wav");

type ScreenShotProps = {
  name: string;
  src: string;
  duration: number;
  visibleFrom?: number;
  visibleUntil?: number;
  startScale?: number;
  endScale?: number;
  startX?: number;
  endX?: number;
  startY?: number;
  endY?: number;
};

const ScreenShot: React.FC<ScreenShotProps> = (props) => {
  const {
    name,
    src,
    duration,
    visibleFrom = 0,
    visibleUntil = duration,
  } = props;
  const frame = useCurrentFrame();
  const fade = Math.min(10, Math.max(3, (visibleUntil - visibleFrom) / 5));

  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        opacity: interpolate(
          frame,
          [visibleFrom, visibleFrom + fade, visibleUntil - fade, visibleUntil],
          [0, 1, 1, 0],
          {...clamp, easing: ease},
        ),
      }}
    >
      <Img
        src={asset(src)}
        style={{width: "100%", height: "100%", objectFit: "cover"}}
      />
    </Interactive.Div>
  );
};

const Pointer: React.FC<{
  name: string;
  duration: number;
  times: number[];
  xs: number[];
  ys: number[];
  clickAt?: number;
}> = ({name, duration, times, xs, ys, clickAt}) => {
  const frame = useCurrentFrame();
  const clickScale = clickAt === undefined
    ? 1
    : interpolate(
        frame,
        [clickAt - 4, clickAt, clickAt + 5, clickAt + 11, clickAt + 18],
        [1, 0.82, 1.24, 0.96, 1],
        clamp,
      );

  return (
    <>
      <Interactive.Div
        name={name}
        style={{
          position: "absolute",
          zIndex: 20,
          left: interpolate(frame, times, xs, {...clamp, easing: ease}),
          top: interpolate(frame, times, ys, {...clamp, easing: ease}),
          width: 52,
          height: 66,
          opacity: interpolate(frame, [0, 8, duration - 10, duration], [0, 1, 1, 0], clamp),
          scale: clickScale,
          transformOrigin: "4px 4px",
          filter: "drop-shadow(0 7px 8px rgba(0,0,0,0.34))",
        }}
      >
        <svg width="42" height="54" viewBox="0 0 42 54" aria-hidden="true">
          <path
            d="M4 3L35 31H21L28 48L19 52L12 34L4 43V3Z"
            fill="#f8f7f0"
            stroke="#151512"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </Interactive.Div>
      {clickAt === undefined ? null : (
        <Sequence name={`${name} click sound`} from={clickAt} durationInFrames={14} layout="none">
          <Audio src={clickSound()} volume={() => 0.5} />
        </Sequence>
      )}
    </>
  );
};

const SceneAudio: React.FC<{src: string}> = ({src}) => (
  <Sequence from={12} layout="none">
    <Audio src={voice(src)} />
  </Sequence>
);

const SceneBase: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{overflow: "hidden", background: "#f5f3eb"}}>
    {children}
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        boxShadow: "inset 0 0 110px rgba(25,25,19,0.12)",
      }}
    />
  </AbsoluteFill>
);

const AdminIntroScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.adminIntro;
  return (
    <SceneBase>
      <ScreenShot
        name="Admin portal before prompt"
        src="admin-empty.png"
        duration={duration}
        visibleUntil={105}
        endScale={1.025}
      />
      <ScreenShot
        name="Admin portal with Cloud Architecture prompt"
        src="admin-prompt-filled.png"
        duration={duration}
        visibleFrom={82}
        startScale={1.01}
        endScale={1.055}
        startX={0}
        endX={-24}
        startY={0}
        endY={7}
      />
      <Pointer
        name="Move to course prompt"
        duration={duration}
        times={[0, 62, duration]}
        xs={[1660, 1320, 1320]}
        ys={[840, 240, 240]}
        clickAt={66}
      />
      <SceneAudio src="act-3-admin-intro.mp3" />
    </SceneBase>
  );
};

const AdminCreateScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.adminCreate;
  return (
    <SceneBase>
      <ScreenShot
        name="Submit the course objective"
        src="admin-prompt-filled.png"
        duration={duration}
        visibleUntil={95}
        startScale={1.035}
        endScale={1.07}
        endX={-40}
      />
      <ScreenShot
        name="Live course generation"
        src="admin-generating.png"
        duration={duration}
        visibleFrom={72}
        visibleUntil={230}
        startScale={1.015}
        endScale={1.05}
        endY={-12}
      />
      <ScreenShot
        name="Completed generated course"
        src="admin-editor.png"
        duration={duration}
        visibleFrom={205}
        startScale={1.01}
        endScale={1.035}
      />
      <Pointer
        name="Generate course click"
        duration={110}
        times={[0, 42, 110]}
        xs={[1320, 1510, 1510]}
        ys={[230, 338, 338]}
        clickAt={46}
      />
      <SceneAudio src="act-3-admin-create.mp3" />
    </SceneBase>
  );
};

const AdminReviewScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.adminReview;
  return (
    <SceneBase>
      <ScreenShot
        name="Review generated outline"
        src="admin-editor.png"
        duration={duration}
        visibleUntil={98}
        endScale={1.03}
      />
      <ScreenShot
        name="Edit an individual lesson"
        src="admin-lesson-editor.png"
        duration={duration}
        visibleFrom={78}
        visibleUntil={190}
        startScale={1.01}
        endScale={1.045}
      />
      <ScreenShot
        name="Inspect authoritative sources"
        src="admin-sources.png"
        duration={duration}
        visibleFrom={168}
        startScale={1.015}
        endScale={1.065}
        endY={-18}
      />
      <SceneAudio src="act-3-admin-review.mp3" />
    </SceneBase>
  );
};

const AdminPublishScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.adminPublish;
  return (
    <SceneBase>
      <ScreenShot
        name="Publish control"
        src="admin-editor.png"
        duration={duration}
        visibleUntil={90}
        startScale={1.035}
        endScale={1.09}
        startX={-18}
        endX={-54}
        startY={20}
        endY={64}
      />
      <ScreenShot
        name="Published confirmation"
        src="admin-published.png"
        duration={duration}
        visibleFrom={70}
        startScale={1.015}
        endScale={1.05}
      />
      <Pointer
        name="Publish course click"
        duration={105}
        times={[0, 48, 105]}
        xs={[1660, 1848, 1848]}
        ys={[250, 98, 98]}
        clickAt={52}
      />
      <SceneAudio src="act-3-admin-publish.mp3" />
    </SceneBase>
  );
};

const LearnerIntroScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.learnerIntro;
  return (
    <SceneBase>
      <ScreenShot
        name="Learner current context"
        src="onboarding-context-empty.png"
        duration={duration}
        visibleUntil={90}
        endScale={1.025}
      />
      <ScreenShot
        name="Learner role and experience"
        src="onboarding-context-filled.png"
        duration={duration}
        visibleFrom={66}
        visibleUntil={150}
        startScale={1.01}
        endScale={1.035}
      />
      <ScreenShot
        name="Learner career goal"
        src="onboarding-goal-empty.png"
        duration={duration}
        visibleFrom={128}
        visibleUntil={214}
        startScale={1.01}
        endScale={1.035}
      />
      <ScreenShot
        name="Learner learning preferences"
        src="onboarding-preferences-empty.png"
        duration={duration}
        visibleFrom={192}
        startScale={1.01}
        endScale={1.03}
      />
      <SceneAudio src="act-3-learner-intro.mp3" />
    </SceneBase>
  );
};

const LearnerProfileScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.learnerProfile;
  return (
    <SceneBase>
      <ScreenShot
        name="Cloud Architect goal entered"
        src="onboarding-goal-typed.png"
        duration={duration}
        visibleUntil={155}
        startScale={1.01}
        endScale={1.045}
        endX={-22}
      />
      <ScreenShot
        name="Visual and hands-on preferences selected"
        src="onboarding-preferences-filled.png"
        duration={duration}
        visibleFrom={132}
        startScale={1.01}
        endScale={1.045}
      />
      <Pointer
        name="Learner goal typing focus"
        duration={142}
        times={[0, 46, 142]}
        xs={[1540, 920, 920]}
        ys={[820, 620, 620]}
        clickAt={50}
      />
      <SceneAudio src="act-3-learner-profile.mp3" />
    </SceneBase>
  );
};

const RoadmapMatchScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.roadmapMatch;
  return (
    <SceneBase>
      <ScreenShot
        name="Roadmap matching"
        src="roadmap-matching.png"
        duration={duration}
        visibleUntil={76}
        endScale={1.025}
      />
      <ScreenShot
        name="Existing Cloud Architect roadmap recommendation"
        src="roadmap-recommended.png"
        duration={duration}
        visibleFrom={54}
        startScale={1.005}
        endScale={1.055}
        endY={-16}
      />
      <SceneAudio src="act-3-roadmap-match.mp3" />
    </SceneBase>
  );
};

const RoadmapStagesScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.roadmapStages;
  return (
    <SceneBase>
      <ScreenShot
        name="Cloud Architect roadmap stages"
        src="cloud-roadmap.png"
        duration={duration}
        startScale={1.005}
        endScale={1.075}
        startY={0}
        endY={-36}
      />
      <SceneAudio src="act-3-roadmap-stages.mp3" />
    </SceneBase>
  );
};

const RoadmapLearnScene: React.FC = () => {
  const duration = PRODUCT_DEMO_SCENES.roadmapLearn;
  return (
    <SceneBase>
      <ScreenShot
        name="Open Cloud Foundations actions"
        src="cloud-foundations-menu.png"
        duration={duration}
        visibleUntil={120}
        startScale={1.01}
        endScale={1.055}
      />
      <ScreenShot
        name="Cloud Foundations learning choices"
        src="cloud-learning-options.png"
        duration={duration}
        visibleFrom={96}
        startScale={1.005}
        endScale={1.035}
      />
      <Pointer
        name="Open learning options"
        duration={126}
        times={[0, 52, 126]}
        xs={[1170, 792, 792]}
        ys={[750, 550, 550]}
        clickAt={56}
      />
      <SceneAudio src="act-3-roadmap-learn.mp3" />
    </SceneBase>
  );
};

const RoadmapOptionsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const duration = PRODUCT_DEMO_SCENES.roadmapOptions;
  const boxes = [
    {top: 313, height: 90},
    {top: 499, height: 84},
    {top: 607, height: 148},
  ];

  return (
    <SceneBase>
      <Interactive.Div
        name="Cprime course, bootcamp, and personalized generation"
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], clamp),
        }}
      >
        <Img
          src={asset("cloud-learning-options.png")}
          style={{width: "100%", height: "100%", objectFit: "cover"}}
        />
        {boxes.map((box, index) => (
          <div
            key={box.top}
            style={{
              position: "absolute",
              left: 1467,
              top: box.top,
              width: 400,
              height: box.height,
              border: "3px solid #b9ed3b",
              boxShadow: "0 0 0 5px rgba(185,237,59,0.14)",
              opacity: interpolate(
                frame,
                [24 + index * 45, 38 + index * 45, 82 + index * 45, 96 + index * 45],
                [0, 1, 1, 0.28],
                clamp,
              ),
            }}
          />
        ))}
      </Interactive.Div>
      <SceneAudio src="act-3-roadmap-options.mp3" />
    </SceneBase>
  );
};

const sceneOrder = [
  {name: "Admin portal", duration: PRODUCT_DEMO_SCENES.adminIntro, component: AdminIntroScene},
  {name: "AI course generation", duration: PRODUCT_DEMO_SCENES.adminCreate, component: AdminCreateScene},
  {name: "Admin review", duration: PRODUCT_DEMO_SCENES.adminReview, component: AdminReviewScene},
  {name: "Publish", duration: PRODUCT_DEMO_SCENES.adminPublish, component: AdminPublishScene},
  {name: "Learner onboarding", duration: PRODUCT_DEMO_SCENES.learnerIntro, component: LearnerIntroScene},
  {name: "Learner goal", duration: PRODUCT_DEMO_SCENES.learnerProfile, component: LearnerProfileScene},
  {name: "Roadmap match", duration: PRODUCT_DEMO_SCENES.roadmapMatch, component: RoadmapMatchScene},
  {name: "Roadmap stages", duration: PRODUCT_DEMO_SCENES.roadmapStages, component: RoadmapStagesScene},
  {name: "Select Cloud Foundations", duration: PRODUCT_DEMO_SCENES.roadmapLearn, component: RoadmapLearnScene},
  {name: "Learning options", duration: PRODUCT_DEMO_SCENES.roadmapOptions, component: RoadmapOptionsScene},
] as const;

export const ProductDemoVideo: React.FC = () => {
  const frame = useCurrentFrame();
  let cursor = 0;

  return (
    <AbsoluteFill style={{background: "#050505"}}>
      {sceneOrder.map((scene) => {
        const from = cursor;
        cursor += scene.duration;
        const Scene = scene.component;
        return (
          <Sequence
            key={scene.name}
            name={scene.name}
            from={from}
            durationInFrames={scene.duration}
          >
            <Scene />
          </Sequence>
        );
      })}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: "#050505",
          opacity: interpolate(frame, [0, 12], [1, 0], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

export const PRODUCT_DEMO_FPS = FPS;
