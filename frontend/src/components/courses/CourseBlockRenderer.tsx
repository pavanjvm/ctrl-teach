"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, Check, ExternalLink, RotateCcw } from "lucide-react";

import { assetUrl } from "@/lib/generatedCourses";
import type {
  CourseCitation,
  CourseContentBlock,
  FlipCardsContentBlock,
  InfoTabsContentBlock,
  QuizContentBlock,
} from "@/lib/types";

export type QuizProgress = {
  answered: number;
  correct: number;
  total: number;
};

export default function CourseBlockRenderer({
  block,
  citations,
  onQuizProgress = () => {},
}: {
  block: CourseContentBlock;
  citations: CourseCitation[];
  onQuizProgress?: (progress: QuizProgress) => void;
}) {
  if (block.type === "content") {
    return (
      <section className="rich-block rich-content-block">
        <h2>{block.heading}</h2>
        {block.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "grid_cards") {
    return (
      <section className="rich-block">
        <h2>{block.heading}</h2>
        <div className="rich-grid-cards">
          {block.cards.map((card, index) => (
            <article key={`${card.title}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "info_tabs") return <InfoTabs block={block} citations={citations} />;
  if (block.type === "flip_cards") return <FlipCards block={block} />;
  if (block.type === "quiz") {
    return <QuizBlockView block={block} citations={citations} onProgress={onQuizProgress} />;
  }
  if (block.type === "numbered_list") {
    return (
      <section className="rich-block">
        <h2>{block.heading}</h2>
        <ol className="rich-numbered-list">
          {block.items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{item.title}</h3><p>{item.body}</p></div>
            </li>
          ))}
        </ol>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "html") {
    const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;background:#faf8f2;color:#23221f;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}body{padding:20px}svg{max-width:100%;height:auto}</style></head><body>${block.html}</body></html>`;
    return (
      <section className="rich-block rich-html-block">
        <h2>{block.heading}</h2>
        <iframe title={block.heading} sandbox="" srcDoc={document} style={{ height: block.height }} />
        <p className="rich-accessibility"><BookOpen size={12} /> {block.accessibilitySummary}</p>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  return (
    <figure className="rich-block rich-image-block">
      <img src={assetUrl(block.asset.url)} alt={block.asset.alt} />
      <figcaption>{block.asset.caption}</figcaption>
      <BlockSources ids={block.citationIds} citations={citations} />
    </figure>
  );
}

function InfoTabs({ block, citations }: { block: InfoTabsContentBlock; citations: CourseCitation[] }) {
  const [active, setActive] = useState(0);
  return (
    <section className="rich-block rich-tabs-block">
      <h2>{block.heading}</h2>
      <div className="rich-tab-list" role="tablist">
        {block.tabs.map((tab, index) => (
          <button
            key={`${tab.label}-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            className={active === index ? "active" : ""}
            onClick={() => setActive(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="rich-tab-panel"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
        >
          {block.tabs[active]?.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </motion.div>
      </AnimatePresence>
      <BlockSources ids={block.citationIds} citations={citations} />
    </section>
  );
}

function FlipCards({ block }: { block: FlipCardsContentBlock }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <section className="rich-block">
      <h2>{block.heading}</h2>
      <div className="rich-flip-grid">
        {block.cards.map((card, index) => (
          <button
            key={`${card.front}-${index}`}
            type="button"
            className={flipped[index] ? "flipped" : ""}
            onClick={() => setFlipped((current) => ({ ...current, [index]: !current[index] }))}
          >
            <span className="rich-flip-front"><small>Tap to reveal</small><strong>{card.front}</strong><RotateCcw size={14} /></span>
            <span className="rich-flip-back"><small>Answer</small><strong>{card.back}</strong><RotateCcw size={14} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuizBlockView({
  block,
  citations,
  onProgress,
}: {
  block: QuizContentBlock;
  citations: CourseCitation[];
  onProgress: (progress: QuizProgress) => void;
}) {
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const question = block.questions[active];

  function choose(choice: number) {
    const next = { ...answers, [active]: choice };
    setAnswers(next);
    onProgress({
      answered: Object.keys(next).length,
      correct: Object.entries(next).filter(([questionIndex, answer]) => (
        block.questions[Number(questionIndex)]?.answerIndex === answer
      )).length,
      total: block.questions.length,
    });
  }

  const selected = answers[active];
  const answered = selected !== undefined;
  if (!question) {
    return (
      <section className="rich-block rich-quiz-block">
        <div className="rich-quiz-head"><span>Knowledge check</span><h2>{block.heading}</h2></div>
        <p>This knowledge check has no questions yet.</p>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  return (
    <section className="rich-block rich-quiz-block">
      <div className="rich-quiz-head"><span>Knowledge check</span><h2>{block.heading}</h2></div>
      <div className="rich-quiz-numbers">
        {block.questions.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`${active === index ? "active" : ""} ${answers[index] !== undefined ? "answered" : ""}`}
            onClick={() => setActive(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={question.id} className="rich-quiz-question" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
          <h3>{question.question}</h3>
          <div>
            {question.choices.map((choice, index) => {
              const correct = answered && index === question.answerIndex;
              const wrong = answered && index === selected && selected !== question.answerIndex;
              return (
                <button
                  key={`${choice}-${index}`}
                  type="button"
                  className={`${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                  disabled={answered}
                  onClick={() => choose(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>{choice}{correct && <Check size={14} />}
                </button>
              );
            })}
          </div>
          {answered && (
            <div className={`rich-quiz-feedback ${selected === question.answerIndex ? "correct" : "wrong"}`}>
              <strong>{selected === question.answerIndex ? "Correct" : "Not quite"}</strong>
              <p>{question.explanation}</p>
              {active < block.questions.length - 1 && (
                <button type="button" onClick={() => setActive(active + 1)}>Next question <ArrowRight size={12} /></button>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <BlockSources ids={block.citationIds} citations={citations} />
    </section>
  );
}

function BlockSources({ ids = [], citations }: { ids?: string[]; citations: CourseCitation[] }) {
  const matches = ids
    .map((id) => citations.find((citation) => citation.id === id))
    .filter((item): item is CourseCitation => Boolean(item));
  if (!matches.length) return null;
  return (
    <div className="rich-block-sources">
      {matches.map((item) => (
        <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
          {item.id.replace("src-", "Source ")} <ExternalLink size={9} />
        </a>
      ))}
    </div>
  );
}
