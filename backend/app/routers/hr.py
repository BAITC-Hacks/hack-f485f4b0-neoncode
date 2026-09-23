from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.hr import employee_list, hr_summary, load_hr_data
from app.importer import ImportValidationError, import_data
from app.routers.dependencies import ERROR_RESPONSES, SessionDependency, require_hr
from app.routers.imports import import_request_body, parse_import
from app.schemas import (
    EmployeesResponse,
    ErrorResponse,
    HRSummaryResponse,
    ImportRequest,
    ImportResponse,
    ImportValidationResponse,
)

router = APIRouter(
    prefix="/api", tags=["hr"], dependencies=[Depends(require_hr)], responses=ERROR_RESPONSES
)


@router.get("/employees", response_model=EmployeesResponse)
def list_employees(session: SessionDependency) -> EmployeesResponse:
    """Employees ordered by ID, with local recommendation status; no employee ranking."""
    return employee_list(load_hr_data(session))


@router.post(
    "/import",
    response_model=ImportResponse,
    openapi_extra={"requestBody": import_request_body()},
    responses={
        422: {
            "model": ImportValidationResponse,
            "description": "Field validation or reference errors",
        },
        413: {"model": ErrorResponse, "description": "Uploaded file exceeds 10 MiB"},
        415: {"model": ErrorResponse, "description": "Unsupported content type"},
    },
)
def post_import(
    body: Annotated[ImportRequest, Depends(parse_import)], session: SessionDependency
) -> ImportResponse:
    """Atomically upsert profiles and history; recommendations are immediately available."""
    try:
        return import_data(session, body)
    except ImportValidationError as exc:
        raise HTTPException(422, detail=[error.model_dump() for error in exc.errors]) from exc


@router.get("/hr/summary", response_model=HRSummaryResponse)
def get_summary(session: SessionDependency) -> HRSummaryResponse:
    """Aggregate current/next-grade gaps, missing steps and participation without ranking people."""
    return hr_summary(session)
