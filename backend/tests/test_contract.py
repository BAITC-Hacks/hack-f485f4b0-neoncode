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


def test_recommendations_and_summary_are_explicit_stubs(client, employee_headers, hr_headers):
    response = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers)
    assert response.status_code == 200
    assert response.json() == {
        "employee_id": "SYN_E001",
        "status": "not_implemented",
        "source": "mock",
        "recommendations": [],
        "gaps": [],
    }
    response = client.get("/api/hr/summary", headers=hr_headers)
    assert response.status_code == 200
    assert response.json() == {
        "status": "not_implemented",
        "total_employees": None,
        "total_events": None,
        "completed_activities": None,
        "employees_by_grade": None,
    }


def test_configured_key_does_not_claim_live_llm(settings, employee_headers):
    configured = Settings(
        data_dir=settings.data_dir, database_url=settings.database_url, llm_api_key="test-only"
    )
    with TestClient(create_app(configured)) as client:
        response = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers)
        assert response.json()["source"] == "fallback"
        assert response.json()["status"] == "not_implemented"


def test_write_stubs_do_not_mutate_state(client, employee_headers, hr_headers):
    profile = client.get("/api/employees/SYN_E001", headers=employee_headers).json()
    for _ in range(2):
        response = client.post(
            "/api/employees/SYN_E001/complete",
            headers=employee_headers,
            json={"event_id": "SYN_EV001", "completion_id": "same-request"},
        )
        assert response.status_code == 501
        assert response.json()["status"] == "not_implemented"
        assert response.json()["skills"] == profile["skills"]
    response = client.post(
        "/api/import",
        headers=hr_headers,
        json={
            "meta": {"synthetic": True},
            "employees": [{**profile, "employee_id": "SYN_NEW"}],
            "history": [
                {
                    "employee_id": "SYN_NEW",
                    "event_id": "SYN_EV001",
                    "date": "2026-09-23",
                    "status": "completed",
                    "synthetic": True,
                }
            ],
        },
    )
    assert response.status_code == 501
    assert response.json() == {
        "status": "not_implemented",
        "employees_received": 1,
        "history_received": 1,
        "employees_imported": 0,
        "history_imported": 0,
    }
    assert client.get("/api/employees/SYN_E001", headers=employee_headers).json() == profile
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(models.Completion)) == 0
        assert session.scalar(select(func.count()).select_from(models.ActivityHistory)) == 12
        assert session.get(models.Employee, "SYN_NEW") is None


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


def test_cors_preflight(client):
    response = client.options(
        "/api/employees/SYN_E001/complete",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-role,x-employee-id",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
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
