import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app import models, schemas
from app.data_loader import read_dataset, seed_database, validate_references
from app.main import create_app


@pytest.mark.parametrize("level", [-1, 6, 1.5, True, "3"])
def test_skill_levels_require_integers_in_range(level):
    with pytest.raises(ValidationError):
        schemas.Employee(
            employee_id="test",
            role="Backend Engineer",
            grade="Junior",
            tenure_months=0,
            skills={"SK_PYTHON": level},
        )


def test_dataset_event_adapter_and_gain_bounds():
    event = schemas.Event.model_validate(
        {
            "event_id": "test",
            "type": "course",
            "target_roles": ["Backend Engineer"],
            "target_grades": ["Junior"],
            "develops_skills": [{"skill_id": "SK_PYTHON", "gain": 1, "max_level": 3}],
        }
    )
    assert event.audience.roles == ["Backend Engineer"]
    assert event.skills[0].max_level == 3
    assert "develops_skills" not in event.model_dump()
    with pytest.raises(ValidationError):
        schemas.SkillGain(skill_id="SK_PYTHON", gain=1, max_level=6)


def test_synthetic_counts_and_labels(settings):
    dataset = read_dataset(settings.data_dir)
    assert (len(dataset.employees), len(dataset.events), len(dataset.catalog.skills)) == (10, 8, 15)
    assert len(dataset.history) == 12
    assert all(
        record.synthetic
        for record in [
            *dataset.employees,
            *dataset.events,
            *dataset.catalog.skills,
            *dataset.catalog.role_profiles,
            *dataset.history,
        ]
    )


def test_duplicate_ids_and_broken_references_are_rejected(settings):
    dataset = read_dataset(settings.data_dir)
    dataset.employees.append(dataset.employees[0])
    with pytest.raises(ValueError, match="Duplicate employee_id"):
        validate_references(dataset)
    dataset.employees.pop()
    dataset.history[0].event_id = "missing"
    with pytest.raises(ValueError, match="Unknown employee/event"):
        validate_references(dataset)


def test_restart_does_not_duplicate_or_reset_persisted_data(settings):
    with TestClient(create_app(settings)) as first:
        with first.app.state.session_factory.begin() as session:
            skill = session.get(models.EmployeeSkill, ("SYN_E001", "SK_PYTHON"))
            skill.level = 5
    with TestClient(create_app(settings)) as second:
        with second.app.state.session_factory() as session:
            assert session.scalar(select(func.count()).select_from(models.Employee)) == 10
            assert session.scalar(select(func.count()).select_from(models.Event)) == 8
            assert session.scalar(select(func.count()).select_from(models.Skill)) == 15
            assert session.scalar(select(func.count()).select_from(models.ActivityHistory)) == 12
            assert session.get(models.EmployeeSkill, ("SYN_E001", "SK_PYTHON")).level == 5


def test_completion_unique_key_and_foreign_keys(client):
    factory = client.app.state.session_factory
    with factory.begin() as session:
        session.add(
            models.Completion(employee_id="SYN_E001", event_id="SYN_EV001", completion_id="same")
        )
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            models.Completion(employee_id="SYN_E001", event_id="SYN_EV001", completion_id="same")
        )
    with factory.begin() as session:
        session.add(
            models.Completion(employee_id="SYN_E002", event_id="SYN_EV001", completion_id="same")
        )
        session.add(
            models.Completion(employee_id="SYN_E001", event_id="SYN_EV002", completion_id="same")
        )
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            models.Completion(
                employee_id="missing", event_id="SYN_EV001", completion_id="different"
            )
        )


def test_seed_transaction_rolls_back_on_invalid_reference(client, settings):
    dataset = read_dataset(settings.data_dir)
    dataset.employees[0].employee_id = "SYN_NEW"
    dataset.history[0].record_id = "SYN_NEW_HISTORY"
    dataset.history[0].event_id = "missing"
    factory = client.app.state.session_factory
    with pytest.raises(IntegrityError), factory.begin() as session:
        seed_database(session, dataset)
    with factory() as session:
        assert session.get(models.Employee, "SYN_NEW") is None
