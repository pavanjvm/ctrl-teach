"use client";

import { Plus, Trash2 } from "lucide-react";

import { assetUrl } from "@/lib/generatedCourses";
import { editorId } from "@/lib/courseEditor";
import type { CourseCitation, CourseContentBlock } from "@/lib/types";

function splitParagraphs(value: string): string[] {
  return value.split(/\n\s*\n/);
}

export default function ContentBlockEditor({
  block,
  citations,
  onChange,
}: {
  block: CourseContentBlock;
  citations: CourseCitation[];
  onChange: (next: CourseContentBlock) => void;
}) {
  const update = (patch: Record<string, unknown>) => onChange({ ...block, ...patch } as CourseContentBlock);

  return (
    <div className="admin-block-inspector">
      {block.type !== "image" && (
        <label><span>Section heading</span><input value={block.heading} onChange={(event) => update({ heading: event.target.value })} /></label>
      )}

      {block.type === "content" && (
        <label><span>Paragraphs <small>Blank line starts a new paragraph</small></span><textarea rows={7} value={block.paragraphs.join("\n\n")} onChange={(event) => update({ paragraphs: splitParagraphs(event.target.value) })} /></label>
      )}

      {(block.type === "grid_cards" || block.type === "numbered_list") && (
        <EditorItems
          items={block.type === "grid_cards" ? block.cards : block.items}
          onChange={(items) => update(block.type === "grid_cards" ? { cards: items } : { items })}
        />
      )}

      {block.type === "info_tabs" && (
        <div className="admin-inspector-items">
          {block.tabs.map((tab, index) => (
            <div key={`${block.id}-${index}`}>
              <input value={tab.label} aria-label={`Tab ${index + 1} label`} onChange={(event) => {
                const tabs = [...block.tabs];
                tabs[index] = { ...tab, label: event.target.value };
                update({ tabs });
              }} />
              <textarea rows={3} value={tab.paragraphs.join("\n\n")} aria-label={`Tab ${index + 1} content`} onChange={(event) => {
                const tabs = [...block.tabs];
                tabs[index] = { ...tab, paragraphs: splitParagraphs(event.target.value) };
                update({ tabs });
              }} />
              <button type="button" onClick={() => update({ tabs: block.tabs.filter((_, position) => position !== index) })} aria-label={`Remove tab ${index + 1}`}><Trash2 size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={() => update({ tabs: [...block.tabs, { label: "New tab", paragraphs: [""] }] })}><Plus size={13} /> Add tab</button>
        </div>
      )}

      {block.type === "flip_cards" && (
        <div className="admin-inspector-items">
          {block.cards.map((card, index) => (
            <div key={`${block.id}-${index}`}>
              <input value={card.front} aria-label={`Flip card ${index + 1} front`} onChange={(event) => {
                const cards = [...block.cards];
                cards[index] = { ...card, front: event.target.value };
                update({ cards });
              }} />
              <textarea rows={2} value={card.back} aria-label={`Flip card ${index + 1} back`} onChange={(event) => {
                const cards = [...block.cards];
                cards[index] = { ...card, back: event.target.value };
                update({ cards });
              }} />
              <button type="button" onClick={() => update({ cards: block.cards.filter((_, position) => position !== index) })} aria-label={`Remove flip card ${index + 1}`}><Trash2 size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={() => update({ cards: [...block.cards, { front: "New concept", back: "" }] })}><Plus size={13} /> Add card</button>
        </div>
      )}

      {block.type === "quiz" && (
        <div className="admin-inspector-quiz">
          {block.questions.map((question, index) => (
            <fieldset key={question.id}>
              <legend>Question {index + 1}</legend>
              <input value={question.question} onChange={(event) => {
                const questions = [...block.questions];
                questions[index] = { ...question, question: event.target.value };
                update({ questions });
              }} />
              <label><span>Choices <small>One per line</small></span><textarea rows={4} value={question.choices.join("\n")} onChange={(event) => {
                const questions = [...block.questions];
                questions[index] = { ...question, choices: event.target.value.split("\n") };
                update({ questions });
              }} /></label>
              <label><span>Correct choice</span><select value={question.answerIndex} onChange={(event) => {
                const questions = [...block.questions];
                questions[index] = { ...question, answerIndex: Number(event.target.value) };
                update({ questions });
              }}>{question.choices.map((choice, choiceIndex) => <option key={choiceIndex} value={choiceIndex}>{choiceIndex + 1}. {choice || "Untitled choice"}</option>)}</select></label>
              <label><span>Explanation</span><textarea rows={2} value={question.explanation} onChange={(event) => {
                const questions = [...block.questions];
                questions[index] = { ...question, explanation: event.target.value };
                update({ questions });
              }} /></label>
              <button type="button" onClick={() => update({ questions: block.questions.filter((_, position) => position !== index) })}><Trash2 size={13} /> Remove question</button>
            </fieldset>
          ))}
          <button type="button" onClick={() => update({ questions: [...block.questions, { id: editorId("question"), question: "New question", choices: ["Choice one", "Choice two"], answerIndex: 0, explanation: "" }] })}><Plus size={13} /> Add question</button>
        </div>
      )}

      {block.type === "html" && (
        <>
          <label><span>HTML</span><textarea rows={10} value={block.html} onChange={(event) => update({ html: event.target.value })} /></label>
          <label><span>Accessibility summary</span><textarea rows={3} value={block.accessibilitySummary} onChange={(event) => update({ accessibilitySummary: event.target.value })} /></label>
          <label><span>Canvas height</span><input type="number" min={160} value={block.height} onChange={(event) => update({ height: Number(event.target.value) })} /></label>
        </>
      )}

      {block.type === "image" && (
        <div className="admin-inspector-image">
          {block.asset.url && <img src={assetUrl(block.asset.url)} alt="" />}
          <label><span>Image URL</span><input value={block.asset.url} onChange={(event) => update({ asset: { ...block.asset, url: event.target.value } })} /></label>
          <label><span>Alt text</span><input value={block.asset.alt} onChange={(event) => update({ asset: { ...block.asset, alt: event.target.value } })} /></label>
          <label><span>Caption</span><textarea rows={2} value={block.asset.caption} onChange={(event) => update({ asset: { ...block.asset, caption: event.target.value } })} /></label>
        </div>
      )}

      {!!citations.length && (
        <fieldset className="admin-citation-picker">
          <legend>Sources for this block</legend>
          {citations.map((citation) => (
            <label key={citation.id}>
              <input
                type="checkbox"
                checked={(block.citationIds ?? []).includes(citation.id)}
                onChange={(event) => update({
                  citationIds: event.target.checked
                    ? [...(block.citationIds ?? []), citation.id]
                    : (block.citationIds ?? []).filter((id) => id !== citation.id),
                })}
              />
              <span>{citation.title}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function EditorItems({
  items,
  onChange,
}: {
  items: { title: string; body: string }[];
  onChange: (items: { title: string; body: string }[]) => void;
}) {
  return (
    <div className="admin-inspector-items">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`}>
          <input value={item.title} aria-label={`Item ${index + 1} title`} onChange={(event) => {
            const next = [...items];
            next[index] = { ...item, title: event.target.value };
            onChange(next);
          }} />
          <textarea rows={2} value={item.body} aria-label={`Item ${index + 1} body`} onChange={(event) => {
            const next = [...items];
            next[index] = { ...item, body: event.target.value };
            onChange(next);
          }} />
          <button type="button" onClick={() => onChange(items.filter((_, position) => position !== index))} aria-label={`Remove item ${index + 1}`}><Trash2 size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { title: "New item", body: "" }])}><Plus size={13} /> Add item</button>
    </div>
  );
}
