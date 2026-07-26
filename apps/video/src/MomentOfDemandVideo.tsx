import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

const WHITE = "#f6f4ed";
const MUTED = "#97978f";
const LINE = "#31312d";
const SIGNAL = "#d0f31f";
const DANGER = "#ff4d4d";
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const CutLabel: React.FC<{children: ReactNode; inverse?: boolean}> = ({children, inverse}) => {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 4,
        top: 52,
        left: 66,
        padding: "13px 18px",
        border: `1px solid ${inverse ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.2)"}`,
        background: inverse ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.92)",
        color: inverse ? WHITE : "#111",
        fontSize: 23,
        fontWeight: 800,
        letterSpacing: "0.13em",
      }}
    >
      {children}
    </div>
  );
};

export const WorkProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#050505",
        color: WHITE,
        opacity: interpolate(frame, [8, 20, 82, 90], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.24,
          backgroundImage:
            "linear-gradient(#252521 1px, transparent 1px), linear-gradient(90deg, #252521 1px, transparent 1px)",
          backgroundSize: "58px 58px",
          translate: `${interpolate(frame, [0, 90], [0, -28])}px ${interpolate(
            frame,
            [0, 90],
            [0, -16],
          )}px`,
        }}
      />

      <div style={{display: "flex", height: "100%", flexDirection: "column", padding: "54px 86px 70px"}}>
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
          <div style={{fontSize: 24, fontWeight: 800, letterSpacing: "0.18em", color: MUTED}}>
            RELEASE CONTROL / INCIDENT 2417
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 12, fontSize: 23, fontWeight: 800}}>
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: DANGER,
                scale: interpolate(frame % 18, [0, 9, 18], [0.75, 1.2, 0.75], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: ease,
                }),
              }}
            />
            LIVE
          </div>
        </div>

        <div style={{display: "grid", flex: 1, gridTemplateColumns: "minmax(0, 1.45fr) minmax(460px, 0.55fr)", alignItems: "center", gap: 52}}>
          <div
            style={{
              padding: "60px 64px 58px",
              border: `1px solid ${LINE}`,
              background: "rgba(10,10,10,0.9)",
              opacity: interpolate(frame, [16, 30], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: `${interpolate(frame, [16, 30], [-52, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0`,
            }}
          >
            <div style={{color: DANGER, fontSize: 28, fontWeight: 800, letterSpacing: "0.16em"}}>
              DEPLOYMENT FAILED
            </div>
            <div style={{marginTop: 28, fontSize: 116, fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 0.92}}>
              CHECKOUT
              <br />
              IS DOWN.
            </div>
            <div style={{marginTop: 34, fontFamily: "monospace", fontSize: 25, lineHeight: 1.55, color: MUTED}}>
              <span style={{color: DANGER}}>ERROR</span> payment-service timeout
              <br />
              region: prod-us-east-1 · retries: 03
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              opacity: interpolate(frame, [34, 50], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: `${interpolate(frame, [34, 50], [56, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0`,
            }}
          >
            <div style={{padding: "34px 36px", border: `1px solid ${LINE}`, background: "#111"}}>
              <div style={{fontSize: 21, fontWeight: 800, color: MUTED, letterSpacing: "0.12em"}}>TEAM CHAT · 14:07</div>
              <div style={{marginTop: 18, fontSize: 36, fontWeight: 700, lineHeight: 1.25}}>
                Can you unblock the release?
              </div>
            </div>
            <div style={{padding: "28px 36px", borderLeft: `7px solid ${SIGNAL}`, background: "#171811", fontSize: 31, fontWeight: 700}}>
              Need the answer now.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const CprimeCourseScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#000"}}>
      <CutLabel inverse>CPRIME COURSE</CutLabel>
      <Img
        src={staticFile("demand-assets/cprime-course.jpg")}
        style={{
          position: "absolute",
          top: 122,
          left: 0,
          width: 1920,
          height: 835,
          objectFit: "contain",
          scale: interpolate(frame, [0, 75], [1.015, 1.065], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />
      <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 0 170px 30px rgba(0,0,0,0.42)"}} />
    </AbsoluteFill>
  );
};

export const CprimeDateScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#000"}}>
      <CutLabel inverse>NEXT AVAILABLE DATE</CutLabel>
      <div
        style={{
          position: "absolute",
          top: 122,
          left: 0,
          width: 1920,
          height: 835,
          translate: `${interpolate(frame, [4, 54], [0, -462], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px ${interpolate(frame, [4, 54], [0, -193], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px`,
        }}
      >
        <Img
          src={staticFile("demand-assets/cprime-course.jpg")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            scale: interpolate(frame, [4, 54], [1.065, 2.55], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            transformOrigin: "74% 73%",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 440,
          left: 712,
          width: 496,
          height: 190,
          border: `6px solid ${SIGNAL}`,
          opacity: interpolate(frame, [40, 52], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
          scale: interpolate(frame, [40, 52], [1.12, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      />
    </AbsoluteFill>
  );
};

const CprimeCloseScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#050505", color: WHITE}}>
      <div
        style={{
          position: "absolute",
          top: 121,
          left: 80,
          width: 1760,
          height: 838,
          overflow: "hidden",
          border: `1px solid ${LINE}`,
          borderRadius: 14,
          background: "#171717",
          boxShadow: "0 36px 110px rgba(0,0,0,0.72)",
          opacity: interpolate(frame, [0, 8, 58, 80], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
          scale: interpolate(frame, [0, 10, 55, 80], [0.96, 1, 1, 0.82], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            display: "grid",
            height: 72,
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            padding: "0 22px",
            borderBottom: `1px solid ${LINE}`,
            background: "#161616",
          }}
        >
          <div style={{display: "flex", gap: 12}}>
            <div style={{width: 17, height: 17, borderRadius: "50%", background: "#ff5f57"}} />
            <div style={{width: 17, height: 17, borderRadius: "50%", background: "#febc2e"}} />
            <div style={{width: 17, height: 17, borderRadius: "50%", background: "#28c840"}} />
          </div>
          <div
            style={{
              minWidth: 760,
              padding: "11px 24px",
              borderRadius: 999,
              background: "#242424",
              color: "#b7b7af",
              fontSize: 20,
              textAlign: "center",
            }}
          >
            cprime.com/learning/courses/chatgpt-primer
          </div>
          <div
            style={{
              justifySelf: "end",
              display: "grid",
              width: 42,
              height: 42,
              placeItems: "center",
              borderRadius: 8,
              background: frame >= 45 ? DANGER : "#242424",
              color: WHITE,
              fontSize: 30,
              fontWeight: 700,
              scale: interpolate(frame, [42, 48, 54], [1, 1.18, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
            }}
          >
            ×
          </div>
        </div>
        <Img
          src={staticFile("demand-assets/cprime-course.jpg")}
          style={{width: 1760, height: 766, objectFit: "cover"}}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            color: WHITE,
            fontSize: 58,
            lineHeight: 1,
            textShadow: "0 3px 12px rgba(0,0,0,0.85)",
            translate: `${interpolate(frame, [12, 45], [1490, 1688], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px ${interpolate(frame, [12, 45], [650, 35], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px`,
            rotate: "-8deg",
          }}
        >
          ↖
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: MUTED,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.18em",
          opacity: interpolate(frame, [70, 86], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
        }}
      >
        PAGE CLOSED
      </div>
    </AbsoluteFill>
  );
};

type BrowserCutProps = {
  asset: string;
  duration?: number;
  label: string;
  dark?: boolean;
  panY?: number;
  prompt?: string;
};

const BrowserCut: React.FC<BrowserCutProps> = ({
  asset,
  duration = 60,
  label,
  dark = false,
  panY = 0,
  prompt,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{overflow: "hidden", background: dark ? "#000" : "#fff"}}>
      <Img
        src={staticFile(`demand-assets/${asset}`)}
        style={{
          width: "100%",
          height: panY === 0 ? "100%" : "112%",
          objectFit: "cover",
          scale: interpolate(frame, [0, duration], [1.02, 1.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
          translate: `0 ${interpolate(frame, [0, duration], [0, panY], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          })}px`,
        }}
      />
      <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 0 180px 24px rgba(0,0,0,0.48)"}} />
      <CutLabel inverse={dark}>{label}</CutLabel>
      {prompt ? (
        <div
          style={{
            position: "absolute",
            right: 290,
            bottom: 252,
            left: 520,
            padding: "22px 28px",
            border: `2px solid ${SIGNAL}`,
            borderRadius: 20,
            background: "rgba(15,15,15,0.94)",
            color: WHITE,
            fontSize: 30,
            fontWeight: 600,
            opacity: interpolate(frame, [12, 24], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            translate: `0 ${interpolate(frame, [12, 24], [22, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px`,
          }}
        >
          {prompt.slice(
            0,
            Math.round(
              interpolate(frame, [18, 47], [0, prompt.length], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.linear,
              }),
            ),
          )}
          <span style={{color: SIGNAL}}>▌</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

type EquationTermProps = {
  frame: number;
  start: number;
  noun: string;
  detail: string;
  highlight?: boolean;
};

const EquationTerm: React.FC<EquationTermProps> = ({frame, start, noun, detail, highlight}) => {
  return (
    <div
      style={{
        display: "flex",
        width: 350,
        height: 280,
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "34px 32px 30px",
        border: `2px solid ${highlight ? SIGNAL : LINE}`,
        background: highlight ? "#15180c" : "#0d0d0c",
        opacity: interpolate(frame, [start, start + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
        scale: interpolate(frame, [start, start + 18], [0.72, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
        translate: `0 ${interpolate(frame, [start, start + 18], [56, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}px`,
      }}
    >
      <div style={{fontSize: 32, fontWeight: 800, letterSpacing: "0.19em", color: highlight ? SIGNAL : MUTED}}>
        MORE
      </div>
      <div style={{fontSize: noun.startsWith("TRAINER HOURS") ? 48 : 57, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.95}}>
        {noun}
      </div>
      <div style={{fontSize: 22, fontWeight: 700, color: MUTED, letterSpacing: "0.08em"}}>{detail}</div>
    </div>
  );
};

const EquationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const starts = [10, 48, 86, 124];

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#000", color: WHITE}}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundImage: "radial-gradient(#67675f 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div style={{display: "flex", height: "100%", flexDirection: "column", justifyContent: "center", gap: 64, padding: "96px 94px"}}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "0.2em",
            color: MUTED,
            opacity: interpolate(frame, [0, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
          }}
        >
          THE CAPACITY EQUATION
        </div>
        <div style={{display: "flex", alignItems: "center", justifyContent: "center", gap: 24}}>
          <EquationTerm frame={frame} start={starts[0]} noun="LEARNERS" detail="DEMAND" />
          <div
            style={{
              color: SIGNAL,
              fontSize: 68,
              fontWeight: 400,
              opacity: interpolate(frame, [starts[1] - 10, starts[1] + 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: `${interpolate(frame, [starts[1] - 10, starts[1] + 4], [-22, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0`,
            }}
          >
            →
          </div>
          <EquationTerm frame={frame} start={starts[1]} noun="COHORTS" detail="DELIVERY" />
          <div
            style={{
              color: SIGNAL,
              fontSize: 68,
              fontWeight: 400,
              opacity: interpolate(frame, [starts[2] - 10, starts[2] + 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: `${interpolate(frame, [starts[2] - 10, starts[2] + 4], [-22, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0`,
            }}
          >
            →
          </div>
          <EquationTerm frame={frame} start={starts[2]} noun="CALENDARS" detail="COORDINATION" />
          <div
            style={{
              color: SIGNAL,
              fontSize: 68,
              fontWeight: 400,
              opacity: interpolate(frame, [starts[3] - 10, starts[3] + 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: `${interpolate(frame, [starts[3] - 10, starts[3] + 4], [-22, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              })}px 0`,
            }}
          >
            →
          </div>
          <EquationTerm frame={frame} start={starts[3]} noun="TRAINER HOURS." detail="FINITE CAPACITY" highlight />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const baseStyle: CSSProperties = {backgroundColor: "#000"};

export const MomentOfDemandVideo: React.FC = () => {
  return (
    <AbsoluteFill style={baseStyle}>
      <Sequence name="Search YouTube" durationInFrames={105}>
        <BrowserCut asset="youtube-search.jpg" duration={105} label="SEARCH YOUTUBE" dark />
      </Sequence>
      <Sequence name="Open ChatGPT" from={105} durationInFrames={105}>
        <BrowserCut
          asset="generic-ai.jpg"
          duration={105}
          label="OPEN CHATGPT"
          dark
          prompt="How do I solve this problem at work?"
        />
      </Sequence>
      <Sequence name="Scroll course marketplace" from={210} durationInFrames={105}>
        <BrowserCut
          asset="learning-platform.jpg"
          duration={105}
          label="SCROLL COURSE MARKETPLACE"
          panY={-120}
        />
      </Sequence>
      <Sequence name="Close Cprime training page" from={315} durationInFrames={90}>
        <CprimeCloseScene />
      </Sequence>
      <Sequence name="Capacity equation" from={405} durationInFrames={195}>
        <EquationScene />
      </Sequence>
    </AbsoluteFill>
  );
};
