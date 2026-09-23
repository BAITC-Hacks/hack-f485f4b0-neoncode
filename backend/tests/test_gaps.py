import pytest

from app.gaps import next_grade_progress
from app.schemas import Employee, GradeRequirement


def test_next_grade_is_selected_by_role_and_order_with_sorted_deficits():
    employee = Employee(
        employee_id="test",
        role="Backend Engineer",
        grade="Junior",
        tenure_months=1,
        skills={"SK_SQL": 4, "SK_PYTHON": 1},
    )
    requirements = [
        GradeRequirement(role="Backend Engineer", grade="Lead", required_skills={"SK_SQL": 5}),
        GradeRequirement(role="Other Role", grade="Middle", required_skills={"SK_SQL": 5}),
        GradeRequirement(
            role="Backend Engineer",
            grade="Middle",
            required_skills={
                "SK_PYTHON": 3,
                "SK_SQL": 2,
                "SK_API": 2,
            },
        ),
    ]
    result = next_grade_progress(employee, requirements)
    assert result.next_grade == "Middle"
    assert result.requirements == requirements[2]
    assert result.status == "needs_development"
    assert result.remaining_points == 4
    assert [(g.skill_id, g.current_level, g.deficit) for g in result.gaps] == [
        ("SK_API", 0, 2),
        ("SK_PYTHON", 1, 2),
        ("SK_SQL", 4, 0),
    ]


@pytest.mark.parametrize("grade,role", [("Lead", "Backend Engineer"), ("Junior", "Unknown Role")])
def test_no_next_grade_is_explicit(grade, role):
    employee = Employee(employee_id="test", role=role, grade=grade, tenure_months=0, skills={})
    result = next_grade_progress(
        employee,
        [GradeRequirement(role="Backend Engineer", grade="Lead", required_skills={"SK_PYTHON": 5})],
    )
    assert result.status == "no_next_grade"
    assert result.next_grade is None
    assert result.requirements is None
    assert result.gaps == []
    assert result.remaining_points == 0


@pytest.mark.parametrize("required_skills", [{"SK_PYTHON": 3}, {}])
def test_requirements_met_is_explicit(required_skills):
    employee = Employee(
        employee_id="test",
        role="Backend Engineer",
        grade="Junior",
        tenure_months=0,
        skills={"SK_PYTHON": 4},
    )
    result = next_grade_progress(
        employee,
        [GradeRequirement(role=employee.role, grade="Middle", required_skills=required_skills)],
    )
    assert result.status == "requirements_met"
    assert result.next_grade == "Middle"
    assert result.remaining_points == 0
    assert all(gap.deficit == 0 for gap in result.gaps)
    assert employee.grade == "Junior"


def test_profile_includes_progress_and_own_history(client, employee_headers, hr_headers):
    response = client.get("/api/employees/SYN_E001", headers=employee_headers)
    assert response.status_code == 200
    profile = response.json()
    assert profile["progress"]["next_grade"] == "Middle"
    assert profile["progress"]["status"] == "needs_development"
    assert profile["progress"]["remaining_points"] == 7
    assert [gap["deficit"] for gap in profile["progress"]["gaps"]] == [2, 2, 2, 1]
    assert len(profile["history"]) == 2
    assert all(row["employee_id"] == "SYN_E001" for row in profile["history"])
    assert [row["date"] for row in profile["history"]] == ["2026-09-01", "2026-08-01"]
    lead = client.get("/api/employees/SYN_E005", headers=hr_headers).json()
    assert lead["progress"]["status"] == "no_next_grade"
    assert lead["progress"]["next_grade"] is None
