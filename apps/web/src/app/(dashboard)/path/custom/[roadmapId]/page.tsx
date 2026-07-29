"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Map } from "lucide-react";

import { useLearner } from "@/lib/learning/provider";

import RoadmapFlow from "../../[roadmapId]/RoadmapFlow";
import "../../path.css";

export default function CustomRoadmapPage() {
  const params = useParams<{ roadmapId: string }>();
  const { customRoadmaps, learnerReady } = useLearner();
  const roadmap = customRoadmaps.find((item) => item.id === params.roadmapId);

  if (!learnerReady) {
    return (
      <main className="roadmap-index-page">
        <div className="roadmap-index-empty">
          <Loader2 size={20} className="roadmap-index-spin" />
          <strong>Loading your roadmap…</strong>
        </div>
      </main>
    );
  }

  if (!roadmap) {
    return (
      <main className="roadmap-index-page">
        <div className="roadmap-index-empty">
          <span className="roadmap-index-empty-icon"><Map size={20} /></span>
          <strong>This generated roadmap isn’t available</strong>
          <span>It may belong to another learner or have been removed from this browser.</span>
          <Link href="/path"><ArrowLeft size={14} /> Return to roadmaps</Link>
        </div>
      </main>
    );
  }

  return <RoadmapFlow roadmap={roadmap} />;
}
