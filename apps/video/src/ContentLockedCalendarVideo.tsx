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
const LINE = "#30302c";
const SIGNAL = "#d0f31f";
const CYAN = "#52d9ff";
const VIOLET = "#9f82ff";
const ORANGE = "#ff9f4a";
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const GridBackground: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#050505"}}>
      <div
        style={{
          position: "absolute",
          inset: -100,
          opacity: 0.24,
          backgroundImage:
            "linear-gradient(#282824 1px, transparent 1px), linear-gradient(90deg, #282824 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          translate: `${interpolate(frame, [0, 480], [0, -38])}px ${interpolate(
            frame,
            [0, 480],
            [0, -22],
          )}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 42%, rgba(208,243,31,0.05), transparent 40%), radial-gradient(circle at 88% 80%, rgba(82,217,255,0.06), transparent 28%)",
        }}
      />
    </AbsoluteFill>
  );
};

const Scene: React.FC<{
  children: ReactNode;
  duration: number;
  index: string;
  label: string;
  accent: string;
}> = ({children, duration, index, label, accent}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        color: WHITE,
        overflow: "hidden",
        opacity: interpolate(frame, [0, 9, duration - 10, duration], [0, 1, 1, 0], {
          ...clamp,
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 62,
          left: 76,
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 25,
          fontWeight: 800,
          letterSpacing: "0.16em",
          translate: `${interpolate(frame, [0, 14], [-30, 0], {...clamp, easing: ease})}px 0`,
          opacity: interpolate(frame, [0, 12], [0, 1], {...clamp, easing: ease}),
        }}
      >
        <span style={{color: accent}}>{index}</span>
        <span>{label}</span>
      </div>
      <div style={{position: "absolute", top: 107, left: 76, width: 1768, height: 1, background: LINE}} />
      {children}
    </AbsoluteFill>
  );
};

const Face: React.FC<{
  skin: string;
  hair: string;
  shirt: string;
  glasses?: boolean;
}> = ({skin, hair, shirt, glasses}) => (
  <div style={{position: "relative", width: 250, height: 290}}>
    <div
      style={{
        position: "absolute",
        left: 35,
        bottom: 0,
        width: 180,
        height: 118,
        borderRadius: "90px 90px 18px 18px",
        background: shirt,
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 42,
        left: 61,
        width: 128,
        height: 154,
        borderRadius: "58px 58px 66px 66px",
        background: skin,
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 22,
        left: 52,
        width: 148,
        height: 82,
        borderRadius: "72px 72px 24px 24px",
        background: hair,
      }}
    />
    <div style={{position: "absolute", top: 112, left: 91, width: 13, height: 7, borderRadius: 8, background: "#171717"}} />
    <div style={{position: "absolute", top: 112, right: 91, width: 13, height: 7, borderRadius: 8, background: "#171717"}} />
    <div style={{position: "absolute", top: 154, left: 108, width: 34, height: 4, borderRadius: 4, background: "rgba(20,20,20,0.65)"}} />
    {glasses ? (
      <>
        <div style={{position: "absolute", top: 96, left: 73, width: 59, height: 41, border: "5px solid #171717", borderRadius: 10}} />
        <div style={{position: "absolute", top: 96, right: 73, width: 59, height: 41, border: "5px solid #171717", borderRadius: 10}} />
        <div style={{position: "absolute", top: 112, left: 128, width: 20, height: 5, background: "#171717"}} />
      </>
    ) : null}
  </div>
);

const TrainerPortraits: React.FC = () => {
  const frame = useCurrentFrame();
  const trainers = [
    {name: "MAYA", role: "AGILE COACH", skin: "#9d654b", hair: "#211c19", shirt: SIGNAL},
    {name: "JORDAN", role: "CLOUD ARCHITECT", skin: "#d8a77c", hair: "#4b2c21", shirt: CYAN, glasses: true},
    {name: "PRIYA", role: "DATA LEAD", skin: "#b87354", hair: "#151313", shirt: VIOLET},
  ];

  return (
    <Scene duration={66} index="01" label="TRAINER EXPERTISE" accent={SIGNAL}>
      <div style={{display: "flex", height: "100%", alignItems: "center", justifyContent: "center", gap: 34, paddingTop: 88}}>
        {trainers.map((trainer, index) => (
          <div
            key={trainer.name}
            style={{
              position: "relative",
              width: 475,
              height: 680,
              overflow: "hidden",
              border: `1px solid ${index === 1 ? CYAN : LINE}`,
              background: index === 1 ? "#0b171b" : "#0e0e0d",
              opacity: interpolate(frame, [5 + index * 6, 18 + index * 6], [0, 1], {...clamp, easing: ease}),
              translate: `${interpolate(frame, [5 + index * 6, 22 + index * 6], [index === 1 ? 0 : index === 0 ? -70 : 70, 0], {
                ...clamp,
                easing: ease,
              })}px ${interpolate(frame, [5 + index * 6, 22 + index * 6], [60, 0], {...clamp, easing: ease})}px`,
              scale: index === 1 ? 1.04 : 0.94,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(150deg, transparent 40%, ${index === 0 ? "rgba(208,243,31,0.16)" : index === 1 ? "rgba(82,217,255,0.18)" : "rgba(159,130,255,0.17)"})`,
              }}
            />
            <div style={{display: "grid", height: 470, placeItems: "center", paddingTop: 70}}>
              <Face skin={trainer.skin} hair={trainer.hair} shirt={trainer.shirt} glasses={trainer.glasses} />
            </div>
            <div style={{position: "absolute", left: 36, right: 36, bottom: 38, borderTop: `1px solid ${LINE}`, paddingTop: 26}}>
              <div style={{fontSize: 45, fontWeight: 800, letterSpacing: "-0.03em"}}>{trainer.name}</div>
              <div style={{marginTop: 9, color: index === 0 ? SIGNAL : index === 1 ? CYAN : VIOLET, fontSize: 21, fontWeight: 800, letterSpacing: "0.13em"}}>
                {trainer.role}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Scene>
  );
};

const CourseMaterials: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene duration={72} index="02" label="COURSE MATERIALS" accent={ORANGE}>
      <div style={{display: "grid", height: "100%", gridTemplateColumns: "0.78fr 1.22fr", alignItems: "center", gap: 70, padding: "125px 120px 46px"}}>
        <div
          style={{
            position: "relative",
            justifySelf: "end",
            width: 470,
            height: 650,
            border: `1px solid ${LINE}`,
            background: "#171614",
            boxShadow: "-34px 35px 0 #0c0c0b, -35px 36px 0 #383832",
            rotate: `${interpolate(frame, [0, 26], [-8, -2], {...clamp, easing: ease})}deg`,
            translate: `${interpolate(frame, [0, 20], [-80, 0], {...clamp, easing: ease})}px 0`,
          }}
        >
          <div style={{height: 19, background: ORANGE}} />
          <div style={{padding: "58px 48px"}}>
            <div style={{color: ORANGE, fontSize: 21, fontWeight: 800, letterSpacing: "0.16em"}}>FACILITATOR GUIDE</div>
            <div style={{marginTop: 28, fontSize: 68, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.05em"}}>LEAD<br />CHANGE<br />AT SCALE</div>
            <div style={{marginTop: 38, width: 140, height: 2, background: ORANGE}} />
            <div style={{marginTop: 28, color: MUTED, fontSize: 23, lineHeight: 1.45}}>Exercises · Labs<br />Discussion prompts<br />Field notes</div>
          </div>
          <div style={{position: "absolute", right: 35, bottom: 35, fontFamily: "monospace", fontSize: 26, color: MUTED}}>V4.2</div>
        </div>

        <div
          style={{
            position: "relative",
            width: 790,
            height: 600,
            overflow: "hidden",
            border: `1px solid ${LINE}`,
            background: "#eeece5",
            color: "#171717",
            rotate: `${interpolate(frame, [4, 30], [6, 1], {...clamp, easing: ease})}deg`,
            translate: `${interpolate(frame, [4, 24], [110, 0], {...clamp, easing: ease})}px 0`,
          }}
        >
          <div style={{display: "grid", height: "100%", gridTemplateColumns: "1fr 1fr"}}>
            {[0, 1].map((page) => (
              <div key={page} style={{position: "relative", padding: "58px 46px", borderLeft: page ? "2px solid #d0cdc4" : undefined}}>
                <div style={{fontSize: 19, fontWeight: 800, letterSpacing: "0.12em", color: "#696760"}}>MODULE {page + 3}</div>
                <div style={{marginTop: 18, fontSize: 36, fontWeight: 800}}>{page ? "Team Practice" : "Core Concepts"}</div>
                {[0, 1, 2, 3, 4, 5].map((line) => (
                  <div
                    key={line}
                    style={{
                      marginTop: line === 0 ? 35 : 19,
                      width: `${88 - ((line * 11 + page * 9) % 32)}%`,
                      height: line === 0 || line === 3 ? 14 : 8,
                      background: line === 0 || line === 3 ? "#242420" : "#aaa79e",
                    }}
                  />
                ))}
                <div style={{position: "absolute", left: page ? 220 : 45, bottom: 54, width: 140, height: 120, background: page ? "#c9f1ff" : "#f5dc6f", rotate: page ? "4deg" : "-5deg", padding: "18px", fontSize: 17, fontWeight: 800}}>
                  {page ? "PAIR + SHARE" : "TRY THIS"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Scene>
  );
};

const CustomerRelationships: React.FC = () => {
  const frame = useCurrentFrame();
  const accounts = [
    {name: "NORTHSTAR", meta: "8-YEAR PARTNERSHIP", color: CYAN},
    {name: "MERIDIAN", meta: "42 TEAMS ENABLED", color: SIGNAL},
    {name: "HORIZON", meta: "96% RENEWAL", color: VIOLET},
  ];

  return (
    <Scene duration={82} index="03" label="CUSTOMER RELATIONSHIPS" accent={CYAN}>
      <div style={{position: "absolute", left: 92, right: 92, top: 150, bottom: 62, display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 28}}>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", border: `1px solid ${LINE}`, background: "#0b0d0e", padding: "56px"}}>
          <div style={{color: MUTED, fontSize: 21, fontWeight: 800, letterSpacing: "0.14em"}}>RELATIONSHIP HISTORY</div>
          <div style={{marginTop: 28, fontSize: 112, fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.07em"}}>TRUST<br />BUILT<br />OVER TIME.</div>
          <div style={{display: "flex", alignItems: "center", gap: 18, marginTop: 42, color: CYAN, fontFamily: "monospace", fontSize: 23}}>
            <div style={{width: 70, height: 2, background: CYAN}} /> LONG-TERM PARTNERS
          </div>
        </div>

        <div style={{position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, border: `1px solid ${LINE}`, background: "#0c0c0b", padding: "46px 55px"}}>
          <div style={{position: "absolute", top: 110, bottom: 110, left: 103, width: 3, background: LINE}} />
          {accounts.map((account, index) => (
            <div
              key={account.name}
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "96px 1fr auto",
                minHeight: 164,
                alignItems: "center",
                gap: 28,
                border: `1px solid ${index === 1 ? SIGNAL : LINE}`,
                background: index === 1 ? "#15180d" : "#141413",
                padding: "24px 30px",
                opacity: interpolate(frame, [7 + index * 8, 21 + index * 8], [0, 1], {...clamp, easing: ease}),
                translate: `${interpolate(frame, [7 + index * 8, 23 + index * 8], [72, 0], {...clamp, easing: ease})}px 0`,
              }}
            >
              <div style={{position: "relative", zIndex: 1, display: "grid", width: 62, height: 62, placeItems: "center", borderRadius: "50%", border: `3px solid ${account.color}`, background: "#0a0a09", color: account.color, fontSize: 22, fontWeight: 800}}>{index + 1}</div>
              <div>
                <div style={{fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em"}}>{account.name}</div>
                <div style={{marginTop: 8, color: account.color, fontFamily: "monospace", fontSize: 21}}>{account.meta}</div>
              </div>
              <div style={{display: "flex", marginRight: 8}}>
                {[0, 1, 2, 3].map((person) => (
                  <div key={person} style={{display: "grid", width: 52, height: 52, marginLeft: person ? -10 : 0, placeItems: "center", border: "3px solid #141413", borderRadius: "50%", background: person === 3 ? account.color : "#4a4a45", color: "#090909", fontSize: 17, fontWeight: 800}}>●</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Scene>
  );
};

const MarketDemand: React.FC = () => {
  const frame = useCurrentFrame();
  const requests = [
    {team: "ENGINEERING", text: "Can 20 people start this week?", time: "NOW"},
    {team: "PRODUCT", text: "Need AI skills before launch.", time: "2m"},
    {team: "LEADERSHIP", text: "Workshop requested for Q3.", time: "5m"},
  ];
  const demand = Math.round(interpolate(frame, [8, 62], [147, 384], clamp));

  return (
    <Scene duration={88} index="04" label="REAL MARKET DEMAND" accent={SIGNAL}>
      <div style={{position: "absolute", left: 88, right: 88, top: 145, bottom: 58, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 25}}>
        <div style={{border: `1px solid ${LINE}`, background: "#0c0c0b", padding: "34px"}}>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 26, borderBottom: `1px solid ${LINE}`}}>
            <div style={{fontSize: 27, fontWeight: 800}}>Incoming learning requests</div>
            <div style={{display: "flex", alignItems: "center", gap: 12, color: SIGNAL, fontFamily: "monospace", fontSize: 20}}><div style={{width: 11, height: 11, borderRadius: "50%", background: SIGNAL}} /> LIVE</div>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 18, marginTop: 26}}>
            {requests.map((request, index) => (
              <div
                key={request.team}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr 55px",
                  minHeight: 155,
                  alignItems: "center",
                  gap: 26,
                  border: `1px solid ${index === 0 ? SIGNAL : LINE}`,
                  background: index === 0 ? "#171b0e" : "#151514",
                  padding: "22px 28px",
                  opacity: interpolate(frame, [5 + index * 9, 18 + index * 9], [0, 1], {...clamp, easing: ease}),
                  translate: `${interpolate(frame, [5 + index * 9, 20 + index * 9], [-72, 0], {...clamp, easing: ease})}px 0`,
                }}
              >
                <div style={{color: index === 0 ? SIGNAL : MUTED, fontSize: 18, fontWeight: 800, letterSpacing: "0.12em"}}>{request.team}</div>
                <div style={{fontSize: 31, fontWeight: 700}}>{request.text}</div>
                <div style={{color: MUTED, fontFamily: "monospace", fontSize: 18, textAlign: "right"}}>{request.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{display: "grid", gridTemplateRows: "1fr 0.72fr", gap: 25}}>
          <div style={{display: "flex", flexDirection: "column", justifyContent: "center", border: `1px solid ${SIGNAL}`, background: "#11140a", padding: "44px 50px"}}>
            <div style={{color: SIGNAL, fontSize: 21, fontWeight: 800, letterSpacing: "0.14em"}}>LEARNING REQUESTS / MONTH</div>
            <div style={{marginTop: 16, fontFamily: "monospace", fontSize: 142, fontWeight: 800, letterSpacing: "-0.09em", lineHeight: 0.95}}>{demand}</div>
            <div style={{display: "flex", alignItems: "center", gap: 18, marginTop: 24, color: SIGNAL, fontFamily: "monospace", fontSize: 26}}><span style={{fontSize: 45}}>↗</span> +38% MARKET PULL</div>
          </div>
          <div style={{border: `1px solid ${LINE}`, background: "#0c0c0b", padding: "30px 36px"}}>
            <div style={{color: MUTED, fontSize: 18, fontWeight: 800, letterSpacing: "0.12em"}}>TOP SEARCHES</div>
            <div style={{display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22}}>
              {["GENERATIVE AI", "CLOUD", "AGILE", "DATA", "LEADERSHIP"].map((term, index) => (
                <div key={term} style={{padding: "12px 17px", border: `1px solid ${index === 0 ? SIGNAL : LINE}`, color: index === 0 ? SIGNAL : WHITE, fontFamily: "monospace", fontSize: 18}}>{term}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Scene>
  );
};

const NoClassNoValue: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene duration={142} index="05" label="WHEN NO CLASS IS RUNNING" accent={ORANGE}>
      <div style={{position: "absolute", left: 80, right: 80, top: 150, bottom: 62, display: "grid", gridTemplateColumns: "390px 830px 390px", alignItems: "center", justifyContent: "space-between", gap: 28}}>
        <div
          style={{
            display: "flex",
            height: 600,
            flexDirection: "column",
            justifyContent: "space-between",
            border: `1px solid ${LINE}`,
            background: "#0d0d0c",
            padding: "36px",
            opacity: interpolate(frame, [0, 14, 90, 120], [0, 1, 1, 0.3], {...clamp, easing: ease}),
            filter: `grayscale(${interpolate(frame, [72, 106], [0, 1], clamp)})`,
          }}
        >
          <div>
            <div style={{color: SIGNAL, fontSize: 19, fontWeight: 800, letterSpacing: "0.13em"}}>EXPERTISE READY</div>
            <div style={{display: "flex", gap: 16, marginTop: 27}}>
              {[SIGNAL, CYAN, VIOLET].map((color, index) => (
                <div key={color} style={{position: "relative", width: 90, height: 118, border: `1px solid ${LINE}`, background: "#171717"}}>
                  <div style={{position: "absolute", top: 16, left: 29, width: 32, height: 38, borderRadius: "50%", background: index === 1 ? "#d8a77c" : "#aa7053"}} />
                  <div style={{position: "absolute", left: 18, bottom: 10, width: 54, height: 50, borderRadius: "28px 28px 4px 4px", background: color}} />
                </div>
              ))}
            </div>
          </div>
          <div style={{height: 1, background: LINE}} />
          <div>
            <div style={{color: ORANGE, fontSize: 19, fontWeight: 800, letterSpacing: "0.13em"}}>CURRICULUM READY</div>
            <div style={{display: "flex", gap: 16, marginTop: 27}}>
              {[0, 1, 2].map((page) => <div key={page} style={{width: 82, height: 112, rotate: `${page * 5 - 5}deg`, borderTop: `8px solid ${ORANGE}`, background: "#d9d6ce"}} />)}
            </div>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 12, color: MUTED, fontFamily: "monospace", fontSize: 19}}><div style={{width: 10, height: 10, borderRadius: "50%", background: SIGNAL}} /> AVAILABLE NOW</div>
        </div>

        <div style={{position: "relative", height: 600, overflow: "hidden", border: `1px solid ${frame > 48 ? ORANGE : LINE}`, borderRadius: 12, background: WHITE, boxShadow: "0 32px 80px rgba(0,0,0,0.72)"}}>
          <div style={{display: "flex", height: 58, alignItems: "center", gap: 11, padding: "0 20px", borderBottom: "1px solid #d4d4cf", background: "#e9e8e3"}}>
            {["#ff5f57", "#febc2e", "#28c840"].map((color) => <div key={color} style={{width: 15, height: 15, borderRadius: "50%", background: color}} />)}
            <div style={{marginLeft: 22, flex: 1, padding: "9px 18px", borderRadius: 999, background: "#f7f6f2", color: "#777", fontFamily: "monospace", fontSize: 15, textAlign: "center"}}>cprime.com/learning/course</div>
          </div>
          <Img
            src={staticFile("course-schedule.svg")}
            style={{
              position: "absolute",
              top: 65,
              left: 42,
              width: 746,
              height: 427,
              objectFit: "contain",
              scale: interpolate(frame, [20, 72], [1, 1.18], {...clamp, easing: ease}),
              translate: `${interpolate(frame, [20, 72], [0, -8], {...clamp, easing: ease})}px ${interpolate(frame, [20, 72], [0, -14], {...clamp, easing: ease})}px`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 20,
              top: 216,
              width: 790,
              height: 72,
              border: `6px solid ${ORANGE}`,
              opacity: interpolate(frame, [48, 62], [0, 1], {...clamp, easing: ease}),
              scale: interpolate(frame, [48, 62], [1.08, 1], {...clamp, easing: ease}),
              boxShadow: "0 0 0 999px rgba(0,0,0,0.16)",
            }}
          />
          <div style={{position: "absolute", left: 0, right: 0, bottom: 0, height: 58, display: "flex", alignItems: "center", justifyContent: "center", background: "#111", color: ORANGE, fontFamily: "monospace", fontSize: 20, fontWeight: 800, letterSpacing: "0.12em", opacity: interpolate(frame, [60, 76], [0, 1], {...clamp, easing: ease})}}>CLASS STATUS / NOT RUNNING</div>
        </div>

        <div
          style={{
            display: "flex",
            height: 600,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${frame > 70 ? ORANGE : LINE}`,
            background: frame > 70 ? "#17100b" : "#0d0d0c",
            opacity: interpolate(frame, [34, 52], [0, 1], {...clamp, easing: ease}),
          }}
        >
          <div style={{color: MUTED, fontSize: 20, fontWeight: 800, letterSpacing: "0.13em"}}>NEW VALUE CREATED</div>
          <div style={{marginTop: 18, color: frame > 70 ? ORANGE : WHITE, fontFamily: "monospace", fontSize: 225, fontWeight: 800, letterSpacing: "-0.12em", lineHeight: 0.95}}>0</div>
          <div style={{marginTop: 30, width: 190, height: 2, background: ORANGE}} />
          <div style={{marginTop: 25, color: ORANGE, fontFamily: "monospace", fontSize: 20, fontWeight: 800}}>EXPERTISE IDLE</div>
        </div>

        <div style={{position: "absolute", top: 295, left: 320, width: 110, height: 5, background: SIGNAL, opacity: interpolate(frame, [12, 24, 64, 82], [0, 1, 1, 0.2], clamp)}} />
        <div style={{position: "absolute", top: 285, left: 412, width: 0, height: 0, borderTop: "13px solid transparent", borderBottom: "13px solid transparent", borderLeft: `20px solid ${SIGNAL}`, opacity: interpolate(frame, [12, 24, 64, 82], [0, 1, 1, 0.2], clamp)}} />
        <div style={{position: "absolute", top: 276, right: 392, width: 15, height: 60, background: ORANGE, opacity: interpolate(frame, [66, 76], [0, 1], clamp)}} />
      </div>
    </Scene>
  );
};

const MiniChart: React.FC<{color: string}> = ({color}) => (
  <div style={{display: "flex", height: 100, alignItems: "end", gap: 9}}>
    {[28, 62, 45, 83, 69, 94, 76].map((height, index) => (
      <div key={index} style={{flex: 1, height, background: index === 5 ? color : `${color}55`}} />
    ))}
  </div>
);

const WallCard: React.FC<{label: string; color: string; children: ReactNode; style?: CSSProperties}> = ({label, color, children, style}) => (
  <div style={{position: "relative", overflow: "hidden", border: `1px solid ${LINE}`, background: "#0d0d0c", padding: "22px", ...style}}>
    <div style={{marginBottom: 18, color, fontSize: 17, fontWeight: 800, letterSpacing: "0.13em"}}>{label}</div>
    {children}
  </div>
);

const LockedContentWall: React.FC = () => {
  const frame = useCurrentFrame();
  const motionFrame = Math.min(frame, 26);
  const freeze = interpolate(frame, [22, 34], [0, 1], clamp);
  const lockIn = interpolate(frame, [28, 52], [0, 1], {...clamp, easing: ease});

  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#050505", color: WHITE}}>
      <div
        style={{
          position: "absolute",
          inset: -30,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: 18,
          padding: "42px",
          opacity: interpolate(frame, [0, 10, 30, 55], [0, 1, 1, 0.32], {...clamp, easing: ease}),
          scale: interpolate(motionFrame, [0, 26], [1.08, 1], {...clamp, easing: ease}),
          filter: `grayscale(${freeze}) blur(${freeze * 3}px) brightness(${1 - freeze * 0.58})`,
        }}
      >
        <WallCard label="TRAINERS" color={SIGNAL}>
          <div style={{display: "flex", justifyContent: "center", gap: 18}}>
            {[SIGNAL, CYAN, VIOLET].map((color, index) => (
              <div key={color} style={{position: "relative", width: 100, height: 130, border: `1px solid ${LINE}`, background: "#171717"}}>
                <div style={{position: "absolute", top: 18, left: 31, width: 38, height: 45, borderRadius: "50%", background: index === 1 ? "#d8a77c" : "#a76f53"}} />
                <div style={{position: "absolute", left: 18, bottom: 10, width: 64, height: 58, borderRadius: "34px 34px 4px 4px", background: color}} />
              </div>
            ))}
          </div>
        </WallCard>
        <WallCard label="COURSE MATERIALS" color={ORANGE}>
          <div style={{display: "flex", justifyContent: "center", gap: 22}}>
            {[0, 1, 2].map((page) => <div key={page} style={{width: 100, height: 140, rotate: `${page * 4 - 4}deg`, borderTop: `9px solid ${ORANGE}`, background: "#dedbd2", boxShadow: "0 10px 20px #0008"}} />)}
          </div>
        </WallCard>
        <WallCard label="RELATIONSHIPS" color={CYAN}>
          <div style={{position: "relative", display: "flex", height: 125, alignItems: "center", justifyContent: "space-around"}}>
            <div style={{position: "absolute", left: 90, right: 90, top: 61, height: 3, background: CYAN}} />
            {[0, 1, 2].map((node) => <div key={node} style={{zIndex: 1, display: "grid", width: 72, height: 72, placeItems: "center", border: `3px solid ${node === 1 ? SIGNAL : CYAN}`, borderRadius: "50%", background: "#0d0d0c", color: WHITE, fontWeight: 800}}>{node + 1}</div>)}
          </div>
        </WallCard>
        <WallCard label="MARKET DEMAND" color={SIGNAL}>
          <MiniChart color={SIGNAL} />
        </WallCard>
        <WallCard label="NO CLASS RUNNING" color={ORANGE}>
          <div style={{border: `1px solid ${ORANGE}`, background: "#111", padding: "18px"}}>
            <div style={{height: 12, background: "#555"}} />
            <div style={{marginTop: 18, height: 52, border: `3px solid ${ORANGE}`, background: "#222"}} />
            <div style={{marginTop: 18, color: ORANGE, fontFamily: "monospace", fontSize: 17, textAlign: "center"}}>NOT SCHEDULED</div>
          </div>
        </WallCard>
        <WallCard label="NEW VALUE CREATED" color={ORANGE}>
          <div style={{display: "grid", height: 128, placeItems: "center", color: ORANGE, fontFamily: "monospace", fontSize: 118, fontWeight: 800, lineHeight: 1}}>0</div>
        </WallCard>
      </div>

      <div style={{position: "absolute", inset: 0, background: `rgba(0,0,0,${freeze * 0.38})`}} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [20, 25, 30, 36], [0, 0.8, 0.1, 0], clamp),
          background: "repeating-linear-gradient(0deg, transparent 0 7px, rgba(255,255,255,0.24) 8px 9px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          background: WHITE,
          opacity: interpolate(frame, [22, 25, 29], [0, 1, 0], clamp),
          translate: `0 ${interpolate(frame, [22, 29], [0, 1080], clamp)}px`,
          boxShadow: "0 0 55px rgba(255,255,255,0.8)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          opacity: lockIn,
          scale: interpolate(frame, [28, 49, 62], [1.38, 0.96, 1], {...clamp, easing: Easing.bezier(0.22, 1.35, 0.3, 1)}),
        }}
      >
        <div style={{position: "relative", width: 470, height: 475, filter: "drop-shadow(0 35px 75px rgba(0,0,0,0.82))"}}>
          <div style={{position: "absolute", top: 26, left: 30, width: 410, height: 350, border: `10px solid ${WHITE}`, borderRadius: 34, background: "#080808"}}>
            <div style={{height: 92, borderBottom: `10px solid ${WHITE}`, background: SIGNAL, borderRadius: "22px 22px 0 0"}} />
            <div style={{position: "absolute", top: -34, left: 77, width: 34, height: 86, border: `10px solid ${WHITE}`, borderRadius: 18, background: "#080808"}} />
            <div style={{position: "absolute", top: -34, right: 77, width: 34, height: 86, border: `10px solid ${WHITE}`, borderRadius: 18, background: "#080808"}} />
            <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 17, padding: "35px 36px"}}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((day) => <div key={day} style={{height: 33, borderRadius: 5, background: day === 5 ? SIGNAL : "#41413d"}} />)}
            </div>
          </div>
          <div style={{position: "absolute", left: 145, bottom: 0, width: 230, height: 220}}>
            <div style={{position: "absolute", top: 0, left: 44, width: 142, height: 124, border: `18px solid ${WHITE}`, borderBottom: 0, borderRadius: "72px 72px 0 0"}} />
            <div style={{position: "absolute", left: 0, bottom: 0, width: 230, height: 150, border: `10px solid ${WHITE}`, borderRadius: 28, background: "#111"}}>
              <div style={{position: "absolute", top: 43, left: 96, width: 28, height: 48, borderRadius: 18, background: SIGNAL}} />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 55,
          textAlign: "center",
          color: MUTED,
          fontFamily: "monospace",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "0.2em",
          opacity: interpolate(frame, [56, 72], [0, 1], {...clamp, easing: ease}),
        }}
      >
        CONTENT ACCESS / CALENDAR LOCKED
      </div>
    </AbsoluteFill>
  );
};

export const ContentLockedCalendarVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{background: "#050505"}}>
      <GridBackground />
      <Sequence name="Trusted experts" durationInFrames={68}><TrainerPortraits /></Sequence>
      <Sequence name="Proven curriculum" from={56} durationInFrames={80}><CourseMaterials /></Sequence>
      <Sequence name="Customer relationships" from={122} durationInFrames={82}><CustomerRelationships /></Sequence>
      <Sequence name="Real market demand" from={190} durationInFrames={88}><MarketDemand /></Sequence>
      <Sequence name="No class, no new value" from={258} durationInFrames={142}><NoClassNoValue /></Sequence>
      <Sequence name="Locked content freeze" from={384} durationInFrames={96}><LockedContentWall /></Sequence>
    </AbsoluteFill>
  );
};
