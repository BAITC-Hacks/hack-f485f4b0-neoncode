from app.schemas import RecommendationsResponse, Source


def recommendations_stub(employee_id: str, source: Source) -> RecommendationsResponse:
    return RecommendationsResponse(
        employee_id=employee_id,
        status="not_implemented",
        source=source,
        recommendations=[],
        gaps=[],
    )
