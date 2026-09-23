from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import models, schemas
from app.data_loader import history_key


class ImportValidationError(Exception):
    def __init__(self, errors: list[schemas.ImportFieldError]):
        super().__init__("Import validation failed")
        self.errors = errors


def validate_import(session: Session, request: schemas.ImportRequest) -> None:
    errors = []

    def error(loc, message, kind="unknown_reference"):
        errors.append(schemas.ImportFieldError(loc=["body", *loc], msg=message, type=kind))

    known_employees = set(session.scalars(select(models.Employee.employee_id)))
    known_employees.update(employee.employee_id for employee in request.employees)
    known_skills = set(session.scalars(select(models.Skill.skill_id)))
    known_events = set(session.scalars(select(models.Event.event_id)))
    profiles = set(
        session.execute(select(models.GradeRequirement.role, models.GradeRequirement.grade))
    )
    seen = set()
    for index, employee in enumerate(request.employees):
        if employee.employee_id in seen:
            error(
                ["employees", index, "employee_id"], "Duplicate employee_id in import", "duplicate"
            )
        seen.add(employee.employee_id)
        if (employee.role, employee.grade) not in profiles:
            field = "grade" if any(role == employee.role for role, _ in profiles) else "role"
            error(["employees", index, field], "No requirements defined for this role and grade")
        for skill_id in employee.skills:
            if skill_id not in known_skills:
                error(["employees", index, "skills", skill_id], "Unknown skill_id")
        if employee.manager_id is not None and employee.manager_id not in known_employees:
            error(["employees", index, "manager_id"], "Unknown manager employee_id")
        if (
            employee.career_goal
            and (employee.career_goal.target_role, employee.career_goal.target_grade)
            not in profiles
        ):
            error(["employees", index, "career_goal"], "Unknown target role/grade requirements")
    existing_history = {
        row.record_id: (row.employee_id, row.event_id)
        for row in session.execute(
            select(
                models.ActivityHistory.record_id,
                models.ActivityHistory.employee_id,
                models.ActivityHistory.event_id,
            )
        )
    }
    seen = set()
    for index, record in enumerate(request.history):
        key = history_key(record)
        if key in seen:
            error(
                ["history", index, "record_id"], "Duplicate history record in import", "duplicate"
            )
        seen.add(key)
        if record.employee_id not in known_employees:
            error(["history", index, "employee_id"], "Unknown employee_id")
        if record.event_id not in known_events:
            error(["history", index, "event_id"], "Unknown event_id")
        if key in existing_history and existing_history[key] != (
            record.employee_id,
            record.event_id,
        ):
            error(
                ["history", index, "record_id"],
                "record_id already belongs to another participation",
                "conflict",
            )
    if errors:
        raise ImportValidationError(errors)


def import_data(session: Session, request: schemas.ImportRequest) -> schemas.ImportResponse:
    request = request.model_copy(deep=True)
    if request.meta.synthetic:
        for record in [*request.employees, *request.history]:
            record.synthetic = True
    employee_created = history_created = 0
    with session.begin():
        session.execute(text("BEGIN IMMEDIATE"))
        validate_import(session, request)
        for profile in request.employees:
            employee = session.get(models.Employee, profile.employee_id)
            if employee is None:
                employee = models.Employee(employee_id=profile.employee_id)
                session.add(employee)
                employee_created += 1
            employee.role = profile.role
            employee.grade = profile.grade
            employee.tenure_months = profile.tenure_months
            employee.profile = profile.model_dump(
                mode="json", exclude={"employee_id", "role", "grade", "tenure_months", "skills"}
            )
            existing = {skill.skill_id: skill for skill in employee.skills}
            for skill_id, skill in existing.items():
                if skill_id not in profile.skills:
                    employee.skills.remove(skill)
            for skill_id, level in profile.skills.items():
                if skill_id in existing:
                    existing[skill_id].level = level
                else:
                    employee.skills.append(models.EmployeeSkill(skill_id=skill_id, level=level))
        session.flush()
        for record in request.history:
            key = history_key(record)
            row = session.get(models.ActivityHistory, key)
            if row is None:
                row = models.ActivityHistory(record_id=key)
                session.add(row)
                history_created += 1
            row.employee_id = record.employee_id
            row.event_id = record.event_id
            row.date = record.date
            row.status = record.status
            row.data = record.model_dump(mode="json") | {"record_id": key}
    return schemas.ImportResponse(
        status="imported",
        employees_received=len(request.employees),
        history_received=len(request.history),
        employees_imported=len(request.employees),
        history_imported=len(request.history),
        employees_created=employee_created,
        employees_updated=len(request.employees) - employee_created,
        history_created=history_created,
        history_updated=len(request.history) - history_created,
    )
