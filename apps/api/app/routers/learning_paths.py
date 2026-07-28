"""Role-based learning paths backed by learner progress and course generation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.auth.dependencies import get_current_user
from app.db import (
    CourseLessonProgress,
    GeneratedCourse,
    LearningPath,
    PathNode,
    PlatformCourse,
    Progress,
    SessionLocal,
)
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


class RecordPathLessonRequest(BaseModel):
    courseId: str = Field(min_length=1, max_length=128)
    lessonId: str = Field(min_length=1, max_length=128)


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
    mastery: dict[str, int] = {}
    for row in rows:
        if not row.topic:
            continue
        key = row.topic.casefold()
        mastery[key] = max(mastery.get(key, 0), max(1, min(5, row.mastery_level)))
    return mastery


def _load_owned_path(user_id: int, path_id: str) -> tuple[LearningPath, list[PathNode]] | None:
    with SessionLocal() as db:
        path = db.scalar(
            select(LearningPath).where(
                LearningPath.id == path_id,
                LearningPath.owner_user_id == user_id,
            )
        )
        if path is None:
            return None
        nodes = list(db.scalars(select(PathNode).where(PathNode.path_id == path.id)))
        db.expunge(path)
        for node in nodes:
            db.expunge(node)
    return path, nodes


def _course_lesson_ids(db: Any, user_id: int, course_id: str) -> list[str]:
    platform_course = db.scalar(
        select(PlatformCourse).where(
            PlatformCourse.id == course_id,
            PlatformCourse.status == "published",
        )
    )
    if platform_course is not None:
        course = platform_course.course or {}
    else:
        generated_course = db.scalar(
            select(GeneratedCourse).where(
                GeneratedCourse.id == course_id,
                GeneratedCourse.owner_user_id == user_id,
                GeneratedCourse.status == "ready",
            )
        )
        course = (generated_course.payload or {}).get("course") if generated_course else {}
    if not isinstance(course, dict):
        return []
    lesson_ids: list[str] = []
    for module in course.get("modules") or []:
        if not isinstance(module, dict):
            continue
        for lesson in module.get("lessons") or []:
            if not isinstance(lesson, dict) or lesson.get("status") == "pending":
                continue
            lesson_id = str(lesson.get("id") or "").strip()
            if lesson_id and lesson_id not in lesson_ids:
                lesson_ids.append(lesson_id)
    return lesson_ids


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
    if changed or (path.skill_snapshot or {}) != mastery:
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


@router.get("")
async def list_learning_paths(user: dict = Depends(get_current_user)):
    user_id = int(user["uid"])
    with SessionLocal() as db:
        path_ids = list(
            db.scalars(
                select(LearningPath.id)
                .where(LearningPath.owner_user_id == user_id)
                .order_by(LearningPath.updated_at.desc(), LearningPath.created_at.desc())
            )
        )
    paths: list[dict[str, Any]] = []
    for path_id in path_ids:
        loaded = _load_owned_path(user_id, path_id)
        if loaded is None:
            continue
        path, nodes = loaded
        paths.append(_serialize_path(path, _refresh_nodes(user_id, path, nodes)))
    return {"paths": paths}


@router.get("/progress/lessons")
async def list_completed_path_lessons(user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(CourseLessonProgress)
                .where(CourseLessonProgress.user_id == int(user["uid"]))
                .order_by(CourseLessonProgress.completed_at.asc(), CourseLessonProgress.id.asc())
            )
        )
    return {
        "completedLessons": [
            {
                "courseId": row.course_id,
                "lessonId": row.lesson_id,
                "completedAt": row.completed_at.isoformat(),
            }
            for row in rows
        ]
    }


@router.get("/{path_id}")
async def get_learning_path(path_id: str, user: dict = Depends(get_current_user)):
    loaded = _load_owned_path(int(user["uid"]), path_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail="Learning path not found.")
    path, nodes = loaded
    return _serialize_path(path, _refresh_nodes(int(user["uid"]), path, nodes))


@router.post("/{path_id}/refresh")
async def refresh_learning_path(path_id: str, user: dict = Depends(get_current_user)):
    return await get_learning_path(path_id, user)


@router.post("/progress/lessons")
async def record_completed_path_lesson(
    body: RecordPathLessonRequest,
    user: dict = Depends(get_current_user),
):
    user_id = int(user["uid"])
    matched_node_ids: set[str] = set()
    matched_path_ids: set[str] = set()
    now = datetime.now(timezone.utc)
    recorded = False
    course_completed = False
    with SessionLocal() as db:
        matches = list(
            db.execute(
                select(PathNode, LearningPath)
                .join(LearningPath, LearningPath.id == PathNode.path_id)
                .where(
                    LearningPath.owner_user_id == user_id,
                    or_(
                        PathNode.course_ref == body.courseId,
                        PathNode.generated_course_id == body.courseId,
                    ),
                )
            ).all()
        )
        if not matches:
            return {
                "courseId": body.courseId,
                "lessonId": body.lessonId,
                "recorded": False,
                "courseCompleted": False,
                "updatedNodeIds": [],
                "paths": [],
            }
        lesson_ids = _course_lesson_ids(db, user_id, body.courseId)
        if not lesson_ids:
            raise HTTPException(status_code=409, detail="Course lessons are not ready for progress tracking.")
        if body.lessonId not in lesson_ids:
            raise HTTPException(status_code=404, detail="Lesson does not belong to this path-backed course.")
        completion = db.scalar(
            select(CourseLessonProgress).where(
                CourseLessonProgress.user_id == user_id,
                CourseLessonProgress.course_id == body.courseId,
                CourseLessonProgress.lesson_id == body.lessonId,
            )
        )
        if completion is None:
            db.add(CourseLessonProgress(
                user_id=user_id,
                course_id=body.courseId,
                lesson_id=body.lessonId,
                completed_at=now,
            ))
            db.flush()
            recorded = True
        completed_lesson_ids = set(
            db.scalars(
                select(CourseLessonProgress.lesson_id).where(
                    CourseLessonProgress.user_id == user_id,
                    CourseLessonProgress.course_id == body.courseId,
                )
            )
        )
        course_completed = set(lesson_ids).issubset(completed_lesson_ids)
        if course_completed:
            for node, path in matches:
                subject = f"Learning path: {path.role_name}"[:128]
                details = f"Completed course {body.courseId} for learning path {path.id}."
                progress = db.scalar(
                    select(Progress)
                    .where(
                        Progress.user_id == user_id,
                        Progress.subject == subject,
                        Progress.topic == node.skill,
                    )
                    .order_by(Progress.mastery_level.desc())
                )
                target_level = max(1, min(5, node.target_level))
                if progress is None:
                    db.add(
                        Progress(
                            user_id=user_id,
                            subject=subject,
                            topic=node.skill,
                            mastery_level=target_level,
                            details=details,
                            updated_at=now,
                        )
                    )
                else:
                    progress.mastery_level = max(progress.mastery_level or 0, target_level)
                    progress.details = details
                    progress.updated_at = now
                if node.status != "completed":
                    node.status = "completed"
                    node.updated_at = now
                path.updated_at = now
                matched_node_ids.add(node.id)
                matched_path_ids.add(path.id)
        db.commit()

    paths: list[dict[str, Any]] = []
    for path_id in sorted(matched_path_ids):
        loaded = _load_owned_path(user_id, path_id)
        if loaded is None:
            continue
        path, nodes = loaded
        paths.append(_serialize_path(path, _refresh_nodes(user_id, path, nodes)))
    return {
        "courseId": body.courseId,
        "lessonId": body.lessonId,
        "recorded": recorded,
        "courseCompleted": course_completed,
        "updatedNodeIds": sorted(matched_node_ids),
        "paths": paths,
    }


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
