import type {ReactNode} from "react";
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
const MUTED = "#9d9d95";
const SIGNAL = "#d0f31f";
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const FilmLabel: React.FC<{children: ReactNode; accent?: string; dark?: boolean}> = ({
  children,
  accent = SIGNAL,
  dark = true,
}) => (
  <div
    style={{
      position: "absolute",
      zIndex: 10,
      top: 54,
      left: 66,
      display: "flex",
      alignItems: "center",
      gap: 15,
      padding: "13px 18px",
      border: `1px solid ${dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.18)"}`,
      background: dark ? "rgba(5,5,5,0.9)" : "rgba(255,255,255,0.94)",
      color: dark ? WHITE : "#111",
      fontSize: 23,
      fontWeight: 800,
      letterSpacing: "0.14em",
      boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
    }}
  >
    <span style={{width: 11, height: 11, borderRadius: "50%", background: accent}} />
    {children}
  </div>
);

type PacedSceneProps = {pace: number};
type YouTubeSceneProps = PacedSceneProps & {holdSearchNarration?: boolean};
type ChatGptSceneProps = PacedSceneProps & {delayFilmLabel?: boolean};

const CutFlash: React.FC<{at: number; pace: number}> = ({at, pace}) => {
  const frame = useCurrentFrame() / pace;
  return (
    <AbsoluteFill
      style={{
        zIndex: 50,
        pointerEvents: "none",
        background: WHITE,
        opacity: interpolate(frame, [at - 2, at, at + 3], [0, 0.9, 0], clamp),
      }}
    />
  );
};

const YouTubeScene: React.FC<YouTubeSceneProps> = ({
  pace,
  holdSearchNarration = false,
}) => {
  const frame = useCurrentFrame() / pace;
  const query = "cloud architect roadmap";
  const typedLength = Math.floor(interpolate(frame, [52, 88], [0, query.length], clamp));
  const typed = query.slice(0, typedLength);
  const fadeStart = holdSearchNarration ? 122 : 102;
  const fadeEnd = holdSearchNarration ? 128 : 110;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#050505",
        opacity: interpolate(frame, [0, 6, fadeStart, fadeEnd], [0, 1, 1, 0], {...clamp, easing: ease}),
      }}
    >
      <Img
        src={staticFile("demand-assets/youtube-search.jpg")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: interpolate(frame, [48, 72], [0, 0.26], {...clamp, easing: ease}),
          filter: "blur(7px) brightness(0.55)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -200,
          background:
            "radial-gradient(circle at 50% 45%, rgba(255,0,0,0.34), rgba(255,0,0,0.06) 24%, transparent 58%)",
          opacity: interpolate(
            frame,
            [0, 18, 70, holdSearchNarration ? 124 : 106],
            [0, 1, 0.65, 0],
            clamp,
          ),
          scale: interpolate(frame, [0, fadeEnd], [0.7, 1.35], {...clamp, easing: Easing.linear}),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.13,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0, transparent 5px, rgba(255,255,255,0.08) 6px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: interpolate(frame, [0, 50], [390, 225], {...clamp, easing: ease}),
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          opacity: interpolate(frame, [2, 18], [0, 1], {...clamp, easing: ease}),
          scale: interpolate(frame, [0, 18, 50], [0.68, 1.06, 0.82], {...clamp, easing: ease}),
        }}
      >
        <div
          style={{
            position: "relative",
            width: 218,
            height: 148,
            borderRadius: 38,
            background: "#ff0033",
            boxShadow: `0 0 ${interpolate(frame, [0, 25, 70], [20, 95, 55], clamp)}px rgba(255,0,51,0.72), 0 36px 90px rgba(0,0,0,0.7)`,
            rotate: `${interpolate(frame, [0, 22], [-10, 0], {...clamp, easing: ease})}deg`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 88,
              top: 45,
              width: 0,
              height: 0,
              borderTop: "29px solid transparent",
              borderBottom: "29px solid transparent",
              borderLeft: "48px solid white",
              filter: "drop-shadow(0 5px 12px rgba(0,0,0,0.18))",
            }}
          />
        </div>
        <div
          style={{
            color: "white",
            fontSize: 112,
            fontWeight: 800,
            letterSpacing: "-0.075em",
            textShadow: "0 18px 55px rgba(0,0,0,0.7)",
          }}
        >
          YouTube
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 545,
          left: 420,
          width: 1080,
          height: 100,
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.42)",
          borderRadius: 56,
          background: "rgba(12,12,12,0.94)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.75), 0 0 55px rgba(255,0,51,0.12)",
          opacity: interpolate(frame, [40, 55], [0, 1], {...clamp, easing: ease}),
          translate: `0 ${interpolate(frame, [40, 55], [44, 0], {...clamp, easing: ease})}px`,
        }}
      >
        <div
          style={{
            flex: 1,
            paddingLeft: 45,
            color: WHITE,
            fontSize: 35,
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          {typed}
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 38,
              marginLeft: 6,
              verticalAlign: "-7px",
              background: WHITE,
              opacity: frame % 16 < 10 ? 1 : 0,
            }}
          />
        </div>
        <div
          style={{
            width: 130,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ff0033",
          }}
        >
          <div style={{position: "relative", width: 35, height: 35}}>
            <div
              style={{
                position: "absolute",
                width: 21,
                height: 21,
                border: "4px solid white",
                borderRadius: "50%",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: 16,
                height: 4,
                right: 0,
                bottom: 5,
                borderRadius: 3,
                background: "white",
                rotate: "45deg",
              }}
            />
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 152,
          color: "rgba(255,255,255,0.78)",
          fontSize: 23,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textAlign: "center",
          opacity: interpolate(frame, [66, 82], [0, 1], {...clamp, easing: ease}),
        }}
      >
        THE ANSWER ISN&apos;T HERE. THE SEARCH BEGINS.
      </div>
      <div
        style={{
          opacity: interpolate(
            frame,
            [68, 83, holdSearchNarration ? 120 : 98, holdSearchNarration ? 127 : 106],
            [0, 1, 1, 0],
            clamp,
          ),
        }}
      >
        <FilmLabel accent="#ff0033">THEY SEARCH.</FilmLabel>
      </div>
      <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 0 210px 35px rgba(0,0,0,0.82)"}} />
    </AbsoluteFill>
  );
};

const ChatGptScene: React.FC<ChatGptSceneProps> = ({
  pace,
  delayFilmLabel = false,
}) => {
  const frame = useCurrentFrame() / pace;
  const prompt = "How do I become a cloud architect?";
  const typedLength = Math.floor(
    interpolate(frame, [18, 72], [0, prompt.length], clamp),
  );
  const typed = prompt.slice(0, typedLength);
  const zoom = interpolate(frame, [0, 95], [1.02, 1.34], {...clamp, easing: ease});

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#000",
        opacity: interpolate(frame, [0, 6, 88, 98], [0, 1, 1, 0], {...clamp, easing: ease}),
      }}
    >
      <Img
        src={staticFile("demand-assets/generic-ai.jpg")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: zoom,
          transformOrigin: "65% 47%",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 744,
          top: 461,
          width: 685,
          height: 56,
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          background: "#212121",
          color: WHITE,
          fontSize: 27,
          scale: zoom,
          transformOrigin: "65% 47%",
        }}
      >
        <span>{typed}</span>
        <span
          style={{
            width: 3,
            height: 31,
            marginLeft: 4,
            background: WHITE,
            opacity: frame % 16 < 10 ? 1 : 0,
          }}
        />
      </div>
      <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 0 170px 12px rgba(0,0,0,0.45)"}} />
      <div
        style={{
          opacity: delayFilmLabel
            ? interpolate(frame, [24, 29, 44, 58], [0, 1, 1, 0], clamp)
            : interpolate(frame, [44, 58], [1, 0], clamp),
        }}
      >
        <FilmLabel accent={SIGNAL}>THEY ASK AI.</FilmLabel>
      </div>
      <div
        style={{
          position: "absolute",
          left: interpolate(frame, [8, 20, 76, 88], [1060, 900, 900, 1240], clamp),
          top: interpolate(frame, [8, 20, 76, 88], [680, 590, 590, 740], clamp),
          width: 0,
          height: 0,
          borderTop: "20px solid transparent",
          borderBottom: "20px solid transparent",
          borderLeft: `30px solid ${WHITE}`,
          rotate: "-38deg",
          filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.6))",
          opacity: interpolate(frame, [5, 13, 82, 92], [0, 1, 1, 0], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

const MarketplaceScene: React.FC<PacedSceneProps> = ({pace}) => {
  const frame = useCurrentFrame() / pace;
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: WHITE,
        opacity: interpolate(frame, [0, 5, 72, 81], [0, 1, 1, 0], {...clamp, easing: ease}),
      }}
    >
      <Img
        src={staticFile("demand-assets/udemy-cloud-catalog.png")}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "auto",
          translate: `0 ${interpolate(frame, [0, 74], [0, -2920], {
            ...clamp,
            easing: Easing.bezier(0.55, 0.08, 0.45, 0.95),
          })}px`,
        }}
      />
      <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 0 140px rgba(0,0,0,0.28)"}} />
      <FilmLabel dark={false} accent="#a435f0">THEY GO SOMEWHERE ELSE.</FilmLabel>
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 36,
          height: 8,
          overflow: "hidden",
          background: "rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            width: `${interpolate(frame, [4, 76], [8, 100], clamp)}%`,
            height: "100%",
            background: "#a435f0",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const DemandEscapesScene: React.FC<PacedSceneProps> = ({pace}) => {
  const frame = useCurrentFrame() / pace;
  const cards = [
    {src: "demand-assets/youtube-search.jpg", x: -530, rotate: -7},
    {src: "demand-assets/generic-ai.jpg", x: 0, rotate: 1},
    {src: "demand-assets/udemy-cloud-catalog.png", x: 530, rotate: 7},
  ];
  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#050505", color: WHITE}}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.25,
          backgroundImage:
            "linear-gradient(#292925 1px, transparent 1px), linear-gradient(90deg, #292925 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      {cards.map((card, index) => (
        <div
          key={card.src}
          style={{
            position: "absolute",
            top: 205,
            left: 635,
            width: 650,
            height: 366,
            overflow: "hidden",
            border: "1px solid #464640",
            background: "#111",
            boxShadow: "0 40px 90px rgba(0,0,0,0.72)",
            translate: `${interpolate(frame, [0, 12, 38, 54], [card.x * 0.82, card.x, card.x, card.x + (index - 1) * 620], {...clamp, easing: ease})}px ${interpolate(frame, [0, 12, 38, 54], [80, 0, 0, 190], {...clamp, easing: ease})}px`,
            rotate: `${interpolate(frame, [0, 12, 38, 54], [0, card.rotate, card.rotate, card.rotate * 2.7], {...clamp, easing: ease})}deg`,
            opacity: interpolate(frame, [0, 8, 37, 54], [0, 1, 1, 0], {...clamp, easing: ease}),
          }}
        >
          <Img
            src={staticFile(card.src)}
            style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "top"}}
          />
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 150,
          color: WHITE,
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: "0.13em",
          textAlign: "center",
          opacity: interpolate(frame, [14, 27, 40, 52], [0, 1, 1, 0], {...clamp, easing: ease}),
        }}
      >
        THE DEMAND MOVES.
      </div>
    </AbsoluteFill>
  );
};

const ReframeScene: React.FC<PacedSceneProps> = ({pace}) => {
  const frame = useCurrentFrame() / pace;
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#050505",
        color: WHITE,
        opacity: interpolate(frame, [0, 5], [0, 1], {...clamp, easing: ease}),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            "linear-gradient(#292925 1px, transparent 1px), linear-gradient(90deg, #292925 1px, transparent 1px)",
          backgroundSize: "66px 66px",
          translate: `${interpolate(frame, [0, 65], [0, -30], clamp)}px 0`,
        }}
      />
      <div style={{display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "80px"}}>
        <div
          style={{
            color: MUTED,
            fontSize: 68,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            opacity: interpolate(frame, [4, 17, 38, 52], [0, 1, 1, 0.35], {...clamp, easing: ease}),
            translate: `0 ${interpolate(frame, [4, 17], [40, 0], {...clamp, easing: ease})}px`,
          }}
        >
          THIS ISN&apos;T A CONTENT PROBLEM.
        </div>
        <div
          style={{
            position: "relative",
            color: WHITE,
            fontSize: 116,
            fontWeight: 800,
            letterSpacing: "-0.055em",
            opacity: interpolate(frame, [25, 40], [0, 1], {...clamp, easing: ease}),
            scale: interpolate(frame, [25, 40, 55], [1.2, 0.98, 1], {...clamp, easing: ease}),
          }}
        >
          IT&apos;S A <span style={{color: SIGNAL}}>DELIVERY</span> PROBLEM.
          <div
            style={{
              position: "absolute",
              left: "31%",
              bottom: -20,
              width: `${interpolate(frame, [38, 58], [0, 31], clamp)}%`,
              height: 9,
              background: SIGNAL,
            }}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 68,
          bottom: 55,
          color: MUTED,
          fontFamily: "monospace",
          fontSize: 20,
          letterSpacing: "0.12em",
          opacity: interpolate(frame, [45, 58], [0, 1], {...clamp, easing: ease}),
        }}
      >
        ACT 02 / DEMAND DOES NOT WAIT
      </div>
    </AbsoluteFill>
  );
};

export const DemandDoesNotWaitVideo: React.FC<{
  pace?: number;
  uniformDemandBeats?: boolean;
}> = ({pace = 1, uniformDemandBeats = false}) => {
  const chatDuration = uniformDemandBeats ? 82 : 102;
  const marketplaceStart = uniformDemandBeats ? 176 : 196;
  const demandStart = uniformDemandBeats ? 246 : 266;
  const reframeStart = uniformDemandBeats ? 289 : 309;
  const reframeDuration = uniformDemandBeats ? 86 : 66;
  const youtubeDuration = uniformDemandBeats ? 128 : 110;

  const youtubeSequence = (
    <Sequence
      name="Cinematic YouTube search"
      durationInFrames={Math.round(youtubeDuration * pace)}
    >
      <YouTubeScene
        pace={pace}
        holdSearchNarration={uniformDemandBeats}
      />
    </Sequence>
  );

  const chatSequence = (
    <Sequence
      name="Ask ChatGPT"
      from={Math.round(102 * pace)}
      durationInFrames={Math.round(chatDuration * pace)}
    >
      <ChatGptScene pace={pace} delayFilmLabel={uniformDemandBeats} />
    </Sequence>
  );

  return (
    <AbsoluteFill style={{background: "#050505"}}>
      {uniformDemandBeats ? (
        <>
          {chatSequence}
          {youtubeSequence}
        </>
      ) : (
        <>
          {youtubeSequence}
          {chatSequence}
        </>
      )}
      <Sequence
        name="Udemy catalog"
        from={Math.round(marketplaceStart * pace)}
        durationInFrames={Math.round(81 * pace)}
      >
        <MarketplaceScene pace={pace} />
      </Sequence>
      <Sequence
        name="Demand escapes"
        from={Math.round(demandStart * pace)}
        durationInFrames={Math.round(55 * pace)}
      >
        <DemandEscapesScene pace={pace} />
      </Sequence>
      <Sequence
        name="Problem reframe"
        from={Math.round(reframeStart * pace)}
        durationInFrames={Math.round(reframeDuration * pace)}
      >
        <ReframeScene pace={pace} />
      </Sequence>
      <CutFlash at={uniformDemandBeats ? 128 : 102} pace={pace} />
      <CutFlash at={marketplaceStart} pace={pace} />
      <CutFlash at={demandStart} pace={pace} />
    </AbsoluteFill>
  );
};
