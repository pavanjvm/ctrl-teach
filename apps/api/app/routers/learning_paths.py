"""Role-based learning paths backed by learner progress and course generation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import GeneratedCourse, LearningPath, PathNode, PlatformCourse, Progress, SessionLocal
from app.routers.generated_courses import _schedule

router = APIRouter(prefix="/api/learning-paths", tags=["learning-paths"])


ROLES: list[dict[str, Any]] = [
    {
        "id": "scrum-master",
        "name": "Scrum Master",
        "description": "Facilitate healthy Scrum teams and improve delivery flow.",
        "skills": [("Scrum", 3, None), ("Facilitation", 3, None), ("Team Coaching", 3, None)],
        "project": "Facilitate a sprint planning and retrospective with a working team brief.",
    },
    {
        "id": "cloud-architect",
        "name": "Cloud Architect",
        "description": "Design secure, scalable cloud systems with operational trade-offs.",
        "skills": [("Requirements", 3, "Requirements"), ("Capacity Planning", 3, "Capacity Planning"), ("Cloud Architecture", 3, None)],
        "project": "Present a resilient cloud architecture and defend its availability, cost, and security choices.",
    },
    {
        "id": "devops-engineer",
        "name": "DevOps Engineer",
        "description": "Build dependable delivery pipelines and observable production systems.",
        "skills": [("Observability", 3, "Observability"), ("CI/CD", 3, None), ("Incident Response", 3, None)],
        "project": "Deliver a deployment pipeline with rollback, monitoring, and an incident runbook.",
    },
    {
        "id": "product-manager",
        "name": "Product Manager",
        "description": "Turn customer evidence into valuable product decisions and alignment.",
        "skills": [("Customer Interviews", 3, "Customer Interviews"), ("Experiment Design", 3, "Experiment Design"), ("Product Strategy", 3, None)],
        "project": "Create and defend an outcome-based product brief backed by customer evidence.",
    },
]

ROLE_BY_ID = {role["id"]: role for role in ROLES}


class CreatePathRequest(BaseModel):
    roleId: str = Field(min_length=2, max_length=128)


def _serialize_node(node: PathNode) -> dict[str, Any]:
    return {
        "id": node.id,
        "sequence": node.sequence,
        "type": node.node_type,
        "skill": node.skill,
        "targetLevel": node.target_level,
        "title": node.title,
        "description": node.description,
        "courseRef": node.course_ref,
        "generatedCourseId": node.generated_course_id,
        "status": node.status,
        "metadata": node.metadata_json or {},
    }


def _serialize_path(path: LearningPath, nodes: list[PathNode]) -> dict[str, Any]:
    return {
        "id": path.id,
        "roleId": path.role_id,
        "roleName": path.role_name,
        "status": path.status,
        "skillSnapshot": path.skill_snapshot or {},
        "nodes": [_serialize_node(node) for node in sorted(nodes, key=lambda item: item.sequence)],
        "createdAt": path.created_at.isoformat(),
        "updatedAt": path.updated_at.isoformat(),
    }


def _progress_by_skill(user_id: int) -> dict[str, int]:
    with SessionLocal() as db:
        rows = list(db.scalars(select(Progress).where(Progress.user_id == user_id)))
    return {row.topic.casefold(): max(1, min(5, row.mastery_level)) for row in rows if row.topic}


def _curated_course_ids_by_skill() -> dict[str, str]:
    """Resolve role anchors from the published admin-managed catalog."""

    with SessionLocal() as db:
        rows = list(db.scalars(select(PlatformCourse).where(PlatformCourse.status == "published")))
    course_ids: dict[str, str] = {}
    for row in rows:
        for skill in (row.course or {}).get("skills") or []:
            normalized = str(skill).strip().casefold()
            if normalized:
                course_ids.setdefault(normalized, row.id)
    return course_ids


def _create_path(user_id: int, role: dict[str, Any]) -> tuple[LearningPath, list[PathNode]]:
    mastery = _progress_by_skill(user_id)
    curated_course_ids = _curated_course_ids_by_skill()
    now = datetime.now(timezone.utc)
    path = LearningPath(
        id=f"path-{uuid.uuid4().hex[:12]}",
        owner_user_id=user_id,
        role_id=role["id"],
        role_name=role["name"],
        status="active",
        skill_snapshot=mastery,
        created_at=now,
        updated_at=now,
    )
    nodes: list[PathNode] = []
    next_available = True
    for index, (skill, target_level, curated_skill) in enumerate(role["skills"], start=1):
        course_ref = curated_course_ids.get(curated_skill.casefold()) if curated_skill else None
        current_level = mastery.get(skill.casefold(), 0)
        completed = current_level >= target_level
        node_status = "completed" if completed else ("available" if next_available else "locked")
        if not completed:
            next_available = False
        nodes.append(PathNode(
            id=f"node-{uuid.uuid4().hex[:12]}", path_id=path.id, sequence=index,
            node_type="course", skill=skill, target_level=target_level,
            title=f"Build {skill}",
            description=("Strength already evidenced in your learning record." if completed else f"Reach level {target_level} in {skill}."),
            course_ref=course_ref, status=node_status,
            metadata_json={"sourceKind": "cprime_curated" if course_ref else "ai_generated", "currentLevel": current_level},
            created_at=now, updated_at=now,
        ))
    project_sequence = len(nodes) + 1
    nodes.append(PathNode(
        id=f"node-{uuid.uuid4().hex[:12]}", path_id=path.id, sequence=project_sequence,
        node_type="project", title="Prove it in practice", description=role["project"],
        status="locked", metadata_json={"milestone": "role-ready"}, created_at=now, updated_at=now,
    ))
    nodes.append(PathNode(
        id=f"node-{uuid.uuid4().hex[:12]}", path_id=path.id, sequence=project_sequence + 1,
        node_type="milestone", title=f"{role['name']} milestone", description="Share your evidence and unlock your role-readiness record.",
        status="locked", metadata_json={"milestone": "role-ready"}, created_at=now, updated_at=now,
    ))
    with SessionLocal() as db:
        db.add(path)
        db.add_all(nodes)
        db.commit()
        db.refresh(path)
    return path, nodes


def _refresh_nodes(user_id: int, path: LearningPath, nodes: list[PathNode]) -> list[PathNode]:
    """Re-rank an existing path from the learner's latest persisted mastery."""

    mastery = _progress_by_skill(user_id)
    ordered = sorted(nodes, key=lambda item: item.sequence)
    next_available = True
    course_nodes = [node for node in ordered if node.node_type == "course"]
    courses_complete = True
    changed = False
    for node in course_nodes:
        complete = mastery.get(node.skill.casefold(), 0) >= node.target_level
        next_status = "completed" if complete else ("available" if next_available else "locked")
        courses_complete = courses_complete and complete
        if not complete:
            next_available = False
        if node.status != next_status and not (node.status == "in_progress" and not complete):
            node.status = next_status
            node.updated_at = datetime.now(timezone.utc)
            changed = True
    for node in ordered:
        if node.node_type == "project":
            next_status = "available" if courses_complete else "locked"
            if node.status != next_status:
                node.status = next_status
                node.updated_at = datetime.now(timezone.utc)
                changed = True
    if changed:
        path.skill_snapshot = mastery
        path.updated_at = datetime.now(timezone.utc)
        with SessionLocal() as db:
            stored_path = db.get(LearningPath, path.id)
            if stored_path is not None:
                stored_path.skill_snapshot = mastery
                stored_path.updated_at = path.updated_at
                for node in ordered:
                    stored_node = db.get(PathNode, node.id)
                    if stored_node is not None:
                        stored_node.status = node.status
                        stored_node.updated_at = node.updated_at
                db.commit()
    return ordered


@router.get("/roles")
async def list_roles(user: dict = Depends(get_current_user)):
    return {"roles": [{key: value for key, value in role.items() if key != "skills"} for role in ROLES]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_learning_path(body: CreatePathRequest, user: dict = Depends(get_current_user)):
    role = ROLE_BY_ID.get(body.roleId)
    if role is None:
        raise HTTPException(status_code=404, detail="That target role is not available.")
    path, nodes = _create_path(int(user["uid"]), role)
    return _serialize_path(path, nodes)


@router.get("/{path_id}")
async def get_learning_path(path_id: str, user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        path = db.scalar(select(LearningPath).where(LearningPath.id == path_id, LearningPath.owner_user_id == int(user["uid"])))
        if path is None:
            raise HTTPException(status_code=404, detail="Learning path not found.")
        nodes = list(db.scalars(select(PathNode).where(PathNode.path_id == path.id)))
        db.expunge(path)
        for node in nodes:
            db.expunge(node)
    return _serialize_path(path, _refresh_nodes(int(user["uid"]), path, nodes))


@router.post("/{path_id}/refresh")
async def refresh_learning_path(path_id: str, user: dict = Depends(get_current_user)):
    return await get_learning_path(path_id, user)


@router.post("/{path_id}/nodes/{node_id}/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_gap_course(path_id: str, node_id: str, user: dict = Depends(get_current_user)):
    user_id = int(user["uid"])
    with SessionLocal() as db:
        path = db.scalar(select(LearningPath).where(LearningPath.id == path_id, LearningPath.owner_user_id == user_id))
        node = db.scalar(select(PathNode).where(PathNode.id == node_id, PathNode.path_id == path_id))
        if path is None or node is None:
            raise HTTPException(status_code=404, detail="Learning path node not found.")
        if node.node_type != "course" or node.course_ref:
            raise HTTPException(status_code=409, detail="This node already has a curated course or is not a course gap.")
        if node.generated_course_id:
            return {"courseId": node.generated_course_id, "status": "already_started"}
        course_id = f"generated-{uuid.uuid4().hex[:12]}"
        source_text = f"Build practical {node.skill} capability for a {path.role_name}."
        payload = {
            "version": 2,
            "source": {"type": "prompt", "text": source_text, "title": node.title, "label": "Learning path gap", "mode": "path"},
            "intake": {"topic": node.skill, "summary": source_text, "questions": [], "complete": True},
            "answers": {"role": path.role_name, "target_skill": node.skill, "target_level": str(node.target_level)},
            "progress": {"stage": "researching", "percent": 10, "message": "Researching your role-specific skill gap"},
            "error": None, "assets": {},
        }
        now = datetime.now(timezone.utc)
        db.add(GeneratedCourse(id=course_id, owner_user_id=user_id, status="researching", source_type="prompt", source_label="Learning path gap", extraction_mode="path", payload=payload, created_at=now, updated_at=now))
        node.generated_course_id = course_id
        node.status = "in_progress"
        node.updated_at = now
        path.updated_at = now
        db.commit()
    _schedule(course_id)
    return {"courseId": course_id, "status": "researching"}
