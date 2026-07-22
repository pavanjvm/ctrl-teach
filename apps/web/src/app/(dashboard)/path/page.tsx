"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowRight, BookOpen, CheckCircle2, Loader2, Sparkles, Target } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL } from "@/lib/constants";
import { useLearner } from "@/lib/learning/provider";

import "./path.css";

type Role = { id: string; name: string; description: string; project: string };
type PathNode = {
  id: string; type: "course" | "project" | "milestone"; title: string; description: string;
  skill: string; courseRef: string | null; generatedCourseId: string | null;
  status: "completed" | "available" | "locked" | "in_progress";
  metadata: { sourceKind?: "cprime_curated" | "ai_generated" };
};
type LearningPath = { id: string; roleName: string; nodes: PathNode[] };
type LearningPathList = { paths: LearningPath[] };

export default function LearningPathPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { courses, setActiveCourse } = useLearner();
  const [roles, setRoles] = useState<Role[]>([]);
  const [path, setPath] = useState<LearningPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingNode, setWorkingNode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: token } : undefined;
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadPath() {
      setLoading(true);
      try {
        const requestHeaders = await headers();
        const [rolesResponse, pathsResponse] = await Promise.all([
          axios.get<{ roles: Role[] }>(`${API_URL}/api/learning-paths/roles`, { headers: requestHeaders }),
          axios.get<LearningPathList>(`${API_URL}/api/learning-paths`, { headers: requestHeaders }),
        ]);
        if (!cancelled) {
          setRoles(rolesResponse.data.roles);
          setPath(pathsResponse.data.paths[0] ?? null);
        }
      } catch {
        if (!cancelled) setError("Could not load the available role paths.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPath();
    return () => { cancelled = true; };
  }, [headers]);

  async function chooseRole(roleId: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post<LearningPath>(`${API_URL}/api/learning-paths`, { roleId }, { headers: await headers() });
      setPath(response.data);
    } catch {
      setError("Could not create that learning path. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function generate(node: PathNode) {
    if (!path) return;
    setWorkingNode(node.id);
    try {
      const response = await axios.post<{ courseId: string }>(
        `${API_URL}/api/learning-paths/${path.id}/nodes/${node.id}/generate`, {}, { headers: await headers() }
      );
      router.push(`/discover?generation=${encodeURIComponent(response.data.courseId)}`);
    } catch {
      setError("Could not start that gap course.");
      setWorkingNode(null);
    }
  }

  function openCurated(courseId: string) {
    const course = courses.find((item) => item.id === courseId);
    if (!course) {
      setError("That curated course is not available in this catalog yet.");
      return;
    }
    setActiveCourse(course.id, course.modules[0]?.lessons[0]?.id);
    router.push("/learn");
  }

  if (loading) return <main className="path-page path-loading"><Loader2 className="spin" /> Building your role map…</main>;

  return (
    <main className="path-page">
      <header className="path-hero">
        <span>Learning path</span>
        <h1>Build toward the role, not just the next course.</h1>
        <p>Tars compares your recorded mastery with the skills required for a role, then sequences curated courses, gap generation, practice, and proof.</p>
      </header>
      {error && <p className="path-error">{error}</p>}

      {!path ? (
        <section className="role-grid" aria-label="Available target roles">
          {roles.map((role) => (
            <button className="role-card" key={role.id} type="button" onClick={() => chooseRole(role.id)}>
              <Target size={20} /><strong>{role.name}</strong><span>{role.description}</span><em>View path <ArrowRight size={15} /></em>
            </button>
          ))}
        </section>
      ) : (
        <section className="path-route">
          <div className="path-title">
            <Target size={19} />
            <div><span>Target role</span><h2>{path.roleName}</h2></div>
            <button className="path-change-role" type="button" onClick={() => { setPath(null); setError(null); }}>Choose a different role</button>
          </div>
          <div className="path-nodes">
            {path.nodes.map((node, index) => {
              const blocked = node.status === "locked";
              const generating = workingNode === node.id;
              return <article className={`path-node ${node.status}`} key={node.id}>
                <div className="path-index">{node.status === "completed" ? <CheckCircle2 size={19} /> : index + 1}</div>
                <div className="path-node-copy"><span>{node.type === "course" ? node.skill || "Course" : node.type}</span><h3>{node.title}</h3><p>{node.description}</p></div>
                {node.type === "course" && !blocked && node.status !== "completed" && (
                  node.courseRef ? <button type="button" onClick={() => openCurated(node.courseRef!)}><BookOpen size={15} /> Cprime curated</button>
                    : <button type="button" onClick={() => generate(node)} disabled={generating}>{generating ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />} Generate now</button>
                )}
              </article>;
            })}
          </div>
        </section>
      )}
    </main>
  );
}
