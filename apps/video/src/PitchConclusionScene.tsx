import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
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
const ink = "#11130f";
const paper = "#f4f3ed";
const muted = "#6b7067";
const lime = "#b7ec52";
const green = "#5d8619";

const CalendarGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const days = Array.from({length: 21}, (_, index) => index + 1);
  return (
    <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 7, marginTop: 22}}>
      {days.map((day, index) => (
        <div
          key={day}
          style={{
            height: 46,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(17,19,15,.09)",
            background: index < 14 ? "#eceee8" : index === 20 ? lime : "white",
            color: index === 20 ? ink : index < 14 ? "#9a9f96" : ink,
            fontSize: 14,
            fontWeight: index === 20 ? 850 : 650,
            opacity: interpolate(frame, [24 + index * 2, 34 + index * 2], [0, 1], clamp),
            scale: interpolate(frame, [24 + index * 2, 38 + index * 2], [0.82, 1], {
              ...clamp,
              easing: ease,
            }),
          }}
        >
          {day}
        </div>
      ))}
    </div>
  );
};

const CalendarGap: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        color: ink,
        opacity: interpolate(frame, [0, 18, 188, 228], [0, 1, 1, 0], clamp),
      }}
    >
      <div style={{position: "absolute", left: 116, top: 72}}>
        <div style={{color: green, fontSize: 16, fontWeight: 850, letterSpacing: ".16em"}}>
          WHERE WE STARTED
        </div>
        <div style={{marginTop: 16, fontSize: 70, fontWeight: 780, letterSpacing: "-.05em"}}>
          The skill is needed now.
        </div>
      </div>

      <Interactive.Div
        name="Learner needs the skill now"
        style={{
          position: "absolute",
          left: 118,
          top: 315,
          width: 590,
          height: 475,
          padding: "38px",
          borderRadius: 32,
          background: "#11130f",
          color: "white",
          boxShadow: "0 34px 90px rgba(17,19,15,.18)",
          opacity: interpolate(frame, [18, 40], [0, 1], {...clamp, easing: ease}),
          translate: interpolate(frame, [18, 46], ["0px 28px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <div style={{color: lime, fontSize: 15, fontWeight: 850, letterSpacing: ".15em"}}>
            LEARNER
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 8, color: "#dff7b0", fontSize: 14, fontWeight: 750}}>
            <span style={{width: 9, height: 9, borderRadius: 99, background: lime, boxShadow: "0 0 18px rgba(183,236,82,.8)"}} />
            NEED IS LIVE
          </div>
        </div>
        <div style={{marginTop: 60, fontSize: 48, lineHeight: 1.08, fontWeight: 760, letterSpacing: "-.04em"}}>
          “I need this skill today.”
        </div>
        <div style={{marginTop: 25, color: "#adb4a5", fontSize: 20, lineHeight: 1.5}}>
          The problem is happening now. The opportunity to learn is happening now.
        </div>
        <div style={{position: "absolute", left: 38, right: 38, bottom: 36, height: 7, borderRadius: 99, background: "rgba(255,255,255,.1)", overflow: "hidden"}}>
          <div
            style={{
              width: `${interpolate(frame, [45, 165], [8, 100], clamp)}%`,
              height: "100%",
              borderRadius: 99,
              background: lime,
            }}
          />
        </div>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          left: 770,
          top: 500,
          width: 250,
          textAlign: "center",
          opacity: interpolate(frame, [70, 96], [0, 1], clamp),
        }}
      >
        <div style={{fontSize: 14, fontWeight: 850, letterSpacing: ".18em", color: "#8b9187"}}>BUT THE CALENDAR SAYS</div>
        <div style={{marginTop: 14, color: ink, fontSize: 42, fontWeight: 780}}>WAIT</div>
        <div style={{marginTop: 19, height: 2, background: "#c8ccc3", position: "relative"}}>
          <div
            style={{
              position: "absolute",
              right: -2,
              top: -6,
              width: 12,
              height: 12,
              borderTop: "2px solid #8b9187",
              borderRight: "2px solid #8b9187",
              rotate: "45deg",
            }}
          />
        </div>
      </div>

      <Interactive.Div
        name="Next scheduled class"
        style={{
          position: "absolute",
          right: 118,
          top: 272,
          width: 720,
          minHeight: 570,
          padding: "34px 38px",
          borderRadius: 32,
          border: "1px solid rgba(17,19,15,.13)",
          background: "rgba(255,255,255,.9)",
          boxShadow: "0 34px 90px rgba(17,19,15,.09)",
          opacity: interpolate(frame, [42, 66], [0, 1], {...clamp, easing: ease}),
          translate: interpolate(frame, [42, 72], ["0px 28px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end"}}>
          <div>
            <div style={{color: green, fontSize: 15, fontWeight: 850, letterSpacing: ".14em"}}>NEXT CLASS</div>
            <div style={{marginTop: 9, fontSize: 32, fontWeight: 760}}>Cloud Architecture</div>
          </div>
          <div style={{textAlign: "right"}}>
            <div style={{fontSize: 44, fontWeight: 820, letterSpacing: "-.04em"}}>21</div>
            <div style={{color: muted, fontSize: 14, fontWeight: 750, letterSpacing: ".12em"}}>DAYS AWAY</div>
          </div>
        </div>
        <CalendarGrid />
        <div style={{marginTop: 22, padding: "16px 18px", borderRadius: 16, background: "#f0f1ec", color: muted, fontSize: 16}}>
          The next available cohort starts later.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};

const QuestionShift: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        color: "white",
        opacity: interpolate(frame, [176, 220, 432, 466], [0, 1, 1, 0], clamp),
      }}
    >
      <div style={{position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 55%, #28321f 0%, #11130f 44%, #070806 100%)"}} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 980,
          height: 980,
          borderRadius: 999,
          border: "1px solid rgba(183,236,82,.15)",
          translate: "-50% -50%",
          scale: interpolate(frame, [180, 450], [0.7, 1.12], clamp),
        }}
      />
      <div style={{position: "absolute", left: 180, right: 180, top: 120, textAlign: "center"}}>
        <div style={{color: lime, fontSize: 16, fontWeight: 850, letterSpacing: ".18em"}}>THE QUESTION CHANGES</div>
      </div>
      <Interactive.Div
        name="Old calendar question"
        style={{
          position: "absolute",
          left: 240,
          right: 240,
          top: 255,
          textAlign: "center",
          color: "#8d9487",
          fontSize: 46,
          fontWeight: 680,
          letterSpacing: "-.03em",
          opacity: interpolate(frame, [214, 242, 326, 355], [0, 1, 1, 0.38], clamp),
        }}
      >
        When does the next class start?
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "54%",
            width: `${interpolate(frame, [280, 326], [0, 86], {...clamp, easing: ease})}%`,
            height: 3,
            borderRadius: 99,
            background: lime,
            translate: "-50% -50%",
          }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="New learner question"
        style={{
          position: "absolute",
          left: 205,
          right: 205,
          top: 450,
          textAlign: "center",
          fontSize: 79,
          lineHeight: 1.06,
          fontWeight: 790,
          letterSpacing: "-.052em",
          opacity: interpolate(frame, [318, 354], [0, 1], {...clamp, easing: ease}),
          translate: interpolate(frame, [318, 365], ["0px 34px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        What does the learner want to
        <div style={{color: lime}}>become next?</div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};

export const PitchConclusionScene: React.FC = () => (
  <AbsoluteFill
    style={{
      overflow: "hidden",
      background: paper,
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage:
          "radial-gradient(circle at 18% 18%, rgba(183,236,82,.16), transparent 30%), linear-gradient(rgba(17,19,15,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(17,19,15,.035) 1px, transparent 1px)",
        backgroundSize: "auto, 60px 60px, 60px 60px",
      }}
    />
    <CalendarGap />
    <QuestionShift />
    <Sequence layout="none">
      <Audio
        src={staticFile("voiceover/combined-pitch/act-3-conclusion.mp3")}
        playbackRate={1.04}
      />
    </Sequence>
  </AbsoluteFill>
);
