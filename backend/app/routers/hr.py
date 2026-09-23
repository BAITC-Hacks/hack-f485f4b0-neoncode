from fastapi import APIRouter, Depends
from sqlalchemy import select

from app import models
from app.data_loader import employee_schema
from app.hr import import_stub, summary_stub
from app.routers.dependencies import ERROR_RESPONSES, SessionDependency, require_hr
from app.schemas import EmployeesResponse, HRSummaryResponse, ImportRequest, ImportResponse

router = APIRouter(
    prefix="/api", tags=["hr"], dependencies=[Depends(require_hr)], responses=ERROR_RESPONSES
)


@router.get("/employees", response_model=EmployeesResponse)
def list_employees(session: SessionDependency) -> EmployeesResponse:
    employees = session.scalars(select(models.Employee).order_by(models.Employee.employee_id)).all()
    return EmployeesResponse(
        employees=[employee_schema(e) for e in employees], total=len(employees)
    )


@router.post("/import", response_model=ImportResponse, status_code=501)
def import_data(body: ImportRequest) -> ImportResponse:
    """Validate the dataset-shaped payload without persisting it."""
    return import_stub(body)


@router.get("/hr/summary", response_model=HRSummaryResponse)
def get_summary() -> HRSummaryResponse:
    """Contract stub: null metrics have not been calculated."""
    return summary_stub()
