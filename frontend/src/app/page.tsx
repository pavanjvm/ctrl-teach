"use client";

/**
 * Ctrl+Teach — Landing Page
 * Editorial / Luxe Whitespace. Mirrors ctrl+teach/landing.html.
 */

import "./landing.css";
import { useEffect, useState } from "react";
import Link from "next/link";

// ── SVG Icon Components (line icons, editorial weight) ────────────────────────

const IconArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);

const IconMic = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const IconPen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Reveal-on-scroll ──────────────────────────────────────────────────────────

function useReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll(".land-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ── Nav scroll spy (active section) ──────────────────────────────────────────

function useNavSpy(links: string[]) {
  useEffect(() => {
    const els = links
      .map((id) => document.querySelector(id) as HTMLElement | null)
      .filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const id = "#" + e.target.id;
            document
              .querySelectorAll(".land-nav-links a")
              .forEach((l) =>
                l.classList.toggle("active", l.getAttribute("href") === id)
              );
          }
        });
      },
      { threshold: 0.32 }
    );
    els.forEach((s) => spy.observe(s));
    return () => spy.disconnect();
  }, [links]);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useReveal();
  useNavSpy([
    "#problem",
    "#shift",
    "#how",
    "#lesson",
    "#coaching",
    "#comparison",
    "#usecases",
    "#monetization",
  ]);

  return (
    <div className="land">

      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className={`land-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="land-nav-inner">
          <Link href="#hero" className="land-brand" aria-label="Ctrl+Teach home">
            <span className="land-brand-name">Ctrl</span>
            <span className="land-brand-plus">+</span>
            <span className="land-brand-name">Teach</span>
          </Link>
          <div className="land-nav-links">
            <a href="#problem" className="active">Problem</a>
            <a href="#shift">Shift</a>
            <a href="#how">How it works</a>
            <a href="#lesson">Live lesson</a>
            <a href="#coaching">Coaching</a>
            <a href="#comparison">Compare</a>
            <a href="#monetization">Platform</a>
          </div>
          <div className="land-nav-actions">
            <Link href="/login" className="land-cta land-cta-secondary">Log in</Link>
            <Link href="/login" className="land-cta land-cta-primary">
              Get started <IconArrow />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── 1. Hero ────────────────────────────────────────── */}
      <section className="land-hero" id="hero">
        <div className="land-hero-ghost" aria-hidden="true">2026</div>
        <div className="land-page">
          <div className="land-hero-grid">
            <div className="land-hero-text">
              <div className="land-eyebrow land-reveal">Training-as-a-Service&nbsp;/&nbsp;AI-led curriculum</div>
              <h1 className="land-headline land-reveal">
                Turn any learning objective into a live AI-led course<span className="stop">.</span>
              </h1>
              <p className="land-sub land-reveal">
                Ctrl+Teach creates, curates, and delivers self-paced technical training
                with an AI instructor that speaks, draws, guides practice, and adapts to each learner.
              </p>
              <div className="land-cta-group land-reveal">
                <Link href="#monetization" className="land-cta land-cta-primary">
                  Generate a course <IconArrow />
                </Link>
                <Link href="#lesson" className="land-cta land-cta-secondary">View demo flow</Link>
              </div>

              <div className="land-pills land-reveal">
                <span className="land-pill"><span className="land-pill-dot" />AI-led sessions</span>
                <span className="land-pill"><span className="land-pill-dot" />Live whiteboard</span>
                <span className="land-pill"><span className="land-pill-dot" />Checkpoint gating</span>
                <span className="land-pill"><span className="land-pill-dot" />Mastery-locked</span>
              </div>
            </div>

            {/* Abstract product mockup: modules | whiteboard | AI coach */}
            <div className="land-hero-visual land-reveal" aria-label="Abstract product UI">
              <div className="land-wb">
                <div className="land-wb-col land-wb-modules">
                  <span className="land-wb-label">Modules</span>
                  <div className="land-wb-mod is-active" />
                  <div className="land-wb-mod"><span className="land-wb-mod-check" /></div>
                  <div className="land-wb-mod" />
                  <div className="land-wb-mod" />
                  <div className="land-wb-mod" style={{ height: 6, width: "60%" }} />
                </div>
                <div className="land-wb-canvas">
                  <span className="land-wb-label">Whiteboard</span>
                  <div className="land-wb-line l1" />
                  <div className="land-wb-line l2" />
                  <div className="land-wb-line l3" />
                  <div className="land-wb-arrow">
                    <span /><b>Given</b><span /><b>When</b><span /><b>Then</b>
                  </div>
                  <div className="land-wb-annot">
                    <span className="land-wb-annot-line" />
                    <span className="land-wb-annot-txt">missing benefit</span>
                  </div>
                </div>
                <div className="land-wb-col land-wb-coach">
                  <span className="land-wb-label">AI coach</span>
                  <div className="land-wb-coach-row is-active" />
                  <div className="land-wb-coach-row" />
                  <div className="land-wb-coach-row" style={{ width: "48%" }} />
                  <div className="land-wb-coach-row" style={{ width: "72%" }} />
                </div>
                <div className="land-wb-progress">
                  <span className="land-wb-label" style={{ whiteSpace: "nowrap" }}>Progress</span>
                  <span className="land-wb-track"><span className="land-wb-fill" /></span>
                  <span className="land-wb-pct">Module 3 / 8</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Problem ─────────────────────────────────────── */}
      <section className="land-section" id="problem">
        <div className="land-page">
          <span className="land-section-num land-reveal">02 — Problem</span>
          <h2 className="land-section-title land-reveal">
            Static courses store content. They do not train<span className="stop">.</span>
          </h2>

          <div className="land-prob-grid">
            <div className="land-prob-col land-reveal">
              <span className="idx">01</span>
              <h3>Videos cannot answer questions</h3>
              <p>A pre-recorded explainer cannot pause, probe, or reframe when the learner's mental model breaks mid-way through.</p>
            </div>
            <div className="land-hl-v land-reveal" />
            <div className="land-prob-col land-reveal">
              <span className="idx">02</span>
              <h3>Quizzes do not coach mistakes</h3>
              <p>A score tells you the answer was wrong. It does not point to the line, explain the gap, and walk the learner through the fix.</p>
            </div>
            <div className="land-hl-v land-reveal" />
            <div className="land-prob-col land-reveal">
              <span className="idx">03</span>
              <h3>Experts do not scale linearly</h3>
              <p>Human subject-matter experts tutor one cohort at a time. Demand for self-paced technical training outpaces the bench.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Shift ──────────────────────────────────────── */}
      <section className="land-section" id="shift">
        <div className="land-page">
          <div className="land-shift">
            <div className="land-reveal">
              <div className="land-big-num">
                10<span className="dot">.</span>0<span className="unit">x</span>
              </div>
              <div className="land-shift-note">
                Faster course creation&nbsp;<span className="dot-inline">·</span>&nbsp;from one objective
              </div>
            </div>
            <div className="land-reveal">
              <span className="land-section-num" style={{ marginBottom: 18 }}>03 — Shift</span>
              <p className="land-lede" style={{ marginTop: 0, color: "var(--fg)", fontSize: 20 }}>
                Faster course creation when curriculum, lessons, labs, and assessments are generated from one objective.
              </p>
              <span className="land-gold-rule" style={{ marginTop: 28 }} />
              <p style={{ fontSize: 13, letterSpacing: "0.04em", color: "var(--muted)", textTransform: "uppercase", fontWeight: 400 }}>
                Generated structure&nbsp;<span style={{ color: "var(--accent)" }}>·</span>&nbsp;Human-editable&nbsp;<span style={{ color: "var(--accent)" }}>·</span>&nbsp;Instructor-led at runtime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. How it works ───────────────────────────────── */}
      <section className="land-section" id="how">
        <div className="land-page">
          <span className="land-section-num land-reveal">04 — How it works</span>
          <h2 className="land-section-title land-reveal">
            From one objective to a certified cohort<span className="stop">.</span>
          </h2>

          <div className="land-steps">
            <div className="land-step land-reveal">
              <span className="n">01.</span>
              <h3>Define the objective</h3>
              <p>State the learning goal in plain language. Ctrl+Teach infers audience, depth, and the milestones that prove mastery.</p>
            </div>
            <div className="land-step land-reveal">
              <span className="n">02.</span>
              <h3>Generate the curriculum</h3>
              <p>Modules, lessons, labs, and assessments are scaffolded instantly. Every block is human-editable before launch.</p>
            </div>
            <div className="land-step land-reveal">
              <span className="n">03.</span>
              <h3>Launch AI-led lessons</h3>
              <p>Each lesson opens as an interactive whiteboard-native session with a live AI instructor that speaks and draws.</p>
            </div>
            <div className="land-step land-reveal">
              <span className="n">04.</span>
              <h3>Coach practice</h3>
              <p>The instructor points to the exact gap in a learner's answer, asks checkpoint questions, and re-explains until correct.</p>
            </div>
            <div className="land-step land-reveal">
              <span className="n">05.</span>
              <h3>Certify mastery</h3>
              <p>Progress is tracked per objective. Completion unlocks a certificate-ready record when mastery criteria are met.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Live lesson ────────────────────────────────── */}
      <section className="land-section" id="lesson">
        <div className="land-page">
          <span className="land-section-num land-reveal">05 — Live lesson</span>
          <h2 className="land-section-title land-reveal">
            Every lesson has an instructor<span className="stop">.</span>
          </h2>

          <div className="land-lesson-grid">
            <div className="land-wb-card land-reveal" aria-label="Whiteboard diagram">
              <span className="wb-k">Whiteboard · user story</span>
              <div className="land-story">
                <div className="seg">
                  <span className="pill">As a</span>
                  <span className="txt">user</span>
                  <span className="arr" />
                  <span className="pill">I want</span>
                  <span className="txt">a goal</span>
                  <span className="arr" />
                  <span className="pill">so that</span>
                  <span className="txt">value</span>
                </div>
              </div>
              <span className="wb-k" style={{ marginTop: 14 }}>Whiteboard · acceptance check</span>
              <div className="land-story">
                <div className="seg gold">
                  <span className="pill">Given</span>
                  <span className="txt">a state</span>
                  <span className="arr" />
                  <span className="pill">When</span>
                  <span className="txt">an action</span>
                  <span className="arr" />
                  <span className="pill">Then</span>
                  <span className="txt">an outcome</span>
                </div>
              </div>
            </div>

            <div className="land-hl-v land-reveal" />

            <div className="land-lesson-expl land-reveal">
              <p>The instructor speaks, draws, asks checkpoints, evaluates practice, and unlocks the next step only when the current objective is met.</p>
              <p>No static video. No passive quiz. Each lesson is an interactive whiteboard-native session the learner can steer.</p>
              <span className="land-gold-rule" />
              <p style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 400 }}>
                AI-led sessions&nbsp;<span style={{ color: "var(--accent)" }}>·</span>&nbsp;Checkpoint-gated&nbsp;<span style={{ color: "var(--accent)" }}>·</span>&nbsp;Mastery-locked
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Pixel-precise coaching ─────────────────────── */}
      <section className="land-section" id="coaching">
        <div className="land-page">
          <span className="land-section-num land-reveal">06 — Pixel-precise coaching</span>
          <h2 className="land-section-title land-reveal">
            It does not just say what is wrong. It points<span className="stop">.</span>
          </h2>

          <div className="land-ba-grid">
            <div className="land-ba-col land-ba-before land-reveal">
              <div className="lbl">Before · learner answer</div>
              <p className="land-ans">As a user, I want a dashboard so that <span className="miss">…</span></p>
              <p className="land-ans" style={{ marginTop: 14, color: "var(--baseline)" }}>Benefit left undefined.</p>
            </div>
            <div className="land-ba-col land-ba-after land-reveal">
              <div className="lbl">After · AI coach annotation</div>
              <p className="land-ans">As a user, I want a dashboard so that I can monitor cohort progress in real time.</p>
              <div className="land-pointer">
                <span className="pl" /><span className="pd" />
                <span className="pt">Missing benefit here</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Comparison ─────────────────────────────────── */}
      <section className="land-section" id="comparison">
        <div className="land-page">
          <span className="land-section-num land-reveal">07 — Comparison</span>
          <h2 className="land-section-title land-reveal">
            Self-paced, but never passive<span className="stop">.</span>
          </h2>

          <div className="land-cmp">
            {[
              {
                label: "Course generation",
                legacy: "days / weeks",
                ctrl: "minutes",
                note: "Curriculum, lessons, labs, and assessments are scaffolded from one objective — then human-edited before launch.",
                legacyW: 34,
                ctrlW: 88,
                fade: true,
              },
              {
                label: "Learner support",
                legacy: "passive",
                ctrl: "live AI coach",
                note: "A live AI instructor joins each lesson to speak, draw, and reframe on demand.",
                legacyW: 24,
                ctrlW: 80,
                fade: false,
              },
              {
                label: "Practice feedback",
                legacy: "quiz score",
                ctrl: "guided correction",
                note: "The coach points to the exact gap and walks the learner through the fix, not just the score.",
                legacyW: 28,
                ctrlW: 90,
                fade: false,
              },
              {
                label: "Delivery model",
                legacy: "static video",
                ctrl: "AI-led session",
                note: "Every lesson is an interactive whiteboard-native session — steered by the learner, led by the AI.",
                legacyW: 30,
                ctrlW: 96,
                fade: true,
              },
            ].map((row, i) => (
              <div className="land-cmp-row land-reveal" key={i}>
                <div>
                  <div className="label">{row.label}</div>
                  <div className="land-cmp-bars">
                    <div className="land-bar-row legacy">
                      <span className="name">Traditional LMS</span>
                      <span className="track"><span className="fill-grey" style={{ width: `${row.legacyW}%` }} /></span>
                      <span className="val">{row.legacy}</span>
                    </div>
                    <div className="land-bar-row">
                      <span className="name">Ctrl+Teach</span>
                      <span className="track">
                        <span className={`fill-gold ${row.fade ? "fade" : ""}`} style={{ width: `${row.ctrlW}%` }} />
                      </span>
                      <span className="val">{row.ctrl}</span>
                    </div>
                  </div>
                </div>
                <p className="land-cmp-note">{row.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. Use cases ──────────────────────────────────── */}
      <section className="land-section" id="usecases">
        <div className="land-page">
          <span className="land-section-num land-reveal">08 — Use cases</span>
          <h2 className="land-section-title land-reveal">
            Built for the teams that train technical practitioners<span className="stop">.</span>
          </h2>

          <div className="land-use-grid">
            <div className="uc-line2" />
            {[
              "Agile & Scrum training",
              "Product owner enablement",
              "Technical onboarding",
              "Software engineering courses",
              "QA automation labs",
              "Enterprise transformation",
            ].map((label, i) => (
              <div className="land-use-cell land-reveal" key={label}>
                <span className="uc-idx">0{i + 1}</span>
                <h4>{label}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. Platform / monetization ────────────────────── */}
      <section className="land-section" id="monetization">
        <div className="land-page">
          <span className="land-section-num land-reveal">09 — Platform</span>
          <h2 className="land-section-title land-reveal">
            Create. Curate. Host. Monetize<span className="stop">.</span>
          </h2>

          <div className="land-mon-grid">
            <div className="land-mon-card land-reveal">
              <span className="mc-idx">01</span>
              <h3>Course Studio</h3>
              <p>Author and edit curriculum, lessons, labs, and assessments from a single objective.</p>
              <div className="mc-num">01<span className="unit">studio</span></div>
            </div>
            <div className="land-hl-v land-reveal" />
            <div className="land-mon-card land-reveal">
              <span className="mc-idx">02</span>
              <h3>AI Lesson Player</h3>
              <p>Deliver each lesson as a live AI-led, whiteboard-native session with checkpoint gating.</p>
              <div className="mc-num">24<span className="unit">/7</span></div>
            </div>
            <div className="land-hl-v land-reveal" />
            <div className="land-mon-card land-reveal">
              <span className="mc-idx">03</span>
              <h3>Mastery &amp; Certificate</h3>
              <p>Track per-objective mastery and issue certificate-ready completion records.</p>
              <div className="mc-num">100<span className="unit">%</span></div>
            </div>
          </div>

          <p className="land-lede land-reveal" style={{ marginTop: 48, maxWidth: "60ch" }}>
            Publish self-paced technical courses with AI-led delivery, progress tracking, assessments, and certificate-ready completion.
          </p>
        </div>
      </section>

      {/* ── 10. Closing CTA ───────────────────────────────── */}
      <section className="land-section land-close" id="close">
        <div className="land-page">
          <span className="land-section-num land-reveal">10 — Begin</span>
          <h2 className="land-section-title land-reveal" style={{ maxWidth: "22ch" }}>
            Build the course. Launch the instructor. Monetize the training<span className="stop">.</span>
          </h2>
          <div className="land-close-note land-reveal">One objective in. A live AI-led course out.</div>
          <div className="land-cta-group land-reveal">
            <Link href="#monetization" className="land-cta land-cta-primary">
              Generate a course <IconArrow />
            </Link>
            <Link href="#lesson" className="land-cta land-cta-secondary">View demo flow</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="land-footer">
        <div className="land-page">
          <div className="land-gold-hairline" />
          <div className="land-foot-inner">
            <div className="land-foot-brand">
              <Link href="#hero" className="land-brand" aria-label="Ctrl+Teach home">
                <span className="land-brand-name">Ctrl</span>
                <span className="land-brand-plus">+</span>
                <span className="land-brand-name">Teach</span>
              </Link>
              <p>AI-led technical training, delivered as self-paced curriculum.</p>
            </div>
            <div className="land-foot-links">
              <a href="#how">Product</a>
              <a href="#lesson">Demo</a>
              <a href="#usecases">Use Cases</a>
              <a href="#monetization">Pricing</a>
              <a href="#close">Contact</a>
            </div>
          </div>
          <div className="land-foot-copy">© 2026 Ctrl+Teach&nbsp;·&nbsp;Training-as-a-Service</div>
        </div>
      </footer>
    </div>
  );
}
