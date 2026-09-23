import json
from time import perf_counter

import pytest
from sqlalchemy import event, func, select

from app import models


def profile(employee_id="SYN_IMPORT_1", **updates):
    return {
        "employee_id": employee_id,
        "role": "Backend Engineer",
        "grade": "Junior",
        "tenure_months": 1,
        "skills": {"SK_PYTHON": 1, "SK_SQL": 1},
        "synthetic": True,
        **updates,
    }


def history(**updates):
    return {
        "record_id": "SYN_IMPORT_HISTORY",
        "employee_id": "SYN_IMPORT_1",
        "event_id": "SYN_EV001",
        "date": "2026-09-23",
        "status": "in_progress",
        "synthetic": True,
        **updates,
    }


def test_import_three_profiles_immediately_recommends_under_two_seconds(
    client, hr_headers, monkeypatch
):
    def forbidden(*args):
        raise AssertionError("Fallback must not call LLM")

    monkeypatch.setattr("app.recommend.select_recommendations", forbidden)
    employees = [profile(f"SYN_IMPORT_{index}") for index in range(3)]
    started = perf_counter()
    imported = client.post(
        "/api/import", headers=hr_headers, json={"employees": employees, "history": []}
    )
    assert imported.status_code == 200
    assert imported.json()["employees_created"] == 3
    assert imported.json()["employees_imported"] == 3
    for employee in employees:
        employee_id = employee["employee_id"]
        response = client.get(
            f"/api/employees/{employee_id}/recommendations",
            headers={"X-Role": "employee", "X-Employee-Id": employee_id},
        )
        assert response.status_code == 200
        assert response.json()["source"] == "fallback"
        assert response.json()["status"] == "ready"
        assert response.json()["recommendations"]
    elapsed = perf_counter() - started
    print(f"Import 3 profiles + 3 fallback requests: {elapsed:.3f}s")
    assert elapsed < 2
    result = client.get("/api/employees", headers=hr_headers).json()
    assert result["total"] == 13
    assert all(
        e["recommendation_status"] == "ready"
        for e in result["employees"]
        if e["employee_id"].startswith("SYN_IMPORT")
    )


def test_upsert_replaces_profile_skills_and_updates_history_without_duplicates(client, hr_headers):
    payload = {"employees": [profile()], "history": [history()]}
    first = client.post("/api/import", headers=hr_headers, json=payload)
    assert first.status_code == 200
    assert first.json()["history_created"] == 1
    payload["employees"][0] = profile(grade="Middle", tenure_months=24, skills={"SK_SQL": 4})
    payload["history"][0].update(status="completed", completion_pct=100)
    for _ in range(2):
        response = client.post("/api/import", headers=hr_headers, json=payload)
        assert response.status_code == 200
        assert response.json()["employees_created"] == response.json()["history_created"] == 0
        assert response.json()["employees_updated"] == response.json()["history_updated"] == 1
    employee = client.get("/api/employees/SYN_IMPORT_1", headers=hr_headers).json()
    assert employee["grade"] == "Middle"
    assert employee["tenure_months"] == 24
    assert employee["skills"] == {"SK_SQL": 4}
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(models.ActivityHistory)) == 13
        row = session.get(models.ActivityHistory, "SYN_IMPORT_HISTORY")
        assert row.status == row.data["status"] == "completed"


def test_imported_completed_history_immediately_excludes_event(client, hr_headers):
    response = client.post(
        "/api/import",
        headers=hr_headers,
        json={
            "employees": [profile()],
            "history": [history(status="completed")],
        },
    )
    assert response.status_code == 200
    recommendations = client.get(
        "/api/employees/SYN_IMPORT_1/recommendations", headers=hr_headers
    ).json()
    assert [r["event"]["event_id"] for r in recommendations["recommendations"]] == ["SYN_EV002"]


def test_summary_separates_current_and_next_grade_and_missing_steps(
    client, hr_headers, monkeypatch
):
    ready_skills = {"SK_PYTHON": 3, "SK_SQL": 2, "SK_API": 2, "SK_TESTING": 2}
    response = client.post(
        "/api/import",
        headers=hr_headers,
        json={
            "employees": [
                profile("SYN_MET", skills=ready_skills),
                profile("SYN_NO_EVENT", skills={**ready_skills, "SK_API": 0}),
            ],
            "history": [],
        },
    )
    assert response.status_code == 200

    def forbidden(*args):
        raise AssertionError("HR must not call LLM")

    monkeypatch.setenv("LLM_API_KEY", "test-configured")
    monkeypatch.setattr("app.recommend.select_recommendations", forbidden)
    summary_response = client.get("/api/hr/summary", headers=hr_headers)
    assert summary_response.status_code == 200
    summary = summary_response.json()
    groups = summary["employees_without_step"]
    assert "SYN_MET" in [e["employee_id"] for e in groups["requirements_met"]]
    assert "SYN_NO_EVENT" in [e["employee_id"] for e in groups["no_suitable_event"]]
    assert "SYN_E005" in [e["employee_id"] for e in groups["no_suitable_event"]]
    for items in groups.values():
        assert [e["employee_id"] for e in items] == sorted(e["employee_id"] for e in items)
        assert all("score" not in employee and "rank" not in employee for employee in items)
    current = {g["skill_id"]: g for g in summary["current_grade_skill_gaps"]}
    upcoming = {g["skill_id"]: g for g in summary["next_grade_skill_gaps"]}
    assert current["SK_API"]["employees_affected"] == 5
    assert upcoming["SK_API"]["employees_affected"] == 5
    assert current["SK_API"]["employees_assessed"] == 7
    assert upcoming["SK_API"]["employees_assessed"] == 6
    for key in ("current_grade_skill_gaps", "next_grade_skill_gaps"):
        gaps = summary[key]
        assert gaps == sorted(
            gaps, key=lambda item: (-item["employees_affected"], item["skill_id"])
        )
    employees = client.get("/api/employees", headers=hr_headers).json()["employees"]
    assert (
        next(e for e in employees if e["employee_id"] == "SYN_MET")["recommendation_status"]
        == "requirements_met"
    )
    assert (
        next(e for e in employees if e["employee_id"] == "SYN_NO_EVENT")["recommendation_status"]
        == "no_suitable_event"
    )


def test_participation_counts_all_statuses_and_empty_events(client, hr_headers):
    summary = client.get("/api/hr/summary", headers=hr_headers).json()
    activities = {row["event_id"]: row for row in summary["participation_by_event"]}
    assert activities["SYN_EV001"] == {
        "event_id": "SYN_EV001",
        "title": "Synthetic Python foundations",
        "enrolled": 3,
        "completed": 1,
        "missed": 0,
        "declined": 0,
        "in_progress": 1,
        "dropped": 1,
        "overdue": 0,
    }
    assert activities["SYN_EV002"]["missed"] == 1
    assert activities["SYN_EV005"]["declined"] == 1
    assert activities["SYN_EV007"]["overdue"] == 1
    assert sum(row["enrolled"] for row in activities.values()) == 12
    for row in activities.values():
        assert row["enrolled"] == sum(
            row[key]
            for key in ("completed", "missed", "declined", "in_progress", "dropped", "overdue")
        )
    with client.app.state.session_factory.begin() as session:
        original = session.get(models.Event, "SYN_EV001")
        session.add(
            models.Event(
                event_id="SYN_EMPTY",
                type=original.type,
                data={**original.data, "event_id": "SYN_EMPTY"},
            )
        )
    summary = client.get("/api/hr/summary", headers=hr_headers).json()
    assert (
        next(row for row in summary["participation_by_event"] if row["event_id"] == "SYN_EMPTY")[
            "enrolled"
        ]
        == 0
    )


@pytest.mark.parametrize(
    "field,value,path",
    [
        ("skills", {"SK_PYTHON": 6}, ["skills", "SK_PYTHON"]),
        ("skills", {"UNKNOWN": 1}, ["skills", "UNKNOWN"]),
        ("role", "Unknown Role", ["role"]),
        ("grade", "Principal", ["grade"]),
        ("tenure_months", -1, ["tenure_months"]),
        ("manager_id", "UNKNOWN", ["manager_id"]),
    ],
)
def test_field_errors_reject_entire_import(client, hr_headers, field, value, path):
    payload = {"employees": [profile("SYN_GOOD"), profile(**{field: value})], "history": []}
    response = client.post("/api/import", headers=hr_headers, json=payload)
    assert response.status_code == 422
    assert ["body", "employees", 1, *path] in [error["loc"] for error in response.json()["detail"]]
    assert all(error["msg"] and error["type"] for error in response.json()["detail"])
    with client.app.state.session_factory() as session:
        assert session.get(models.Employee, "SYN_GOOD") is None
        assert session.get(models.Employee, "SYN_IMPORT_1") is None


def test_history_references_duplicates_and_record_ownership(client, hr_headers):
    for records, expected in [
        ([history(event_id="UNKNOWN")], "event_id"),
        ([history(employee_id="UNKNOWN")], "employee_id"),
        ([history(), history()], "record_id"),
        ([history(record_id="SYN_R001")], "record_id"),
    ]:
        response = client.post(
            "/api/import", headers=hr_headers, json={"employees": [profile()], "history": records}
        )
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"][-1] == expected
    response = client.post(
        "/api/import", headers=hr_headers, json={"employees": [profile(), profile()], "history": []}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "employees", 1, "employee_id"]


def test_manager_in_same_import_and_synthetic_marker(client, hr_headers):
    response = client.post(
        "/api/import",
        headers=hr_headers,
        json={
            "meta": {"synthetic": True},
            "employees": [
                profile(manager_id="SYN_MANAGER", synthetic=False),
                profile("SYN_MANAGER", grade="Lead"),
            ],
            "history": [history(synthetic=False)],
        },
    )
    assert response.status_code == 200
    assert client.get("/api/employees/SYN_IMPORT_1", headers=hr_headers).json()["synthetic"] is True
    with client.app.state.session_factory() as session:
        assert session.get(models.ActivityHistory, "SYN_IMPORT_HISTORY").data["synthetic"] is True


def test_storage_failure_rolls_back_import(client, hr_headers):
    def fail_history(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.startswith("INSERT INTO activity_history"):
            raise RuntimeError("Simulated history failure")

    event.listen(client.app.state.engine, "before_cursor_execute", fail_history)
    try:
        with pytest.raises(RuntimeError, match="Simulated history failure"):
            client.post(
                "/api/import",
                headers=hr_headers,
                json={"employees": [profile()], "history": [history()]},
            )
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", fail_history)
    with client.app.state.session_factory() as session:
        assert session.get(models.Employee, "SYN_IMPORT_1") is None


@pytest.mark.parametrize("format", ["csv", "json_array", "json_envelope"])
def test_import_files(client, hr_headers, format):
    employees = json.dumps({"meta": {"synthetic": True}, "employees": [profile(synthetic=False)]})
    if format == "csv":
        filename = "activity_history.csv"
        content = (
            "record_id,employee_id,event_id,date,status,score,synthetic\n"
            "SYN_IMPORT_HISTORY,SYN_IMPORT_1,SYN_EV001,2026-09-23,in_progress,,true\n"
        )
    else:
        filename = "history.json"
        content = json.dumps(
            [history()]
            if format == "json_array"
            else {"meta": {"synthetic": True}, "history": [history()]}
        )
    response = client.post(
        "/api/import",
        headers=hr_headers,
        files={
            "employees_file": ("employees.json", employees, "application/json"),
            "history_file": (
                filename,
                content,
                "text/csv" if format == "csv" else "application/json",
            ),
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["employees_created"] == response.json()["history_created"] == 1
    assert client.get("/api/employees/SYN_IMPORT_1", headers=hr_headers).json()["synthetic"] is True


@pytest.mark.parametrize(
    "content,path",
    [
        ("employee_id,event_id,date\nSYN_IMPORT_1,SYN_EV001,2026-09-23\n", ["body", "history"]),
        (
            "employee_id,event_id,date,status\nSYN_IMPORT_1,SYN_EV001,2026-09-23,completed,extra\n",
            ["body", "history", 0],
        ),
        (
            "employee_id,event_id,date,status\nSYN_IMPORT_1,SYN_EV001,wrong,completed\n",
            ["body", "history", 0, "date"],
        ),
    ],
)
def test_csv_errors(client, hr_headers, content, path):
    response = client.post(
        "/api/import",
        headers=hr_headers,
        files={
            "employees_file": ("employees.json", json.dumps([profile()]), "application/json"),
            "history_file": ("history.csv", content, "text/csv"),
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == path
    assert client.get("/api/employees/SYN_IMPORT_1", headers=hr_headers).status_code == 404


def test_bad_json_content_type_and_missing_file(client, hr_headers):
    response = client.post(
        "/api/import", headers={**hr_headers, "Content-Type": "application/json"}, content="{"
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "json_invalid"
    assert (
        client.post(
            "/api/import", headers={**hr_headers, "Content-Type": "text/plain"}, content="hello"
        ).status_code
        == 415
    )
    response = client.post(
        "/api/import", headers=hr_headers, files={"employees_file": ("employees.json", "[]")}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "history_file"]


def test_employee_cannot_upload_or_send_malformed_import(client, employee_headers):
    assert (
        client.post(
            "/api/import",
            headers=employee_headers,
            files={"employees_file": ("employees.json", "[]")},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/import",
            headers={**employee_headers, "Content-Type": "application/json"},
            content="{",
        ).status_code
        == 403
    )


def test_import_openapi_documents_json_and_file_uploads(client):
    content = client.get("/openapi.json").json()["paths"]["/api/import"]["post"]["requestBody"][
        "content"
    ]
    assert set(content) == {"application/json", "multipart/form-data"}
    assert content["application/json"]["schema"]["required"] == ["employees", "history"]
    assert (
        content["multipart/form-data"]["schema"]["properties"]["history_file"]["format"] == "binary"
    )
