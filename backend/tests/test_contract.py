import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import models
from app.config import BACKEND_DIR, Settings
from app.main import create_app


def test_employee_read_and_hr_list(client, employee_headers, hr_headers):
    response = client.get("/api/employees/SYN_E001", headers=employee_headers)
    assert response.status_code == 200
    assert response.json()["employee_id"] == "SYN_E001"
    assert response.json()["synthetic"] is True
    response = client.get("/api/employees", headers=hr_headers)
    assert response.status_code == 200
    assert response.json()["total"] == len(response.json()["employees"]) == 10
    assert client.get("/api/employees/SYN_E002", headers=hr_headers).status_code == 200


@pytest.mark.parametrize(
    "suffix,method,body",
    [
        ("", "GET", None),
        ("/recommendations", "GET", None),
        ("/complete", "POST", {"event_id": "SYN_EV001", "completion_id": "test"}),
    ],
)
def test_employee_cannot_access_other_profile(client, employee_headers, suffix, method, body):
    response = client.request(
        method, f"/api/employees/SYN_E002{suffix}", headers=employee_headers, json=body
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    "path,method,body",
    [
        ("/api/employees", "GET", None),
        ("/api/hr/summary", "GET", None),
        ("/api/import", "POST", {"employees": [], "history": []}),
    ],
)
def test_hr_routes_reject_employee(client, employee_headers, path, method, body):
    assert client.request(method, path, headers=employee_headers, json=body).status_code == 403


@pytest.mark.parametrize(
    "headers,status",
    [
        ({}, 401),
        ({"X-Role": "employee"}, 401),
        ({"X-Employee-Id": "SYN_E001"}, 401),
        ({"X-Role": "admin", "X-Employee-Id": "SYN_E001"}, 422),
        ({"X-Role": "employee", "X-Employee-Id": " "}, 422),
    ],
)
def test_identity_validation(client, headers, status):
    assert client.get("/api/employees/SYN_E001", headers=headers).status_code == status


def test_missing_employee_and_event(client, employee_headers, hr_headers):
    assert client.get("/api/employees/missing", headers=hr_headers).status_code == 404
    assert (
        client.post(
            "/api/employees/SYN_E001/complete",
            headers=employee_headers,
            json={"event_id": "missing", "completion_id": "test"},
        ).status_code
        == 404
    )


def test_recommendations_and_summary_contract(client, employee_headers, hr_headers):
    response = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["employee_id"] == "SYN_E001"
    assert body["status"] == "ready"
    assert body["source"] == "fallback"
    assert body["next_grade"] == "Middle"
    assert [r["event"]["event_id"] for r in body["recommendations"]] == ["SYN_EV001", "SYN_EV002"]
    assert all(len(r["reasons"]) == 4 for r in body["recommendations"])
    response = client.get("/api/hr/summary", headers=hr_headers)
    assert response.status_code == 200
    summary = response.json()
    assert summary["status"] == "ready"
    assert summary["total_employees"] == 10
    assert summary["total_events"] == 8
    assert summary["completed_activities"] == 6


def test_configured_key_uses_fallback_on_failure(settings, employee_headers, monkeypatch):
    async def unavailable(*args):
        return None

    monkeypatch.setattr("app.recommend.select_recommendations", unavailable)
    configured = Settings(
        data_dir=settings.data_dir, database_url=settings.database_url, llm_api_key="test-only"
    )
    with TestClient(create_app(configured)) as client:
        response = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers)
        assert response.json()["source"] == "fallback"
        assert response.json()["status"] == "ready"


def test_import_and_completion_cycle(client, employee_headers, hr_headers):
    profile = client.get("/api/employees/SYN_E001", headers=employee_headers).json()
    dataset_employee = {
        key: value for key, value in profile.items() if key not in {"progress", "history"}
    }
    response = client.post(
        "/api/import",
        headers=hr_headers,
        json={
            "meta": {"synthetic": True},
            "employees": [{**dataset_employee, "employee_id": "SYN_NEW"}],
            "history": [],
        },
    )
    assert response.status_code == 200
    headers = {"X-Role": "employee", "X-Employee-Id": "SYN_NEW"}
    path = "/api/employees/SYN_NEW"
    before = client.get(path + "/recommendations", headers=headers).json()
    event_id = before["recommendations"][0]["event"]["event_id"]
    first = None
    for _ in range(2):
        response = client.post(
            path + "/complete",
            headers=headers,
            json={"event_id": event_id, "completion_id": "same-request"},
        )
        assert response.status_code == 200
        first = first or response.json()
        assert response.json() == first
    updated = client.get(path, headers=headers).json()
    assert updated["skills"]["SK_PYTHON"] == 2
    assert updated["grade"] == "Junior"
    assert updated["skills"] == first["skills_after"]
    assert updated["progress"] == first["progress_after"]
    assert len(updated["history"]) == 1
    after = client.get(path + "/recommendations", headers=headers).json()
    assert after["source"] == "fallback"
    assert after["gaps"] == updated["progress"]["gaps"]
    assert after["recommendations"]
    assert event_id not in [r["event"]["event_id"] for r in after["recommendations"]]
    assert client.get("/api/employees/SYN_E001", headers=employee_headers).json() == profile
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(models.Completion)) == 1
        assert session.scalar(select(func.count()).select_from(models.ActivityHistory)) == 13
        assert session.get(models.Employee, "SYN_NEW") is not None


def test_import_rejects_invalid_dataset(client, hr_headers):
    response = client.post(
        "/api/import",
        headers=hr_headers,
        json={
            "employees": [
                {
                    "employee_id": "SYN_NEW",
                    "role": "Backend Engineer",
                    "grade": "Junior",
                    "tenure_months": 0,
                    "skills": {"SK_PYTHON": 6},
                }
            ],
            "history": [],
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "origin", ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"]
)
def test_cors_preflight(client, origin):
    response = client.options(
        "/api/employees/SYN_E001/complete",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-role,x-employee-id",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    response = client.options(
        "/api/employees",
        headers={
            "Origin": "http://untrusted.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in response.headers


def test_openapi_export_matches_runtime(client):
    exported = json.loads((BACKEND_DIR / "docs/openapi.json").read_text())
    assert exported == client.get("/openapi.json").json()
    assert set(exported["paths"]) == {
        "/api/employees/{id}",
        "/api/employees/{id}/recommendations",
        "/api/employees/{id}/complete",
        "/api/import",
        "/api/hr/summary",
        "/api/employees",
    }
    for path in exported["paths"].values():
        for operation in path.values():
            headers = {p["name"] for p in operation["parameters"] if p["in"] == "header"}
            assert headers == {"x-role", "x-employee-id"}
