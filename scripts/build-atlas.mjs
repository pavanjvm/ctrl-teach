#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "docs/atlas.html");
const CHECK_ONLY = process.argv.includes("--check");
const START = "/* ATLAS_DATA_START */";
const END = "/* ATLAS_DATA_END */";

const HOODS = [
  { id: "CL", name: "Web client", sub: "Next.js 15 · React 19" },
  { id: "EX", name: "Chrome extension", sub: "Manifest V3 · Tars" },
  { id: "ED", name: "API edge", sub: "FastAPI · signed sessions" },
  { id: "AG", name: "Agent layer", sub: "OpenAI Realtime SDK" },
  { id: "SV", name: "Services & data", sub: "SQLite · local assets" },
  { id: "OW", name: "Outside world", sub: "provider and browser boundaries" },
];

const MODULE_SPECS = [
  {
    id: "PG", hood: "CL", gx: 0, gy: 0, h: 32, name: "App Router pages",
    match: [/^apps\/web\/src\/app\/(?:.*\/)?page\.(?:ts|tsx|js|jsx)$/],
    note: ({ counts }) => `${counts.nextRoutePages} filesystem route pages cover onboarding, discovery, learning, paths, the library, roleplay, profiles, and admin.`,
  },
  {
    id: "LP", hood: "CL", gx: 0, gy: 1.55, h: 38, name: "Learner state & catalog",
    files: [
      "apps/web/src/lib/learning/provider.tsx",
      "apps/web/src/lib/learning/skillProfile.ts",
      "apps/web/src/lib/courses/catalog.ts",
      "apps/web/src/lib/courses/generated.ts",
    ],
    note: () => "LearnerProvider owns onboarding preferences, the active course and lesson, XP, streak, confidence, and badges; local state is mirrored to Profile.preferences.ctrlteach.",
  },
  {
    id: "RT", hood: "CL", gx: 1.45, gy: 0, h: 27, name: "Realtime client transport",
    files: [
      "apps/web/src/hooks/useWebSocket.ts",
      "apps/web/src/hooks/useAudio.ts",
      "apps/web/src/types/whiteboard.ts",
    ],
    note: () => "The browser WebSocket and audio hooks carry signed session setup, PCM frames, transcripts, tool events, interruptions, and reconnect state.",
  },
  {
    id: "LC", hood: "CL", gx: 1.45, gy: 1.55, h: 24, name: "Learning lab surfaces",
    files: [
      "apps/web/src/components/labs/LabCoach.tsx",
      "apps/web/src/components/labs/UserStoryBuilder.tsx",
      "apps/web/src/components/learning/BrowserLabPanel.tsx",
      "apps/web/src/lib/learning/labScenes.ts",
      "apps/web/src/lib/learning/browserLabReview.ts",
    ],
    note: () => "Embedded practice uses selector-grounded pointer coaching; real-tool labs open through BrowserLabPanel and collect verifiable evidence from the extension.",
  },
  {
    id: "WB", hood: "CL", gx: 2.9, gy: 0, h: 29, name: "Whiteboard & transcript",
    match: [
      /^apps\/web\/src\/components\/realtime\//,
      /^apps\/web\/src\/lib\/realtime\/.*\.(?:ts|tsx)$/,
    ],
    note: () => "Excalidraw rendering, transcript presentation, and text/diagram layout solvers turn realtime tool output into a readable classroom surface.",
  },
  {
    id: "TP", hood: "CL", gx: 2.9, gy: 1.55, h: 22, name: "Tars companion (web)",
    match: [
      /^apps\/web\/src\/components\/tars\/.*\.(?:ts|tsx)$/,
      /^apps\/web\/src\/lib\/tars\/.*\.(?:ts|tsx)$/,
    ],
    note: () => "The in-app rocket, global assistant, motion and lip-sync code share session state with the Chrome extension through a page bridge.",
  },

  {
    id: "SW", hood: "EX", gx: 0.1, gy: 4.25, h: 34, name: "Extension service worker",
    files: [
      "apps/extension/service-worker.js",
      "apps/extension/page-action-gate.js",
      "apps/extension/extension-assets.js",
    ],
    note: () => "The MV3 background worker owns extension session state, opens browser-lab tabs, routes frames, and posts grounded evidence to the API.",
  },
  {
    id: "CT", hood: "EX", gx: 1.55, gy: 4.25, h: 27, name: "Content & grounding scripts",
    files: [
      "apps/extension/content.js",
      "apps/extension/grounding-geometry.js",
      "apps/extension/github-dom-tools.js",
      "apps/extension/github-lab.js",
      "apps/extension/drawing-lifetime.js",
    ],
    note: () => "The injected page layer resolves live DOM targets, traverses frames and open shadow roots, renders pointer guidance, and observes GitHub workflow state.",
  },
  {
    id: "RK", hood: "EX", gx: 3, gy: 4.25, h: 21, name: "Rocket & offscreen audio",
    files: [
      "apps/extension/rocket-pet.js",
      "apps/extension/offscreen.js",
      "apps/extension/pcm-worklet.js",
      "apps/extension/playback-gate.js",
      "apps/extension/offscreen.html",
    ],
    note: () => "The extension renders the rocket in page DOM while an offscreen document and PCM worklet handle microphone capture and voice playback.",
  },

  {
    id: "MN", hood: "ED", gx: 5.15, gy: 2.15, h: 43, name: "FastAPI realtime gateway",
    files: ["apps/api/app/main.py", "apps/api/app/utils/ws_signals.py"],
    endpointScope: "main",
    note: ({ counts }) => `FastAPI exposes ${counts.websocketEndpoints} realtime socket at /ws/{user_id}/{session_id}; it validates subprotocol auth, resolves lesson context, and selects the tutor, roleplay, or page-mode Tars agent.`,
  },
  {
    id: "AR", hood: "ED", gx: 5.15, gy: 0.55, h: 34, name: "Mounted REST routers",
    mountedRouterSources: true,
    endpointScope: "routers",
    note: ({ counts }) => `${counts.mountedRouters} mounted router instances expose ${counts.restEndpoints - counts.mainRestEndpoints} API operations; the health route lives directly on main.py.`,
  },
  {
    id: "AU", hood: "ED", gx: 5.15, gy: 3.75, h: 27, name: "Auth, limits & middleware",
    match: [
      /^apps\/api\/app\/auth\/.*\.py$/,
      /^apps\/api\/app\/middleware\/.*\.py$/,
    ],
    note: () => "Signed bearer sessions, short-lived extension tokens, password hashing, rate limits, and request-body caps guard both browser and extension traffic.",
  },

  {
    id: "TU", hood: "AG", gx: 7.25, gy: 0.25, h: 35, name: "Tutor agent",
    files: [
      "apps/api/app/agents/tutor_agent.py",
      "apps/api/app/agents/prompt_builder.py",
      "apps/api/app/agents/companion_identity.py",
    ],
    note: () => "The lesson-scoped voice tutor owns canvas, plot, media, storage, and progress tools directly, with planner and progress handoffs available when needed.",
  },
  {
    id: "CA", hood: "AG", gx: 7.25, gy: 1.55, h: 29, name: "Canvas, plot & media tools",
    files: [
      "apps/api/app/tools/canvas_tools.py",
      "apps/api/app/tools/plot_tools.py",
      "apps/api/app/tools/media_tools.py",
      "apps/api/app/tools/storage_tools.py",
    ],
    note: () => "Direct tutor tools emit whiteboard commands, plots, educational images, snapshots, and early canvas pushes. canvas_agent.py remains only as a deprecated compatibility shell.",
  },
  {
    id: "RA", hood: "AG", gx: 7.25, gy: 2.85, h: 28, name: "Roleplay agent",
    files: ["apps/api/app/agents/roleplay_agent.py"],
    note: () => "A dedicated Realtime agent validates the requested OpenAI voice and follows the learner's scenario while Tavus remains the face renderer.",
  },
  {
    id: "TA", hood: "AG", gx: 7.25, gy: 4.15, h: 29, name: "Tars page agent",
    files: [
      "apps/api/app/agents/tars_agent.py",
      "apps/api/app/services/companion_context.py",
      "apps/api/app/services/tars_visual_locator.py",
    ],
    note: () => "Page-mode Tars combines structured page context with locator output to decide what to say, where to point, and which transient drawing to show.",
  },
  {
    id: "PP", hood: "AG", gx: 8.65, gy: 2.15, h: 24, name: "Planner & progress handoffs",
    files: [
      "apps/api/app/agents/planner_agent.py",
      "apps/api/app/agents/progress_agent.py",
      "apps/api/app/tools/firestore_tools.py",
    ],
    note: () => "The active tutor can hand work to planner and progress agents; despite the legacy filename, firestore_tools.py writes learner progress through the current local database layer.",
  },

  {
    id: "CS", hood: "SV", gx: 10.35, gy: 0.35, h: 32, name: "Generated course pipeline",
    files: [
      "apps/api/app/services/course_factory.py",
      "apps/api/app/services/generated_courses.py",
      "apps/api/app/routers/generated_courses.py",
    ],
    note: () => "A resumable job moves through research, outline, lesson, and image stages, persisting intermediate output so interrupted work continues from its last checkpoint.",
  },
  {
    id: "BS", hood: "SV", gx: 10.35, gy: 1.7, h: 27, name: "Browser lab evidence",
    files: [
      "apps/api/app/services/browser_labs.py",
      "apps/api/app/routers/browser_labs.py",
    ],
    note: () => "Structured assertions, attempt history, evidence intake, misconception detection, practice checks, and retry state power real-tool labs.",
  },
  {
    id: "RS", hood: "SV", gx: 10.35, gy: 3.05, h: 27, name: "Discovery & learning paths",
    files: [
      "apps/api/app/routers/discover.py",
      "apps/api/app/routers/learning_paths.py",
      "apps/api/app/services/roadmap_generation.py",
      "apps/api/app/services/learning_path.py",
      "apps/web/src/lib/learning/roadmapMatching.ts",
    ],
    note: () => "Prompt roadmaps and persisted learning paths are matched against learner skills; a path node can seed a generated course.",
  },
  {
    id: "DB", hood: "SV", gx: 11.8, gy: 1.05, h: 20, name: "SQLite data model",
    files: ["apps/api/app/db.py"],
    note: () => "SQLAlchemy models persist users, profiles, progress, schedules, generated-course jobs, platform courses, lab attempts, and roleplay ownership records in SQLite.",
  },
  {
    id: "UP", hood: "SV", gx: 11.8, gy: 2.5, h: 16, name: "Generated asset storage",
    files: ["apps/api/app/tools/storage_tools.py", "apps/api/app/config.py"],
    note: () => "Generated lesson images are served only from the generated uploads subtree; private learner snapshots stay on disk for agent workflows.",
  },

  {
    id: "OA", hood: "OW", gx: 8.65, gy: 6.45, h: 39, name: "OpenAI",
    files: ["apps/api/app/config.py"],
    note: () => "OpenAI provides realtime voice, transcription, grounded discovery, course writing, lesson imagery, and visual-location reasoning; model defaults stay centralized in config.py.",
  },
  {
    id: "TV", hood: "OW", gx: 10.1, gy: 6.45, h: 31, name: "Tavus CVI",
    files: ["apps/api/app/routers/roleplay.py"],
    note: () => "Tavus Echo creates the private face session and returns Daily room credentials; server-enforced timeouts protect metered credits.",
  },
  {
    id: "DY", hood: "OW", gx: 11.55, gy: 6.45, h: 25, name: "Daily room",
    files: ["apps/web/src/app/(dashboard)/role-playing/page.tsx"],
    note: () => "The browser joins Tavus's Daily room in call-object mode to receive the remote actor; local camera and room microphone tracks remain disabled.",
  },
  {
    id: "FC", hood: "OW", gx: 7.2, gy: 6.45, h: 23, name: "Firecrawl (optional)",
    files: [
      "apps/api/app/services/course_factory.py",
      "apps/api/app/routers/discover.py",
    ],
    note: () => "When configured, Firecrawl searches and extracts current course sources and parses uploaded curricula; OpenAI or local fallbacks keep the workflows usable without it.",
  },
  {
    id: "BT", hood: "OW", gx: 5.75, gy: 6.45, h: 22, name: "Live browser target",
    files: [
      "apps/extension/github-dom-tools.js",
      "apps/extension/github-lab.js",
      "apps/extension/grounding-geometry.js",
    ],
    note: () => "Real browser pages are the territory for extension labs. Target-specific DOM adapters and generic grounding geometry turn visible state into evidence and pointer anchors.",
  },
];

const FLOWS = [
  {
    id: "study", name: "Study session", payload: "PCM · TOOL EVENTS", color: "teal",
    what: "A learner opens a lesson and talks to Tars. Signed PCM audio travels over the one realtime socket; OpenAI returns voice while direct tutor tools update the whiteboard and learner progress.",
    how: [
      "StudyMode opens /ws/{user_id}/{session_id} with the bearer session in the WebSocket subprotocol.",
      "The gateway resolves the course and lesson, applies the teaching profile, and builds the tutor session.",
      "Microphone PCM streams to OpenAI Realtime and synthesized speech streams back through the same socket.",
      "Canvas, plot, media, and storage tools emit structured events for the whiteboard client.",
      "Progress tools persist mastery and session notes in SQLite; LearnerProvider refreshes the learner-facing state.",
    ],
    path: ["PG", "LP", "RT", "MN", "AU", "TU", "OA", "CA", "WB", "DB"],
    steps: [
      "Open the lesson workspace and resolve the active lesson.",
      "Start the signed realtime client and microphone pipeline.",
      "Connect to the single FastAPI WebSocket gateway.",
      "Validate the signed session and load learner context.",
      "Build the lesson-scoped tutor and teaching profile.",
      "Stream speech and reasoning through OpenAI Realtime.",
      "Dispatch structured canvas, plot, media, and progress tools.",
      "Render the whiteboard and transcript without overlap.",
      "Persist mastery, notes, and session evidence in SQLite.",
    ],
  },
  {
    id: "generate", name: "Course generation", payload: "COURSE JSON · PNG", color: "amber",
    what: "A goal, curriculum, or uploaded document becomes a complete course through a resumable research → outline → lessons → images pipeline. Every stage is checkpointed before the next starts.",
    how: [
      "The create-course surface posts an intake form to /api/generated-courses/intake and answers any follow-up questions.",
      "POST /api/generated-courses/{course_id}/generate returns 202 while the owner-scoped background job continues.",
      "course_factory optionally extracts source material with Firecrawl, then writes the outline and lessons with the configured OpenAI model.",
      "The image model writes lesson assets under the generated uploads directory.",
      "generated_courses.py persists intermediate stages and merges completed owner-scoped courses into the learner catalog.",
    ],
    path: ["PG", "AR", "CS", "FC", "OA", "UP", "DB", "LP"],
    steps: [
      "Submit a prompt, curriculum, or document from the create-course UI.",
      "Create the owner-scoped intake job and start generation.",
      "Extract current sources or parse the curriculum when Firecrawl is available.",
      "Generate the outline, lesson content, and imagery with configured OpenAI models.",
      "Write generated lesson artwork to the public generated-assets subtree.",
      "Checkpoint every stage and completed course record in SQLite.",
      "Merge the finished course into the learner's visible catalog.",
    ],
  },
  {
    id: "roleplay", name: "Video roleplay", payload: "VIDEO · PCM", color: "violet",
    what: "The learner rehearses with an AI actor. Tavus owns the face session, Daily carries the remote video, and the existing OpenAI Realtime socket supplies the intelligence and selected voice.",
    how: [
      "POST /api/roleplay/sessions creates an owned Tavus Echo conversation and returns private Daily credentials.",
      "The page joins Daily in call-object mode with local camera and room-microphone tracks disabled.",
      "A mode=roleplay WebSocket sends learner microphone audio to roleplay_agent with the selected OpenAI voice.",
      "OpenAI speech is forwarded into the Tavus/Daily session so Tavus renders the chosen face against it.",
      "DELETE /api/roleplay/sessions/{conversation_id} or the end-beacon closes the metered room on every exit path.",
    ],
    path: ["PG", "AR", "TV", "DY", "RT", "MN", "RA", "OA"],
    steps: [
      "Choose the scenario, Tavus face, and OpenAI voice.",
      "Create the owned Tavus Echo conversation through the API.",
      "Receive the private Daily room URL and meeting token.",
      "Join the remote video room with local room tracks disabled.",
      "Open a signed roleplay-mode WebSocket for learner microphone audio.",
      "Select the dedicated roleplay agent and validate its voice.",
      "Generate the live response voice and scenario reasoning with OpenAI.",
    ],
  },
  {
    id: "lab", name: "Browser lab", payload: "DOM EVIDENCE", color: "lime",
    what: "A learner performs the real task on a real site. The extension observes the live DOM, the API scores structured assertions, and missed evidence becomes targeted practice and a retry instead of a dead end.",
    how: [
      "BrowserLabPanel creates an attempt, then asks the extension to open the blueprint's allow-listed launch URL.",
      "The service worker owns the attempt and content scripts observe the target page, including frames and open shadow roots.",
      "Evidence posts to /api/browser-labs/attempts/{attempt_id}/evidence with the short-lived extension token.",
      "browser_labs.py evaluates task and cleanup assertions, tracks misconceptions, and manages practice/retry state.",
      "The learning surface polls the attempt and awards completion only after verified evidence returns.",
    ],
    path: ["LC", "AR", "BS", "TP", "SW", "CT", "BT", "DB"],
    steps: [
      "Create or resume a structured browser-lab attempt.",
      "Load the assertion plan and persisted attempt state.",
      "Bridge the active lab and extension identity from the web app.",
      "Open the allow-listed target tab and own the lab lifecycle.",
      "Observe real DOM state, pointer anchors, frames, and shadow roots.",
      "Perform the task on the live browser target and collect evidence.",
      "Persist verification, recovery, practice, and retry history.",
    ],
  },
  {
    id: "tars", name: "Tars companion", payload: "SPEECH · POINTER", color: "rose",
    what: "The rocket companion follows the learner across the app and supported browser pages. It reads grounded page context, chooses a target, points to it, and speaks the next concise instruction.",
    how: [
      "TarsExtensionBridge mints a short-lived extension session through POST /api/tars/extension-session.",
      "The extension and in-app assistant connect to the same /ws/{user_id}/{session_id} gateway in page mode.",
      "companion_context normalizes visible state; tars_agent chooses speech, pointer, and temporary drawing tools.",
      "tars_visual_locator resolves semantic targets when direct DOM identifiers are unavailable.",
      "The web pet or extension rocket renders motion and offscreen audio plays the response.",
    ],
    path: ["TP", "AR", "AU", "SW", "CT", "MN", "TA", "OA", "RK"],
    steps: [
      "Enable the shared Tars state in the web app.",
      "Mint a short-lived signed extension session.",
      "Store the extension identity and gate privileged page actions.",
      "Read grounded page context from the supported tab.",
      "Connect page mode to the common realtime gateway.",
      "Choose speech, pointer, and temporary drawing actions.",
      "Resolve ambiguous visual targets and generate the voice turn with OpenAI.",
      "Render rocket motion and play PCM audio in the page.",
    ],
  },
  {
    id: "discover", name: "Discover & path", payload: "ROADMAP", color: "blue",
    what: "A role or rough learning goal becomes a bounded roadmap. Discovery can use current web sources, path services organize the nodes, and any chosen node can seed a resumable generated course.",
    how: [
      "/api/discover/roadmap turns the onboarding or path prompt into an interactive roadmap using OpenAI or a local fallback.",
      "/api/discover/path can merge Firecrawl and OpenAI web-search hits into a grounded multimodal learning path.",
      "POST /api/learning-paths persists a custom path and its node state in SQLite.",
      "roadmapMatching compares path topics with the learner's skill profile in the client.",
      "POST /api/learning-paths/{path_id}/nodes/{node_id}/generate hands a selected node to the generated-course pipeline.",
    ],
    path: ["PG", "AR", "RS", "FC", "OA", "DB", "LP", "CS"],
    steps: [
      "Capture a role, topic, or free-form learning goal.",
      "Route the request to discovery and learning-path APIs.",
      "Build roadmap nodes and gather current sources when requested.",
      "Search or extract live material when Firecrawl is configured.",
      "Rank, normalize, or generate the path with OpenAI.",
      "Persist custom path and node progress in SQLite.",
      "Match the roadmap against the learner's current skill profile.",
    ],
  },
];

const SUPPORT = [
  ["PG", "LP"], ["PG", "RT"], ["RT", "MN"], ["MN", "AU"], ["AR", "AU"],
  ["MN", "TU"], ["MN", "RA"], ["MN", "TA"], ["TU", "CA"], ["TU", "PP"],
  ["CA", "WB"], ["AR", "CS"], ["AR", "RS"], ["AR", "BS"], ["CS", "DB"],
  ["CS", "UP"], ["CS", "OA"], ["CS", "FC"], ["RS", "DB"], ["BS", "DB"],
  ["TP", "SW"], ["SW", "CT"], ["SW", "RK"], ["CT", "BT"], ["TV", "DY"],
];

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walk(relativeRoot) {
  const found = [];
  async function visit(relativeDir) {
    const entries = await readdir(path.join(ROOT, relativeDir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".next", "node_modules", "__pycache__", ".git"].includes(entry.name)) continue;
      const relativePath = path.posix.join(relativeDir.split(path.sep).join(path.posix.sep), entry.name);
      if (entry.isDirectory()) await visit(relativePath);
      else if (entry.isFile()) found.push(relativePath);
    }
  }
  await visit(relativeRoot);
  return found;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinRoute(prefix, route) {
  const joined = `${prefix || ""}${route || ""}` || "/";
  return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

function parseDecorators({ text, variable, prefix, source }) {
  const endpoints = [];
  const pattern = new RegExp(
    `@${escapeRegExp(variable)}\\.(get|post|put|patch|delete|options|head|websocket)\\s*\\(\\s*(["'])(.*?)\\2`,
    "gs",
  );
  for (const match of text.matchAll(pattern)) {
    const method = match[1].toUpperCase();
    endpoints.push({
      method: method === "WEBSOCKET" ? "WS" : method,
      path: joinRoute(prefix, match[3]),
      source,
      line: lineNumber(text, match.index),
      transport: method === "WEBSOCKET" ? "websocket" : "rest",
    });
  }
  return endpoints;
}

async function readApiInventory() {
  const mainSource = "apps/api/app/main.py";
  const mainText = await readFile(path.join(ROOT, mainSource), "utf8");
  const aliases = new Map();

  for (const match of mainText.matchAll(/^from app\.routers import ([^\n#]+)/gm)) {
    for (const imported of match[1].split(",")) {
      const parts = imported.trim().split(/\s+as\s+/);
      if (!parts[0]) continue;
      aliases.set(parts[1] || parts[0], `apps/api/app/routers/${parts[0]}.py`);
    }
  }

  const mounts = [];
  for (const match of mainText.matchAll(/app\.include_router\(\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\)/g)) {
    const source = aliases.get(match[1]);
    if (!source) throw new Error(`Could not resolve mounted router alias ${match[1]} in ${mainSource}`);
    mounts.push({ alias: match[1], variable: match[2], source });
  }

  const endpoints = parseDecorators({ text: mainText, variable: "app", prefix: "", source: mainSource });
  for (const mount of mounts) {
    const text = await readFile(path.join(ROOT, mount.source), "utf8");
    const assignment = text.indexOf(`${mount.variable} = APIRouter`);
    if (assignment < 0) throw new Error(`Could not find ${mount.variable} = APIRouter in ${mount.source}`);
    const header = text.slice(assignment, assignment + 900);
    const prefix = header.match(/prefix\s*=\s*(["'])(.*?)\1/s)?.[2] || "";
    endpoints.push(...parseDecorators({ text, variable: mount.variable, prefix, source: mount.source }));
  }

  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { mainSource, mounts, endpoints };
}

function matchesModule(spec, source) {
  return (spec.match || []).some((pattern) => pattern.test(source));
}

async function main() {
  const [apiFiles, webFiles, extensionFiles, api] = await Promise.all([
    walk("apps/api/app"),
    walk("apps/web/src"),
    walk("apps/extension"),
    readApiInventory(),
  ]);
  const scannedFiles = [...apiFiles, ...webFiles, ...extensionFiles].sort();
  const restEndpoints = api.endpoints.filter((endpoint) => endpoint.transport === "rest");
  const websocketEndpoints = api.endpoints.filter((endpoint) => endpoint.transport === "websocket");
  const mainRestEndpoints = restEndpoints.filter((endpoint) => endpoint.source === api.mainSource).length;
  const counts = {
    apiFiles: apiFiles.length,
    apiPythonModules: apiFiles.filter((file) => file.endsWith(".py")).length,
    routerFiles: apiFiles.filter((file) => /^apps\/api\/app\/routers\/.*\.py$/.test(file) && !file.endsWith("/__init__.py")).length,
    mountedRouters: api.mounts.length,
    restEndpoints: restEndpoints.length,
    websocketEndpoints: websocketEndpoints.length,
    mainRestEndpoints,
    agentFiles: apiFiles.filter((file) => /^apps\/api\/app\/agents\/.*\.py$/.test(file)).length,
    agentModules: apiFiles.filter((file) => /^apps\/api\/app\/agents\/.*\.py$/.test(file) && !file.endsWith("/__init__.py")).length,
    serviceModules: apiFiles.filter((file) => /^apps\/api\/app\/services\/.*\.py$/.test(file)).length,
    webFiles: webFiles.length,
    webSourceModules: webFiles.filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file)).length,
    nextRoutePages: webFiles.filter((file) => /^apps\/web\/src\/app\/(?:.*\/)?page\.(?:ts|tsx|js|jsx)$/.test(file)).length,
    extensionFiles: extensionFiles.length,
    extensionScripts: extensionFiles.filter((file) => /\.(?:js|mjs|cjs)$/.test(file)).length,
    extensionTests: extensionFiles.filter((file) => /\.test\.(?:js|mjs|cjs)$/.test(file)).length,
  };

  const mountedRouterSources = [...new Set(api.mounts.map((mount) => mount.source))].sort();
  const modules = [];
  for (const spec of MODULE_SPECS) {
    const selected = new Set(spec.files || []);
    if (spec.mountedRouterSources) mountedRouterSources.forEach((source) => selected.add(source));
    scannedFiles.filter((source) => matchesModule(spec, source)).forEach((source) => selected.add(source));
    const files = [...selected].sort();
    for (const file of files) {
      if (!(await exists(file))) throw new Error(`Atlas module ${spec.id} references missing source: ${file}`);
    }
    if (!files.length) throw new Error(`Atlas module ${spec.id} resolved no source files`);
    let endpoints = [];
    if (spec.endpointScope === "main") endpoints = api.endpoints.filter((endpoint) => endpoint.source === api.mainSource);
    if (spec.endpointScope === "routers") endpoints = api.endpoints.filter((endpoint) => endpoint.source !== api.mainSource);
    modules.push({
      id: spec.id,
      hood: spec.hood,
      gx: spec.gx,
      gy: spec.gy,
      h: spec.h,
      st: Math.max(1, Math.min(6, Math.ceil(Math.log2(files.length + 1)))),
      name: spec.name,
      note: spec.note({ counts }),
      files,
      endpoints,
    });
  }

  const moduleIds = new Set(modules.map((module) => module.id));
  for (const flow of FLOWS) {
    const missing = flow.path.filter((id) => !moduleIds.has(id));
    if (missing.length) throw new Error(`Flow ${flow.id} references missing modules: ${missing.join(", ")}`);
    if (flow.steps.length !== flow.path.length - 1) {
      throw new Error(`Flow ${flow.id} has ${flow.steps.length} timeline steps for ${flow.path.length - 1} edges`);
    }
  }
  for (const [from, to] of SUPPORT) {
    if (!moduleIds.has(from) || !moduleIds.has(to)) throw new Error(`Support edge ${from} → ${to} references a missing module`);
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ counts, endpoints: api.endpoints, files: modules.map((module) => [module.id, module.files]) }))
    .digest("hex")
    .slice(0, 12);
  const atlas = {
    schema: 1,
    fingerprint,
    counts,
    hoods: HOODS,
    modules,
    flows: FLOWS,
    support: SUPPORT,
    endpoints: api.endpoints,
  };
  const generated = `${START}\nconst ATLAS = ${JSON.stringify(atlas, null, 2).replaceAll("<", "\\u003c")};\n${END}`;
  const current = await readFile(TARGET, "utf8");
  const startIndex = current.indexOf(START);
  const endIndex = current.indexOf(END);
  if (startIndex < 0 || endIndex < startIndex) throw new Error(`Missing atlas data markers in ${path.relative(ROOT, TARGET)}`);
  const next = `${current.slice(0, startIndex)}${generated}${current.slice(endIndex + END.length)}`;

  if (CHECK_ONLY) {
    if (next !== current) {
      console.error("docs/atlas.html is stale. Run: node scripts/build-atlas.mjs");
      process.exitCode = 1;
      return;
    }
    console.log(`Atlas is current (${counts.restEndpoints} REST, ${counts.websocketEndpoints} WS, ${modules.length} modules, ${fingerprint}).`);
    return;
  }

  if (next !== current) await writeFile(TARGET, next);
  console.log(`Built docs/atlas.html: ${modules.length} modules, ${counts.restEndpoints} REST, ${counts.websocketEndpoints} WS, ${counts.nextRoutePages} Next routes, ${fingerprint}.`);
}

await main();
