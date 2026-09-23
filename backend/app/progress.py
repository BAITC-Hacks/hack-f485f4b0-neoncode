from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import models
from app.data_loader import employee_schema
from app.gaps import employee_progress
from app.schemas import ActivityHistory, CompleteRequest, CompletionResponse, Event


class CompletionError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def complete_event(
    session: Session,
    employee_id: str,
    request: CompleteRequest,
    assigned_by: Literal["self", "hr"] = "self",
) -> CompletionResponse:
    with session.begin():
        # Lock before reading skills or replay state to serialize SQLite writers.
        session.execute(text("BEGIN IMMEDIATE"))
        employee = session.get(models.Employee, employee_id)
        if employee is None:
            raise CompletionError(404, "Employee not found")
        previous = session.scalar(
            select(models.Completion).where(
                models.Completion.employee_id == employee_id,
                models.Completion.event_id == request.event_id,
                models.Completion.completion_id == request.completion_id,
            )
        )
        if previous is not None:
            if previous.response is None:
                raise CompletionError(409, "Completion exists without a saved response")
            return CompletionResponse.model_validate(previous.response)

        event_row = session.get(models.Event, request.event_id)
        if event_row is None:
            raise CompletionError(404, "Event not found")
        event = Event.model_validate(event_row.data)
        if employee.role not in event.audience.roles or employee.grade not in event.audience.grades:
            raise CompletionError(400, "Event audience does not include employee role and grade")

        before = employee_schema(employee)
        skills = {skill.skill_id: skill for skill in employee.skills}
        for developed in event.skills:
            skill = skills.get(developed.skill_id)
            current = skill.level if skill is not None else 0
            new_level = min(5, max(current, min(current + developed.gain, developed.max_level)))
            if skill is None:
                skill = models.EmployeeSkill(skill_id=developed.skill_id, level=new_level)
                employee.skills.append(skill)
                skills[developed.skill_id] = skill
            else:
                skill.level = new_level

        after = employee_schema(employee)
        result = CompletionResponse(
            employee_id=employee_id,
            event_id=request.event_id,
            completion_id=request.completion_id,
            status="completed",
            skills_before=before.skills,
            skills_after=after.skills,
            progress_after=employee_progress(session, after),
        )
        history = ActivityHistory(
            record_id=f"completion-{uuid4().hex}",
            employee_id=employee_id,
            event_id=request.event_id,
            date=datetime.now(UTC).date(),
            status="completed",
            completion_pct=100,
            assigned_by=assigned_by,
            synthetic=before.synthetic or event.synthetic,
        )
        session.add(
            models.ActivityHistory(
                record_id=history.record_id,
                employee_id=employee_id,
                event_id=request.event_id,
                date=history.date,
                status=history.status,
                data=history.model_dump(mode="json"),
            )
        )
        session.add(
            models.Completion(
                employee_id=employee_id,
                event_id=request.event_id,
                completion_id=request.completion_id,
                response=result.model_dump(mode="json"),
            )
        )
    return result
