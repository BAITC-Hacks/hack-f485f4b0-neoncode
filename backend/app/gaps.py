from app.schemas import Employee, GradeRequirement, SkillGap


def calculate_gaps(employee: Employee, requirement: GradeRequirement) -> list[SkillGap]:
    """Reserved for role/grade gap calculation."""
    raise NotImplementedError("Skill gap calculation is not implemented")
