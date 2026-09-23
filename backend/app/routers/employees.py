from fastapi import APIRouter, HTTPException, Request

from app import models
from app.data_loader import employee_schema
from app.llm import configured_source
from app.progress import completion_stub
from app.recommend import recommendations_stub
from app.routers.dependencies import ERROR_RESPONSES, EmployeeDependency, SessionDependency
from app.schemas import CompleteRequest, CompletionResponse, Employee, RecommendationsResponse

router = APIRouter(prefix="/api/employees", tags=["employees"], responses=ERROR_RESPONSES)


@router.get("/{id}", response_model=Employee)
def get_employee(employee: EmployeeDependency) -> Employee:
    return employee_schema(employee)


@router.get("/{id}/recommendations", response_model=RecommendationsResponse)
def get_recommendations(request: Request, employee: EmployeeDependency) -> RecommendationsResponse:
    """Contract stub: no ranking, gap calculation or LLM calls."""
    return recommendations_stub(
        employee.employee_id, configured_source(request.app.state.settings.llm_api_key)
    )


@router.post("/{id}/complete", response_model=CompletionResponse, status_code=501)
def complete_event(
    body: CompleteRequest, employee: EmployeeDependency, session: SessionDependency
) -> CompletionResponse:
    """Contract stub: no completion, history or skill changes are persisted."""
    if session.get(models.Event, body.event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return completion_stub(employee_schema(employee), body)
