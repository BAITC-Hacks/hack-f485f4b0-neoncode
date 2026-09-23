from collections.abc import Iterable

from app.schemas import Employee, GradeRequirement, SkillGap

GRADE_ORDER = ("Junior", "Middle", "Senior", "Lead")


def next_requirement(
    employee: Employee, requirements: Iterable[GradeRequirement]
) -> GradeRequirement | None:
    current_index = GRADE_ORDER.index(employee.grade)
    return min(
        (
            requirement
            for requirement in requirements
            if requirement.role == employee.role
            and GRADE_ORDER.index(requirement.grade) > current_index
        ),
        key=lambda requirement: GRADE_ORDER.index(requirement.grade),
        default=None,
    )


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
