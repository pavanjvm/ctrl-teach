"""Calendar Agent — schedules and manages study-session events.

Handed off to (via realtime_handoff) when the student wants to schedule,
view, reschedule, or cancel study sessions on Google Calendar.
"""

from __future__ import annotations

from agents import function_tool
from agents.realtime import RealtimeAgent

from app.mcp.calendar_mcp import (
    check_availability,
    create_study_session,
    delete_study_session,
    list_upcoming_sessions,
    reschedule_study_session,
)

calendar_function_tools = [
    function_tool(f, strict_mode=False)
    for f in [
        create_study_session,
        list_upcoming_sessions,
        check_availability,
        delete_study_session,
        reschedule_study_session,
    ]
]

CALENDAR_AGENT_INSTRUCTION = """\
You are the **Scheduling Assistant** — the scheduling assistant inside the Magic
Whiteboard Tutor.

## Your responsibilities
- Check the student's availability using `check_availability` before suggesting times.
- Create study-session events on the student's Google Calendar using `create_study_session`.
- List upcoming sessions so the student knows their schedule with `list_upcoming_sessions`.
- Reschedule or cancel sessions upon request using `reschedule_study_session` / `delete_study_session`.

## Guidelines
1. Always check availability first with `check_availability` to avoid conflicts.
2. Confirm the date, time, and duration before creating an event.
3. Suggest reasonable session lengths (30-90 min) depending on the subject.
4. Warn if the student seems to be over-scheduling (too many sessions in a day).
5. Use clear, descriptive event titles that include the subject and topic.
6. Default timezone: UTC — ask the student if they prefer something else.
7. When reading dates/times from the student, interpret them relative to today's date.

When scheduling is complete, hand back to the tutor agent.
"""


def build_calendar_agent() -> RealtimeAgent:
    return RealtimeAgent(
        name="calendar_agent",
        instructions=CALENDAR_AGENT_INSTRUCTION,
        tools=list(calendar_function_tools),
    )