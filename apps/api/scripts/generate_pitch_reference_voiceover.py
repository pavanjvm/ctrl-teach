"""Generate temporary reference narration for the combined Ctrl+Teach pitch."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings


OUTPUT_DIR = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "video"
    / "public"
    / "voiceover"
    / "combined-pitch"
)

SCENES = {
    "act-1-opening.mp3": "World-class expertise shouldn’t have office hours.",
    "act-1-calendar.mp3": (
        "Yet every new cohort adds another calendar, another constraint, another wait."
    ),
    "act-1-urgency.mp3": (
        "The learner needs the skill now. The next class starts later."
    ),
    "act-2-escape.mp3": (
        "And when the answer isn’t available, learners don’t wait."
    ),
    "act-2-search.mp3": "They search.",
    "act-2-ai.mp3": "They ask AI.",
    "act-2-elsewhere.mp3": "They go somewhere else.",
    "act-2-reframe.mp3": (
        "This isn’t a content problem. It’s a delivery problem."
    ),
    "act-3-breakthrough.mp3": "So we removed the calendar.",
    "act-3-ctrlteach-intro.mp3": (
        "Introducing Ctrl+Teach, Cprime's AI-powered platform for personalized learning "
        "on demand."
    ),
    "act-3-admin-intro.mp3": (
        "In the admin portal, Cprime teams can create a course from a learning "
        "objective or import an existing curriculum."
    ),
    "act-3-admin-create.mp3": (
        "Here, we ask for an intermediate course on cloud architecture. Ctrl+Teach "
        "generates the structure, outcomes, lessons, assessments, and practical activities."
    ),
    "act-3-admin-review.mp3": (
        "Nothing is published automatically. An administrator can review the outline, "
        "edit any lesson, inspect the sources, and make changes."
    ),
    "act-3-admin-publish.mp3": (
        "After review, one click publishes the course to the learner catalogue."
    ),
    "act-3-learner-intro.mp3": (
        "On the learner side, onboarding captures their current role, experience, "
        "learning preferences, and goal."
    ),
    "act-3-learner-profile.mp3": (
        "This learner is an intermediate software engineer who wants to become a cloud "
        "architect and prefers visual, hands-on learning."
    ),
    "act-3-roadmap-match.mp3": (
        "Ctrl+Teach first checks for a suitable published roadmap. Here, it finds the "
        "existing Cloud Architect path and recommends it immediately."
    ),
    "act-3-roadmap-stages.mp3": (
        "The roadmap organizes cloud foundations, networking, automation, reliability, "
        "and security into a clear learning sequence."
    ),
    "act-3-roadmap-learn.mp3": (
        "Selecting Cloud Foundations brings together the published Cprime course, the "
        "relevant bootcamp, and a personalized generation option."
    ),
    "act-3-roadmap-options.mp3": (
        "The learner can choose an admin-curated course, a Cprime Learning bootcamp, "
        "or generate a personalized course tailored to their level, goal, and time."
    ),
    "act-3-live-intro.mp3": (
        "For learners who prefer an interactive explanation, the same course opens in "
        "Live Classroom."
    ),
    "act-3-live-auto.mp3": (
        "Once the lesson starts, the classroom begins teaching automatically. It already "
        "knows the course, the current lesson, and the learner’s context."
    ),
    "act-3-tars-classroom.mp3": (
        "Welcome to class. Let’s turn a vague application request into a measurable "
        "architecture problem."
    ),
    "act-3-live-explain.mp3": (
        "It explains by voice, builds the visual on the whiteboard, and keeps follow-up "
        "questions inside the lesson—without copying context into another chat."
    ),
    "act-3-lab-intro.mp3": (
        "Where hands-on practice is possible, every course includes a lab built directly "
        "into the lesson."
    ),
    "act-3-meet-tars.mp3": (
        "This is where learners meet Tars, the assistant behind guided practice in Lab Mode."
    ),
    "act-3-ec2-example.mp3": (
        "Let’s take an example. A learner has completed a course module on creating an "
        "EC2 instance and now wants to practise it inside the real AWS console."
    ),
    "act-3-ec2-risk.mp3": (
        "But they’re not yet familiar with the AWS interface or its security configurations. "
        "With critical resources like EC2, one incorrect setting can create unnecessary cost "
        "or expose the instance."
    ),
    "act-3-ec2-question.mp3": (
        "Hey Tars, which security group should I use for this instance? Should I create a "
        "new one, or use an existing security group?"
    ),
    "act-3-ec2-answer.mp3": (
        "Okay, I’ll mark the security group area on the screen, then explain what to choose "
        "for your lab. For this demo lab, choose create security group and keep only SSH "
        "allowed, ideally from your own IP. Avoid a wide-open anywhere rule unless the lab "
        "specifically mentioned it."
    ),
    "act-3-ec2-closing.mp3": (
        "Without leaving the AWS console or juggling between tabs, the learner receives "
        "guidance directly inside the interface."
    ),
    "act-3-across-browser.mp3": (
        "Tars can also move with the learner across supported browser tabs."
    ),
    "act-3-across-follow.mp3": (
        "It can follow the task between instructions, consoles and documentation while "
        "keeping the guidance connected to what the learner is trying to accomplish."
    ),
    "act-3-aws-question.mp3": (
        "Hey Tars, which AWS database is the MongoDB equivalent?"
    ),
    "act-3-aws-answer.mp3": (
        "Amazon DocumentDB is AWS's fully managed MongoDB-compatible database service."
    ),
    "act-3-circle-intro.mp3": (
        "Tars also includes Circle to Ask for questions about a specific location on screen."
    ),
    "act-3-circle-question.mp3": "Why did this signal split into four?",
    "act-3-circle-answer.mp3": (
        "It split into four because that proton has three equivalent neighboring protons. "
        "Those neighbors couple through bonds and split its signal into n plus one lines, "
        "so three neighbors give four peaks: a quartet. It's basically the neighboring "
        "protons nudging the signal into four."
    ),
    "act-3-anatomy-labeling.mp3": (
        "Tars can also draw and point to specific areas of the screen with pixel-level "
        "precision. In this example, it labels the key parts of a human anatomy image."
    ),
    "act-3-roleplay.mp3": (
        "Some skills require more than reading or labs—they require practice in conversation. "
        "For those courses, Ctrl+Teach includes a Roleplay module where learners can rehearse "
        "stakeholder discussions, technical explanations, and interviews based on what they "
        "have recently learned. We’ve taken Roleplay beyond a voice-only simulation. Learners "
        "interact face-to-face with a lifelike participant that listens, responds naturally, "
        "and adapts as the conversation develops. When your camera is turned on, it can "
        "understand visible context and non-verbal cues, making the experience feel closer to "
        "a real interview or workplace conversation."
    ),
    "act-3-roleplay-interviewer.mp3": (
        "Alright, thanks for joining. Let’s jump right in: design a backend service that "
        "handles user authentication and issues tokens. What components do you include, "
        "and how do you keep it secure under heavy load?"
    ),
    "act-3-memory.mp3": (
        "Tars is the intelligence behind this experience. Using Dreaming v3 as its memory "
        "layer, Tars remembers the learner’s goals, completed courses, strengths, knowledge "
        "gaps, and previous interactions. That memory determines which scenarios to create, "
        "how difficult they should be, how Tars responds, and what feedback the learner "
        "receives. The same context also improves Tars throughout the platform and guides "
        "future course generation. Instead of starting from zero every time, Ctrl+Teach "
        "becomes more personalized with every interaction. The roleplay, Tars’s behaviour, "
        "and each newly generated course feel increasingly designed for that learner."
    ),
    "act-3-conclusion.mp3": (
        "We started with one simple problem: the learner needs the skill now, but the next "
        "class starts later. So the question is no longer, when does the next class start? "
        "It is, what does the learner want to become next?"
    ),
    "act-3-real-workflow.mp3": (
        "The learner works in the real interface, while Ctrl+Teach provides assistance "
        "in context—exactly when it is needed."
    ),
}

SCENE_VOICES = {
    "act-3-tars-classroom.mp3": "cedar",
    "act-3-aws-question.mp3": "coral",
    "act-3-aws-answer.mp3": "cedar",
    "act-3-ec2-question.mp3": "coral",
    "act-3-ec2-answer.mp3": "cedar",
    "act-3-circle-question.mp3": "coral",
    "act-3-circle-answer.mp3": "cedar",
    "act-3-roleplay-interviewer.mp3": "nova",
}

SCENE_INSTRUCTIONS = {
    "act-3-tars-classroom.mp3": (
        "Speak as a clear, friendly AI instructor already teaching a live technical "
        "class. Be natural and concise. Preserve every supplied word."
    ),
    "act-3-aws-question.mp3": (
        "Speak as a learner asking an AI assistant a quick question during a practical "
        "task. Sound natural and conversational. Preserve every supplied word."
    ),
    "act-3-aws-answer.mp3": (
        "Speak as a calm, precise AI guide answering inside the learner's workspace. "
        "Preserve every supplied word."
    ),
    "act-3-ec2-question.mp3": (
        "Speak as a learner asking an AI assistant for help during a practical AWS lab. "
        "Sound natural and conversational. Preserve every supplied word."
    ),
    "act-3-ec2-answer.mp3": (
        "Speak as a calm, precise AI guide responding inside the learner’s AWS workspace. "
        "Sound helpful and concise. Preserve every supplied word."
    ),
    "act-3-circle-question.mp3": (
        "Speak as a learner asking a quick question while circling part of a technical "
        "diagram. Sound curious and natural. Preserve every supplied word."
    ),
    "act-3-circle-answer.mp3": (
        "Speak as a calm, concise AI tutor explaining proton NMR splitting. Sound "
        "conversational and clear, with slight emphasis on n plus one and quartet. "
        "Preserve every supplied word."
    ),
    "act-3-roleplay-interviewer.mp3": (
        "Speak as a confident, lifelike technical interviewer opening a realistic job "
        "interview. Sound professional, direct, and conversational. Aim to finish in about "
        "ten seconds. Preserve every supplied word."
    ),
}

INSTRUCTIONS = (
    "Speak as a warm, authoritative female-presenting premium documentary narrator. "
    "Use confident, intelligent, understated urgency with crisp diction and deliberate "
    "emphasis. Use a measured, unhurried pace. Preserve every supplied word. Do not "
    "add an introduction or any commentary."
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", choices=SCENES)
    args = parser.parse_args()

    if not settings.openai_api_key.strip():
        raise SystemExit("OPENAI_API_KEY is not configured")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=settings.openai_api_key)

    scenes = (
        {args.scene: SCENES[args.scene]}
        if args.scene
        else SCENES
    )
    for filename, text in scenes.items():
        output_path = OUTPUT_DIR / filename
        print(f"generate {filename}")
        with client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts",
            voice=SCENE_VOICES.get(filename, "marin"),
            input=text,
            instructions=SCENE_INSTRUCTIONS.get(filename, INSTRUCTIONS),
            response_format="mp3",
        ) as response:
            response.stream_to_file(output_path)
        print(f"saved {output_path} ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
