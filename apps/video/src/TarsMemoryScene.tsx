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
const muted = "#686d63";
const lime = "#b7ec52";
const green = "#5d8619";
const paper = "#f4f3ed";

const MemoryCard: React.FC<{
  name: string;
  eyebrow: string;
  value: string;
  detail: string;
  left: number;
  top: number;
  width: number;
  enterAt: number;
}> = ({name, eyebrow, value, detail, left, top, width, enterAt}) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        left,
        top,
        width,
        minHeight: 126,
        padding: "20px 22px",
        border: "1px solid rgba(17,19,15,0.13)",
        borderRadius: 22,
        background: "rgba(255,255,255,0.86)",
        boxShadow: "0 22px 55px rgba(24,29,18,0.08)",
        opacity: interpolate(frame, [enterAt, enterAt + 18], [0, 1], {
          ...clamp,
          easing: ease,
        }),
        translate: interpolate(frame, [enterAt, enterAt + 24], ["0px 22px", "0px 0px"], {
          ...clamp,
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          color: green,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: ".12em",
          textTransform: "uppercase",
        }}
      >
        <span style={{width: 8, height: 8, borderRadius: 99, background: lime}} />
        {eyebrow}
      </div>
      <div style={{marginTop: 9, color: ink, fontSize: 26, fontWeight: 720, letterSpacing: "-.02em"}}>
        {value}
      </div>
      <div style={{marginTop: 5, color: muted, fontSize: 16, lineHeight: 1.35}}>{detail}</div>
    </Interactive.Div>
  );
};

const Connector: React.FC<{
  name: string;
  d: string;
  enterAt: number;
}> = ({name, d, enterAt}) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Path
      name={name}
      d={d}
      pathLength={1}
      fill="none"
      stroke="rgba(93,134,25,0.55)"
      strokeWidth={3}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={interpolate(frame, [enterAt, enterAt + 32], [1, 0], {
        ...clamp,
        easing: ease,
      })}
    />
  );
};

const TarsCore: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Tars memory core"
      style={{
        position: "absolute",
        left: 825,
        top: 390,
        width: 270,
        height: 270,
        borderRadius: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        background: "radial-gradient(circle at 35% 28%, #30372b 0%, #11130f 62%, #060705 100%)",
        boxShadow: "0 35px 100px rgba(19,27,10,0.24), 0 0 0 18px rgba(183,236,82,0.12)",
        opacity: interpolate(frame, [12, 32], [0, 1], {...clamp, easing: ease}),
        scale: interpolate(frame, [12, 42], [0.72, 1], {...clamp, easing: ease}),
      }}
    >
      <Interactive.Div
        name="Tars orbit"
        style={{
          position: "absolute",
          inset: -25,
          borderRadius: 999,
          border: "1px solid rgba(93,134,25,0.35)",
          rotate: `${frame * 0.18}deg`,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: -7,
            width: 14,
            height: 14,
            borderRadius: 99,
            background: lime,
            boxShadow: "0 0 24px rgba(183,236,82,0.9)",
          }}
        />
      </Interactive.Div>
      <svg width="58" height="64" viewBox="0 0 58 64" aria-hidden="true">
        <path d="M8 5L51 28L31 34L23 56L8 5Z" fill={lime} />
        <path d="M15 14L43 28L28 30L23 46L15 14Z" fill="#11130f" opacity="0.56" />
      </svg>
      <div style={{marginTop: 4, fontSize: 30, fontWeight: 820, letterSpacing: ".08em"}}>TARS</div>
      <div style={{marginTop: 5, color: "#d7f59c", fontSize: 15, fontWeight: 700}}>
        DREAMING V3 MEMORY
      </div>
    </Interactive.Div>
  );
};

const MemoryCollection: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, 18, 338, 386], [0, 1, 1, 0], clamp),
      }}
    >
      <Interactive.Div
        name="Memory introduction"
        style={{position: "absolute", left: 112, top: 70, width: 900}}
      >
        <div style={{color: green, fontSize: 16, fontWeight: 850, letterSpacing: ".16em"}}>
          TARS MEMORY
        </div>
        <div style={{marginTop: 14, color: ink, fontSize: 64, fontWeight: 760, letterSpacing: "-.045em"}}>
          Every interaction becomes context.
        </div>
        <div style={{marginTop: 13, color: muted, fontSize: 22}}>
          One memory layer connects the learner’s history to every experience.
        </div>
      </Interactive.Div>

      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{position: "absolute", inset: 0}}
      >
        <Connector name="Goal to Tars" d="M590 390 C720 400 750 455 825 490" enterAt={70} />
        <Connector name="Courses to Tars" d="M1330 375 C1215 390 1170 450 1095 490" enterAt={104} />
        <Connector name="Strength to Tars" d="M590 738 C720 725 760 645 835 600" enterAt={138} />
        <Connector name="Gap to Tars" d="M1330 708 C1210 700 1170 635 1085 595" enterAt={172} />
        <Connector name="Interactions to Tars" d="M960 835 C960 775 960 710 960 660" enterAt={206} />
      </svg>

      <TarsCore />
      <MemoryCard
        name="Learner goal memory"
        eyebrow="Goal"
        value="Become a cloud architect"
        detail="Target role · active roadmap"
        left={135}
        top={325}
        width={455}
        enterAt={48}
      />
      <MemoryCard
        name="Completed courses memory"
        eyebrow="Completed courses"
        value="Cloud Foundations · 4/4"
        detail="Assessments and lab evidence retained"
        left={1330}
        top={310}
        width={455}
        enterAt={82}
      />
      <MemoryCard
        name="Learner strength memory"
        eyebrow="Strength"
        value="Systems thinking"
        detail="Consistent architecture reasoning"
        left={135}
        top={675}
        width={455}
        enterAt={116}
      />
      <MemoryCard
        name="Knowledge gap memory"
        eyebrow="Knowledge gap"
        value="Network security"
        detail="Needs deeper security-group practice"
        left={1330}
        top={645}
        width={455}
        enterAt={150}
      />
      <MemoryCard
        name="Previous interactions memory"
        eyebrow="Previous interactions"
        value="18 learning moments"
        detail="Questions, feedback and recoveries"
        left={735}
        top={820}
        width={450}
        enterAt={184}
      />
    </AbsoluteFill>
  );
};

const OutcomeCard: React.FC<{
  name: string;
  top: number;
  enterAt: number;
  number: string;
  title: string;
  subtitle: string;
  chips: string[];
}> = ({name, top, enterAt, number, title, subtitle, chips}) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        left: 760,
        top,
        width: 1010,
        height: 218,
        borderRadius: 26,
        border: "1px solid rgba(17,19,15,0.13)",
        background: "rgba(255,255,255,0.9)",
        boxShadow: "0 25px 65px rgba(24,29,18,0.08)",
        padding: "28px 32px",
        opacity: interpolate(frame, [enterAt, enterAt + 20], [0, 1], {...clamp, easing: ease}),
        translate: interpolate(frame, [enterAt, enterAt + 26], ["36px 0px", "0px 0px"], {
          ...clamp,
          easing: ease,
        }),
      }}
    >
      <div style={{display: "flex", alignItems: "flex-start", gap: 22}}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
            background: "#11130f",
            color: lime,
            fontSize: 18,
            fontWeight: 850,
          }}
        >
          {number}
        </div>
        <div style={{flex: 1}}>
          <div style={{fontSize: 29, fontWeight: 760, color: ink, letterSpacing: "-.025em"}}>{title}</div>
          <div style={{marginTop: 5, fontSize: 17, color: muted}}>{subtitle}</div>
          <div style={{display: "flex", gap: 9, marginTop: 18, flexWrap: "wrap"}}>
            {chips.map((chip) => (
              <span
                key={chip}
                style={{
                  padding: "8px 12px",
                  borderRadius: 99,
                  background: "#eef6df",
                  color: "#486d10",
                  fontSize: 14,
                  fontWeight: 760,
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div style={{color: green, fontSize: 14, fontWeight: 850, letterSpacing: ".1em"}}>ADAPTED</div>
      </div>
    </Interactive.Div>
  );
};

const MemoryOutcomes: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{opacity: interpolate(frame, [342, 400, 766, 824], [0, 1, 1, 0], clamp)}}
    >
      <div style={{position: "absolute", left: 112, top: 68}}>
        <div style={{color: green, fontSize: 16, fontWeight: 850, letterSpacing: ".16em"}}>
          ONE MEMORY LAYER
        </div>
        <div style={{marginTop: 14, color: ink, fontSize: 60, fontWeight: 760, letterSpacing: "-.045em"}}>
          Memory changes what happens next.
        </div>
      </div>

      <Interactive.Div
        name="Learner memory summary"
        style={{
          position: "absolute",
          left: 112,
          top: 255,
          width: 520,
          height: 665,
          padding: "34px",
          borderRadius: 30,
          background: "#11130f",
          color: "white",
          boxShadow: "0 35px 90px rgba(17,19,15,0.18)",
        }}
      >
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
          <div style={{color: "#d7f59c", fontSize: 15, fontWeight: 820, letterSpacing: ".14em"}}>
            LEARNER MEMORY
          </div>
          <div style={{padding: "7px 11px", borderRadius: 99, background: "rgba(183,236,82,.14)", color: lime, fontSize: 13, fontWeight: 800}}>
            LIVE CONTEXT
          </div>
        </div>
        <div style={{marginTop: 38, display: "flex", alignItems: "center", gap: 18}}>
          <div style={{width: 76, height: 76, borderRadius: 99, display: "grid", placeItems: "center", background: lime, color: ink, fontSize: 27, fontWeight: 850}}>
            DL
          </div>
          <div>
            <div style={{fontSize: 25, fontWeight: 760}}>Demo Learner</div>
            <div style={{marginTop: 5, color: "#adb4a5", fontSize: 16}}>Cloud Architect roadmap</div>
          </div>
        </div>
        <div style={{marginTop: 36, height: 1, background: "rgba(255,255,255,.12)"}} />
        {[
          ["Goal", "Cloud architect"],
          ["Strength", "Systems thinking"],
          ["Gap", "Network security"],
          ["Preference", "Visual + hands-on"],
          ["Evidence", "18 learning moments"],
        ].map(([label, value], index) => (
          <div
            key={label}
            style={{
              marginTop: index === 0 ? 28 : 17,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
            }}
          >
            <span style={{color: "#949c8f", fontSize: 15}}>{label}</span>
            <span style={{fontSize: 16, fontWeight: 720, textAlign: "right"}}>{value}</span>
          </div>
        ))}
        <div style={{position: "absolute", left: 34, right: 34, bottom: 32, padding: "17px 18px", borderRadius: 17, background: "rgba(183,236,82,.1)", color: "#dff7b0", fontSize: 15, lineHeight: 1.35}}>
          Context is bounded, relevant and carried into the next experience.
        </div>
      </Interactive.Div>

      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position: "absolute", inset: 0}}>
        <Connector name="Memory to roleplay" d="M632 390 C690 390 710 330 760 330" enterAt={430} />
        <Connector name="Memory to Tars behavior" d="M632 565 C690 565 710 560 760 560" enterAt={530} />
        <Connector name="Memory to course generation" d="M632 740 C690 740 710 790 760 790" enterAt={630} />
      </svg>

      <OutcomeCard
        name="Personalized roleplay output"
        top={215}
        enterAt={410}
        number="01"
        title="Roleplay"
        subtitle="A scenario generated from recent learning and current gaps."
        chips={["Backend interview", "Challenging", "Security follow-ups"]}
      />
      <OutcomeCard
        name="Personalized Tars behavior output"
        top={455}
        enterAt={510}
        number="02"
        title="Tars behaviour"
        subtitle="The explanation style and guidance adapt to the learner."
        chips={["Visual explanation", "Recalls prior gap", "One level deeper"]}
      />
      <OutcomeCard
        name="Personalized course generation output"
        top={695}
        enterAt={610}
        number="03"
        title="Course generation"
        subtitle="The next course begins where this learner actually is."
        chips={["Secure cloud networking", "Hands-on", "Two-week plan"]}
      />
    </AbsoluteFill>
  );
};

const FinalPersonalization: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{opacity: interpolate(frame, [770, 830, 1242, 1258], [0, 1, 1, 0], clamp)}}
    >
      <div style={{position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 48%, rgba(183,236,82,.22), transparent 34%)"}} />
      <div style={{position: "absolute", left: 180, right: 180, top: 92, textAlign: "center"}}>
        <div style={{color: green, fontSize: 16, fontWeight: 850, letterSpacing: ".17em"}}>
          PERSONALIZATION OVER TIME
        </div>
        <div style={{marginTop: 16, color: ink, fontSize: 74, fontWeight: 780, letterSpacing: "-.052em"}}>
          It never starts from zero.
        </div>
        <div style={{marginTop: 16, color: muted, fontSize: 24}}>
          Every interaction sharpens the next roleplay, response and course.
        </div>
      </div>

      <div style={{position: "absolute", left: 180, right: 180, top: 415, display: "flex", gap: 26}}>
        {[
          ["ROLEPLAY", "The right scenario", "Built from recent learning"],
          ["TARS", "The right behaviour", "Adjusted to strengths and gaps"],
          ["NEXT COURSE", "The right next step", "Generated from accumulated context"],
        ].map(([eyebrow, title, subtitle], index) => (
          <Interactive.Div
            name={`${eyebrow} personalization result`}
            key={eyebrow}
            style={{
              flex: 1,
              minHeight: 250,
              padding: "30px",
              borderRadius: 27,
              border: "1px solid rgba(17,19,15,.13)",
              background: index === 1 ? "#11130f" : "rgba(255,255,255,.88)",
              color: index === 1 ? "white" : ink,
              boxShadow: "0 28px 75px rgba(24,29,18,.09)",
              opacity: interpolate(frame, [840 + index * 48, 864 + index * 48], [0, 1], {
                ...clamp,
                easing: ease,
              }),
              translate: interpolate(frame, [840 + index * 48, 870 + index * 48], ["0px 28px", "0px 0px"], {
                ...clamp,
                easing: ease,
              }),
            }}
          >
            <div style={{fontSize: 14, fontWeight: 850, letterSpacing: ".14em", color: index === 1 ? lime : green}}>{eyebrow}</div>
            <div style={{marginTop: 32, fontSize: 33, fontWeight: 760, letterSpacing: "-.03em"}}>{title}</div>
            <div style={{marginTop: 10, color: index === 1 ? "#aeb5a7" : muted, fontSize: 18, lineHeight: 1.45}}>{subtitle}</div>
            <div style={{marginTop: 35, height: 7, borderRadius: 99, background: index === 1 ? "rgba(255,255,255,.12)" : "#e4e7df", overflow: "hidden"}}>
              <div
                style={{
                  width: `${interpolate(frame, [900 + index * 48, 1050 + index * 35], [12, 92], clamp)}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: lime,
                }}
              />
            </div>
          </Interactive.Div>
        ))}
      </div>

      <Interactive.Div
        name="Personalization timeline"
        style={{position: "absolute", left: 250, right: 250, top: 790, height: 130}}
      >
        <div style={{position: "absolute", left: 0, right: 0, top: 38, height: 2, background: "rgba(17,19,15,.14)"}} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 37,
            width: `${interpolate(frame, [870, 1130], [0, 100], {...clamp, easing: ease})}%`,
            height: 4,
            borderRadius: 99,
            background: green,
          }}
        />
        {[
          ["01", "First goal", 0],
          ["08", "Course evidence", 33],
          ["18", "Roleplay feedback", 66],
          ["24", "Better next course", 100],
        ].map(([number, label, percent], index) => (
          <div key={label} style={{position: "absolute", left: `${percent}%`, top: 22, translate: "-50% 0px", textAlign: "center"}}>
            <div
              style={{
                width: 34,
                height: 34,
                margin: "0 auto",
                borderRadius: 99,
                display: "grid",
                placeItems: "center",
                background: frame >= 900 + index * 70 ? lime : "#dfe2da",
                color: ink,
                fontSize: 12,
                fontWeight: 850,
                boxShadow: frame >= 900 + index * 70 ? "0 0 0 8px rgba(183,236,82,.16)" : "none",
              }}
            >
              {number}
            </div>
            <div style={{marginTop: 14, width: 160, color: muted, fontSize: 14, fontWeight: 680}}>{label}</div>
          </div>
        ))}
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          left: 180,
          right: 180,
          bottom: 54,
          textAlign: "center",
          color: ink,
          fontSize: 28,
          fontWeight: 760,
          letterSpacing: "-.02em",
          opacity: interpolate(frame, [1080, 1120], [0, 1], {...clamp, easing: ease}),
        }}
      >
        Roleplay, Tars and every generated course—designed increasingly for one learner.
      </div>
    </AbsoluteFill>
  );
};

export const TarsMemoryScene: React.FC = () => (
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
          "radial-gradient(circle at 18% 18%, rgba(183,236,82,.18), transparent 28%), radial-gradient(circle at 82% 76%, rgba(93,134,25,.08), transparent 30%)",
      }}
    />
    <AbsoluteFill
      style={{
        opacity: 0.24,
        backgroundImage:
          "linear-gradient(rgba(17,19,15,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(17,19,15,.05) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }}
    />
    <MemoryCollection />
    <MemoryOutcomes />
    <FinalPersonalization />
    <Sequence from={18} layout="none">
      <Audio src={staticFile("voiceover/combined-pitch/act-3-memory.mp3")} />
    </Sequence>
    <AbsoluteFill style={{pointerEvents: "none", boxShadow: "inset 0 0 110px rgba(17,19,15,.10)"}} />
  </AbsoluteFill>
);
