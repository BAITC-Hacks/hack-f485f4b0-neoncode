import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data/synthetic")))
    )
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'career_quest.db'}"
        )
    )
    llm_api_key: str | None = field(
        default_factory=lambda: os.getenv("LLM_API_KEY") or None, repr=False
    )
    llm_base_url: str = field(
        default_factory=lambda: os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
    )
    llm_model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "gpt-4o-mini"))
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
