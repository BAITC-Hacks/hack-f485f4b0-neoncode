import pytest
from fastapi.testclient import TestClient

from app.config import BACKEND_DIR, Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(
        data_dir=BACKEND_DIR / "data/synthetic",
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        llm_api_key=None,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def employee_headers():
    return {"X-Role": "employee", "X-Employee-Id": "SYN_E001"}


@pytest.fixture
def hr_headers():
    return {"X-Role": "hr", "X-Employee-Id": "SYN_HR001"}
