from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app import models
from app.data_loader import employee_schema
from app.progress import completion_stub
from app.recommend import recommend_events
from app.routers.dependencies import ERROR_RESPONSES, EmployeeDependency, SessionDependency
from app.schemas import (
    ActivityHistory,
    CompleteRequest,
    CompletionResponse,
    Employee,
    Event,
    GradeRequirement,
    RecommendationsResponse,
)

router = APIRouter(prefix="/api/employees", tags=["employees"], responses=ERROR_RESPONSES)


@router.get("/{id}", response_model=Employee)
def get_employee(employee: EmployeeDependency) -> Employee:
    return employee_schema(employee)


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


@router.post("/{id}/complete", response_model=CompletionResponse, status_code=501)
def complete_event(
    body: CompleteRequest, employee: EmployeeDependency, session: SessionDependency
) -> CompletionResponse:
    """Contract stub: no completion, history or skill changes are persisted."""
    if session.get(models.Event, body.event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return completion_stub(employee_schema(employee), body)
