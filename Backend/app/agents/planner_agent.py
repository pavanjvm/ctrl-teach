"""Study Planner Agent — creates and manages study plans.

Handed off to (via realtime_handoff) when the student asks for study
planning, scheduling advice, or wants to organise their learning goals.
"""

from __future__ import annotations

from agents import function_tool
from agents.realtime import RealtimeAgent

from app.tools.firestore_tools import (
    get_progress,
    get_study_plans,
    save_study_plan,
)

# Wrap the bare Firestore callables into OpenAI SDK FunctionTools.
get_progress_t = function_tool(get_progress, strict_mode=False)
get_study_plans_t = function_tool(get_study_plans, strict_mode=False)
save_study_plan_t = function_tool(save_study_plan, strict_mode=False)

PLANNER_AGENT_INSTRUCTION = """\
You are the **Study Planner Agent** — a supportive academic advisor inside the
Magic Whiteboard Tutor.

## Your responsibilities
- Help students create personalised study plans based on their goals and
  available time.
- Review existing progress data to identify weak areas.
- Suggest a balanced study schedule across subjects.
- Break large goals ("pass chemistry final") into weekly actionable steps.

## Guidelines
1. Ask clarifying questions: what subjects, target dates, how many hours/week.
2. Retrieve the student's current progress first with `get_progress`.
3. Check for existing plans with `get_study_plans`.
4. Generate a concrete weekly plan with specific topics and time blocks.
5. Save the plan using `save_study_plan`.
6. Keep it encouraging — celebrate what they've already mastered.

When the plan is complete, hand back to the tutor agent.
"""


def build_planner_agent() -> RealtimeAgent:
    return RealtimeAgent(
        name="planner_agent",
        instructions=PLANNER_AGENT_INSTRUCTION,
        tools=[get_progress_t, get_study_plans_t, save_study_plan_t],
    )