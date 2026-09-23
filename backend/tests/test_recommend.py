from datetime import date

import pytest

from app import models
from app.config import Settings
from app.recommend import rank_candidates, recommend_events
from app.schemas import ActivityHistory, Audience, Employee, Event, GradeRequirement, SkillGain


@pytest.fixture
def scenario():
    employee = Employee(
        employee_id="SYN_TEST",
        role="Engineer",
        grade="Middle",
        tenure_months=12,
        skills={"PUBLIC_SPEAKING": 0, "SYSTEM_DESIGN": 2, "SQL": 3},
        synthetic=True,
    )
    requirement = GradeRequirement(
        role="Engineer",
        grade="Senior",
        required_skills={"PUBLIC_SPEAKING": 3, "SYSTEM_DESIGN": 4, "SQL": 4},
        critical_skills=["SYSTEM_DESIGN"],
        synthetic=True,
    )
    events = [
        make_event("SYN_SPEAK", "PUBLIC_SPEAKING"),
        make_event("SYN_DESIGN", "SYSTEM_DESIGN"),
        make_event("SYN_SQL", "SQL"),
    ]
    return employee, requirement, events


def make_event(event_id, skill_id, gain=1, cap=5):
    return Event(
        event_id=event_id,
        type="workshop",
        synthetic=True,
        audience=Audience(roles=["Engineer"], grades=["Middle"]),
        skills=[SkillGain(skill_id=skill_id, gain=gain, max_level=cap)],
    )


def record(event_id, status, employee_id="SYN_TEST"):
    return ActivityHistory(
        employee_id=employee_id,
        event_id=event_id,
        status=status,
        date=date(2026, 9, 1),
        synthetic=True,
    )


def test_trap_weakest_public_speaking_with_three_no_shows(scenario):
    employee, requirement, events = scenario
    similar = [make_event(f"SYN_TALK_{index}", "PUBLIC_SPEAKING") for index in range(3)]
    for event in similar:
        event.mandatory = True
    history = [record(event.event_id, "no_show") for event in similar]
    ranked = rank_candidates(employee, requirement, events + similar, history)
    assert ranked[0].event.event_id == "SYN_DESIGN"
    speaking = next(item for item in ranked if item.event.event_id == "SYN_SPEAK")
    assert speaking.factors.no_show_count == 3
    assert speaking.factors.history_penalty == 30
    assert "3 no-shows" in speaking.explanation
    assert ranked[0].factors.skill_impacts[0].critical is True


def test_trap_high_advertised_gain_but_cap_blocks_required_skill(scenario):
    employee, requirement, events = scenario
    bait = make_event("SYN_HUGE_GAIN", "SYSTEM_DESIGN", gain=5, cap=2)
    bait.skills.append(SkillGain(skill_id="UNRELATED", gain=5, max_level=5))
    ranked = rank_candidates(employee, requirement, [bait, events[1]], [])
    assert [item.event.event_id for item in ranked] == ["SYN_DESIGN"]
    impact = ranked[0].factors.skill_impacts[0]
    assert (impact.current_level, impact.level_after, impact.covered_deficit) == (2, 3, 1)


def test_trap_gain_beyond_requirement_and_completed_event(scenario):
    employee, requirement, events = scenario
    events[1].skills[0].gain = 2
    events[2].skills[0].gain = 5
    completed = make_event("SYN_ALREADY_DONE", "SYSTEM_DESIGN", gain=5)
    ranked = rank_candidates(
        employee, requirement, events + [completed], [record(completed.event_id, "completed")]
    )
    assert ranked[0].event.event_id == "SYN_DESIGN"
    assert all(item.event.event_id != completed.event_id for item in ranked)
    sql = next(item for item in ranked if item.event.event_id == "SYN_SQL")
    assert sql.factors.skill_impacts[0].effective_gain == 2
    assert sql.factors.covered_deficit == 1


def test_score_components_and_numeric_explanation(scenario):
    employee, requirement, events = scenario
    ranked = rank_candidates(employee, requirement, events, [])
    design = next(item for item in ranked if item.event.event_id == "SYN_DESIGN")
    factors = design.factors
    assert factors.total_deficit == 6
    assert factors.covered_deficit == 1
    assert factors.weighted_total_deficit == 8
    assert factors.weighted_covered_deficit == 2
    assert factors.deficit_score == pytest.approx(100 / 6)
    assert factors.importance_score == 7.5
    assert factors.grade_score == 5
    assert factors.history_penalty == 0
    assert design.score == pytest.approx(100 / 6 + 7.5 + 5)
    assert len(design.reasons) == 4
    assert "current 2, required 4, gain 1, cap 5, after 3" in design.explanation


def test_similar_declines_penalize_but_other_employee_history_does_not(scenario):
    employee, requirement, events = scenario
    before = rank_candidates(employee, requirement, events, [])
    other_history = [record("SYN_DESIGN", "declined", employee_id="OTHER")]
    assert rank_candidates(employee, requirement, events, other_history) == before
    related = make_event("SYN_DESIGN_OLD", "SYSTEM_DESIGN")
    related.mandatory = True
    ranked = rank_candidates(
        employee, requirement, events + [related], [record(related.event_id, "declined")]
    )
    design = next(item for item in ranked if item.event.event_id == "SYN_DESIGN")
    assert design.factors.declined_count == 1
    assert design.factors.history_penalty == 15
    assert ranked[0].event.event_id != "SYN_DESIGN"


@pytest.mark.parametrize(
    "exclusion", ["role", "grade", "mandatory", "prerequisite", "zero_gain", "above_cap", "no_gap"]
)
def test_candidate_exclusions(scenario, exclusion):
    employee, requirement, events = scenario
    candidate = events[1]
    if exclusion == "role":
        candidate.audience.roles = ["Analyst"]
    elif exclusion == "grade":
        candidate.audience.grades = ["Senior"]
    elif exclusion == "mandatory":
        candidate.mandatory = True
    elif exclusion == "prerequisite":
        candidate.prerequisites = {"SQL": 5}
    elif exclusion == "zero_gain":
        candidate.skills[0].gain = 0
    elif exclusion == "above_cap":
        candidate.skills[0].max_level = 1
    else:
        employee.skills["SYSTEM_DESIGN"] = 5
    assert rank_candidates(employee, requirement, [candidate], []) == []


def test_grade_specificity_and_deterministic_ties(scenario):
    employee, requirement, _ = scenario
    broad = make_event("SYN_BROAD", "SYSTEM_DESIGN")
    broad.audience.grades = ["Junior", "Middle", "Senior", "Lead"]
    exact = make_event("SYN_EXACT", "SYSTEM_DESIGN")
    tied = exact.model_copy(update={"event_id": "SYN_TIED"})
    ranked = rank_candidates(employee, requirement, [tied, broad, exact], [])
    assert [r.event.event_id for r in ranked] == ["SYN_EXACT", "SYN_TIED", "SYN_BROAD"]
    assert ranked[-1].factors.grade_score == 1.25


@pytest.mark.parametrize("state", ["met", "no_events", "no_next_grade"])
def test_empty_states_skip_llm(scenario, state, monkeypatch):
    employee, requirement, events = scenario
    if state == "met":
        employee.skills = dict(requirement.required_skills)
    elif state == "no_events":
        events = []
    else:
        employee.grade = "Lead"

    def forbidden(*args):
        raise AssertionError("LLM must not be called without candidates")

    monkeypatch.setattr("app.recommend.select_recommendations", forbidden)
    result = recommend_events(employee, [requirement], events, [], Settings(llm_api_key="test"))
    assert result.status == ("requirements_met" if state == "met" else "no_suitable_event")
    assert result.source == "fallback"
    assert result.recommendations == []
    assert result.next_grade == (None if state == "no_next_grade" else "Senior")


def test_no_key_fallback_limits_to_three_and_ignores_other_roles(scenario, monkeypatch):
    employee, requirement, _ = scenario
    events = [make_event(f"SYN_{index}", "SYSTEM_DESIGN") for index in range(10)]

    def forbidden(*args):
        raise AssertionError("LLM must not be called without a key")

    monkeypatch.setattr("app.recommend.select_recommendations", forbidden)
    unrelated = GradeRequirement(role="Other", grade="Senior", required_skills={"UNRELATED": 5})
    result = recommend_events(
        employee, [unrelated, requirement], events, [], Settings(llm_api_key=None)
    )
    assert result.source == "fallback"
    assert len(result.recommendations) == 3
    assert result.recommendations[0].event.event_id == "SYN_0"


def test_db_completion_and_history_exclude_events_from_api(client, employee_headers):
    with client.app.state.session_factory.begin() as session:
        session.add(
            models.Completion(
                employee_id="SYN_E001", event_id="SYN_EV001", completion_id="previous"
            )
        )
    result = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers).json()
    assert [r["event"]["event_id"] for r in result["recommendations"]] == ["SYN_EV002"]
    with client.app.state.session_factory.begin() as session:
        session.add(
            models.ActivityHistory(
                record_id="SYN_COMPLETE_SQL",
                employee_id="SYN_E001",
                event_id="SYN_EV002",
                date=date(2026, 9, 2),
                status="completed",
                data=ActivityHistory(
                    employee_id="SYN_E001",
                    event_id="SYN_EV002",
                    date=date(2026, 9, 2),
                    status="completed",
                    synthetic=True,
                ).model_dump(mode="json"),
            )
        )
    result = client.get("/api/employees/SYN_E001/recommendations", headers=employee_headers).json()
    assert result["status"] == "no_suitable_event"
    assert result["recommendations"] == []
