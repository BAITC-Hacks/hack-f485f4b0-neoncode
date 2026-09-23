from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app import models
from app.data_loader import employee_schema
from app.gaps import employee_progress
from app.llm import configured_source
from app.progress import CompletionError, complete_event
from app.recommend import recommendations_stub
from app.routers.dependencies import (
    ERROR_RESPONSES,
    EmployeeDependency,
    EmployeeIdDependency,
    IdentityDependency,
    SessionDependency,
)
from app.schemas import (
    ActivityHistory,
    CompleteRequest,
    CompletionResponse,
    EmployeeProfile,
    ErrorResponse,
    RecommendationsResponse,
)

router = APIRouter(prefix="/api/employees", tags=["employees"], responses=ERROR_RESPONSES)


@router.get("/{id}", response_model=EmployeeProfile)
def get_employee(employee: EmployeeDependency, session: SessionDependency) -> EmployeeProfile:
    profile = employee_schema(employee)
    history = session.scalars(
        select(models.ActivityHistory)
        .where(models.ActivityHistory.employee_id == employee.employee_id)
        .order_by(models.ActivityHistory.date.desc(), models.ActivityHistory.record_id)
    )
    return EmployeeProfile(
        **profile.model_dump(),
        progress=employee_progress(session, profile),
        history=[
            ActivityHistory.model_validate(
                {
                    **row.data,
                    "record_id": row.record_id,
                    "employee_id": row.employee_id,
                    "event_id": row.event_id,
                    "date": row.date,
                    "status": row.status,
                }
            )
            for row in history
        ],
    )


@router.get("/{id}/recommendations", response_model=RecommendationsResponse)
def get_recommendations(request: Request, employee: EmployeeDependency) -> RecommendationsResponse:
    """Contract stub: no ranking, gap calculation or LLM calls."""
    return recommendations_stub(
        employee.employee_id, configured_source(request.app.state.settings.llm_api_key)
    )


@router.post(
    "/{id}/complete",
    response_model=CompletionResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Event audience does not match employee"},
        409: {"model": ErrorResponse, "description": "Stored completion has no replay response"},
    },
)
def post_completion(
    body: CompleteRequest,
    employee_id: EmployeeIdDependency,
    identity: IdentityDependency,
    session: SessionDependency,
) -> CompletionResponse:
    """Apply skill growth atomically; replay the saved response for the same completion key."""
    try:
        return complete_event(
            session, employee_id, body, assigned_by="hr" if identity.role == "hr" else "self"
        )
    except CompletionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
