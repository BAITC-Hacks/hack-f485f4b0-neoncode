import asyncio
import json
import time

import httpx
import pytest

from app import llm
from app.config import Settings
from app.recommend import recommend_events
from app.schemas import ActivityHistory, Employee, Event, GradeRequirement


@pytest.fixture
def llm_data():
    employee = Employee(
        employee_id="SYN_LLM",
        full_name="Synthetic private name",
        role="Engineer",
        grade="Junior",
        tenure_months=2,
        skills={"PYTHON": 1},
        synthetic=True,
    )
    requirement = GradeRequirement(
        role="Engineer",
        grade="Middle",
        required_skills={"PYTHON": 3},
        critical_skills=["PYTHON"],
        synthetic=True,
    )
    events = [
        Event.model_validate(
            {
                "event_id": f"SYN_EVENT_{index}",
                "type": "course",
                "audience": {"roles": ["Engineer"], "grades": ["Junior"]},
                "skills": [{"skill_id": "PYTHON", "gain": 1, "max_level": 3}],
                "synthetic": True,
            }
        )
        for index in range(10)
    ]
    history = [
        ActivityHistory.model_validate(
            {
                "employee_id": employee.employee_id,
                "event_id": "SYN_EVENT_0",
                "date": "2026-09-01",
                "status": "no_show",
                "synthetic": True,
            }
        )
    ]
    return employee, [requirement], events, history


def mock_transport(monkeypatch, handler):
    client_class = httpx.AsyncClient
    monkeypatch.setattr(
        llm.httpx,
        "AsyncClient",
        lambda **kwargs: client_class(transport=httpx.MockTransport(handler), **kwargs),
    )


def valid_choice(request, index=0):
    payload = json.loads(json.loads(request.content)["messages"][1]["content"])
    candidate = payload["candidates"][index]
    return {
        "event_id": candidate["event"]["event_id"],
        "explanation": " ".join(reversed(candidate["facts"])),
    }


def provider_response(choices, **kwargs):
    return httpx.Response(
        200,
        json={
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": json.dumps({"recommendations": choices})},
                    **kwargs,
                }
            ]
        },
    )


def test_llm_selects_only_from_top_eight_with_minimized_profile_and_relevant_history(
    llm_data, monkeypatch
):
    employee, requirements, events, history = llm_data
    history.append(history[0].model_copy(update={"employee_id": "OTHER"}))
    history.append(history[0].model_copy(update={"event_id": "UNRELATED"}))
    requests = []

    def handler(request):
        requests.append(request)
        return provider_response([valid_choice(request, 1), valid_choice(request, 0)])

    mock_transport(monkeypatch, handler)
    result = recommend_events(
        employee,
        requirements,
        events,
        history,
        Settings(
            llm_api_key="test-key", llm_base_url="https://llm.example/v1", llm_model="test-model"
        ),
    )
    assert result.source == "llm"
    assert [r.event.event_id for r in result.recommendations] == ["SYN_EVENT_1", "SYN_EVENT_0"]
    assert result.recommendations[0].explanation == " ".join(
        reversed(result.recommendations[0].reasons)
    )
    assert len(requests) == 1
    request = requests[0]
    body = json.loads(request.content)
    payload = json.loads(body["messages"][1]["content"])
    assert str(request.url) == "https://llm.example/v1/chat/completions"
    assert body["model"] == "test-model"
    assert body["response_format"] == {"type": "json_object"}
    assert set(request.extensions["timeout"].values()) == {8.0}
    assert request.headers["authorization"] == "Bearer test-key"
    assert len(payload["candidates"]) == 8
    assert payload["gaps"][0]["deficit"] == 2
    assert set(payload["profile"]) == {"role", "grade", "tenure_months", "skills"}
    assert payload["relevant_history"] == [
        {"event_id": "SYN_EVENT_0", "date": "2026-09-01", "status": "no_show"}
    ]
    assert "Synthetic private name" not in request.content.decode()
    assert "test-key" not in request.content.decode()


@pytest.mark.parametrize(
    "failure",
    [
        "unknown_id",
        "outside_shortlist",
        "duplicate",
        "empty",
        "too_many",
        "wrong_number",
        "swapped_numbers",
        "missing_factor",
        "judgment",
        "extra_field",
        "bad_json",
        "refusal",
        "truncated",
        "missing_choices",
        "http_error",
        "network_error",
        "read_timeout",
    ],
)
def test_llm_failures_return_exact_fallback(llm_data, monkeypatch, failure):
    expected = recommend_events(*llm_data, Settings(llm_api_key=None))

    def handler(request):
        if failure == "network_error":
            raise httpx.ConnectError("Offline", request=request)
        if failure == "read_timeout":
            raise httpx.ReadTimeout("Timed out", request=request)
        if failure == "http_error":
            return httpx.Response(503)
        if failure == "missing_choices":
            return httpx.Response(200, json={})
        choice = valid_choice(request)
        choices = [choice]
        if failure == "unknown_id":
            choice["event_id"] = "INVENTED"
        elif failure == "outside_shortlist":
            choice["event_id"] = "SYN_EVENT_9"
        elif failure == "duplicate":
            choices = [choice, choice]
        elif failure == "empty":
            choices = []
        elif failure == "too_many":
            choices = [valid_choice(request, index) for index in range(4)]
        elif failure == "wrong_number":
            choice["explanation"] = choice["explanation"].replace("current 1", "current 5")
        elif failure == "swapped_numbers":
            choice["explanation"] = choice["explanation"].replace(
                "current 1, required 3", "current 3, required 1"
            )
        elif failure == "missing_factor":
            choice["explanation"] = choice["explanation"].split("History:")[0]
        elif failure == "judgment":
            choice["explanation"] += " This employee is lazy."
        elif failure == "extra_field":
            choice["score"] = 999
        elif failure == "bad_json":
            return provider_response([], message={"content": "not JSON"})
        elif failure == "refusal":
            return provider_response([], message={"content": None, "refusal": "Refused"})
        elif failure == "truncated":
            return provider_response(choices, finish_reason="length")
        return provider_response(choices)

    mock_transport(monkeypatch, handler)
    result = recommend_events(*llm_data, Settings(llm_api_key="test"))
    assert result == expected


def test_total_timeout_cancels_request_and_returns_fallback(llm_data, monkeypatch):
    assert llm.LLM_TIMEOUT_SECONDS == 8.0
    monkeypatch.setattr(llm, "LLM_TIMEOUT_SECONDS", 0.03)
    cancelled = []

    async def handler(request):
        try:
            await asyncio.sleep(1)
        except asyncio.CancelledError:
            cancelled.append(True)
            raise
        return provider_response([valid_choice(request)])

    mock_transport(monkeypatch, handler)
    start = time.monotonic()
    result = recommend_events(*llm_data, Settings(llm_api_key="test"))
    assert time.monotonic() - start < 0.5
    assert cancelled == [True]
    assert result.source == "fallback"
    assert len(result.recommendations) == 3


def test_llm_api_response_source(client, employee_headers, monkeypatch):
    client.app.state.settings = Settings(llm_api_key="test-key")
    mock_transport(monkeypatch, lambda request: provider_response([valid_choice(request)]))
    response = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers)
    assert response.status_code == 200
    assert response.json()["source"] == "llm"
    assert len(response.json()["recommendations"]) == 1
