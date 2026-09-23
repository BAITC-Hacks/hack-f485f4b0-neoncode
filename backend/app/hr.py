from collections import Counter, defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import Settings
from app.data_loader import employee_schema
from app.gaps import calculate_gaps, next_requirement
from app.recommend import recommend_events


@dataclass
class HRData:
    employees: list[schemas.Employee]
    requirements: list[schemas.GradeRequirement]
    events: list[schemas.Event]
    history: dict[str, list[schemas.ActivityHistory]]
    completed: dict[str, set[str]]


def load_hr_data(session: Session) -> HRData:
    history = defaultdict(list)
    for row in session.scalars(select(models.ActivityHistory)):
        history[row.employee_id].append(
            schemas.ActivityHistory.model_validate(
                {
                    **row.data,
                    "employee_id": row.employee_id,
                    "event_id": row.event_id,
                    "date": row.date,
                    "status": row.status,
                    "record_id": row.record_id,
                }
            )
        )
    completed = defaultdict(set)
    for employee_id, event_id in session.execute(
        select(models.Completion.employee_id, models.Completion.event_id)
    ):
        completed[employee_id].add(event_id)
    return HRData(
        employees=[
            employee_schema(row)
            for row in session.scalars(
                select(models.Employee).order_by(models.Employee.employee_id)
            )
        ],
        requirements=[
            schemas.GradeRequirement.model_validate(row.data)
            for row in session.scalars(select(models.GradeRequirement))
        ],
        events=[
            schemas.Event.model_validate(row.data)
            for row in session.scalars(select(models.Event).order_by(models.Event.event_id))
        ],
        history=dict(history),
        completed=dict(completed),
    )


def employee_list(data: HRData) -> schemas.EmployeesResponse:
    # HR status checks never incur one external model call per employee.
    fallback_settings = Settings(llm_api_key=None)
    employees = []
    for employee in data.employees:
        result = recommend_events(
            employee,
            data.requirements,
            data.events,
            data.history.get(employee.employee_id, []),
            fallback_settings,
            data.completed.get(employee.employee_id, set()),
        )
        employees.append(
            schemas.EmployeeListItem(
                **employee.model_dump(),
                recommendation_status=result.status,
                next_grade=result.next_grade,
            )
        )
    return schemas.EmployeesResponse(employees=employees, total=len(employees))


def skill_deficiencies(
    data: HRData, skill_names: dict[str, str], *, next_grade: bool
) -> list[schemas.SkillDeficiency]:
    assessed = Counter()
    affected = Counter()
    deficits = Counter()
    current_requirements = {(r.role, r.grade): r for r in data.requirements}
    for employee in data.employees:
        requirement = (
            next_requirement(employee, data.requirements)
            if next_grade
            else current_requirements.get((employee.role, employee.grade))
        )
        if requirement is None:
            continue
        for gap in calculate_gaps(employee, requirement):
            assessed[gap.skill_id] += 1
            if gap.deficit:
                affected[gap.skill_id] += 1
                deficits[gap.skill_id] += gap.deficit
    return [
        schemas.SkillDeficiency(
            skill_id=skill_id,
            name=skill_names.get(skill_id, skill_id),
            employees_affected=affected[skill_id],
            employees_assessed=assessed[skill_id],
            total_deficit=deficits[skill_id],
        )
        for skill_id in sorted(affected, key=lambda key: (-affected[key], key))
    ]


def hr_summary(session: Session) -> schemas.HRSummaryResponse:
    data = load_hr_data(session)
    employees = employee_list(data).employees
    without_step = {"requirements_met": [], "no_suitable_event": []}
    for employee in employees:
        if employee.recommendation_status in without_step:
            without_step[employee.recommendation_status].append(
                schemas.EmployeeStep(
                    employee_id=employee.employee_id,
                    full_name=employee.full_name,
                    role=employee.role,
                    grade=employee.grade,
                    next_grade=employee.next_grade,
                )
            )
    counts = defaultdict(Counter)
    for records in data.history.values():
        for record in records:
            counts[record.event_id][record.status] += 1
    participation = [
        schemas.ActivityParticipation(
            event_id=event.event_id,
            title=event.title,
            enrolled=sum(counts[event.event_id].values()),
            completed=counts[event.event_id]["completed"],
            missed=counts[event.event_id]["no_show"],
            declined=counts[event.event_id]["declined"],
            in_progress=counts[event.event_id]["in_progress"],
            dropped=counts[event.event_id]["dropped"],
            overdue=counts[event.event_id]["overdue"],
        )
        for event in data.events
    ]
    names = {row.skill_id: row.data["name"] for row in session.scalars(select(models.Skill))}
    return schemas.HRSummaryResponse(
        status="ready",
        total_employees=len(employees),
        total_events=len(data.events),
        completed_activities=sum(row.completed for row in participation),
        employees_by_grade=dict(sorted(Counter(e.grade for e in employees).items())),
        current_grade_skill_gaps=skill_deficiencies(data, names, next_grade=False),
        next_grade_skill_gaps=skill_deficiencies(data, names, next_grade=True),
        employees_without_step=schemas.EmployeesWithoutStep(**without_step),
        participation_by_event=participation,
    )
