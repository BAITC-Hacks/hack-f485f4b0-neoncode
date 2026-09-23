from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app import models
from app.data_loader import employee_schema
from app.gaps import employee_progress
from app.progress import CompletionError, complete_event
from app.recommend import recommend_events
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
    Event,
    GradeRequirement,
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
def get_recommendations(
    request: Request, employee: EmployeeDependency, session: SessionDependency
) -> RecommendationsResponse:
    """Recommend eligible events using explicit scores and validated optional LLM selection."""
    requirements = session.scalars(
        select(models.GradeRequirement).where(models.GradeRequirement.role == employee.role)
    ).all()
    events = session.scalars(select(models.Event).order_by(models.Event.event_id)).all()
    history = session.scalars(
        select(models.ActivityHistory)
        .where(models.ActivityHistory.employee_id == employee.employee_id)
        .order_by(models.ActivityHistory.date, models.ActivityHistory.record_id)
    ).all()
    completed_ids = set(
        session.scalars(
            select(models.Completion.event_id).where(
                models.Completion.employee_id == employee.employee_id
            )
        )
    )
    return recommend_events(
        employee_schema(employee),
        [GradeRequirement.model_validate(row.data) for row in requirements],
        [Event.model_validate(row.data) for row in events],
        [ActivityHistory.model_validate(row.data) for row in history],
        request.app.state.settings,
        completed_ids,
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
