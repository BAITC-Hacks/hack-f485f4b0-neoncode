from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (CheckConstraint("tenure_months >= 0"),)

    employee_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str]
    grade: Mapped[str]
    tenure_months: Mapped[int]
    profile: Mapped[dict[str, Any]] = mapped_column(JSON)
    skills: Mapped[list["EmployeeSkill"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class Skill(Base):
    __tablename__ = "skills"

    skill_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)


class GradeRequirement(Base):
    __tablename__ = "grade_requirements"

    role: Mapped[str] = mapped_column(primary_key=True)
    grade: Mapped[str] = mapped_column(primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)


class EmployeeSkill(Base):
    __tablename__ = "employee_skills"
    __table_args__ = (CheckConstraint("level BETWEEN 0 AND 5"),)

    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.employee_id"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    level: Mapped[int]


class Event(Base):
    __tablename__ = "events"

    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str]
    data: Mapped[dict[str, Any]] = mapped_column(JSON)


class ActivityHistory(Base):
    __tablename__ = "activity_history"

    record_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.employee_id"), index=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.event_id"))
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str]
    data: Mapped[dict[str, Any]] = mapped_column(JSON)


class Completion(Base):
    __tablename__ = "completions"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "event_id", "completion_id", name="uq_completion_idempotency"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.employee_id"), index=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.event_id"))
    completion_id: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    response: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
