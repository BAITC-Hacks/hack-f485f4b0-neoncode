from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.schemas import Employee, GradeProgress, GradeRequirement, SkillGap

GRADE_ORDER = ("Junior", "Middle", "Senior", "Lead")


def calculate_gaps(employee: Employee, requirement: GradeRequirement) -> list[SkillGap]:
    gaps = [
        SkillGap(
            skill_id=skill_id,
            current_level=employee.skills.get(skill_id, 0),
            required_level=required,
            deficit=max(0, required - employee.skills.get(skill_id, 0)),
        )
        for skill_id, required in requirement.required_skills.items()
    ]
    return sorted(gaps, key=lambda gap: (-gap.deficit, gap.skill_id))


def next_grade_progress(
    employee: Employee, requirements: Iterable[GradeRequirement]
) -> GradeProgress:
    current_index = GRADE_ORDER.index(employee.grade)
    candidates = [
        requirement
        for requirement in requirements
        if requirement.role == employee.role
        and GRADE_ORDER.index(requirement.grade) > current_index
    ]
    if not candidates:
        return GradeProgress(
            status="no_next_grade", next_grade=None, requirements=None, gaps=[], remaining_points=0
        )
    requirement = min(candidates, key=lambda item: GRADE_ORDER.index(item.grade))
    gaps = calculate_gaps(employee, requirement)
    remaining_points = sum(gap.deficit for gap in gaps)
    return GradeProgress(
        status="needs_development" if remaining_points else "requirements_met",
        next_grade=requirement.grade,
        requirements=requirement,
        gaps=gaps,
        remaining_points=remaining_points,
    )


def employee_progress(session: Session, employee: Employee) -> GradeProgress:
    requirements = session.scalars(
        select(models.GradeRequirement).where(models.GradeRequirement.role == employee.role)
    )
    return next_grade_progress(
        employee, (GradeRequirement.model_validate(row.data) for row in requirements)
    )
