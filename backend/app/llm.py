from app.schemas import Employee, Event, Recommendation, Source


def configured_source(api_key: str | None) -> Source:
    # No provider is connected yet, even when a key is configured.
    return "fallback" if api_key else "mock"


def select_recommendations(employee: Employee, candidates: list[Event]) -> list[Recommendation]:
    """Reserved for validated selection from candidates; no external calls."""
    raise NotImplementedError("LLM recommendation selection is not implemented")
