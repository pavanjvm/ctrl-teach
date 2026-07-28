import type {CSSProperties} from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

const INK = "#f6f4ed";
const MUTED = "#8a8a83";
const LINE = "#32322e";
const SIGNAL = "#d0f31f";
const ease = Easing.bezier(0.16, 1, 0.3, 1);

type CalendarEvent = {
  day: number;
  slot: 0 | 1;
  start: number;
  cohort: string;
  trainer: string;
};

const events: CalendarEvent[] = [
  {day: 1, slot: 0, start: 35, cohort: "C01", trainer: "MAYA R."},
  {day: 3, slot: 0, start: 41, cohort: "C02", trainer: "LEO K."},
  {day: 6, slot: 0, start: 47, cohort: "C03", trainer: "MAYA R."},
  {day: 8, slot: 0, start: 53, cohort: "C04", trainer: "NINA S."},
  {day: 10, slot: 0, start: 59, cohort: "C05", trainer: "LEO K."},
  {day: 12, slot: 0, start: 65, cohort: "C06", trainer: "MAYA R."},
  {day: 14, slot: 0, start: 71, cohort: "C07", trainer: "NINA S."},
  {day: 16, slot: 0, start: 77, cohort: "C08", trainer: "LEO K."},
  {day: 18, slot: 0, start: 83, cohort: "C09", trainer: "MAYA R."},
  {day: 20, slot: 0, start: 89, cohort: "C10", trainer: "NINA S."},
  {day: 22, slot: 0, start: 95, cohort: "C11", trainer: "LEO K."},
  {day: 24, slot: 0, start: 101, cohort: "C12", trainer: "MAYA R."},
  {day: 26, slot: 0, start: 107, cohort: "C13", trainer: "NINA S."},
  {day: 28, slot: 0, start: 113, cohort: "C14", trainer: "LEO K."},
  {day: 30, slot: 0, start: 119, cohort: "C15", trainer: "MAYA R."},
  {day: 2, slot: 1, start: 125, cohort: "C16", trainer: "MAYA R."},
  {day: 5, slot: 1, start: 130, cohort: "C17", trainer: "LEO K."},
  {day: 9, slot: 1, start: 135, cohort: "C18", trainer: "MAYA R."},
  {day: 13, slot: 1, start: 140, cohort: "C19", trainer: "NINA S."},
  {day: 17, slot: 1, start: 145, cohort: "C20", trainer: "LEO K."},
  {day: 21, slot: 1, start: 150, cohort: "C21", trainer: "MAYA R."},
  {day: 25, slot: 1, start: 155, cohort: "C22", trainer: "NINA S."},
  {day: 29, slot: 1, start: 160, cohort: "C23", trainer: "LEO K."},
  {day: 31, slot: 1, start: 165, cohort: "C24", trainer: "MAYA R."},
];

const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const getNextAvailable = (frame: number) => {
  if (frame < 64) return "JUL 28";
  if (frame < 100) return "AUG 19";
  if (frame < 136) return "SEP 07";
  if (frame < 172) return "OCT 22";
  return "DEC 03";
};

type PacedSceneProps = {pace: number};

const CalendarScene: React.FC<PacedSceneProps> = ({pace}) => {
  const frame = useCurrentFrame() / pace;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        color: INK,
        opacity: interpolate(frame, [14, 30, 196, 210], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          gap: 22,
          padding: "58px 92px 54px",
          scale: interpolate(frame, [14, 42], [0.965, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      >
        <div style={{display: "flex", alignItems: "flex-end", justifyContent: "space-between"}}>
          <div>
            <div style={{fontSize: 24, fontWeight: 700, letterSpacing: "0.19em", color: MUTED}}>
              INSTRUCTOR-LED TRAINING
            </div>
            <div style={{marginTop: 8, fontSize: 48, fontWeight: 700, letterSpacing: "-0.035em"}}>
              Delivery calendar
            </div>
          </div>
          <div style={{display: "flex", alignItems: "baseline", gap: 32}}>
            <div style={{fontSize: 24, fontWeight: 700, color: MUTED, letterSpacing: "0.14em"}}>
              {String(
                Math.round(
                  interpolate(frame, [28, 172], [0, 24], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                ),
              ).padStart(2, "0")} COHORTS
            </div>
            <div style={{fontSize: 50, fontWeight: 700, letterSpacing: "-0.04em"}}>JULY 2026</div>
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`}}>
          {weekDays.map((day) => (
            <div
              key={day}
              style={{
                padding: "13px 16px",
                borderRight: `1px solid ${LINE}`,
                borderBottom: `1px solid ${LINE}`,
                color: MUTED,
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: "0.16em",
              }}
            >
              {day}
            </div>
          ))}

          {Array.from({length: 35}, (_, index) => {
            const day = index + 1;
            const dayEvents = events.filter((event) => event.day === day);

            return (
              <div
                key={day}
                style={{
                  position: "relative",
                  height: 126,
                  overflow: "hidden",
                  padding: "12px 12px 10px",
                  borderRight: `1px solid ${LINE}`,
                  borderBottom: `1px solid ${LINE}`,
                  background: day > 31 ? "#080808" : "#000",
                }}
              >
                <div style={{fontSize: 20, color: day > 31 ? "#30302c" : MUTED}}>
                  {day <= 31 ? day : ""}
                </div>
                {dayEvents.map((event) => (
                  <div
                    key={`${event.cohort}-${event.slot}`}
                    style={{
                      position: "absolute",
                      right: 8,
                      bottom: event.slot === 0 ? 9 : 55,
                      left: 8,
                      height: 42,
                      overflow: "hidden",
                      padding: "6px 9px",
                      borderLeft: `5px solid ${event.slot === 0 ? SIGNAL : INK}`,
                      background: event.slot === 0 ? "#191a16" : "#292a25",
                      opacity: interpolate(frame, [event.start, event.start + 8], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: ease,
                      }),
                      scale: interpolate(frame, [event.start, event.start + 10], [0.82, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: ease,
                      }),
                    }}
                  >
                    <div style={{display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, lineHeight: 1.1}}>
                      <span>{event.cohort}</span>
                      <span style={{color: event.slot === 0 ? SIGNAL : "#b7b7af"}}>{event.trainer}</span>
                    </div>
                    <div style={{marginTop: 3, color: "#a4a49c", fontSize: 12, lineHeight: 1}}>TRAINING SESSION</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto"}}>
          <div style={{fontSize: 23, fontWeight: 700, letterSpacing: "0.12em", color: MUTED}}>
            TRAINERS REPEAT. WAIT TIMES GROW.
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 24}}>
            <span style={{fontSize: 23, fontWeight: 700, letterSpacing: "0.12em"}}>NEXT AVAILABLE</span>
            <span
              style={{
                minWidth: 214,
                padding: "13px 18px",
                background: SIGNAL,
                color: "#000",
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: "0.03em",
                textAlign: "center",
              }}
            >
              {getNextAvailable(frame)}
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ScreenshotScene: React.FC<PacedSceneProps> = ({pace}) => {
  const frame = useCurrentFrame() / pace;

  return (
    <AbsoluteFill style={{background: "#000", overflow: "hidden"}}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 4, 78, 90], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            width: 1748,
            height: 1000,
            translate: `${interpolate(frame, [24, 76], [0, 369], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px 0`,
          }}
        >
          <Img
            src={staticFile("course-schedule.svg")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              scale: interpolate(frame, [24, 76], [1, 2.15], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              transformOrigin: "29% 48%",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FinalMessage: React.FC<PacedSceneProps> = ({pace}) => {
  const frame = useCurrentFrame() / pace;

  return (
    <AbsoluteFill style={{background: "#000", color: INK}}>
      <div
        style={{
          position: "absolute",
          top: 112,
          bottom: 112,
          left: 118,
          width: 8,
          background: SIGNAL,
          scale: `1 ${interpolate(frame, [2, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}`,
          transformOrigin: "center top",
        }}
      />
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          justifyContent: "center",
          gap: 32,
          padding: "100px 150px 100px 190px",
        }}
      >
        <div
          style={{
            maxWidth: 1520,
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.04,
            opacity: interpolate(frame, [4, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            translate: `0 ${interpolate(frame, [4, 18], [42, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px`,
          }}
        >
          THE LEARNER NEEDS THE SKILL <span style={{color: SIGNAL}}>NOW.</span>
        </div>
        <div
          style={{
            maxWidth: 1520,
            color: "#a5a59d",
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.04,
            opacity: interpolate(frame, [16, 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            translate: `0 ${interpolate(frame, [16, 30], [42, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px`,
          }}
        >
          THE NEXT CLASS STARTS <span style={{color: INK}}>LATER.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const baseStyle: CSSProperties = {backgroundColor: "#000"};

export const TrainingCapacityVideo: React.FC<{pace?: number}> = ({pace = 1}) => {
  return (
    <AbsoluteFill style={baseStyle}>
      <Sequence name="Calendar overload" durationInFrames={Math.round(210 * pace)}>
        <CalendarScene pace={pace} />
      </Sequence>
      <Sequence
        name="No scheduled classes screenshot"
        from={Math.round(210 * pace)}
        durationInFrames={Math.round(90 * pace)}
      >
        <ScreenshotScene pace={pace} />
      </Sequence>
      <Sequence
        name="Learner urgency message"
        from={Math.round(300 * pace)}
        durationInFrames={Math.round(60 * pace)}
      >
        <FinalMessage pace={pace} />
      </Sequence>
    </AbsoluteFill>
  );
};
