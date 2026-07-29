import type { SkillLevel } from "@/lib/types";

export interface RoadmapCourseHint {
  courseIds: string[];
  keywords: string[];
}

export interface RoadmapTopic extends RoadmapCourseHint {
  id: string;
  title: string;
  description: string;
  bootcampIds: string[];
  optional?: boolean;
}

export interface RoadmapStage {
  id: string;
  label: string;
  description: string;
  topics: RoadmapTopic[];
}

export interface LearningRoadmap {
  id: string;
  eyebrow: string;
  title: string;
  shortTitle: string;
  description: string;
  audience: string;
  duration: string;
  aliases?: string[];
  experienceLevels?: SkillLevel[];
  accent: string;
  softAccent: string;
  courseIds: string[];
  stages: RoadmapStage[];
  reference?: {
    label: string;
    url: string;
  };
}

export interface CprimeBootcamp {
  id: string;
  title: string;
  description: string;
  duration: string;
  format: string;
  url: string;
}

function boundedText(value: unknown, fallback: string, limit: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, limit)
    : fallback.slice(0, limit);
}

function stringList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, limit)
    : [];
}

/** Keep locally/remote persisted AI roadmaps bounded and safe to render. */
export function sanitizeCustomRoadmaps(value: unknown): LearningRoadmap[] {
  if (!Array.isArray(value)) return [];
  const roadmaps: LearningRoadmap[] = [];
  const seen = new Set<string>();
  for (const candidate of value.slice(0, 12)) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    const id = boundedText(raw.id, "", 96);
    if (!/^custom-[a-z0-9-]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const rawStages = Array.isArray(raw.stages) ? raw.stages.slice(0, 5) : [];
    const stages: RoadmapStage[] = rawStages.flatMap((stageCandidate, stageIndex) => {
      if (!stageCandidate || typeof stageCandidate !== "object") return [];
      const stage = stageCandidate as Record<string, unknown>;
      const rawTopics = Array.isArray(stage.topics) ? stage.topics.slice(0, 4) : [];
      const topics: RoadmapTopic[] = rawTopics.flatMap((topicCandidate, topicIndex) => {
        if (!topicCandidate || typeof topicCandidate !== "object") return [];
        const rawTopic = topicCandidate as Record<string, unknown>;
        const title = boundedText(rawTopic.title, "", 80);
        const description = boundedText(rawTopic.description, "", 280);
        if (!title || !description) return [];
        return [{
          id: `${id}-s${stageIndex + 1}-t${topicIndex + 1}`,
          title,
          description,
          keywords: stringList(rawTopic.keywords, 4).map((item) => item.slice(0, 48)),
          courseIds: stringList(rawTopic.courseIds, 6),
          bootcampIds: stringList(rawTopic.bootcampIds, 4),
          optional: Boolean(rawTopic.optional),
        }];
      });
      if (topics.length < 2) return [];
      return [{
        id: `${id}-stage-${stageIndex + 1}`,
        label: boundedText(stage.label, `${String(stageIndex + 1).padStart(2, "0")} · Stage`, 72),
        description: boundedText(stage.description, "Build capability through focused practice.", 180),
        topics,
      }];
    });
    if (stages.length < 3) continue;
    const title = boundedText(raw.title, "Custom roadmap", 80);
    roadmaps.push({
      id,
      eyebrow: boundedText(raw.eyebrow, "Generated for your goal", 72),
      title,
      shortTitle: boundedText(raw.shortTitle, title, 32),
      description: boundedText(raw.description, `A personalized learning roadmap for ${title}.`, 420),
      audience: boundedText(raw.audience, "Learners building a new capability", 180),
      duration: boundedText(raw.duration, "8–12 weeks", 40),
      accent: typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : "#7c3aed",
      softAccent: typeof raw.softAccent === "string" && /^#[0-9a-f]{6}$/i.test(raw.softAccent) ? raw.softAccent : "#f5f3ff",
      courseIds: stringList(raw.courseIds, 6),
      stages,
    });
  }
  return roadmaps;
}

function topic(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  courseIds: string[],
  bootcampIds: string[],
  optional = false,
): RoadmapTopic {
  return { id, title, description, keywords, courseIds, bootcampIds, optional };
}

export const CPRIME_BOOTCAMPS: Record<string, CprimeBootcamp> = {
  "ai-implementation": {
    id: "ai-implementation",
    title: "Artificial Intelligence Implementation Boot Camp",
    description: "Turn AI opportunities into practical use cases, adoption plans, and implementation decisions.",
    duration: "7 hours",
    format: "Live online",
    url: "https://www.cprime.com/learning/courses/artificial-intelligence-implementation-boot-camp/",
  },
  "product-owner": {
    id: "product-owner",
    title: "Professional Scrum Product Owner",
    description: "Build product ownership, value delivery, backlog, release, and product-management capability.",
    duration: "2 days",
    format: "Live online",
    url: "https://www.cprime.com/learning/courses/professional-scrum-product-owner/",
  },
  "agile-fundamentals": {
    id: "agile-fundamentals",
    title: "Agile Boot Camp: ICAgile Fundamentals",
    description: "Learn the principles, planning levels, team practices, and mindset behind modern agile delivery.",
    duration: "2 days",
    format: "Live online",
    url: "https://www.cprime.com/learning/courses/agile-boot-camp-icp-fundamentals-certification/",
  },
  "data-analysis": {
    id: "data-analysis",
    title: "Data Analysis Boot Camp",
    description: "Practice data quality, statistics, visualization, and decision-making with hands-on exercises.",
    duration: "3 days",
    format: "Live online",
    url: "https://www.cprime.com/learning/courses/data-analysis-boot-camp/",
  },
  "power-bi": {
    id: "power-bi",
    title: "Microsoft Power BI Boot Camp",
    description: "Build business-intelligence reports and dashboards that make complex data easier to act on.",
    duration: "Instructor-led",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/microsoft-power-bi-boot-camp/",
  },
  "business-analysis": {
    id: "business-analysis",
    title: "Business Analyst Boot Camp",
    description: "Develop requirements, elicitation, modeling, stakeholder, and solution-analysis skills.",
    duration: "4 days",
    format: "Live online",
    url: "https://www.cprime.com/learning/courses/business-analyst-boot-camp/",
  },
  "devops-implementation": {
    id: "devops-implementation",
    title: "DevOps Implementation Boot Camp",
    description: "Connect DevOps culture with CI/CD, cloud, infrastructure automation, operations, and flow.",
    duration: "3 days",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/devops-implementation-boot-camp-icp-fdo/",
  },
  "cloud-strategy": {
    id: "cloud-strategy",
    title: "Cloud Strategy Boot Camp",
    description: "Create a cloud strategy grounded in business outcomes, governance, readiness, and migration planning.",
    duration: "2 days",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/cloud-strategy-boot-camp/",
  },
  "responsive-web-design": {
    id: "responsive-web-design",
    title: "UX & Responsive Design for Web Developers",
    description: "Apply responsive layouts, accessibility, UX principles, and design handoff practices to production web interfaces.",
    duration: "Instructor-led",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/user-experience-ux-design-responsive-design-for-experienced-web-developers/",
  },
  "secure-application-development": {
    id: "secure-application-development",
    title: "Fundamentals of Secure Application Development",
    description: "Build secure coding, threat modeling, input validation, authentication, and application-testing habits.",
    duration: "Instructor-led",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/fundamentals-of-secure-application-development/",
  },
  "microservices-engineering": {
    id: "microservices-engineering",
    title: "Microservices Engineering Boot Camp",
    description: "Practice the architecture, engineering tools, containers, APIs, and operational patterns behind microservices.",
    duration: "Boot camp",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/microservices-engineering-boot-camp/",
  },
  "cybersecurity-developers": {
    id: "cybersecurity-developers",
    title: "Cybersecurity for Developers",
    description: "Protect applications through secure design, authorization, encryption, review, and automated security testing.",
    duration: "Instructor-led",
    format: "Cprime Learning",
    url: "https://www.cprime.com/learning/courses/cybersecurity-for-developers/",
  },
};

export const LEARNING_ROADMAPS: LearningRoadmap[] = [
  {
    id: "frontend-developer",
    eyebrow: "Build experiences for the web",
    title: "Frontend Developer",
    shortTitle: "Frontend",
    description: "Learn the browser platform from semantic HTML and modern CSS through JavaScript, React, testing, accessibility, and production performance.",
    audience: "New developers, UI engineers, full-stack developers",
    duration: "14–18 weeks",
    aliases: ["web developer", "frontend engineer", "ui engineer"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#2563eb",
    softAccent: "#eff6ff",
    courseIds: ["web-frontend", "ux-research", "sd-fundamentals"],
    reference: {
      label: "Taxonomy informed by the roadmap.sh Frontend Developer roadmap",
      url: "https://roadmap.sh/frontend",
    },
    stages: [
      {
        id: "web-foundations",
        label: "01 · Web foundations",
        description: "Understand how browsers request and render the web.",
        topics: [
          topic("frontend-internet", "How the web works", "Follow a request from a URL through DNS and HTTP to the browser response.", ["internet", "dns", "http", "browsers"], ["web-frontend", "sd-fundamentals"], ["responsive-web-design"]),
          topic("frontend-html", "Semantic HTML", "Structure pages with meaningful elements, forms, metadata, and accessible document landmarks.", ["html", "semantic markup", "forms", "seo"], ["web-frontend"], ["responsive-web-design"]),
          topic("frontend-accessibility", "Accessibility foundations", "Build keyboard-friendly interfaces with useful focus, labels, contrast, and assistive-technology semantics.", ["accessibility", "wcag", "aria", "keyboard navigation"], ["web-frontend", "ux-research"], ["responsive-web-design"]),
        ],
      },
      {
        id: "frontend-styling",
        label: "02 · Styling & layout",
        description: "Turn sound structure into adaptable interfaces.",
        topics: [
          topic("frontend-css", "CSS fundamentals", "Use the cascade, selectors, inheritance, sizing, color, typography, and the box model deliberately.", ["css", "cascade", "box model", "typography"], ["web-frontend"], ["responsive-web-design"]),
          topic("frontend-layout", "Modern page layout", "Compose robust layouts with Flexbox, Grid, positioning, spacing systems, and intrinsic sizing.", ["flexbox", "css grid", "positioning", "responsive design"], ["web-frontend"], ["responsive-web-design"]),
          topic("frontend-design-systems", "Reusable UI systems", "Create tokens, components, states, documentation, and theming that stay consistent as a product grows.", ["design systems", "css modules", "component libraries", "theming"], ["web-frontend", "ux-research"], ["responsive-web-design"], true),
        ],
      },
      {
        id: "frontend-javascript",
        label: "03 · JavaScript",
        description: "Make the interface dynamic and data-aware.",
        topics: [
          topic("frontend-js-language", "JavaScript language", "Work confidently with values, functions, objects, modules, errors, and asynchronous control flow.", ["javascript", "functions", "modules", "async await"], ["web-frontend"], ["responsive-web-design"]),
          topic("frontend-dom", "DOM & browser APIs", "Respond to user events, update the document safely, persist state, and use native browser capabilities.", ["dom", "events", "web storage", "browser apis"], ["web-frontend"], ["responsive-web-design"]),
          topic("frontend-networking", "APIs & data fetching", "Consume HTTP services with Fetch, handle failures, validate data, and model loading states.", ["rest apis", "fetch", "json", "error handling"], ["web-frontend", "sd-fundamentals"], ["secure-application-development"]),
        ],
      },
      {
        id: "frontend-applications",
        label: "04 · Modern applications",
        description: "Build maintainable applications with a team-ready workflow.",
        topics: [
          topic("frontend-tooling", "Developer workflow", "Use Git, package managers, formatting, linting, bundlers, and environment configuration.", ["git", "npm", "build tools", "linting"], ["web-frontend", "sd-fundamentals"], ["responsive-web-design"]),
          topic("frontend-typescript", "TypeScript", "Add useful types to application state, component boundaries, APIs, and reusable utilities.", ["typescript", "type safety", "generics", "api types"], ["web-frontend"], ["responsive-web-design"]),
          topic("frontend-framework", "React application development", "Compose interfaces with components, routing, state, server rendering, and predictable data flow.", ["react", "components", "state management", "next.js"], ["web-frontend"], ["responsive-web-design"]),
        ],
      },
      {
        id: "frontend-production",
        label: "05 · Production quality",
        description: "Verify, protect, optimize, and ship the experience.",
        topics: [
          topic("frontend-testing", "Frontend testing", "Combine unit, component, integration, and end-to-end tests around real user behavior.", ["unit testing", "component testing", "end-to-end testing", "debugging"], ["web-frontend"], ["secure-application-development"]),
          topic("frontend-performance", "Web performance", "Improve loading, rendering, assets, caching, Core Web Vitals, and runtime responsiveness.", ["web performance", "core web vitals", "caching", "code splitting"], ["web-frontend", "sd-fundamentals"], ["responsive-web-design"]),
          topic("frontend-security-deploy", "Security & deployment", "Protect browser applications, manage configuration, automate checks, and deploy with safe rollback paths.", ["web security", "https", "ci/cd", "deployment"], ["web-frontend", "sd-fundamentals"], ["secure-application-development"]),
        ],
      },
    ],
  },
  {
    id: "backend-developer",
    eyebrow: "Build systems behind the interface",
    title: "Backend Developer",
    shortTitle: "Backend",
    description: "Build secure server applications from HTTP and language fundamentals through databases, APIs, architecture, observability, and scale.",
    audience: "New developers, API engineers, full-stack developers",
    duration: "16–20 weeks",
    aliases: ["backend engineer", "api engineer", "server-side developer"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#0f766e",
    softAccent: "#f0fdfa",
    courseIds: ["web-backend", "py-python", "sd-fundamentals"],
    reference: {
      label: "Taxonomy informed by the roadmap.sh Backend Developer roadmap",
      url: "https://roadmap.sh/backend",
    },
    stages: [
      {
        id: "backend-foundations",
        label: "01 · Backend foundations",
        description: "Learn the runtime, protocol, and workflow beneath an API.",
        topics: [
          topic("backend-internet", "Internet & HTTP", "Understand DNS, HTTP messages, TLS, proxies, ports, cookies, and the request lifecycle.", ["internet", "dns", "http", "https"], ["web-backend", "sd-fundamentals"], ["secure-application-development"]),
          topic("backend-language", "Server-side programming", "Build fluency in one backend language with functions, types, concurrency, errors, and package management.", ["python", "data structures", "error handling", "concurrency"], ["web-backend", "py-python"], ["microservices-engineering"]),
          topic("backend-workflow", "Git, terminal & Linux", "Navigate the shell, manage processes and permissions, and collaborate safely through version control.", ["git", "linux", "shell", "processes"], ["web-backend", "py-python"], ["microservices-engineering"]),
        ],
      },
      {
        id: "backend-data",
        label: "02 · Data persistence",
        description: "Store, query, and protect application data.",
        topics: [
          topic("backend-relational", "Relational databases", "Model data, write SQL, enforce constraints, use transactions, and evolve schemas safely.", ["sql", "data modeling", "transactions", "migrations"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
          topic("backend-database-performance", "Database performance", "Use indexes, query plans, connection pools, replication, and partitioning based on measured needs.", ["database indexes", "query optimization", "replication", "connection pooling"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
          topic("backend-nosql-cache", "NoSQL & caching", "Choose document, key-value, and cache technologies according to access patterns and consistency needs.", ["nosql", "redis", "caching", "consistency"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"], true),
        ],
      },
      {
        id: "backend-apis",
        label: "03 · APIs & security",
        description: "Expose useful capabilities without exposing the system.",
        topics: [
          topic("backend-rest", "REST API design", "Design resources, status codes, pagination, validation, errors, and documented HTTP contracts.", ["rest", "openapi", "pagination", "api versioning"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
          topic("backend-auth", "Authentication & authorization", "Implement sessions or tokens, identity flows, roles, permissions, and secure credential handling.", ["authentication", "authorization", "oauth", "jwt"], ["web-backend", "sd-fundamentals"], ["secure-application-development", "cybersecurity-developers"]),
          topic("backend-api-security", "Application security", "Validate input, manage secrets, limit abuse, encrypt data, and defend common web attack paths.", ["owasp", "rate limiting", "secrets", "encryption"], ["web-backend", "sd-fundamentals"], ["secure-application-development", "cybersecurity-developers"]),
        ],
      },
      {
        id: "backend-architecture",
        label: "04 · Architecture",
        description: "Organize backend code and communication as complexity grows.",
        topics: [
          topic("backend-design", "Application architecture", "Separate concerns using modules, services, dependency boundaries, and maintainable design principles.", ["design patterns", "solid principles", "dependency injection", "domain modeling"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
          topic("backend-async", "Asynchronous systems", "Move work through queues, background jobs, scheduled tasks, events, and idempotent consumers.", ["message brokers", "background jobs", "event driven", "idempotency"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
          topic("backend-services", "Services & containers", "Package services, define boundaries, use service discovery, and understand microservice trade-offs.", ["docker", "microservices", "service discovery", "api gateway"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"], true),
        ],
      },
      {
        id: "backend-production",
        label: "05 · Production systems",
        description: "Prove reliability and operate the service with confidence.",
        topics: [
          topic("backend-testing", "Backend testing", "Use unit, integration, contract, load, and security tests to protect behavior and service boundaries.", ["unit testing", "integration testing", "contract testing", "load testing"], ["web-backend", "sd-fundamentals"], ["secure-application-development"]),
          topic("backend-observability", "Observability & operations", "Instrument logs, metrics, and traces; define health checks and respond effectively to incidents.", ["logging", "metrics", "distributed tracing", "incident response"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
          topic("backend-scale", "Delivery & scalability", "Automate delivery and scale services with load balancing, horizontal capacity, resilience, and safe releases.", ["ci/cd", "load balancing", "scalability", "resilience"], ["web-backend", "sd-fundamentals"], ["microservices-engineering"]),
        ],
      },
    ],
  },
  {
    id: "ai-agentic-engineer",
    eyebrow: "Build intelligent products",
    title: "AI & Agentic Engineering",
    shortTitle: "AI Engineering",
    description: "Go from AI fundamentals to reliable agents that use tools, retrieve knowledge, and can be evaluated in production.",
    audience: "Developers, architects, technical product builders",
    duration: "10–12 weeks",
    aliases: ["ai engineer", "agent engineer", "machine learning engineer"],
    experienceLevels: ["Intermediate", "Advanced"],
    accent: "#4f46e5",
    softAccent: "#eef2ff",
    courseIds: ["ai-eng", "py-python", "sd-fundamentals"],
    stages: [
      {
        id: "foundations",
        label: "01 · Foundations",
        description: "Learn the language and building blocks.",
        topics: [
          topic("ai-foundations", "AI & ML foundations", "Understand models, training, inference, capabilities, and common enterprise use cases.", ["ai", "machine learning", "models", "inference"], ["ai-eng"], ["ai-implementation"]),
          topic("python-apis", "Python & APIs", "Use Python, HTTP APIs, JSON, authentication, and asynchronous application patterns.", ["python", "api", "json", "http"], ["py-python"], ["ai-implementation"]),
          topic("prompt-engineering", "Prompt engineering", "Design clear instructions, context, examples, and structured responses for repeatable outcomes.", ["prompt", "llm", "structured outputs"], ["ai-eng"], ["ai-implementation"]),
        ],
      },
      {
        id: "build",
        label: "02 · Build",
        description: "Create useful AI systems, not demos.",
        topics: [
          topic("llm-apis", "LLM APIs", "Work with model APIs, streaming, state, tool schemas, and multimodal inputs.", ["llm", "openai", "api", "streaming"], ["ai-eng"], ["ai-implementation"]),
          topic("rag", "RAG & vector search", "Ground responses in private knowledge with chunking, embeddings, retrieval, and citations.", ["rag", "retrieval", "embeddings", "vector"], ["ai-eng", "sd-fundamentals"], ["ai-implementation"]),
          topic("agents", "Tool use & agents", "Build agents that plan, call tools, manage state, and complete bounded workflows.", ["agents", "tool use", "workflows", "openai"], ["ai-eng"], ["ai-implementation"]),
        ],
      },
      {
        id: "production",
        label: "03 · Production",
        description: "Make quality observable and dependable.",
        topics: [
          topic("evals", "Evals & guardrails", "Measure quality, test regressions, design safety boundaries, and handle failure paths.", ["evals", "guardrails", "testing", "safety"], ["ai-eng"], ["ai-implementation"]),
          topic("ai-capstone", "Ship an AI copilot", "Combine retrieval, tools, evaluations, monitoring, and human handoff in a portfolio project.", ["agents", "copilot", "production", "observability"], ["ai-eng", "sd-fundamentals"], ["ai-implementation"]),
        ],
      },
    ],
  },
  {
    id: "product-manager",
    eyebrow: "Turn problems into outcomes",
    title: "Product Management",
    shortTitle: "Product",
    description: "Learn discovery, strategy, roadmapping, analytics, and delivery—the complete loop from customer problem to measurable value.",
    audience: "New PMs, product owners, founders, business leads",
    duration: "8–10 weeks",
    aliases: ["product manager", "product owner", "product lead"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#d97706",
    softAccent: "#fff7ed",
    courseIds: ["pm-user-stories", "ux-research", "sc-scrum"],
    stages: [
      {
        id: "discover",
        label: "01 · Discover",
        description: "Start with people and problems.",
        topics: [
          topic("product-foundations", "Product foundations", "Understand the product role, value, outcomes, and the difference between product and project work.", ["product management", "outcomes", "value"], ["pm-user-stories"], ["product-owner"]),
          topic("customer-discovery", "Customer discovery", "Plan interviews, identify needs, synthesize evidence, and avoid leading research.", ["customer discovery", "user research", "interviews"], ["ux-research"], ["product-owner"]),
          topic("problem-framing", "Problem framing", "Turn observations into clear opportunity statements, assumptions, and testable hypotheses.", ["problem framing", "hypotheses", "discovery"], ["ux-research", "pm-user-stories"], ["product-owner"]),
        ],
      },
      {
        id: "decide",
        label: "02 · Decide",
        description: "Choose where the product should go.",
        topics: [
          topic("product-strategy", "Product strategy", "Connect vision, positioning, business goals, and a coherent set of product choices.", ["product strategy", "vision", "positioning"], ["pm-user-stories"], ["product-owner"]),
          topic("roadmapping", "Roadmaps & prioritization", "Build outcome-oriented roadmaps and use evidence to make trade-offs visible.", ["roadmap", "prioritization", "backlog"], ["pm-user-stories"], ["product-owner"]),
          topic("product-analytics", "Product analytics", "Define success metrics, read funnels and cohorts, and connect usage signals to decisions.", ["product analytics", "metrics", "experiments"], ["ux-research"], ["product-owner"]),
        ],
      },
      {
        id: "deliver",
        label: "03 · Deliver",
        description: "Align teams around valuable outcomes.",
        topics: [
          topic("product-ownership", "Agile product ownership", "Shape user stories, acceptance criteria, backlogs, releases, and feedback loops.", ["product owner", "user stories", "acceptance criteria", "backlog"], ["pm-user-stories", "sc-scrum"], ["product-owner"]),
          topic("stakeholder-storytelling", "Stakeholder storytelling", "Communicate product bets, trade-offs, evidence, and progress to different audiences.", ["stakeholders", "storytelling", "leadership"], ["pm-user-stories"], ["product-owner"]),
        ],
      },
    ],
  },
  {
    id: "agile-delivery",
    eyebrow: "Help teams deliver better",
    title: "Agile Delivery & Scrum",
    shortTitle: "Agile & Scrum",
    description: "Build practical agility from mindset and team flow through facilitation, metrics, coaching, and organization-scale delivery.",
    audience: "Scrum masters, delivery leads, project managers",
    duration: "6–8 weeks",
    aliases: ["scrum master", "agile coach", "delivery lead"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#059669",
    softAccent: "#ecfdf5",
    courseIds: ["sc-scrum", "pm-user-stories"],
    stages: [
      {
        id: "principles",
        label: "01 · Principles",
        description: "Understand how agile work behaves.",
        topics: [
          topic("agile-mindset", "Agile mindset", "Use empiricism, feedback, small batches, and customer value to guide decisions.", ["agile", "empiricism", "flow"], ["sc-scrum"], ["agile-fundamentals"]),
          topic("scrum-framework", "Scrum framework", "Learn accountabilities, events, artifacts, commitments, and how the system fits together.", ["scrum", "sprint", "retrospective"], ["sc-scrum"], ["agile-fundamentals"]),
          topic("kanban-flow", "Kanban & flow", "Visualize work, limit work in progress, manage flow, and improve predictability.", ["kanban", "flow", "wip"], ["sc-scrum"], ["agile-fundamentals"]),
        ],
      },
      {
        id: "practice",
        label: "02 · Team practice",
        description: "Make the day-to-day system work.",
        topics: [
          topic("agile-backlog", "Backlogs & user stories", "Refine valuable slices of work with shared understanding and testable acceptance criteria.", ["backlog", "user stories", "acceptance criteria"], ["pm-user-stories"], ["agile-fundamentals"]),
          topic("planning-estimation", "Planning & estimation", "Forecast with uncertainty, plan at multiple horizons, and avoid false precision.", ["planning", "estimation", "forecasting"], ["sc-scrum"], ["agile-fundamentals"]),
          topic("facilitation", "Facilitation & coaching", "Create productive workshops, handle conflict, and help teams solve their own problems.", ["facilitation", "coaching", "retrospective"], ["sc-scrum"], ["agile-fundamentals"]),
        ],
      },
      {
        id: "improve",
        label: "03 · Improve",
        description: "Turn delivery evidence into change.",
        topics: [
          topic("agile-metrics", "Metrics & improvement", "Use cycle time, throughput, quality, and outcome signals to improve the system.", ["agile metrics", "cycle time", "throughput"], ["sc-scrum"], ["agile-fundamentals"]),
          topic("scaling-agility", "Scaling agility", "Coordinate multiple teams while preserving flow, learning, and local ownership.", ["scaling agile", "portfolio", "coordination"], ["sc-scrum"], ["agile-fundamentals"], true),
        ],
      },
    ],
  },
  {
    id: "data-analyst",
    eyebrow: "Turn data into decisions",
    title: "Data Analytics",
    shortTitle: "Data Analytics",
    description: "Develop the practical toolkit to clean, query, analyze, visualize, and communicate data with confidence.",
    audience: "Analysts, operators, managers, career switchers",
    duration: "10–12 weeks",
    aliases: ["data analyst", "business intelligence analyst", "bi analyst"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#0284c7",
    softAccent: "#f0f9ff",
    courseIds: ["py-python", "sd-fundamentals"],
    stages: [
      {
        id: "data-basics",
        label: "01 · Foundations",
        description: "Build fluency with data and tools.",
        topics: [
          topic("data-literacy", "Data literacy", "Understand data types, quality, bias, business questions, and responsible interpretation.", ["data", "data quality", "analytics"], ["py-python"], ["data-analysis"]),
          topic("spreadsheets", "Spreadsheet analysis", "Clean, transform, summarize, and explore data with formulas, pivots, and lookups.", ["excel", "spreadsheets", "pivot"], ["py-python"], ["data-analysis"]),
          topic("sql", "SQL foundations", "Query relational data with filters, joins, aggregations, subqueries, and window functions.", ["sql", "database", "queries"], ["sd-fundamentals"], ["data-analysis"]),
        ],
      },
      {
        id: "analyze",
        label: "02 · Analyze",
        description: "Find patterns that answer real questions.",
        topics: [
          topic("statistics", "Practical statistics", "Use distributions, confidence, sampling, correlation, and hypothesis tests appropriately.", ["statistics", "hypothesis", "sampling"], ["py-python"], ["data-analysis"]),
          topic("visualization", "Data visualization", "Choose honest charts, reduce noise, and direct attention to the important signal.", ["data visualization", "charts", "dashboards"], ["py-python"], ["data-analysis", "power-bi"]),
          topic("bi-dashboards", "BI & dashboards", "Model metrics and build useful dashboards with clear definitions and interaction patterns.", ["power bi", "business intelligence", "dashboards"], ["py-python"], ["power-bi"]),
        ],
      },
      {
        id: "communicate",
        label: "03 · Apply",
        description: "Make analysis useful to the business.",
        topics: [
          topic("python-analysis", "Python for analysis", "Use Python data structures and analysis workflows to automate repeatable work.", ["python", "pandas", "analysis"], ["py-python"], ["data-analysis"]),
          topic("data-storytelling", "Data storytelling", "Frame recommendations, communicate uncertainty, and guide a decision with evidence.", ["data storytelling", "decision making", "stakeholders"], ["py-python"], ["data-analysis"]),
        ],
      },
    ],
  },
  {
    id: "business-analyst",
    eyebrow: "Make the right change clear",
    title: "Business Analysis",
    shortTitle: "Business Analysis",
    description: "Learn to frame business needs, discover requirements, model processes, and validate that solutions deliver the intended value.",
    audience: "Business analysts, systems analysts, project leads",
    duration: "8–10 weeks",
    aliases: ["business analyst", "requirements analyst", "systems analyst"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#be185d",
    softAccent: "#fdf2f8",
    courseIds: ["pm-user-stories", "ux-research"],
    stages: [
      {
        id: "frame",
        label: "01 · Frame",
        description: "Understand the situation before the solution.",
        topics: [
          topic("ba-foundations", "BA foundations", "Understand the analyst role, competencies, domains, lifecycles, and value to the organization.", ["business analysis", "ba", "requirements"], ["pm-user-stories"], ["business-analysis"]),
          topic("stakeholder-analysis", "Stakeholder analysis", "Identify stakeholders, influence, needs, communication preferences, and engagement risks.", ["stakeholders", "communication", "analysis"], ["ux-research"], ["business-analysis"]),
          topic("scope-problem", "Problem & scope", "Define the current state, root causes, desired outcomes, boundaries, and assumptions.", ["problem analysis", "scope", "root cause"], ["pm-user-stories"], ["business-analysis"]),
        ],
      },
      {
        id: "discover-ba",
        label: "02 · Discover",
        description: "Turn conversations into shared understanding.",
        topics: [
          topic("elicitation", "Requirements elicitation", "Plan and run interviews, workshops, observation, document analysis, and collaborative discovery.", ["requirements elicitation", "interviews", "workshops"], ["ux-research", "pm-user-stories"], ["business-analysis"]),
          topic("process-modeling", "Process modeling", "Map current and future processes, decisions, handoffs, exceptions, and improvement opportunities.", ["process modeling", "bpmn", "workflows"], ["pm-user-stories"], ["business-analysis"]),
          topic("stories-use-cases", "Stories & use cases", "Express needs through user stories, scenarios, use cases, and clear acceptance criteria.", ["user stories", "use cases", "acceptance criteria"], ["pm-user-stories"], ["business-analysis"]),
        ],
      },
      {
        id: "validate",
        label: "03 · Validate",
        description: "Keep requirements and outcomes aligned.",
        topics: [
          topic("requirements-validation", "Requirements validation", "Check quality, traceability, feasibility, testability, priority, and stakeholder agreement.", ["requirements validation", "traceability", "quality"], ["pm-user-stories"], ["business-analysis"]),
          topic("solution-evaluation", "Solution evaluation", "Assess performance, identify limitations, and recommend changes based on business value.", ["solution evaluation", "business value", "outcomes"], ["pm-user-stories"], ["business-analysis"]),
        ],
      },
    ],
  },
  {
    id: "devops-cloud",
    eyebrow: "Design reliable cloud systems",
    title: "Cloud Architect",
    shortTitle: "Cloud Architect",
    description: "Design secure, scalable cloud systems through infrastructure foundations, automation, observability, reliability, cost, and governance.",
    audience: "Software engineers, DevOps engineers, platform engineers, solution architects",
    duration: "10–12 weeks",
    aliases: ["cloud architect", "cloud engineer", "solutions architect", "devops engineer", "platform engineer"],
    experienceLevels: ["Beginner", "Intermediate", "Advanced"],
    accent: "#7c3aed",
    softAccent: "#f5f3ff",
    courseIds: ["sd-fundamentals", "py-python"],
    stages: [
      {
        id: "systems",
        label: "01 · Systems",
        description: "Understand the platform beneath the pipeline.",
        topics: [
          topic("linux-networking", "Linux & networking", "Learn processes, permissions, shell workflows, DNS, HTTP, ports, and basic troubleshooting.", ["linux", "networking", "http", "dns"], ["sd-fundamentals"], ["devops-implementation"]),
          topic("git", "Git & version control", "Work confidently with commits, branches, merges, pull requests, and collaborative workflows.", ["git", "github", "version control"], ["py-python"], ["devops-implementation"]),
          topic("cloud-foundations", "Cloud foundations", "Understand cloud service models, regions, identity, networking, compute, storage, and cost.", ["cloud", "aws", "azure", "infrastructure"], ["sd-fundamentals"], ["cloud-strategy"]),
        ],
      },
      {
        id: "automate",
        label: "02 · Automate",
        description: "Make delivery repeatable and safe.",
        topics: [
          topic("cicd", "CI/CD pipelines", "Automate build, test, security checks, deployments, releases, and recovery.", ["ci/cd", "pipelines", "automation", "deployment"], ["sd-fundamentals"], ["devops-implementation"]),
          topic("containers", "Containers & Kubernetes", "Package workloads, manage images, orchestrate services, and reason about cluster primitives.", ["docker", "kubernetes", "containers"], ["sd-fundamentals"], ["devops-implementation"]),
          topic("infrastructure-code", "Infrastructure as code", "Provision repeatable environments, manage state, review changes, and control configuration drift.", ["terraform", "infrastructure as code", "automation"], ["sd-fundamentals"], ["devops-implementation", "cloud-strategy"]),
        ],
      },
      {
        id: "operate",
        label: "03 · Operate",
        description: "Build systems that explain and defend themselves.",
        topics: [
          topic("observability-sre", "Observability & SRE", "Use metrics, logs, traces, SLOs, incident response, and learning reviews to improve reliability.", ["observability", "sre", "monitoring", "reliability"], ["sd-fundamentals"], ["devops-implementation"]),
          topic("devsecops", "DevSecOps", "Integrate threat modeling, secrets, dependency controls, policy, and secure delivery practices.", ["devsecops", "security", "secrets", "supply chain"], ["sd-fundamentals"], ["devops-implementation"]),
        ],
      },
    ],
  },
];

export const ROADMAP_TOPIC_COUNT = LEARNING_ROADMAPS.reduce(
  (total, roadmap) => total + roadmap.stages.reduce((stageTotal, stage) => stageTotal + stage.topics.length, 0),
  0,
);
