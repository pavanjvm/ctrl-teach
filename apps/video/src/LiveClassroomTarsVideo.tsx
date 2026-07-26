import {Audio, Video} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const EC2_SOURCE_DURATION = 1842;
const EC2_HOLD_AT = 533;
const EC2_HOLD_DURATION = 166;
const EC2_CLEAN_END = 1782;

export const LIVE_TARS_SCENES = {
  liveIntro: 196,
  liveAuto: 294,
  classroomVoice: 208,
  liveExplain: 290,
  labIntro: 192,
  meetTars: 161,
  acrossBrowser: EC2_SOURCE_DURATION + EC2_HOLD_DURATION,
  workflow: 960,
} as const;

export const LIVE_TARS_DURATION = Object.values(LIVE_TARS_SCENES).reduce<number>(
  (total, duration) => total + duration,
  0,
);

const shot = (name: string) => staticFile(`product-demo/live-tars/${name}`);
const voice = (name: string) => staticFile(`voiceover/combined-pitch/${name}`);
const clickSound = () => staticFile("sfx/mouse-click.wav");

const SceneBase: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{overflow: "hidden", background: "#f4f2ea"}}>
    {children}
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        boxShadow: "inset 0 0 95px rgba(19, 20, 17, 0.11)",
      }}
    />
  </AbsoluteFill>
);

const Still: React.FC<{
  name: string;
  src: string;
  duration: number;
  visibleFrom?: number;
  visibleUntil?: number;
}> = ({name, src, duration, visibleFrom = 0, visibleUntil = duration}) => {
  const frame = useCurrentFrame();
  const fade = Math.min(10, Math.max(4, (visibleUntil - visibleFrom) / 6));
  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(
          frame,
          [visibleFrom, visibleFrom + fade, visibleUntil - fade, visibleUntil],
          [0, 1, 1, 0],
          {...clamp, easing: ease},
        ),
      }}
    >
      <Img src={shot(src)} style={{width: "100%", height: "100%", objectFit: "cover"}} />
    </Interactive.Div>
  );
};

const SceneAudio: React.FC<{
  src: string;
  from?: number;
  playbackRate?: number;
  fadeOutFrom?: number;
}> = ({
  src,
  from = 12,
  playbackRate = 1,
  fadeOutFrom,
}) => (
  <Sequence from={from} layout="none">
    <Audio
      src={voice(src)}
      playbackRate={playbackRate}
      volume={(audioFrame) =>
        fadeOutFrom === undefined
          ? 1
          : interpolate(audioFrame, [fadeOutFrom, fadeOutFrom + 18], [1, 0], clamp)
      }
    />
  </Sequence>
);

const ClickPointer: React.FC<{
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  travelEnd: number;
  clickAt: number;
  hideAt: number;
}> = ({fromX, fromY, toX, toY, travelEnd, clickAt, hideAt}) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, travelEnd], [fromX, toX], {...clamp, easing: ease});
  const y = interpolate(frame, [0, travelEnd], [fromY, toY], {...clamp, easing: ease});
  const clickScale = interpolate(
    frame,
    [clickAt - 4, clickAt, clickAt + 5, clickAt + 11, clickAt + 18],
    [1, 0.82, 1.24, 0.96, 1],
    clamp,
  );
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          zIndex: 20,
          opacity: interpolate(frame, [0, 8, hideAt - 8, hideAt], [0, 1, 1, 0], clamp),
          scale: clickScale,
          transformOrigin: "4px 4px",
          filter: "drop-shadow(0 7px 8px rgba(0,0,0,0.3))",
        }}
      >
        <svg width="40" height="52" viewBox="0 0 42 54" aria-hidden="true">
          <path
            d="M4 3L35 31H21L28 48L19 52L12 34L4 43V3Z"
            fill="#fbfaf5"
            stroke="#11120f"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <Sequence name="Cursor click sound" from={clickAt} durationInFrames={14} layout="none">
        <Audio src={clickSound()} volume={() => 0.5} />
      </Sequence>
    </>
  );
};

const TarsCursor: React.FC<{
  x: number;
  y: number;
  size?: number;
  opacity?: number;
  rotation?: number;
  mode?: "idle" | "listening" | "thinking";
  clickPulse?: number;
}> = ({x, y, size = 24, opacity = 1, rotation = -35, mode = "idle", clickPulse = 0}) => {
  const frame = useCurrentFrame();
  const wave = (offset: number) => 5 + Math.abs(Math.sin((frame + offset) / 5)) * 12;
  return (
    <Interactive.Div
      name="Tars cursor"
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 45,
        opacity,
        rotate: `${rotation}deg`,
        filter: "drop-shadow(0 0 8px rgba(121,169,37,0.52))",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -13,
          top: -13,
          width: size + 26,
          height: size + 26,
          border: "3px solid #a9dd32",
          borderRadius: "50%",
          opacity: clickPulse,
          scale: interpolate(clickPulse, [0, 1], [0.5, 1.15], clamp),
        }}
      />
      {mode === "idle" && (
        <div
          style={{
            width: size,
            height: size * 0.866,
            background: "#79a925",
            clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
          }}
        />
      )}
      {mode === "listening" && (
        <div style={{display: "flex", alignItems: "center", gap: 3, rotate: "35deg"}}>
          {[0, 7, 14, 21, 28].map((offset) => (
            <span
              key={offset}
              style={{
                width: 4,
                height: wave(offset),
                borderRadius: 999,
                background: "#14b8a6",
              }}
            />
          ))}
        </div>
      )}
      {mode === "thinking" && (
        <div
          style={{
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: "50%",
            border: "4px solid rgba(121,169,37,0.22)",
            borderTopColor: "#79a925",
            rotate: `${frame * 12}deg`,
          }}
        />
      )}
    </Interactive.Div>
  );
};

const RealCursor: React.FC<{
  x: number;
  y: number;
  opacity?: number;
}> = ({x, y, opacity = 1}) => (
  <Interactive.Div
    name="Learner cursor"
    style={{
      position: "absolute",
      left: x,
      top: y,
      zIndex: 49,
      opacity,
      filter: "drop-shadow(0 6px 7px rgba(0,0,0,0.28))",
    }}
  >
    <svg width="31" height="40" viewBox="0 0 42 54" aria-hidden="true">
      <path
        d="M4 3L35 31H21L28 48L19 52L12 34L4 43V3Z"
        fill="#fbfaf5"
        stroke="#11120f"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  </Interactive.Div>
);

const CursorPair: React.FC<{
  x: number;
  y: number;
  tarsSize?: number;
  opacity?: number;
  mode?: "idle" | "listening" | "thinking";
}> = ({x, y, tarsSize = 24, opacity = 1, mode = "idle"}) => (
  <>
    <RealCursor x={x} y={y} opacity={opacity} />
    <TarsCursor x={x + 34} y={y + 20} size={tarsSize} opacity={opacity} mode={mode} />
  </>
);

const LabReadyStatus: React.FC = () => (
  <div
    style={{
      position: "absolute",
      zIndex: 30,
      left: 1166,
      top: 711,
      width: 332,
      height: 60,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      background: "#f4f2e9",
      color: "#27301c",
      fontSize: 17,
      fontWeight: 750,
    }}
  >
    <span style={{width: 9, height: 9, borderRadius: "50%", background: "#79a925"}} />
    Tars ready · Hold Ctrl to talk
  </div>
);

const LiveIntroScene: React.FC = () => {
  const duration = LIVE_TARS_SCENES.liveIntro;
  return (
    <SceneBase>
      <Still name="Cloud Architecture course" src="course-overview.png" duration={duration} />
      <ClickPointer
        fromX={1490}
        fromY={820}
        toX={996}
        toY={32}
        travelEnd={90}
        clickAt={112}
        hideAt={150}
      />
      <SceneAudio src="act-3-live-intro.mp3" />
    </SceneBase>
  );
};

export const ActiveClassroomChrome: React.FC<{opacity?: number}> = ({opacity = 1}) => (
  <div style={{opacity}}>
    <div
      style={{
        position: "absolute",
        left: 724,
        bottom: 0,
        zIndex: 14,
        width: 390,
        height: 82,
        background: "#fff",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 747,
        bottom: 20,
        zIndex: 15,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 18px",
        border: "1px solid #deddd6",
        borderRadius: 10,
        background: "rgba(255,255,255,0.98)",
        color: "#34362f",
        fontSize: 16,
        fontWeight: 700,
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
      }}
    >
      <span style={{width: 9, height: 9, borderRadius: "50%", background: "#79a925"}} />
      Teacher speaking
      <span style={{color: "#8b8c85", fontWeight: 600}}>·</span>
      <span style={{fontWeight: 600}}>Mic paused</span>
    </div>
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 214,
        bottom: 106,
        zIndex: 14,
        width: 340,
        background: "#fff",
      }}
    />
    <div
      style={{
        position: "absolute",
        right: 18,
        top: 222,
        zIndex: 15,
        width: 292,
        padding: "15px 16px",
        borderRadius: 12,
        background: "#f8f8f4",
        border: "1px solid #e4e4dc",
        color: "#4a4d45",
        fontSize: 16,
        lineHeight: 1.45,
      }}
    >
      <div style={{fontSize: 13, color: "#759b31", fontWeight: 850, letterSpacing: ".08em"}}>TARS · NOW</div>
      <div style={{marginTop: 7}}>Let’s turn the request into a measurable architecture problem.</div>
    </div>
  </div>
);

export const AnimatedClassroomDiagram: React.FC<{frame: number}> = ({frame}) => {
  const title = interpolate(frame, [18, 86], [0, 1], clamp);
  const boxOne = interpolate(frame, [78, 136], [0, 1], clamp);
  const boxOneText = interpolate(frame, [116, 148], [0, 1], clamp);
  const arrowOne = interpolate(frame, [142, 190], [0, 1], clamp);
  const boxTwo = interpolate(frame, [186, 258], [0, 1], clamp);
  const boxTwoText = interpolate(frame, [226, 276], [0, 1], clamp);
  const arrowTwo = interpolate(frame, [270, 322], [0, 1], clamp);
  const boxThree = interpolate(frame, [316, 386], [0, 1], clamp);
  const boxThreeText = interpolate(frame, [356, 410], [0, 1], clamp);
  const finalEmphasis = interpolate(frame, [420, 450, 476], [0, 1, 0.72], clamp);

  return (
    <Interactive.Div name="Whiteboard diagram drawn live" style={{position: "absolute", inset: 0, zIndex: 12}}>
      <div
        style={{
          position: "absolute",
          left: 240,
          top: 136,
          right: 340,
          bottom: 84,
          background: "#fff",
        }}
      />
      <svg viewBox="0 0 1920 1080" style={{position: "absolute", inset: 0, width: "100%", height: "100%"}}>
        <defs>
          <clipPath id="live-title-reveal">
            <rect x="392" y="450" width={880 * title} height="78" />
          </clipPath>
        </defs>
        <text
          x="402"
          y="505"
          fill="#176a9a"
          fontFamily='"Comic Sans MS", "Bradley Hand", cursive'
          fontSize="34"
          fontWeight="700"
          clipPath="url(#live-title-reveal)"
        >
          From needs to a measurable problem statement
        </text>

        <path
          d="M480 574 L680 573 L678 643 L479 642 Z"
          pathLength="1"
          stroke="#334155"
          strokeWidth="4"
          fill={`rgba(219,234,254,${0.72 * boxOne})`}
          strokeDasharray="1"
          strokeDashoffset={1 - boxOne}
        />
        <text
          x="579"
          y="615"
          textAnchor="middle"
          fill="#263746"
          fontFamily='"Comic Sans MS", "Bradley Hand", cursive'
          fontSize="22"
          fontWeight="700"
          opacity={boxOneText}
        >
          Needs &amp; scenario
        </text>

        <path
          d="M681 608 C730 608 770 608 814 608"
          pathLength="1"
          stroke="#475569"
          strokeWidth="4"
          fill="none"
          strokeDasharray="1"
          strokeDashoffset={1 - arrowOne}
        />
        <path d="M796 598 L818 608 L796 618" fill="none" stroke="#475569" strokeWidth="4" opacity={arrowOne} />
        <text
          x="748"
          y="594"
          textAnchor="middle"
          fill="#475569"
          fontFamily='"Comic Sans MS", "Bradley Hand", cursive'
          fontSize="15"
          opacity={arrowOne}
        >
          organize
        </text>

        <path
          d="M823 556 L1055 554 L1053 661 L822 659 Z"
          pathLength="1"
          stroke="#334155"
          strokeWidth="4"
          fill={`rgba(209,250,229,${0.78 * boxTwo})`}
          strokeDasharray="1"
          strokeDashoffset={1 - boxTwo}
        />
        <text
          x="938"
          y="590"
          textAnchor="middle"
          fill="#263746"
          fontFamily='"Comic Sans MS", "Bradley Hand", cursive'
          fontSize="21"
          fontWeight="700"
          opacity={boxTwoText}
        >
          <tspan x="938" dy="0">Separate: functional,</tspan>
          <tspan x="938" dy="27">quality, constraints,</tspan>
          <tspan x="938" dy="27">assumptions</tspan>
        </text>

        <path
          d="M1055 608 C1105 608 1150 608 1196 608"
          pathLength="1"
          stroke="#475569"
          strokeWidth="4"
          fill="none"
          strokeDasharray="1"
          strokeDashoffset={1 - arrowTwo}
        />
        <path d="M1178 598 L1200 608 L1178 618" fill="none" stroke="#475569" strokeWidth="4" opacity={arrowTwo} />
        <text
          x="1125"
          y="594"
          textAnchor="middle"
          fill="#475569"
          fontFamily='"Comic Sans MS", "Bradley Hand", cursive'
          fontSize="15"
          opacity={arrowTwo}
        >
          prioritize
        </text>

        <path
          d="M1202 574 L1414 573 L1413 643 L1201 642 Z"
          pathLength="1"
          stroke="#334155"
          strokeWidth={4 + finalEmphasis * 2}
          fill={`rgba(254,243,199,${0.8 * boxThree})`}
          strokeDasharray="1"
          strokeDashoffset={1 - boxThree}
        />
        <text
          x="1307"
          y="615"
          textAnchor="middle"
          fill="#263746"
          fontFamily='"Comic Sans MS", "Bradley Hand", cursive'
          fontSize="22"
          fontWeight="700"
          opacity={boxThreeText}
        >
          Measurable drivers
        </text>
      </svg>
    </Interactive.Div>
  );
};

const LiveAutoScene: React.FC = () => {
  const duration = LIVE_TARS_SCENES.liveAuto;
  return (
    <SceneBase>
      <Still
        name="Live Classroom ready"
        src="live-classroom-ready.png"
        duration={duration}
        visibleUntil={118}
      />
      <Still
        name="Automatic classroom explanation"
        src="live-classroom-speaking.png"
        duration={duration}
        visibleFrom={96}
      />
      <ClickPointer
        fromX={1335}
        fromY={865}
        toX={941}
        toY={1030}
        travelEnd={58}
        clickAt={70}
        hideAt={105}
      />
      <SceneAudio src="act-3-live-auto.mp3" />
    </SceneBase>
  );
};

const ClassroomExplanationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const duration = LIVE_TARS_SCENES.classroomVoice + LIVE_TARS_SCENES.liveExplain;
  return (
    <SceneBase>
      <Still
        name="Completed Live Classroom architecture diagram"
        src="live-classroom-explaining.png"
        duration={duration}
      />
      <div
        style={{
          position: "absolute",
          left: 396,
          top: 452,
          width: 1040,
          height: 244,
          zIndex: 18,
          border: "3px solid rgba(121,169,37,0.82)",
          borderRadius: 22,
          opacity: interpolate(frame, [30, 48, duration - 28, duration - 10], [0, 1, 1, 0], clamp),
          boxShadow: "0 0 0 8px rgba(121,169,37,0.08)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 78,
          right: 360,
          zIndex: 20,
          padding: "10px 16px",
          borderRadius: 999,
          border: "1px solid rgba(121,169,37,0.45)",
          background: "rgba(246,248,240,0.94)",
          color: "#536d22",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: ".08em",
        }}
      >
        LIVE CLASSROOM · VISUAL EXPLANATION
      </div>
      <SceneAudio src="act-3-tars-classroom.mp3" from={12} />
      <SceneAudio src="act-3-live-explain.mp3" from={LIVE_TARS_SCENES.classroomVoice + 12} />
    </SceneBase>
  );
};

const LabIntroScene: React.FC = () => {
  const duration = LIVE_TARS_SCENES.labIntro;
  return (
    <SceneBase>
      <Still
        name="Hands-on lab inside the course"
        src="course-browser-lab.png"
        duration={duration}
      />
      <SceneAudio src="act-3-lab-intro.mp3" />
    </SceneBase>
  );
};

const MeetTarsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [4, 38, 124, 157], [1, 4.2, 4.2, 1], {
    ...clamp,
    easing: ease,
  });
  return (
    <SceneBase>
      <Interactive.Div
        name="Meet Tars focus zoom"
        style={{
          position: "absolute",
          inset: 0,
          scale: zoom,
          transformOrigin: "65% 69%",
        }}
      >
        <Img
          src={shot("course-browser-lab-actions.png")}
          style={{width: "100%", height: "100%", objectFit: "cover"}}
        />
        <LabReadyStatus />
        <CursorPair x={1230} y={724} tarsSize={23} />
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 1110,
          top: 566,
          zIndex: 40,
          padding: "13px 17px 12px",
          borderRadius: 14,
          background: "rgba(17,18,15,0.92)",
          color: "white",
          boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
          opacity: interpolate(frame, [10, 24, 139, 157], [0, 1, 1, 0], clamp),
        }}
      >
        <div style={{fontSize: 14, color: "#b9ed3b", fontWeight: 850, letterSpacing: ".12em"}}>MEET TARS</div>
        <div style={{marginTop: 5, fontSize: 20, fontWeight: 720}}>Guided practice in Lab Mode</div>
      </div>
      <SceneAudio src="act-3-meet-tars.mp3" from={6} />
    </SceneBase>
  );
};

const Ec2Recording: React.FC<{
  trimBefore: number;
  trimAfter: number;
  muted?: boolean;
}> = ({trimBefore, trimAfter, muted = false}) => (
  <Video
    src={shot("tars-ec2.mov")}
    trimBefore={trimBefore}
    trimAfter={trimAfter}
    muted={muted}
    volume={() => (muted ? 0 : 2.2)}
    objectFit="cover"
    style={{width: "100%", height: "100%"}}
  />
);

const AwsAccountMask: React.FC = () => (
  <Interactive.Div
    name="AWS account privacy mask"
    style={{
      position: "absolute",
      top: 88,
      right: 10,
      zIndex: 30,
      width: 292,
      height: 58,
      borderRadius: "0 0 0 8px",
      background: "#111821",
    }}
  />
);

const AcrossBrowserScene: React.FC = () => (
  <SceneBase>
    <Sequence name="Learner opens the EC2 launch flow" durationInFrames={EC2_HOLD_AT}>
      <Ec2Recording trimBefore={0} trimAfter={EC2_HOLD_AT} muted />
    </Sequence>
    <Sequence
      name="Hold Network settings for narration"
      from={EC2_HOLD_AT}
      durationInFrames={EC2_HOLD_DURATION}
    >
      <Freeze frame={EC2_HOLD_AT - 1}>
        <Ec2Recording trimBefore={0} trimAfter={EC2_SOURCE_DURATION} muted />
      </Freeze>
    </Sequence>
    <Sequence
      name="Learner asks Tars inside AWS"
      from={EC2_HOLD_AT + EC2_HOLD_DURATION}
      durationInFrames={EC2_CLEAN_END - EC2_HOLD_AT}
    >
      <Ec2Recording trimBefore={EC2_HOLD_AT} trimAfter={EC2_CLEAN_END} muted />
    </Sequence>
    <Sequence
      name="Clean AWS hold replacing the screen-recording controls"
      from={EC2_CLEAN_END + EC2_HOLD_DURATION}
      durationInFrames={EC2_SOURCE_DURATION - EC2_CLEAN_END}
    >
      <Freeze frame={EC2_CLEAN_END - 1}>
        <Ec2Recording trimBefore={0} trimAfter={EC2_CLEAN_END} muted />
      </Freeze>
    </Sequence>

    <AwsAccountMask />

    <SceneAudio src="act-3-ec2-example.mp3" from={6} />
    <SceneAudio src="act-3-ec2-risk.mp3" from={326} />
    <SceneAudio src="act-3-ec2-question.mp3" from={706} />
    <SceneAudio src="act-3-ec2-answer.mp3" from={1074} />
    <SceneAudio src="act-3-ec2-closing.mp3" from={1588} />
  </SceneBase>
);

const WorkflowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const chemistryVideo = (trimBefore: number, trimAfter: number) => (
    <Video
      src={shot("tars-circle-to-ask.mov")}
      trimBefore={trimBefore}
      trimAfter={trimAfter}
      muted
      objectFit="fill"
      style={{
        position: "absolute",
        left: -170,
        top: -96,
        width: 2090,
        height: 1176,
      }}
    />
  );

  return (
    <SceneBase>
      <Interactive.Div
        name="Recorded circle-and-ask interaction"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <Sequence name="Hold first chemistry frame for the feature introduction" durationInFrames={198}>
          <Freeze frame={0}>{chemistryVideo(60, 840)}</Freeze>
        </Sequence>
        <Sequence name="Recorded chemistry circle-and-ask interaction" from={198}>
          {chemistryVideo(60, 840)}
        </Sequence>
      </Interactive.Div>
      <Interactive.Div
        name="Circle to Ask introduction"
        style={{
          position: "absolute",
          left: 70,
          top: 60,
          zIndex: 50,
          width: 430,
          padding: "17px 20px 18px",
          borderRadius: 15,
          background: "rgba(17,24,39,0.94)",
          color: "white",
          boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
          opacity: interpolate(frame, [4, 14, 180, 194], [0, 1, 1, 0], clamp),
        }}
      >
        <div style={{fontSize: 15, color: "#b7ec52", fontWeight: 800, letterSpacing: ".11em"}}>
          CIRCLE TO ASK
        </div>
        <div style={{marginTop: 6, fontSize: 22, fontWeight: 650, lineHeight: 1.3}}>
          Circle anything on screen. Ask in context.
        </div>
      </Interactive.Div>
      <SceneAudio src="act-3-circle-intro.mp3" from={6} />
      <SceneAudio src="act-3-circle-question.mp3" from={228} />
      <SceneAudio src="act-3-circle-answer.mp3" from={423} />
    </SceneBase>
  );
};

export const LiveClassroomTarsVideo: React.FC = () => (
  <AbsoluteFill style={{background: "#060606"}}>
    <Sequence name="Open Live Classroom" durationInFrames={196}>
      <LiveIntroScene />
    </Sequence>
    <Sequence name="Automatic lesson start" from={196} durationInFrames={294}>
      <LiveAutoScene />
    </Sequence>
    <Sequence
      name="Completed Live Classroom diagram"
      from={490}
      durationInFrames={LIVE_TARS_SCENES.classroomVoice + LIVE_TARS_SCENES.liveExplain}
    >
      <ClassroomExplanationScene />
    </Sequence>
    <Sequence name="Built-in hands-on lab" from={988} durationInFrames={192}>
      <LabIntroScene />
    </Sequence>
    <Sequence name="Meet Tars" from={1180} durationInFrames={161}>
      <MeetTarsScene />
    </Sequence>
    <Sequence
      name="Open with Tars and continue in AWS"
      from={1341}
      durationInFrames={LIVE_TARS_SCENES.acrossBrowser}
    >
      <AcrossBrowserScene />
    </Sequence>
    <Sequence
      name="Recorded circle-and-ask example"
      from={1341 + LIVE_TARS_SCENES.acrossBrowser}
      durationInFrames={LIVE_TARS_SCENES.workflow}
    >
      <WorkflowScene />
    </Sequence>
  </AbsoluteFill>
);
