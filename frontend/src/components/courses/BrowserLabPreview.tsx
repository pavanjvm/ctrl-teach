import { CheckCircle2, Circle, ExternalLink, FlaskConical } from "lucide-react";

import type { BrowserLabBlueprint } from "@/lib/types";

export default function BrowserLabPreview({ browserLab }: { browserLab: BrowserLabBlueprint }) {
  return (
    <section className="rich-browser-lab admin-browser-lab-preview">
      <header className="rich-browser-lab-head">
        <span><FlaskConical size={13} /> Browser lab · Preview only</span>
        <h2>{browserLab.objective}</h2>
        <p>This authoring preview never launches the browser extension or records learner progress.</p>
      </header>

      <div className="rich-browser-lab-status">
        <div>
          <strong>{browserLab.platform || browserLab.platformId}</strong>
          <span>{browserLab.estimatedDuration || "Estimated duration not set"}</span>
        </div>
        <a href={browserLab.launchUrl} target="_blank" rel="noreferrer">
          Review destination <ExternalLink size={12} />
        </a>
      </div>

      {!!browserLab.prerequisites?.length && (
        <section className="rich-browser-lab-list">
          <span>Prerequisites</span>
          <ul>
            {browserLab.prerequisites.map((item) => (
              <li key={item}><Circle size={12} /><strong>{item}</strong></li>
            ))}
          </ul>
        </section>
      )}

      <section className="rich-browser-lab-list">
        <span>Learner task</span>
        <ol>
          {browserLab.steps.map((step) => (
            <li key={step.id}>
              <Circle size={12} />
              <div><strong>{step.instruction}</strong><small>{step.expectedEvidence}</small></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rich-browser-lab-list">
        <span>Success criteria</span>
        <ul>
          {browserLab.successCriteria.map((item) => (
            <li key={item}><CheckCircle2 size={12} /><strong>{item}</strong></li>
          ))}
        </ul>
      </section>

      <section className="rich-browser-lab-list cleanup">
        <span>Cleanup</span>
        <ol>
          {browserLab.cleanupSteps.map((step) => (
            <li key={step.id}>
              <Circle size={12} />
              <div><strong>{step.instruction}</strong><small>{step.expectedEvidence}</small></div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
