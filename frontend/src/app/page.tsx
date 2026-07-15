"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Check,
  Menu,
  Mic,
  MousePointer2,
  Play,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import "./landing.css";

type ProductMode = "study" | "lab" | "assessment" | "roleplay";
type DemoMode = "explain" | "practice" | "remember";

const productModes: Record<
  ProductMode,
  {
    eyebrow: string;
    title: string;
    fieldLabel: string;
    fieldValue: string;
    feedback: string;
    memory: string;
  }
> = {
  study: {
    eyebrow: "Shared whiteboard",
    title: "Connect the three parts",
    fieldLabel: "Outcome",
    fieldValue: "Why the user cares",
    feedback: "Start with the user, then connect the action to a meaningful outcome.",
    memory: "Prefers a worked example before formal definitions.",
  },
  lab: {
    eyebrow: "Live practice",
    title: "Build a user story",
    fieldLabel: "So that",
    fieldValue: "I can...",
    feedback: "Name the outcome, not another feature.",
    memory: "Strong at user intent. Building outcome framing.",
  },
  assessment: {
    eyebrow: "Adaptive assessment",
    title: "Explain your reasoning",
    fieldLabel: "Your evidence",
    fieldValue: "This works because...",
    feedback: "Use an observable behavior to support your choice.",
    memory: "Reasoning is clear; evidence needs more specificity.",
  },
  roleplay: {
    eyebrow: "Stakeholder roleplay",
    title: "Handle the objection",
    fieldLabel: "Your response",
    fieldValue: "I would clarify...",
    feedback: "Ask one question before offering a solution.",
    memory: "Communicates calmly and benefits from a response structure.",
  },
};

const demoModes: Record<
  DemoMode,
  {
    label: string;
    title: string;
    copy: string;
    memory: string;
    nodes: [string, string, string];
  }
> = {
  explain: {
    label: "Mental model",
    title: "Connect the user, action, and outcome.",
    copy: "The action is observable. Now connect it to why the user cares.",
    memory:
      "Pavan recognizes user intent quickly and benefits from concrete outcome examples.",
    nodes: ["User need", "Action", "Outcome"],
  },
  practice: {
    label: "Live practice",
    title: "Turn a vague request into a useful story.",
    copy: "Your user and action are clear. The highlighted outcome is still too broad.",
    memory: "Outcome language is improving after one pointed correction.",
    nodes: ["Product manager", "Usage alert", "Spot risks"],
  },
  remember: {
    label: "Skill synthesis",
    title: "Convert the attempt into useful evidence.",
    copy: "This confirms a strength in intent and a focus area in acceptance criteria.",
    memory: "The next lesson will use a worked example before independent practice.",
    nodes: ["Strength", "Evidence", "Next step"],
  },
};

function useLandingReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("signal-reveal-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6%" },
    );

    document
      .querySelectorAll(".signal-reveal")
      .forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);
}

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productMode, setProductMode] = useState<ProductMode>("lab");
  const [productAction, setProductAction] = useState<"ask" | "check" | null>(null);
  const [demoMode, setDemoMode] = useState<DemoMode>("explain");
  const [pointerState, setPointerState] = useState(0);

  useLandingReveal();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setPointerState((current) => (current + 1) % 3),
      2200,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const activeProduct = productModes[productMode];
  const activeDemo = demoModes[demoMode];
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="signal-landing">
      <nav
        className={`signal-nav ${scrolled ? "signal-nav-scrolled" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="signal-page signal-nav-inner">
          <Link className="signal-brand" href="#top" aria-label="Ctrl+Teach home">
            Ctrl<span>+</span>Teach
          </Link>
          <div className="signal-nav-links">
            <a href="#method">How it works</a>
            <a href="#profile">Skill profile</a>
            <a href="#proof">Why it works</a>
          </div>
          <div className="signal-nav-actions">
            <Link className="signal-login" href="/login">
              Log in
            </Link>
            <Link className="signal-button" href="/login">
              Start learning <ArrowUpRight aria-hidden="true" />
            </Link>
            <button
              className="signal-menu-button"
              type="button"
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="signal-mobile-menu">
            <a href="#method" onClick={closeMobileMenu}>How it works</a>
            <a href="#profile" onClick={closeMobileMenu}>Skill profile</a>
            <a href="#proof" onClick={closeMobileMenu}>Why it works</a>
            <Link href="/login" onClick={closeMobileMenu}>Log in</Link>
            <Link className="signal-mobile-primary" href="/login" onClick={closeMobileMenu}>
              Start learning <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}
      </nav>

      <main>
        <section className="signal-hero" id="top">
          <div className="signal-page signal-hero-page">
            <div className="signal-hero-copy">
              <p className="signal-eyebrow">AI training that stays with you</p>
              <h1>Ctrl+<br />Teach.</h1>
              <p className="signal-hero-value">
                Practice technical skills with a coach that can see, point, explain,
                and remember.
              </p>
              <p className="signal-hero-sub">
                TARS follows your work in real time and turns every attempt into the
                next useful lesson.
              </p>
              <div className="signal-hero-actions">
                <Link className="signal-button signal-button-accent" href="/login">
                  Start learning <ArrowRight aria-hidden="true" />
                </Link>
                <a className="signal-button signal-button-secondary" href="#method">
                  <Play aria-hidden="true" /> Watch the lesson
                </a>
              </div>
            </div>
          </div>

          <div className="signal-product" aria-label="Ctrl+Teach live practice workspace">
            <div className="signal-product-bar">
              <div className="signal-window-dots" aria-hidden="true"><i /><i /><i /></div>
              <div className="signal-product-url" aria-hidden="true" />
              <div className="signal-product-avatar" aria-hidden="true" />
            </div>
            <div className="signal-product-tabs" role="tablist" aria-label="Learning mode">
              {(Object.keys(productModes) as ProductMode[]).map((mode) => (
                <button
                  className={`signal-product-tab ${productMode === mode ? "active" : ""}`}
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={productMode === mode}
                  onClick={() => {
                    setProductMode(mode);
                    setProductAction(null);
                  }}
                >
                  {mode === "assessment" ? "Assessment" : `${mode[0].toUpperCase()}${mode.slice(1)}`}
                </button>
              ))}
            </div>
            <div className="signal-lesson-layout">
              <aside className="signal-lesson-path">
                <span className="signal-mini-label">Your path</span>
                <h2>Writing clear user stories</h2>
                <div className="signal-path-step done"><i><Check /></i><span>Intent</span></div>
                <div className="signal-path-step done"><i><Check /></i><span>Persona</span></div>
                <div className="signal-path-step active"><i>3</i><span>Benefit</span></div>
                <div className="signal-path-step"><i>4</i><span>Criteria</span></div>
              </aside>

              <section className="signal-practice">
                <div className="signal-practice-heading">
                  <div>
                    <span className="signal-mini-label">{activeProduct.eyebrow}</span>
                    <h2>{activeProduct.title}</h2>
                  </div>
                  <span className="signal-live-state"><i />TARS is watching</span>
                </div>
                <div className={`signal-story-board ${productAction === "check" ? "checked" : ""}`}>
                  <div className="signal-story-fields">
                    <div className="signal-story-field"><span>As a</span><strong>Product manager</strong></div>
                    <div className="signal-story-field"><span>I want</span><strong>Weekly usage alerts</strong></div>
                    <div className="signal-story-field target"><span>{activeProduct.fieldLabel}</span><strong>{activeProduct.fieldValue}</strong></div>
                  </div>
                  <div className="signal-story-output">
                    As a product manager, I want weekly usage alerts <mark>so that I can spot adoption risks early.</mark>
                  </div>
                  <div
                    className={`signal-coach-pointer signal-pointer-${pointerState}`}
                    aria-hidden="true"
                  >
                    <MousePointer2 />
                  </div>
                  <div className="signal-coach-bubble" aria-live="polite">
                    {productAction === "check" ? (
                      <><b>Story checked.</b> The outcome is specific, useful, and measurable.</>
                    ) : productAction === "ask" ? (
                      <><b>Try this.</b> {activeProduct.feedback}</>
                    ) : (
                      <><b>Look here.</b> {activeProduct.feedback}</>
                    )}
                  </div>
                </div>
                <div className="signal-practice-actions">
                  <button
                    type="button"
                    aria-pressed={productAction === "ask"}
                    onClick={() => {
                      setProductAction("ask");
                      setPointerState((current) => (current + 1) % 3);
                    }}
                  >
                    {productAction === "ask" ? "TARS answered" : "Ask TARS"}
                  </button>
                  <button
                    className="primary"
                    type="button"
                    aria-pressed={productAction === "check"}
                    onClick={() => setProductAction("check")}
                  >
                    {productAction === "check" ? "Story checked" : "Check story"}
                  </button>
                </div>
              </section>

              <aside className="signal-companion">
                <span className="signal-mini-label">Companion</span>
                <div className="signal-coach-id">
                  <div className="signal-coach-mark">T</div>
                  <div><strong>TARS</strong><span>Live coach</span></div>
                </div>
                <div className="signal-message">I can see the role and action are clear.</div>
                <div className="signal-message tars">
                  {productAction === "check"
                    ? "That outcome is clear enough to test. Next, add one acceptance criterion."
                    : activeProduct.feedback}
                </div>
                <div className="signal-memory-capture">
                  <strong><Brain aria-hidden="true" /> Memory captured</strong>
                  <p>{activeProduct.memory}</p>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="signal-proof" id="proof" aria-label="Product summary">
          <div className="signal-page signal-proof-grid">
            <p>One continuous learning loop, from explanation to evidence.</p>
            <div><strong>4 modes</strong><span>Study, lab, assessment, roleplay</span></div>
            <div><strong>Live</strong><span>Voice, drawing, and pointing feedback</span></div>
            <div><strong>1 profile</strong><span>A memory of how you learn</span></div>
          </div>
        </section>

        <section className="signal-statement" id="method">
          <div className="signal-page">
            <h2 className="signal-reveal">
              Most courses remember your score. <span>Ctrl+Teach remembers your thinking.</span>
            </h2>
            <div className="signal-statement-grid">
              <article className="signal-reveal">
                <h3>It watches the attempt</h3>
                <p>TARS follows the actual task, not a simulated quiz detached from the work.</p>
              </article>
              <article className="signal-reveal">
                <h3>It points to the gap</h3>
                <p>Feedback lands on the exact field, line, or idea that needs your attention.</p>
              </article>
              <article className="signal-reveal">
                <h3>It adapts the next move</h3>
                <p>Every success and struggle updates a practical skill profile you can inspect.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="signal-walkthrough">
          <div className="signal-page">
            <div className="signal-walkthrough-head signal-reveal">
              <h2>Feedback that moves at the speed of thought.</h2>
              <p>Switch the lesson below. TARS changes what it sees, what it points to, and what it remembers.</p>
            </div>
            <div className="signal-demo-grid">
              <div className="signal-demo-steps" role="tablist" aria-label="Teaching loop">
                {(Object.keys(demoModes) as DemoMode[]).map((mode) => (
                  <button
                    className={demoMode === mode ? "active" : ""}
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={demoMode === mode}
                    onClick={() => setDemoMode(mode)}
                  >
                    <strong>{mode[0].toUpperCase() + mode.slice(1)}</strong>
                    <span>
                      {mode === "explain" && "Build the mental model together"}
                      {mode === "practice" && "Coach the work while it happens"}
                      {mode === "remember" && "Turn evidence into a profile"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="signal-demo-stage signal-reveal">
                <div className="signal-demo-stage-inner">
                  <div className="signal-demo-canvas">
                    <span className="signal-mini-label">{activeDemo.label}</span>
                    <h3>{activeDemo.title}</h3>
                    <div className="signal-diagram">
                      <div className="signal-diagram-node n1">{activeDemo.nodes[0]}</div>
                      <div className="signal-diagram-line l1" aria-hidden="true" />
                      <div className="signal-diagram-node n2">{activeDemo.nodes[1]}</div>
                      <div className="signal-diagram-line l2" aria-hidden="true" />
                      <div className="signal-diagram-node n3">{activeDemo.nodes[2]}</div>
                    </div>
                  </div>
                  <aside className="signal-demo-side">
                    <strong>TARS is pointing to {activeDemo.nodes[1]}</strong>
                    <p>{activeDemo.copy}</p>
                    <div className="signal-demo-memory">
                      <span className="signal-mini-label">Learner memory</span>
                      <p>{activeDemo.memory}</p>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="signal-profile" id="profile">
          <div className="signal-page signal-profile-layout">
            <div className="signal-profile-copy signal-reveal">
              <h2>A profile built from doing, not guessing.</h2>
              <p>Your skill profile collects interests, strengths, focus areas, and evidence from each lesson. You stay in control of what is remembered.</p>
              <Link className="signal-button" href="/login">
                See your profile <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="signal-profile-visual signal-reveal">
              <SkillRow title="Problem framing" description="Consistently identifies the user and their intent without prompting." label="Strength" score={86} />
              <SkillRow title="Outcome language" description="Improves fastest after seeing one concrete example." label="Building" score={62} />
              <SkillRow title="Acceptance criteria" description="Needs more practice separating behavior from implementation details." label="Focus" score={38} />
              <div className="signal-latest-memory"><span>Latest memory</span><strong>Prefers examples before formal definitions.</strong></div>
            </div>
          </div>
        </section>

        <section className="signal-final" id="start">
          <div className="signal-page signal-final-row">
            <h2>Learn something by actually doing it.</h2>
            <Link className="signal-button" href="/login">
              Start learning <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="signal-footer">
        <div className="signal-page signal-footer-row">
          <Link className="signal-brand" href="#top">Ctrl<span>+</span>Teach</Link>
          <a href="#method">Method</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Log in</Link>
          <small>Adaptive technical learning, built around you.</small>
        </div>
      </footer>
    </div>
  );
}

function SkillRow({
  title,
  description,
  label,
  score,
}: {
  title: string;
  description: string;
  label: string;
  score: number;
}) {
  return (
    <article className="signal-skill-row">
      <div><h3>{title}</h3><p>{description}</p></div>
      <div className="signal-skill-meter">
        <div><span>{label}</span><span>{score}%</span></div>
        <div className="signal-skill-track"><i style={{ width: `${score}%` }} /></div>
      </div>
    </article>
  );
}
