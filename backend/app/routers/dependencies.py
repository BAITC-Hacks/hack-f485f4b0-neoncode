from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app import models
from app.schemas import ErrorResponse

ERROR_RESPONSES = {
    401: {"model": ErrorResponse, "description": "Missing identity headers"},
    403: {"model": ErrorResponse, "description": "Access denied"},
    404: {"model": ErrorResponse, "description": "Employee or event not found"},
}


@dataclass(frozen=True)
class Identity:
    role: Literal["employee", "hr"]
    employee_id: str


def get_identity(
    x_role: Annotated[Literal["employee", "hr"] | None, Header()] = None,
    x_employee_id: Annotated[str | None, Header(min_length=1, pattern=r"^\S+$")] = None,
) -> Identity:
    if x_role is None or x_employee_id is None:
        raise HTTPException(status_code=401, detail="X-Role and X-Employee-Id are required")
    return Identity(role=x_role, employee_id=x_employee_id)


def require_hr(identity: Annotated[Identity, Depends(get_identity)]) -> Identity:
    if identity.role != "hr":
        raise HTTPException(status_code=403, detail="HR role required")
    return identity


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


SessionDependency = Annotated[Session, Depends(get_session)]


def accessible_employee_id(
    id: str,
    identity: Annotated[Identity, Depends(get_identity)],
) -> str:
    if identity.role != "hr" and identity.employee_id != id:
        raise HTTPException(status_code=403, detail="Employees may only access their own profile")
    return id


EmployeeIdDependency = Annotated[str, Depends(accessible_employee_id)]
IdentityDependency = Annotated[Identity, Depends(get_identity)]


def accessible_employee(
    employee_id: EmployeeIdDependency,
    session: SessionDependency,
) -> models.Employee:
    employee = session.get(models.Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


EmployeeDependency = Annotated[models.Employee, Depends(accessible_employee)]
