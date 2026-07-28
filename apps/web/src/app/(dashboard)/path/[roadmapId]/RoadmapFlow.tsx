"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { useLearner } from "@/lib/learning/provider";
import {
  getRoadmapDisplayNodes,
  getTopicDisplayNodes,
  type RoadmapDisplayNode,
} from "@/lib/learning/roadmapNodes";
import {
  CPRIME_BOOTCAMPS,
  type LearningRoadmap,
  type RoadmapTopic,
} from "@/lib/learning/roadmaps";
import type { Course } from "@/lib/types";

import "./roadmap-flow.css";

function searchableCourseText(course: Course): string {
  return [course.title, course.description, course.instructor, ...course.skills]
    .join(" ")
    .toLocaleLowerCase();
}

function matchingScore(course: Course, topic: RoadmapTopic): number {
  const haystack = searchableCourseText(course);
  return topic.keywords.reduce((score, keyword) => (
    haystack.includes(keyword.toLocaleLowerCase()) ? score + 1 : score
  ), 0);
}

export default function RoadmapFlow({ roadmap }: { roadmap: LearningRoadmap }) {
  const router = useRouter();
  const {
    addCourse,
    completedRoadmapTopics,
    courses,
    setActiveCourse,
    startRoadmap,
    startedRoadmaps,
    toggleRoadmapTopic,
  } = useLearner();
  const [selectedNode, setSelectedNode] = useState<RoadmapDisplayNode | null>(null);
  const [learningNode, setLearningNode] = useState<RoadmapDisplayNode | null>(null);
  const learningHeading = useRef<HTMLHeadingElement>(null);

  const allNodes = useMemo(() => getRoadmapDisplayNodes(roadmap), [roadmap]);
  const completedCount = allNodes.filter((node) => completedRoadmapTopics.includes(node.id)).length;
  const progress = allNodes.length > 0 ? Math.round((completedCount / allNodes.length) * 100) : 0;
  const started = startedRoadmaps.includes(roadmap.id);
  const finished = started && completedCount === allNodes.length;

  const recommendedCourses = useMemo(() => {
    if (!learningNode) return [];
    const topic = learningNode.topic;
    const publishedMatches = courses
      .filter((course) => course.id.startsWith("platform-"))
      .map((course) => ({ course, score: matchingScore(course, topic) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((result) => result.course);
    const fallbackIds = [...topic.courseIds, ...roadmap.courseIds];
    const fallbacks = fallbackIds
      .map((courseId) => courses.find((course) => course.id === courseId))
      .filter((course): course is Course => Boolean(course));
    const byId = new Map<string, Course>();
    [...publishedMatches, ...fallbacks].forEach((course) => byId.set(course.id, course));
    return Array.from(byId.values()).slice(0, 3);
  }, [courses, learningNode, roadmap.courseIds]);

  const bootcamps = useMemo(() => {
    if (!learningNode) return [];
    return learningNode.topic.bootcampIds
      .map((id) => CPRIME_BOOTCAMPS[id])
      .filter(Boolean);
  }, [learningNode]);

  useEffect(() => {
    if (!learningNode) return;
    learningHeading.current?.focus({ preventScroll: true });
  }, [learningNode]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (learningNode) setLearningNode(null);
      else setSelectedNode(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [learningNode]);

  function chooseNode(node: RoadmapDisplayNode) {
    setSelectedNode(node);
    setLearningNode(null);
  }

  function learnNode(node: RoadmapDisplayNode) {
    startRoadmap(roadmap.id);
    setLearningNode(node);
  }

  function openCourse(course: Course) {
    const firstLesson = course.modules.flatMap((module) => module.lessons)[0];
    addCourse(course);
    setActiveCourse(course.id, firstLesson?.id);
    router.push(course.id.startsWith("platform-") || course.format === "rich"
      ? `/learn/${course.id}`
      : "/learn");
  }

  function generateCourse() {
    if (!learningNode) return;
    const prompt = [
      `Build a practical course on ${learningNode.title}.`,
      learningNode.description,
      `This course should fit the ${roadmap.title} learning roadmap and include hands-on practice, assessment, and a portfolio-ready outcome.`,
    ].join(" ");
    router.push(`/library?create=1&prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <main
      className="roadmap-flow-page"
      style={{ "--role-accent": roadmap.accent, "--role-soft": roadmap.softAccent } as CSSProperties}
    >
      <header className="roadmap-flow-header">
        <Link href="/path" className="roadmap-flow-back"><ArrowLeft size={14} /> All roadmaps</Link>
        <div className="roadmap-flow-heading">
          <span>{roadmap.eyebrow}</span>
          <h1>{roadmap.title}</h1>
          <p>{roadmap.description}</p>
          {roadmap.reference && (
            <a href={roadmap.reference.url} target="_blank" rel="noreferrer" className="roadmap-flow-reference">
              {roadmap.reference.label} <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="roadmap-flow-status">
          <div>
            <span>{finished ? "Roadmap completed" : started ? "Roadmap in progress" : "Not started"}</span>
            <strong>{completedCount} / {allNodes.length} topics</strong>
          </div>
          <div className="roadmap-flow-progress" aria-label={`${progress}% complete`}><i style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="roadmap-flow-legend" aria-label="Roadmap legend">
          <span><i className="primary" /> Recommended</span>
          <span><i className="supporting" /> Supporting topic</span>
          <span><i className="optional" /> Optional / advanced</span>
          <small>Click any box to mark it complete or start learning.</small>
        </div>
      </header>

      <section className="roadmap-flowchart" aria-label={`${roadmap.title} learning flowchart`}>
        <div className="roadmap-flow-start">
          <span>Start here</span>
          <ArrowRight size={15} />
        </div>

        {roadmap.stages.map((stage, stageIndex) => (
          <section className="roadmap-flow-stage" key={stage.id} aria-labelledby={`stage-${stage.id}`}>
            <header className="roadmap-flow-stage-label">
              <small>Stage {String(stageIndex + 1).padStart(2, "0")}</small>
              <h2 id={`stage-${stage.id}`}>{stage.label.replace(/^\d+ · /, "")}</h2>
              <p>{stage.description}</p>
            </header>

            <div className="roadmap-flow-stage-nodes">
              {stage.topics.map((topic, topicIndex) => {
                const nodes = getTopicDisplayNodes(roadmap, topic);
                const alignment = topicIndex % 2 === 0 ? "left" : "right";
                return (
                  <div className={`roadmap-flow-cluster ${alignment}`} key={topic.id}>
                    <div className="roadmap-flow-cluster-body">
                      <RoadmapNode
                        node={nodes[0]}
                        active={selectedNode?.id === nodes[0].id}
                        complete={completedRoadmapTopics.includes(nodes[0].id)}
                        onChoose={chooseNode}
                        onLearn={learnNode}
                        onToggle={toggleRoadmapTopic}
                        onClose={() => setSelectedNode(null)}
                      />
                      <div className="roadmap-flow-supporting">
                        {nodes.slice(1).map((node, index) => (
                          <RoadmapNode
                            node={node}
                            variant={topic.optional || index % 3 === 2 ? "optional" : "supporting"}
                            active={selectedNode?.id === node.id}
                            complete={completedRoadmapTopics.includes(node.id)}
                            onChoose={chooseNode}
                            onLearn={learnNode}
                            onToggle={toggleRoadmapTopic}
                            onClose={() => setSelectedNode(null)}
                            key={node.id}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="roadmap-flow-finish">
          <span><GraduationCap size={20} /></span>
          <div><small>Finish</small><strong>Role-ready foundation</strong></div>
        </div>
      </section>

      {learningNode && (
        <>
          <button className="roadmap-learning-scrim" type="button" aria-label="Close learning options" onClick={() => setLearningNode(null)} />
          <aside className="roadmap-learning-panel" role="dialog" aria-modal="true" aria-labelledby="learning-panel-title">
            <header>
              <div>
                <span>Choose how to learn</span>
                <h2 id="learning-panel-title" ref={learningHeading} tabIndex={-1}>{learningNode.title}</h2>
              </div>
              <button type="button" onClick={() => setLearningNode(null)} aria-label="Close learning options"><X size={17} /></button>
              <p>{learningNode.description}</p>
            </header>

            <div className="roadmap-learning-panel-body">
              <section className="roadmap-learning-choice">
                <div className="roadmap-learning-choice-title">
                  <span>01</span>
                  <div><BookOpen size={17} /><h3>Cprime curated courses</h3></div>
                  <small>Curated and published in Ctrl+Teach</small>
                </div>
                <div className="roadmap-learning-course-list">
                  {recommendedCourses.length > 0 ? recommendedCourses.map((course) => (
                    <article key={course.id}>
                      <div>
                        <span>{course.id.startsWith("platform-") ? "Published by Cprime" : "Cprime course"}</span>
                        <strong>{course.title}</strong>
                        <p>{course.duration} · {course.difficulty} · {course.modules.length} modules</p>
                      </div>
                      <button type="button" onClick={() => openCourse(course)}>Open <ArrowRight size={13} /></button>
                    </article>
                  )) : (
                    <p className="roadmap-learning-course-empty">
                      No published Ctrl+Teach course is mapped to this topic yet. Generate a focused course below instead.
                    </p>
                  )}
                </div>
              </section>

              <section className="roadmap-learning-choice">
                <div className="roadmap-learning-choice-title">
                  <span>02</span>
                  <div><Users size={17} /><h3>Cprime Learning bootcamps</h3></div>
                  <small>Instructor-led external training</small>
                </div>
                <div className="roadmap-learning-bootcamps">
                  {bootcamps.length > 0 ? bootcamps.map((bootcamp) => (
                    <a href={bootcamp.url} target="_blank" rel="noreferrer" key={bootcamp.id}>
                      <div>
                        <span>{bootcamp.format} · {bootcamp.duration}</span>
                        <strong>{bootcamp.title}</strong>
                        <p>{bootcamp.description}</p>
                      </div>
                      <ExternalLink size={15} />
                    </a>
                  )) : (
                    <a href="https://www.cprime.com/learning/courses/" target="_blank" rel="noreferrer">
                      <div>
                        <span>Cprime Learning · Course catalog</span>
                        <strong>Find instructor-led training for this topic</strong>
                        <p>Browse the live catalog to find the closest available course or private team training option.</p>
                      </div>
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              </section>

              <section className="roadmap-learning-choice roadmap-learning-generate">
                <div className="roadmap-learning-choice-title">
                  <span>03</span>
                  <div><Sparkles size={17} /><h3>Generate your own</h3></div>
                  <small>Tailored to your exact goal</small>
                </div>
                <p>Use this roadmap node as the starting point for a complete personalized course.</p>
                <button type="button" onClick={generateCourse}>Generate course <ArrowUpRight size={15} /></button>
              </section>
            </div>
          </aside>
        </>
      )}
    </main>
  );
}

function RoadmapNode({
  node,
  variant = "primary",
  active,
  complete,
  onChoose,
  onLearn,
  onToggle,
  onClose,
}: {
  node: RoadmapDisplayNode;
  variant?: "primary" | "supporting" | "optional";
  active: boolean;
  complete: boolean;
  onChoose: (node: RoadmapDisplayNode) => void;
  onLearn: (node: RoadmapDisplayNode) => void;
  onToggle: (nodeId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className={`roadmap-flow-node-wrap ${active ? "active" : ""}`}>
      <button
        type="button"
        className={`roadmap-flow-node ${variant} ${complete ? "complete" : ""}`}
        aria-expanded={active}
        onClick={() => onChoose(node)}
      >
        {complete && <Check size={12} />}
        <span>{node.title}</span>
      </button>
      {active && (
        <div className="roadmap-flow-node-menu" role="dialog" aria-label={`Actions for ${node.title}`}>
          <div>
            <span>Topic actions</span>
            <button type="button" onClick={onClose} aria-label="Close topic actions"><X size={12} /></button>
          </div>
          <div>
            <button type="button" className={complete ? "complete" : ""} onClick={() => onToggle(node.id)}>
              <CheckCircle2 size={14} /> {complete ? "Mark incomplete" : "Mark complete"}
            </button>
            <button type="button" className="learn" onClick={() => onLearn(node)}>
              <BookOpen size={14} /> Learn <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
