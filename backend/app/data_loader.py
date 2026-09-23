import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app import models, schemas


@dataclass
class Dataset:
    employees: list[schemas.Employee]
    events: list[schemas.Event]
    catalog: schemas.SkillsFile
    history: list[schemas.ActivityHistory]


def _unique(values: list, label: str) -> set:
    if len(values) != len(set(values)):
        raise ValueError(f"Duplicate {label} in dataset")
    return set(values)


def read_dataset(data_dir: Path) -> Dataset:
    employees = schemas.EmployeesFile.model_validate_json(
        (data_dir / "employees.json").read_text(encoding="utf-8")
    )
    events = schemas.EventsFile.model_validate_json(
        (data_dir / "events.json").read_text(encoding="utf-8")
    )
    catalog = schemas.SkillsFile.model_validate_json(
        (data_dir / "skills.json").read_text(encoding="utf-8")
    )
    with (data_dir / "activity_history.csv").open(encoding="utf-8", newline="") as stream:
        history = [
            schemas.ActivityHistory.model_validate(
                {key: value if value != "" else None for key, value in row.items()}
            )
            for row in csv.DictReader(stream)
        ]
    for document, records in (
        (employees, employees.employees),
        (events, events.events),
        (catalog, [*catalog.skills, *catalog.role_profiles]),
    ):
        if document.meta.synthetic:
            for record in records:
                record.synthetic = True
    dataset = Dataset(employees.employees, events.events, catalog, history)
    validate_references(dataset)
    return dataset


def validate_references(dataset: Dataset) -> None:
    employee_ids = _unique([e.employee_id for e in dataset.employees], "employee_id")
    event_ids = _unique([e.event_id for e in dataset.events], "event_id")
    skill_ids = _unique([s.skill_id for s in dataset.catalog.skills], "skill_id")
    _unique([history_key(h) for h in dataset.history], "history record")
    profiles = _unique(
        [(p.role, p.grade) for p in dataset.catalog.role_profiles], "role/grade profile"
    )
    referenced_skills = set()
    for employee in dataset.employees:
        referenced_skills.update(employee.skills)
        if (employee.role, employee.grade) not in profiles:
            raise ValueError(f"Unknown role/grade for {employee.employee_id}")
        if employee.manager_id is not None and employee.manager_id not in employee_ids:
            raise ValueError(f"Unknown manager for {employee.employee_id}")
    for event in dataset.events:
        referenced_skills.update(s.skill_id for s in event.skills)
        referenced_skills.update(event.prerequisites)
    for profile in dataset.catalog.role_profiles:
        referenced_skills.update(profile.required_skills)
        referenced_skills.update(profile.critical_skills)
    if missing := referenced_skills - skill_ids:
        raise ValueError(f"Unknown skills: {sorted(missing)}")
    for record in dataset.history:
        if record.employee_id not in employee_ids or record.event_id not in event_ids:
            raise ValueError(f"Unknown employee/event in history: {history_key(record)}")


def history_key(record: schemas.ActivityHistory) -> str:
    if record.record_id:
        return record.record_id
    serialized = json.dumps(record.model_dump(mode="json"), sort_keys=True)
    return "generated-" + hashlib.sha256(serialized.encode()).hexdigest()


def seed_database(session: Session, dataset: Dataset) -> None:
    """Insert missing records only; startup must not reset persisted progress."""
    for skill in dataset.catalog.skills:
        if session.get(models.Skill, skill.skill_id) is None:
            session.add(models.Skill(skill_id=skill.skill_id, data=skill.model_dump(mode="json")))
    for profile in dataset.catalog.role_profiles:
        if session.get(models.GradeRequirement, (profile.role, profile.grade)) is None:
            session.add(
                models.GradeRequirement(
                    role=profile.role, grade=profile.grade, data=profile.model_dump(mode="json")
                )
            )
    session.flush()
    for employee in dataset.employees:
        if session.get(models.Employee, employee.employee_id) is None:
            session.add(
                models.Employee(
                    employee_id=employee.employee_id,
                    role=employee.role,
                    grade=employee.grade,
                    tenure_months=employee.tenure_months,
                    profile=employee.model_dump(
                        mode="json",
                        exclude={"employee_id", "role", "grade", "tenure_months", "skills"},
                    ),
                    skills=[
                        models.EmployeeSkill(skill_id=k, level=v)
                        for k, v in employee.skills.items()
                    ],
                )
            )
    for event in dataset.events:
        if session.get(models.Event, event.event_id) is None:
            session.add(
                models.Event(
                    event_id=event.event_id, type=event.type, data=event.model_dump(mode="json")
                )
            )
    session.flush()
    for record in dataset.history:
        key = history_key(record)
        if session.get(models.ActivityHistory, key) is None:
            session.add(
                models.ActivityHistory(
                    record_id=key,
                    employee_id=record.employee_id,
                    event_id=record.event_id,
                    date=record.date,
                    status=record.status,
                    data=record.model_dump(mode="json"),
                )
            )
    session.flush()


def employee_schema(employee: models.Employee) -> schemas.Employee:
    return schemas.Employee(
        **employee.profile,
        employee_id=employee.employee_id,
        role=employee.role,
        grade=employee.grade,
        tenure_months=employee.tenure_months,
        skills={skill.skill_id: skill.level for skill in employee.skills},
    )
