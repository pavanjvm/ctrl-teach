import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

const SIGNAL = "#d0f31f";
const WHITE = "#f6f4ed";
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const BREAKTHROUGH_DURATION = 330;

const fragments = [
  {clip: "polygon(0 0, 43% 0, 34% 25%, 0 31%)", x: -510, y: -300, rotate: -24},
  {clip: "polygon(43% 0, 72% 0, 66% 29%, 34% 25%)", x: -80, y: -440, rotate: 12},
  {clip: "polygon(72% 0, 100% 0, 100% 35%, 66% 29%)", x: 420, y: -330, rotate: 29},
  {clip: "polygon(0 31%, 34% 25%, 30% 57%, 0 63%)", x: -570, y: -35, rotate: -35},
  {clip: "polygon(34% 25%, 66% 29%, 55% 55%, 30% 57%)", x: -150, y: -80, rotate: 21},
  {clip: "polygon(66% 29%, 100% 35%, 100% 65%, 55% 55%)", x: 560, y: -10, rotate: 38},
  {clip: "polygon(0 63%, 30% 57%, 42% 100%, 0 100%)", x: -470, y: 370, rotate: 28},
  {clip: "polygon(30% 57%, 55% 55%, 72% 100%, 42% 100%)", x: 10, y: 470, rotate: -18},
  {clip: "polygon(55% 55%, 100% 65%, 100% 100%, 72% 100%)", x: 470, y: 350, rotate: -32},
] as const;

const CalendarFace: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      border: "2px solid rgba(246,244,237,0.76)",
      borderRadius: 42,
      background: "linear-gradient(145deg, #20201e, #0c0c0b 62%)",
      boxShadow: "0 48px 120px rgba(0,0,0,0.68)",
    }}
  >
    <div
      style={{
        height: 130,
        borderBottom: "2px solid rgba(246,244,237,0.38)",
        background: "linear-gradient(90deg, rgba(208,243,31,0.18), rgba(208,243,31,0.03))",
      }}
    />
    {[156, 267, 378].map((top) => (
      <div
        key={`row-${top}`}
        style={{
          position: "absolute",
          top,
          left: 54,
          width: 452,
          height: 1,
          background: "rgba(246,244,237,0.2)",
        }}
      />
    ))}
    {[167, 280, 393].map((left) => (
      <div
        key={`column-${left}`}
        style={{
          position: "absolute",
          top: 157,
          left,
          width: 1,
          height: 332,
          background: "rgba(246,244,237,0.2)",
        }}
      />
    ))}
    {[80, 193, 306, 419].flatMap((left, column) =>
      [190, 301, 412].map((top, row) => (
        <div
          key={`${left}-${top}`}
          style={{
            position: "absolute",
            left,
            top,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: column === 2 && row === 1 ? SIGNAL : "rgba(246,244,237,0.23)",
            boxShadow: column === 2 && row === 1 ? `0 0 28px ${SIGNAL}` : undefined,
          }}
        />
      )),
    )}
    <div
      style={{
        position: "absolute",
        top: 48,
        left: 54,
        color: WHITE,
        fontSize: 30,
        fontWeight: 800,
        letterSpacing: "0.18em",
      }}
    >
      NEXT CLASS
    </div>
    <div
      style={{
        position: "absolute",
        top: 45,
        right: 54,
        color: SIGNAL,
        fontFamily: "monospace",
        fontSize: 32,
        fontWeight: 700,
      }}
    >
      +28 DAYS
    </div>
  </div>
);

const Calendar: React.FC = () => (
  <div style={{position: "absolute", left: 680, top: 245, width: 560, height: 540}}>
    <CalendarFace />
    {[118, 442].map((left) => (
      <div
        key={left}
        style={{
          position: "absolute",
          top: -36,
          left,
          width: 34,
          height: 91,
          borderRadius: 20,
          border: "8px solid #c8c8c1",
          background: "#111",
          boxShadow: "0 8px 20px rgba(0,0,0,0.55)",
        }}
      />
    ))}
  </div>
);

const Cracks: React.FC<{progress: number}> = ({progress}) => (
  <svg
    viewBox="0 0 560 540"
    style={{
      position: "absolute",
      left: 680,
      top: 245,
      width: 560,
      height: 540,
      overflow: "visible",
      filter: `drop-shadow(0 0 ${10 + progress * 20}px rgba(208,243,31,0.95))`,
    }}
  >
    {[
      "M286 266 L212 198 L170 116 L84 70",
      "M286 266 L340 182 L425 135 L492 47",
      "M286 266 L377 286 L461 252 L546 285",
      "M286 266 L330 357 L318 451 L375 535",
      "M286 266 L205 330 L122 351 L44 430",
      "M286 266 L223 260 L155 230 L1 245",
    ].map((path) => (
      <path
        key={path}
        d={path}
        fill="none"
        stroke={SIGNAL}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
      />
    ))}
    <circle cx="286" cy="266" r={11 + progress * 10} fill={SIGNAL} opacity={progress} />
  </svg>
);

export const BreakthroughVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const crackProgress = interpolate(frame, [14, 34], [0, 1], {...clamp, easing: Easing.bezier(0.7, 0, 0.84, 0)});
  const shatter = interpolate(frame, [32, 55], [0, 1], {...clamp, easing: Easing.bezier(0.22, 0.78, 0.34, 1)});

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#050505", color: WHITE}}>
      <Sequence name="So we removed the calendar" from={12} layout="none">
        <Audio
          src={staticFile("voiceover/combined-pitch/act-3-breakthrough.mp3")}
        />
      </Sequence>
      <Sequence name="Introducing Ctrl+Teach" from={90} layout="none">
        <Audio
          src={staticFile("voiceover/combined-pitch/act-3-ctrlteach-intro.mp3")}
        />
      </Sequence>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [0, 10, 44, 70], [0.18, 0.3, 0.22, 0.1], clamp),
          backgroundImage:
            "linear-gradient(#292925 1px, transparent 1px), linear-gradient(90deg, #292925 1px, transparent 1px)",
          backgroundSize: "66px 66px",
          scale: interpolate(frame, [0, BREAKTHROUGH_DURATION], [1.08, 1.24], {...clamp, easing: Easing.linear}),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -240,
          background: "radial-gradient(circle at 50% 51%, rgba(208,243,31,0.27), rgba(208,243,31,0.035) 22%, transparent 54%)",
          opacity: interpolate(frame, [0, 22, 34, 65], [0, 0.35, 1, 0.4], clamp),
          scale: interpolate(frame, [0, 55], [0.55, 1.45], {...clamp, easing: ease}),
        }}
      />

      <div
        style={{
          opacity: interpolate(frame, [0, 8, 31, 35], [0, 1, 1, 0], {...clamp, easing: ease}),
          scale: interpolate(frame, [0, 10, 32], [0.82, 1, 1.035], {...clamp, easing: ease}),
        }}
      >
        <Calendar />
      </div>

      {fragments.map((fragment, index) => (
        <div
          key={fragment.clip}
          style={{
            position: "absolute",
            left: 680,
            top: 245,
            width: 560,
            height: 540,
            clipPath: fragment.clip,
            opacity: interpolate(frame, [31, 34, 50, 66], [0, 1, 0.92, 0], clamp),
            translate: `${fragment.x * shatter}px ${fragment.y * shatter + shatter * shatter * 105}px`,
            rotate: `${fragment.rotate * shatter + (index % 2 === 0 ? -2 : 2)}deg`,
            scale: 1 - shatter * 0.12,
            filter: `blur(${interpolate(frame, [48, 66], [0, 4], clamp)}px)`,
          }}
        >
          <CalendarFace />
        </div>
      ))}

      <div
        style={{
          opacity: interpolate(frame, [14, 24, 42, 64], [0, 1, 1, 0], clamp),
        }}
      >
        <Cracks progress={crackProgress} />
      </div>

      <AbsoluteFill
        style={{
          background: WHITE,
          opacity: interpolate(frame, [31, 35, 42], [0, 0.94, 0], clamp),
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: interpolate(
            frame,
            [42, 62, BREAKTHROUGH_DURATION - 9, BREAKTHROUGH_DURATION - 1],
            [0, 1, 1, 0],
            {...clamp, easing: ease},
          ),
          scale: interpolate(frame, [42, 66, 88], [0.76, 1.035, 1], {...clamp, easing: ease}),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            color: WHITE,
            fontSize: 166,
            fontWeight: 850,
            letterSpacing: "-0.075em",
            textShadow: "0 30px 90px rgba(0,0,0,0.88)",
          }}
        >
          Ctrl<span style={{color: SIGNAL, padding: "0 8px", textShadow: `0 0 52px ${SIGNAL}`}}>+</span>Teach
        </div>
        <div
          style={{
            width: interpolate(frame, [58, 82], [0, 620], {...clamp, easing: ease}),
            height: 5,
            marginTop: 28,
            background: SIGNAL,
            boxShadow: `0 0 24px ${SIGNAL}`,
          }}
        />
        <div
          style={{
            marginTop: 35,
            color: "rgba(246,244,237,0.72)",
            fontSize: 25,
            fontWeight: 800,
            letterSpacing: "0.3em",
            opacity: interpolate(frame, [68, 84], [0, 1], {...clamp, easing: ease}),
            translate: `0 ${interpolate(frame, [68, 84], [18, 0], {...clamp, easing: ease})}px`,
          }}
        >
          EXPERTISE. ON DEMAND.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 68,
          bottom: 55,
          color: "rgba(246,244,237,0.42)",
          fontFamily: "monospace",
          fontSize: 20,
          letterSpacing: "0.12em",
          opacity: interpolate(
            frame,
            [64, 78, BREAKTHROUGH_DURATION - 9, BREAKTHROUGH_DURATION - 1],
            [0, 1, 1, 0],
            {...clamp, easing: ease},
          ),
        }}
      >
        ACT 03 / BREAKTHROUGH
      </div>
    </AbsoluteFill>
  );
};
