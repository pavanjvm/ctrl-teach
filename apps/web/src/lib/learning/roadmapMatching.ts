import type { SkillLevel } from "@/lib/types";
import type { LearningRoadmap } from "@/lib/learning/roadmaps";

export interface RoadmapMatchInput {
  goal: string;
  currentRole: string;
  experienceLevel: SkillLevel;
}

export interface RankedRoadmapMatch {
  roadmap: LearningRoadmap;
  score: number;
  reason: string;
  matchedTerms: string[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "become",
  "becoming",
  "career",
  "for",
  "from",
  "i",
  "in",
  "into",
  "learn",
  "learning",
  "my",
  "of",
  "on",
  "role",
  "the",
  "to",
  "want",
  "work",
]);

const GENERIC_ROLE_WORDS = new Set([
  "analyst",
  "architect",
  "developer",
  "engineer",
  "lead",
  "leader",
  "manager",
  "professional",
  "specialist",
]);

const TOKEN_ALIASES: Record<string, string> = {
  ai: "artificial-intelligence",
  analytics: "data",
  architecture: "architect",
  designing: "design",
  devops: "devops",
  ml: "machine-learning",
  pm: "product-manager",
  scrum: "agile",
};

function normalizedToken(value: string): string {
  const aliased = TOKEN_ALIASES[value];
  if (aliased) return aliased;
  if (value.length > 5 && value.endsWith("ing")) return value.slice(0, -3);
  if (value.length > 4 && value.endsWith("ers")) return value.slice(0, -1);
  if (value.length > 4 && value.endsWith("s")) return value.slice(0, -1);
  return value;
}

export function normalizeRoadmapQuery(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeRoadmapQuery(value)
      .split(" ")
      .map(normalizedToken)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return Array.from(left).filter((token) => right.has(token));
}

function rolePhrases(roadmap: LearningRoadmap): string[] {
  return [roadmap.title, roadmap.shortTitle, ...(roadmap.aliases ?? [])]
    .map(normalizeRoadmapQuery)
    .filter(Boolean);
}

function searchableText(roadmap: LearningRoadmap): string {
  return [
    roadmap.title,
    roadmap.shortTitle,
    roadmap.description,
    roadmap.audience,
    ...(roadmap.aliases ?? []),
    ...roadmap.stages.flatMap((stage) => [
      stage.label,
      stage.description,
      ...stage.topics.flatMap((topic) => [
        topic.title,
        topic.description,
        ...topic.keywords,
      ]),
    ]),
  ].join(" ");
}

function scoreRoadmap(
  roadmap: LearningRoadmap,
  input: RoadmapMatchInput,
): RankedRoadmapMatch & { suitable: boolean } {
  const goal = normalizeRoadmapQuery(input.goal);
  const goalTokens = tokenSet(goal);
  const phrases = rolePhrases(roadmap);
  const roleTokens = tokenSet([roadmap.title, roadmap.shortTitle, ...(roadmap.aliases ?? [])].join(" "));
  const allTokens = tokenSet(searchableText(roadmap));
  const currentRoleTokens = tokenSet(input.currentRole);
  const audienceTokens = tokenSet(roadmap.audience);
  const phraseMatch = phrases.some((phrase) => (
    phrase.length >= 4 && (goal === phrase || goal.includes(phrase))
  ));
  const roleMatches = overlap(goalTokens, roleTokens);
  const domainRoleMatches = roleMatches.filter((term) => !GENERIC_ROLE_WORDS.has(term));
  const skillMatches = overlap(goalTokens, allTokens);
  const currentRoleMatches = overlap(currentRoleTokens, audienceTokens);
  const supportsExperience = !roadmap.experienceLevels?.length
    || roadmap.experienceLevels.includes(input.experienceLevel);

  let score = phraseMatch ? 72 : 0;
  score += Math.min(48, domainRoleMatches.length * 24);
  score += Math.min(32, skillMatches.length * 8);
  score += Math.min(12, currentRoleMatches.length * 4);
  score += supportsExperience ? 6 : -18;

  const matchedTerms = Array.from(new Set([...domainRoleMatches, ...skillMatches]));
  const suitable = phraseMatch
    || (domainRoleMatches.length >= 1 && score >= 30)
    || (skillMatches.length >= 2 && score >= 34);

  const experienceCopy = input.experienceLevel.toLocaleLowerCase();
  const experienceArticle = /^[aeiou]/.test(experienceCopy) ? "an" : "a";
  const roleCopy = input.currentRole.trim() ? ` from your current role as ${input.currentRole.trim()}` : "";
  const matchedCopy = matchedTerms.slice(0, 3).join(", ");
  const reason = phraseMatch
    ? `It directly supports your goal and uses ${experienceArticle} ${experienceCopy}-level sequence${roleCopy}.`
    : `Its focus on ${matchedCopy || roadmap.shortTitle} connects your goal to ${experienceArticle} ${experienceCopy}-level sequence${roleCopy}.`;

  return { roadmap, score, reason, matchedTerms, suitable };
}

export function rankRoadmapsForGoal(
  roadmaps: LearningRoadmap[],
  input: RoadmapMatchInput,
): RankedRoadmapMatch[] {
  return roadmaps
    .map((roadmap) => scoreRoadmap(roadmap, input))
    .filter((match) => match.suitable)
    .sort((left, right) => (
      right.score - left.score
      || left.roadmap.title.localeCompare(right.roadmap.title)
    ))
    .map(({ suitable: _suitable, ...match }) => match);
}

/** Use the same semantic scoring for the roadmap catalogue's free-form search. */
export function searchRoadmaps(
  roadmaps: LearningRoadmap[],
  query: string,
): LearningRoadmap[] {
  if (!query.trim()) return roadmaps;
  return roadmaps
    .map((roadmap) => scoreRoadmap(roadmap, {
      goal: query,
      currentRole: "",
      experienceLevel: "Intermediate",
    }))
    .filter((match) => match.score > 6)
    .sort((left, right) => (
      right.score - left.score
      || left.roadmap.title.localeCompare(right.roadmap.title)
    ))
    .map((match) => match.roadmap);
}
