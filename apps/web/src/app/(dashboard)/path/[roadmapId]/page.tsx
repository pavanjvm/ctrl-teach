import { notFound } from "next/navigation";

import { LEARNING_ROADMAPS } from "@/lib/learning/roadmaps";

import RoadmapFlow from "./RoadmapFlow";

export function generateStaticParams() {
  return LEARNING_ROADMAPS.map((roadmap) => ({ roadmapId: roadmap.id }));
}

export default async function RoadmapDetailPage({
  params,
}: {
  params: Promise<{ roadmapId: string }>;
}) {
  const { roadmapId } = await params;
  const roadmap = LEARNING_ROADMAPS.find((item) => item.id === roadmapId);
  if (!roadmap) notFound();
  return <RoadmapFlow roadmap={roadmap} />;
}
