"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";

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

function EditableText({
  value,
  onChange,
  ariaLabel,
  multiline = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  ariaLabel: string;
  multiline?: boolean;
}) {
  if (!onChange) return value;
  return (
    <span
      className={`admin-direct-edit ${multiline ? "multiline" : ""}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.textContent = value;
          event.currentTarget.blur();
        } else if (!multiline && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const next = event.currentTarget.innerText;
        if (next !== value) onChange(next);
      }}
    >
      {value}
    </span>
  );
}

export default function CourseBlockRenderer({
  block,
  citations,
  onQuizProgress = () => {},
  editable = false,
  onChange,
}: {
  block: CourseContentBlock;
  citations: CourseCitation[];
  onQuizProgress?: (progress: QuizProgress) => void;
  editable?: boolean;
  onChange?: (block: CourseContentBlock) => void;
}) {
  const edit = editable && onChange ? onChange : undefined;

  if (block.type === "content") {
    return (
      <section className="rich-block rich-content-block">
        <h2><EditableText value={block.heading} ariaLabel="Edit section heading" onChange={edit ? (heading) => edit({ ...block, heading }) : undefined} /></h2>
        {block.paragraphs.map((paragraph, index) => (
          <p key={index}>
            <EditableText
              value={paragraph}
              ariaLabel={`Edit paragraph ${index + 1}`}
              multiline
              onChange={edit ? (value) => {
                const paragraphs = [...block.paragraphs];
                paragraphs[index] = value;
                edit({ ...block, paragraphs });
              } : undefined}
            />
          </p>
        ))}
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "grid_cards") {
    return (
      <section className="rich-block">
        <h2><EditableText value={block.heading} ariaLabel="Edit section heading" onChange={edit ? (heading) => edit({ ...block, heading }) : undefined} /></h2>
        <div className="rich-grid-cards">
          {block.cards.map((card, index) => (
            <article key={`${card.title}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>
                <EditableText
                  value={card.title}
                  ariaLabel={`Edit card ${index + 1} title`}
                  onChange={edit ? (title) => {
                    const cards = [...block.cards];
                    cards[index] = { ...card, title };
                    edit({ ...block, cards });
                  } : undefined}
                />
              </h3>
              <p>
                <EditableText
                  value={card.body}
                  ariaLabel={`Edit card ${index + 1} text`}
                  multiline
                  onChange={edit ? (body) => {
                    const cards = [...block.cards];
                    cards[index] = { ...card, body };
                    edit({ ...block, cards });
                  } : undefined}
                />
              </p>
            </article>
          ))}
        </div>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.type === "info_tabs") return <InfoTabs block={block} citations={citations} editable={editable} onChange={edit} />;
  if (block.type === "flip_cards") return <FlipCards block={block} editable={editable} onChange={edit} />;
  if (block.type === "quiz") {
    return <QuizBlockView block={block} citations={citations} onProgress={onQuizProgress} editable={editable} onChange={edit} />;
  }
  if (block.type === "numbered_list") {
    return (
      <section className="rich-block">
        <h2><EditableText value={block.heading} ariaLabel="Edit section heading" onChange={edit ? (heading) => edit({ ...block, heading }) : undefined} /></h2>
        <ol className="rich-numbered-list">
          {block.items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>
                  <EditableText
                    value={item.title}
                    ariaLabel={`Edit item ${index + 1} title`}
                    onChange={edit ? (title) => {
                      const items = [...block.items];
                      items[index] = { ...item, title };
                      edit({ ...block, items });
                    } : undefined}
                  />
                </h3>
                <p>
                  <EditableText
                    value={item.body}
                    ariaLabel={`Edit item ${index + 1} text`}
                    multiline
                    onChange={edit ? (body) => {
                      const items = [...block.items];
                      items[index] = { ...item, body };
                      edit({ ...block, items });
                    } : undefined}
                  />
                </p>
              </div>
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
        <h2><EditableText value={block.heading} ariaLabel="Edit section heading" onChange={edit ? (heading) => edit({ ...block, heading }) : undefined} /></h2>
        <iframe title={block.heading} sandbox="" srcDoc={document} style={{ height: block.height }} />
        <p className="rich-accessibility">
          <BookOpen size={12} />{" "}
          <EditableText
            value={block.accessibilitySummary}
            ariaLabel="Edit accessibility summary"
            multiline
            onChange={edit ? (accessibilitySummary) => edit({ ...block, accessibilitySummary }) : undefined}
          />
        </p>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  if (block.status === "pending" || block.asset.status === "pending" || !block.asset.url) {
    return (
      <figure className="rich-block rich-image-block rich-image-pending" role="status">
        <div><Loader2 className="rich-spin" size={22} /><span>Generating lesson artwork</span></div>
        {block.asset.caption && <figcaption>{block.asset.caption}</figcaption>}
        <BlockSources ids={block.citationIds} citations={citations} />
      </figure>
    );
  }
  return (
    <figure className="rich-block rich-image-block">
      <img src={assetUrl(block.asset.url)} alt={block.asset.alt} />
      <figcaption>
        <EditableText
          value={block.asset.caption}
          ariaLabel="Edit image caption"
          multiline
          onChange={edit ? (caption) => edit({ ...block, asset: { ...block.asset, caption } }) : undefined}
        />
      </figcaption>
      <BlockSources ids={block.citationIds} citations={citations} />
    </figure>
  );
}

function InfoTabs({
  block,
  citations,
  editable = false,
  onChange,
}: {
  block: InfoTabsContentBlock;
  citations: CourseCitation[];
  editable?: boolean;
  onChange?: (block: CourseContentBlock) => void;
}) {
  const [active, setActive] = useState(0);
  return (
    <section className="rich-block rich-tabs-block">
      <h2><EditableText value={block.heading} ariaLabel="Edit section heading" onChange={onChange ? (heading) => onChange({ ...block, heading }) : undefined} /></h2>
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
            <EditableText
              value={tab.label}
              ariaLabel={`Edit tab ${index + 1} label`}
              onChange={onChange ? (label) => {
                const tabs = [...block.tabs];
                tabs[index] = { ...tab, label };
                onChange({ ...block, tabs });
              } : undefined}
            />
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
          {block.tabs[active]?.paragraphs.map((paragraph, index) => (
            <p key={index}>
              <EditableText
                value={paragraph}
                ariaLabel={`Edit tab paragraph ${index + 1}`}
                multiline
                onChange={onChange ? (value) => {
                  const tabs = [...block.tabs];
                  const paragraphs = [...tabs[active].paragraphs];
                  paragraphs[index] = value;
                  tabs[active] = { ...tabs[active], paragraphs };
                  onChange({ ...block, tabs });
                } : undefined}
              />
            </p>
          ))}
        </motion.div>
      </AnimatePresence>
      <BlockSources ids={block.citationIds} citations={citations} />
      {editable && <span className="admin-direct-edit-hint">Click any text to edit</span>}
    </section>
  );
}

function FlipCards({
  block,
  editable = false,
  onChange,
}: {
  block: FlipCardsContentBlock;
  editable?: boolean;
  onChange?: (block: CourseContentBlock) => void;
}) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <section className="rich-block">
      <h2><EditableText value={block.heading} ariaLabel="Edit section heading" onChange={onChange ? (heading) => onChange({ ...block, heading }) : undefined} /></h2>
      <div className="rich-flip-grid">
        {block.cards.map((card, index) => (
          <button
            key={`${card.front}-${index}`}
            type="button"
            className={flipped[index] ? "flipped" : ""}
            onClick={() => setFlipped((current) => ({ ...current, [index]: !current[index] }))}
          >
            <span className="rich-flip-front">
              <small>{editable ? "Click text to edit · click card to reveal" : "Tap to reveal"}</small>
              <strong>
                <EditableText
                  value={card.front}
                  ariaLabel={`Edit flip card ${index + 1} front`}
                  multiline
                  onChange={onChange ? (front) => {
                    const cards = [...block.cards];
                    cards[index] = { ...card, front };
                    onChange({ ...block, cards });
                  } : undefined}
                />
              </strong>
              <RotateCcw size={14} />
            </span>
            <span className="rich-flip-back">
              <small>Answer</small>
              <strong>
                <EditableText
                  value={card.back}
                  ariaLabel={`Edit flip card ${index + 1} back`}
                  multiline
                  onChange={onChange ? (back) => {
                    const cards = [...block.cards];
                    cards[index] = { ...card, back };
                    onChange({ ...block, cards });
                  } : undefined}
                />
              </strong>
              <RotateCcw size={14} />
            </span>
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
  editable = false,
  onChange,
}: {
  block: QuizContentBlock;
  citations: CourseCitation[];
  onProgress: (progress: QuizProgress) => void;
  editable?: boolean;
  onChange?: (block: CourseContentBlock) => void;
}) {
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const question = block.questions[active];

  function updateQuestion(patch: Partial<QuizContentBlock["questions"][number]>) {
    if (!question || !onChange) return;
    const questions = [...block.questions];
    questions[active] = { ...question, ...patch };
    onChange({ ...block, questions });
  }

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
        <div className="rich-quiz-head"><span>Knowledge check</span><h2><EditableText value={block.heading} ariaLabel="Edit quiz heading" onChange={onChange ? (heading) => onChange({ ...block, heading }) : undefined} /></h2></div>
        <p>This knowledge check has no questions yet.</p>
        <BlockSources ids={block.citationIds} citations={citations} />
      </section>
    );
  }
  return (
    <section className="rich-block rich-quiz-block">
      <div className="rich-quiz-head"><span>Knowledge check</span><h2><EditableText value={block.heading} ariaLabel="Edit quiz heading" onChange={onChange ? (heading) => onChange({ ...block, heading }) : undefined} /></h2></div>
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
          <h3><EditableText value={question.question} ariaLabel={`Edit question ${active + 1}`} multiline onChange={onChange ? (value) => updateQuestion({ question: value }) : undefined} /></h3>
          <div>
            {question.choices.map((choice, index) => {
              const correct = !editable && answered && index === question.answerIndex;
              const wrong = !editable && answered && index === selected && selected !== question.answerIndex;
              return (
                <button
                  key={`${choice}-${index}`}
                  type="button"
                  className={`${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                  disabled={!editable && answered}
                  onClick={() => { if (!editable) choose(index); }}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  <EditableText
                    value={choice}
                    ariaLabel={`Edit choice ${index + 1}`}
                    onChange={onChange ? (value) => {
                      const choices = [...question.choices];
                      choices[index] = value;
                      updateQuestion({ choices });
                    } : undefined}
                  />
                  {correct && <Check size={14} />}
                </button>
              );
            })}
          </div>
          {(answered || editable) && (
            <div className={`rich-quiz-feedback ${editable ? "" : selected === question.answerIndex ? "correct" : "wrong"}`}>
              <strong>{editable ? "Answer explanation" : selected === question.answerIndex ? "Correct" : "Not quite"}</strong>
              <p><EditableText value={question.explanation} ariaLabel="Edit answer explanation" multiline onChange={onChange ? (explanation) => updateQuestion({ explanation }) : undefined} /></p>
              {!editable && active < block.questions.length - 1 && (
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
