from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import event, func, select

from app import models

PATH = "/api/employees/SYN_E001/complete"
REQUEST = {"event_id": "SYN_EV001", "completion_id": "test-completion"}


def assert_persisted(client, level, completions, history_count):
    with client.app.state.session_factory() as session:
        assert session.get(models.EmployeeSkill, ("SYN_E001", "SK_PYTHON")).level == level
        assert session.get(models.Employee, "SYN_E001").grade == "Junior"
        assert session.scalar(select(func.count()).select_from(models.Completion)) == completions
        assert (
            session.scalar(select(func.count()).select_from(models.ActivityHistory))
            == history_count
        )


@pytest.mark.parametrize(
    "current,gain,cap,expected",
    [
        (1, 1, 3, 2),
        (2, 3, 3, 3),
        (4, 1, 3, 4),
        (5, 5, 5, 5),
        (None, 1, 3, 1),
    ],
)
def test_skill_growth(client, employee_headers, current, gain, cap, expected):
    with client.app.state.session_factory.begin() as session:
        employee = session.get(models.Employee, "SYN_E001")
        skill = next(skill for skill in employee.skills if skill.skill_id == "SK_PYTHON")
        if current is None:
            employee.skills.remove(skill)
        else:
            skill.level = current
        row = session.get(models.Event, "SYN_EV001")
        row.data = {
            **row.data,
            "skills": [{"skill_id": "SK_PYTHON", "gain": gain, "max_level": cap}],
        }

    response = client.post(PATH, headers=employee_headers, json=REQUEST)
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "completed"
    assert result["skills_before"].get("SK_PYTHON") == current
    assert result["skills_after"]["SK_PYTHON"] == expected
    assert result["progress_after"]["remaining_points"] == 5 + max(0, 3 - expected)
    assert_persisted(client, expected, 1, 13)
    profile = client.get("/api/employees/SYN_E001", headers=employee_headers).json()
    assert profile["progress"] == result["progress_after"]
    assert len(profile["history"]) == 3
    completed = [h for h in profile["history"] if h["record_id"].startswith("completion-")]
    assert len(completed) == 1
    assert completed[0]["status"] == "completed"
    assert completed[0]["completion_pct"] == 100
    assert completed[0]["assigned_by"] == "self"
    assert completed[0]["synthetic"] is True


def test_repeated_completion_replays_original_response(client, employee_headers):
    first = client.post(PATH, headers=employee_headers, json=REQUEST)
    repeated = client.post(PATH, headers=employee_headers, json=REQUEST)
    assert first.status_code == repeated.status_code == 200
    assert first.json() == repeated.json()
    assert_persisted(client, 2, 1, 13)

    later = client.post(PATH, headers=employee_headers, json={**REQUEST, "completion_id": "later"})
    assert later.status_code == 200
    assert later.json()["skills_after"]["SK_PYTHON"] == 3
    replay = client.post(PATH, headers=employee_headers, json=REQUEST)
    assert replay.status_code == 200
    assert replay.json() == first.json()
    assert_persisted(client, 3, 2, 14)


@pytest.mark.parametrize("same_key", [True, False])
def test_concurrent_completions_are_serialized(client, employee_headers, same_key):
    barrier = Barrier(2)

    def submit(index):
        barrier.wait(timeout=10)
        body = {**REQUEST, "completion_id": "same" if same_key else f"request-{index}"}
        return client.post(PATH, headers=employee_headers, json=body)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(submit, range(2)))
    assert all(response.status_code == 200 for response in responses)
    if same_key:
        assert responses[0].json() == responses[1].json()
        assert_persisted(client, 2, 1, 13)
    else:
        assert sorted(r.json()["skills_before"]["SK_PYTHON"] for r in responses) == [1, 2]
        assert_persisted(client, 3, 2, 14)


@pytest.mark.parametrize("employee_id", ["SYN_E001", "SYN_E007"])
def test_event_must_match_both_role_and_grade(client, employee_id):
    response = client.post(
        f"/api/employees/{employee_id}/complete",
        headers={"X-Role": "employee", "X-Employee-Id": employee_id},
        json={"event_id": "SYN_EV003", "completion_id": "not-eligible"},
    )
    assert response.status_code == 400
    assert_persisted(client, 1, 0, 12)


def test_other_employee_cannot_complete_event(client):
    response = client.post(
        PATH, headers={"X-Role": "employee", "X-Employee-Id": "SYN_E002"}, json=REQUEST
    )
    assert response.status_code == 403
    assert_persisted(client, 1, 0, 12)


def test_hr_completion_and_event_without_skill_gains(client, hr_headers):
    response = client.post(PATH, headers=hr_headers, json={**REQUEST, "event_id": "SYN_EV007"})
    assert response.status_code == 200
    assert response.json()["skills_before"] == response.json()["skills_after"]
    assert_persisted(client, 1, 1, 13)
    profile = client.get("/api/employees/SYN_E001", headers=hr_headers).json()
    history = next(h for h in profile["history"] if h["record_id"].startswith("completion-"))
    assert history["assigned_by"] == "hr"


def test_failure_saving_completion_rolls_back_skills_and_history(client, employee_headers):
    engine = client.app.state.engine

    def fail_completion(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.startswith("INSERT INTO completions"):
            raise RuntimeError("Simulated completion storage failure")

    event.listen(engine, "before_cursor_execute", fail_completion)
    try:
        with pytest.raises(RuntimeError, match="Simulated completion storage failure"):
            client.post(PATH, headers=employee_headers, json=REQUEST)
    finally:
        event.remove(engine, "before_cursor_execute", fail_completion)
    assert_persisted(client, 1, 0, 12)
    assert client.post(PATH, headers=employee_headers, json=REQUEST).status_code == 200
    assert_persisted(client, 2, 1, 13)


def test_requirements_met_does_not_promote_employee(client, employee_headers):
    with client.app.state.session_factory.begin() as session:
        employee = session.get(models.Employee, "SYN_E001")
        for skill in employee.skills:
            if skill.skill_id in {"SK_PYTHON", "SK_SQL", "SK_API"}:
                skill.level = 2
        employee.skills.append(models.EmployeeSkill(skill_id="SK_TESTING", level=2))
    result = client.post(PATH, headers=employee_headers, json=REQUEST).json()
    assert result["progress_after"]["status"] == "requirements_met"
    assert result["progress_after"]["next_grade"] == "Middle"
    assert result["progress_after"]["remaining_points"] == 0
    assert_persisted(client, 3, 1, 13)
