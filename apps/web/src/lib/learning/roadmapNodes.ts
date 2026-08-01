import type { LearningRoadmap, RoadmapTopic } from "@/lib/learning/roadmaps";

export interface RoadmapDisplayNode {
  id: string;
  title: string;
  description: string;
  kind: "primary" | "supporting";
  topic: RoadmapTopic;
}

const TERM_LABELS: Record<string, string> = {
  ai: "Artificial Intelligence",
  api: "API Design",
  aria: "ARIA",
  aws: "AWS",
  azure: "Azure",
  ba: "Business Analysis",
  bpmn: "BPMN",
  codeql: "CodeQL",
  "ci/cd": "CI/CD",
  dns: "DNS",
  dom: "DOM",
  css: "CSS",
  html: "HTML",
  http: "HTTP",
  https: "HTTPS",
  json: "JSON",
  jwt: "JWT",
  github: "GitHub",
  "github actions": "GitHub Actions",
  "github advanced security": "GitHub Advanced Security",
  "github enterprise cloud": "GitHub Enterprise Cloud",
  "github enterprise server": "GitHub Enterprise Server",
  kubernetes: "Kubernetes",
  llm: "Large Language Models",
  nosql: "NoSQL",
  npm: "npm",
  oauth: "OAuth",
  oidc: "OIDC",
  openai: "OpenAI",
  owasp: "OWASP",
  rag: "Retrieval-Augmented Generation",
  redis: "Redis",
  rest: "REST",
  "saml sso": "SAML SSO",
  scim: "SCIM",
  sql: "SQL",
  sre: "Site Reliability Engineering",
  wcag: "WCAG",
  wip: "Work in Progress Limits",
};

export function formatRoadmapTerm(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  const known = TERM_LABELS[normalized];
  if (known) return known;
  return value
    .split(/([\s/-]+)/)
    .map((part) => /^[\s/-]+$/.test(part)
      ? part
      : `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join("");
}

export function roadmapNodeProgressId(
  roadmapId: string,
  topicId: string,
  supportingIndex?: number,
): string {
  return supportingIndex === undefined
    ? `${roadmapId}:${topicId}`
    : `${roadmapId}:${topicId}:supporting:${supportingIndex}`;
}

export function getTopicDisplayNodes(
  roadmap: LearningRoadmap,
  topic: RoadmapTopic,
): RoadmapDisplayNode[] {
  const primary: RoadmapDisplayNode = {
    id: roadmapNodeProgressId(roadmap.id, topic.id),
    title: topic.title,
    description: topic.description,
    kind: "primary",
    topic,
  };
  const supporting = topic.keywords.map<RoadmapDisplayNode>((keyword, index) => ({
    id: roadmapNodeProgressId(roadmap.id, topic.id, index),
    title: formatRoadmapTerm(keyword),
    description: `Build practical fluency with ${formatRoadmapTerm(keyword)} as part of ${topic.title}.`,
    kind: "supporting",
    topic,
  }));
  return [primary, ...supporting];
}

export function getRoadmapDisplayNodes(roadmap: LearningRoadmap): RoadmapDisplayNode[] {
  return roadmap.stages.flatMap((stage) => (
    stage.topics.flatMap((topic) => getTopicDisplayNodes(roadmap, topic))
  ));
}
