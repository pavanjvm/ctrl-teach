"use client";

import type { ComponentType, CSSProperties } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  CheckCircle2,
  Cloud,
  GitBranch,
  Loader2,
  Monitor,
  Search,
  Server,
  Sparkles,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL } from "@/lib/constants";
import { useLearner } from "@/lib/learning/provider";
import { getRoadmapDisplayNodes } from "@/lib/learning/roadmapNodes";
import { searchRoadmaps } from "@/lib/learning/roadmapMatching";
import {
  LEARNING_ROADMAPS,
  sanitizeCustomRoadmaps,
} from "@/lib/learning/roadmaps";

import "./path.css";

const ROADMAP_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  "frontend-developer": Monitor,
  "backend-developer": Server,
  "ai-agentic-engineer": Bot,
  "product-manager": Briefcase,
  "agile-delivery": Users,
  "data-analyst": BarChart3,
  "business-analyst": GitBranch,
  "devops-cloud": Cloud,
};

export default function RoadmapIndexPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const {
    addCustomRoadmap,
    completedRoadmapTopics,
    customRoadmaps,
    startedRoadmaps,
  } = useLearner();
  const [query, setQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const allRoadmaps = useMemo(
    () => [...LEARNING_ROADMAPS, ...customRoadmaps],
    [customRoadmaps],
  );

  const visibleRoadmaps = useMemo(() => {
    return searchRoadmaps(allRoadmaps, query);
  }, [allRoadmaps, query]);

  async function generateRoadmap() {
    const prompt = query.trim();
    if (!prompt || generating) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/discover/roadmap`,
        { prompt },
        { headers: token ? { Authorization: token } : undefined },
      );
      const roadmap = sanitizeCustomRoadmaps([response.data?.roadmap])[0];
      if (!roadmap) throw new Error("The generated roadmap was incomplete.");
      addCustomRoadmap(roadmap);
      router.push(`/path/custom/${roadmap.id}`);
    } catch (error) {
      console.error("Roadmap generation failed", error);
      setGenerationError("We couldn't generate that roadmap. Check the backend connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="roadmap-index-page">
      <header className="roadmap-index-hero">
        <div>
          <span>Role-based roadmaps</span>
          <h1>What do you want to become?</h1>
          <p>Step-by-step learning paths built for the skills Cprime teams use in real work.</p>
        </div>
        <div className="roadmap-index-legend" aria-label="Roadmap topic legend">
          <span><i className="recommended" /> Recommended path</span>
          <span><i className="supporting" /> Supporting topic</span>
          <span><i className="optional" /> Optional depth</span>
        </div>
      </header>

      <div className="roadmap-index-search">
        <Search size={17} aria-hidden="true" />
        <label htmlFor="roadmap-index-search">Search roadmaps</label>
        <input
          id="roadmap-index-search"
          type="search"
          maxLength={200}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setGenerationError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && visibleRoadmaps.length === 0) void generateRoadmap();
          }}
          placeholder="Search by role, skill, or topic"
        />
      </div>

      <section className="roadmap-index-section" aria-labelledby="roadmap-list-title">
        <div className="roadmap-index-heading">
          <div>
            <span>Choose a role</span>
            <h2 id="roadmap-list-title">Ctrl+Teach roadmaps</h2>
          </div>
          <p>Select a roadmap to open its complete learning flow.</p>
        </div>

        {visibleRoadmaps.length > 0 ? (
          <div className="roadmap-index-grid">
            {visibleRoadmaps.map((roadmap) => {
              const roadmapIndex = allRoadmaps.findIndex((item) => item.id === roadmap.id);
              const custom = roadmap.id.startsWith("custom-");
              const Icon = ROADMAP_ICONS[roadmap.id] ?? Sparkles;
              const nodes = getRoadmapDisplayNodes(roadmap);
              const completed = nodes.filter((node) => completedRoadmapTopics.includes(node.id)).length;
              const started = startedRoadmaps.includes(roadmap.id);
              const finished = started && completed === nodes.length;
              const progress = nodes.length > 0 ? Math.round((completed / nodes.length) * 100) : 0;

              return (
                <Link
                  href={custom ? `/path/custom/${roadmap.id}` : `/path/${roadmap.id}`}
                  className="roadmap-index-card"
                  key={roadmap.id}
                  style={{ "--card-accent": roadmap.accent, "--card-soft": roadmap.softAccent } as CSSProperties}
                >
                  <div className="roadmap-index-card-top">
                    <span className="roadmap-index-card-icon"><Icon size={20} /></span>
                    <span className="roadmap-index-card-number">{String(roadmapIndex + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="roadmap-index-card-copy">
                    <span>{roadmap.eyebrow}</span>
                    <h2>{roadmap.title}</h2>
                    <p>{roadmap.description}</p>
                  </div>
                  <div className="roadmap-index-card-meta">
                    <span>{nodes.length} topics</span>
                    <span>{roadmap.duration}</span>
                  </div>
                  {started && (
                    <div className="roadmap-index-progress" aria-label={`${progress}% complete`}>
                      <div><i style={{ width: `${progress}%` }} /></div>
                      <span>{finished ? <><CheckCircle2 size={12} /> Roadmap completed</> : `Roadmap in progress · ${progress}%`}</span>
                    </div>
                  )}
                  <div className="roadmap-index-open">
                    {started ? "Continue roadmap" : "View roadmap"} <ArrowRight size={15} />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="roadmap-index-empty">
            <span className="roadmap-index-empty-icon"><Sparkles size={20} /></span>
            <strong>No roadmap for “{query.trim()}” yet</strong>
            <span>Turn your search into a complete, interactive Ctrl+Teach roadmap.</span>
            <button type="button" onClick={() => void generateRoadmap()} disabled={generating || !query.trim()}>
              {generating ? <Loader2 size={15} className="roadmap-index-spin" /> : <Sparkles size={15} />}
              {generating ? "Generating your roadmap…" : `Generate a roadmap for “${query.trim()}”`}
              {!generating && <ArrowRight size={14} />}
            </button>
            {generationError && <p role="alert">{generationError}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
