from __future__ import annotations

import unittest

from app.services.browser_labs import verify_evidence
from app.services.generated_courses import (
    ContentBlock,
    CourseOutline,
    LessonContent,
    OutlineLesson,
    OutlineModule,
    _prepare_course,
    github_private_repository_lab,
    normalize_course_for_delivery,
)


def github_plan() -> dict:
    return github_private_repository_lab()


def evidence(kind: str, *, url: str, payload: dict | None = None) -> dict:
    return {
        "kind": kind,
        "phase": "task",
        "host": "github.com",
        "url": url,
        "payload": payload or {},
    }


class GitHubBrowserLabVerificationTests(unittest.TestCase):
    def test_delivery_hides_generic_github_labs_when_protected_lab_exists(self) -> None:
        course = {
            "modules": [{
                "lessons": [
                    {"id": "study", "type": "study", "duration": "20m"},
                    {
                        "id": "generic-github-lab",
                        "type": "lab",
                        "duration": "15m",
                        "browserLab": {
                            "platformId": "github",
                            "workflow": None,
                            "launchUrl": "https://github.com/",
                        },
                    },
                    {
                        "id": "private-repository-lab",
                        "type": "lab",
                        "duration": "10m",
                        "browserLab": github_private_repository_lab(),
                    },
                ],
            }],
        }

        delivered = normalize_course_for_delivery(course, {"answers": {"time_budget": "2–4 hours"}})
        lesson_ids = [lesson["id"] for lesson in delivered["modules"][0]["lessons"]]

        self.assertEqual(lesson_ids, ["study", "private-repository-lab"])

    def test_course_factory_injects_the_protected_lab_into_github_courses(self) -> None:
        outline = CourseOutline(
            title="Git and GitHub from First Commit to Collaboration",
            description="A detailed practical course about local Git workflows and GitHub collaboration.",
            difficulty="Beginner",
            audience="Developers beginning their version-control journey",
            outcomes=["Create useful Git history", "Collaborate safely with GitHub"],
            prerequisites=[],
            skills=["Git", "GitHub"],
            coverPrompt="An editorial educational illustration of connected commit history and a remote repository.",
            modules=[OutlineModule(
                title="Foundations",
                lessons=[OutlineLesson(
                    title="Git, GitHub, and repositories",
                    summary="Build an accurate mental model before using the real tools.",
                )],
            )],
        )
        blocks = [
            ContentBlock(
                type="content",
                heading=f"Concept {index}",
                paragraphs=["A substantial explanation of the concept and how it applies in practice."],
                citationIds=[],
            )
            for index in range(1, 5)
        ]
        lesson = LessonContent(
            summary="Understand the relationship between Git, GitHub, and a repository.",
            duration="20m",
            blocks=blocks,
            browserLab=None,
        )
        course = _prepare_course(
            "generated-github-course",
            {
                "source": {"type": "prompt", "label": "Learning prompt"},
                "intake": {"topic": "Git and GitHub", "summary": "Learn GitHub from scratch"},
                "answers": {"time_budget": "2–4 hours"},
                "research": {"citations": []},
            },
            outline,
            [lesson],
        )

        lab_lessons = [
            item
            for module in course["modules"]
            for item in module["lessons"]
            if item.get("browserLab", {}).get("workflow") == "github_create_private_repository"
        ]

        self.assertEqual(len(lab_lessons), 1)
        self.assertEqual(lab_lessons[0]["title"], "Real-tool lab: Create a private GitHub repository")
        self.assertEqual(lab_lessons[0]["browserLab"]["launchUrl"], "https://github.com/")
        self.assertEqual(lab_lessons[0]["browserLab"]["cleanupAssertions"], [])

    def test_non_github_courses_do_not_receive_the_github_lab(self) -> None:
        outline = CourseOutline(
            title="Python Data Processing",
            description="A practical course about processing structured datasets with Python.",
            difficulty="Beginner",
            audience="Developers learning data-processing fundamentals",
            outcomes=["Transform tabular data", "Validate processing results"],
            prerequisites=[],
            skills=["Python", "Data processing"],
            coverPrompt="An editorial educational illustration of a clean data-processing pipeline.",
            modules=[OutlineModule(
                title="Foundations",
                lessons=[OutlineLesson(
                    title="Data processing mental model",
                    summary="Understand inputs, transformations, validation, and outputs.",
                )],
            )],
        )
        lesson = LessonContent(
            summary="Understand the stages of a reliable data-processing workflow.",
            duration="20m",
            blocks=[
                ContentBlock(
                    type="content",
                    heading=f"Stage {index}",
                    paragraphs=["A substantial explanation of this stage and its practical purpose."],
                    citationIds=[],
                )
                for index in range(1, 5)
            ],
            browserLab=None,
        )
        course = _prepare_course(
            "generated-python-course",
            {
                "source": {"type": "prompt", "label": "Learning prompt"},
                "intake": {"topic": "Python data processing", "summary": "Learn data workflows"},
                "answers": {"time_budget": "2–4 hours"},
                "research": {"citations": []},
            },
            outline,
            [lesson],
        )

        self.assertFalse(any(
            item.get("browserLab", {}).get("workflow") == "github_create_private_repository"
            for module in course["modules"]
            for item in module["lessons"]
        ))

    def test_private_repository_state_completes_without_cleanup(self) -> None:
        events = [
            evidence("navigation", url="https://github.com/new"),
            evidence(
                "input",
                url="https://github.com/new",
                payload={"label": "Repository name", "tagName": "input"},
            ),
            evidence(
                "state_snapshot",
                url="https://github.com/new",
                payload={"state": {"repositoryVisibility": "private", "repositoryCreated": False}},
            ),
            evidence(
                "state_snapshot",
                url="https://github.com/demo/ctrlteach-git-lab-4821",
                payload={"state": {"repositoryVisibility": "private", "repositoryCreated": True}},
            ),
        ]

        result = verify_evidence(github_plan(), events)

        self.assertEqual(result["status"], "verified")
        self.assertTrue(result["taskComplete"])
        self.assertTrue(result["cleanupComplete"])
        self.assertTrue(all(result["taskAssertions"].values()))

    def test_public_repository_state_never_satisfies_private_assertion(self) -> None:
        events = [
            evidence("navigation", url="https://github.com/new"),
            evidence(
                "input",
                url="https://github.com/new",
                payload={"label": "Repository name", "tagName": "input"},
            ),
            evidence(
                "state_snapshot",
                url="https://github.com/demo/ctrlteach-git-lab-public",
                payload={"state": {"repositoryVisibility": "public", "repositoryCreated": True}},
            ),
        ]

        result = verify_evidence(github_plan(), events)

        self.assertEqual(result["status"], "running")
        self.assertFalse(result["taskComplete"])
        self.assertFalse(result["taskAssertions"]["github-private-visibility"])
        self.assertTrue(result["taskAssertions"]["github-repository-created"])


if __name__ == "__main__":
    unittest.main()
