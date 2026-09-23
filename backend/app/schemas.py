from datetime import date as Date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^\S+$")]
SkillLevel = Annotated[int, Field(strict=True, ge=0, le=5)]
Grade = Literal["Junior", "Middle", "Senior", "Lead"]
Source = Literal["fallback", "llm"]
RecommendationStatus = Literal["ready", "no_suitable_event", "requirements_met"]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DatasetRecord(Schema):
    synthetic: bool = False


class CareerGoal(Schema):
    target_role: str
    target_grade: Grade


class Employee(DatasetRecord):
    employee_id: Identifier
    role: str = Field(min_length=1)
    grade: Grade
    tenure_months: int = Field(ge=0)
    skills: dict[Identifier, SkillLevel]
    full_name: str | None = None
    department: str | None = None
    manager_id: Identifier | None = None
    hire_date: Date | None = None
    work_format: Literal["office", "hybrid", "remote"] | None = None
    preferred_language: Literal["kk", "ru", "en"] | None = None
    career_goal: CareerGoal | None = None
    last_review_date: Date | None = None


class Skill(DatasetRecord):
    skill_id: Identifier
    name: str
    type: Literal["hard", "soft"]
    category: str
    description: str = ""


class GradeRequirement(DatasetRecord):
    role: str
    grade: Grade
    required_skills: dict[Identifier, SkillLevel]
    critical_skills: list[Identifier] = Field(default_factory=list)


class SkillGain(Schema):
    skill_id: Identifier
    gain: SkillLevel
    max_level: SkillLevel


class Audience(Schema):
    roles: list[str]
    grades: list[Grade]


class Event(DatasetRecord):
    event_id: Identifier
    type: Literal[
        "compliance", "onboarding", "course", "workshop", "mentoring", "certification", "meetup"
    ]
    audience: Audience
    skills: list[SkillGain]
    title: str | None = None
    description: str = ""
    format: Literal["online", "offline", "self_paced"] | None = None
    duration_hours: float | None = Field(default=None, ge=0)
    mandatory: bool = False
    prerequisites: dict[Identifier, SkillLevel] = Field(default_factory=dict)
    upcoming_sessions: list[Date] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def dataset_field_names(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        value = dict(value)
        if "target_roles" in value or "target_grades" in value:
            if "audience" in value:
                raise ValueError("Use audience or target_roles/target_grades, not both")
            value["audience"] = {
                "roles": value.pop("target_roles", []),
                "grades": value.pop("target_grades", []),
            }
        if "develops_skills" in value:
            if "skills" in value:
                raise ValueError("Use skills or develops_skills, not both")
            value["skills"] = value.pop("develops_skills")
        return value


class ActivityHistory(DatasetRecord):
    employee_id: Identifier
    event_id: Identifier
    date: Date
    status: Literal["completed", "in_progress", "dropped", "no_show", "declined", "overdue"]
    record_id: Identifier | None = None
    due_date: Date | None = None
    completion_pct: int | None = Field(default=None, ge=0, le=100)
    score: int | None = Field(default=None, ge=0, le=100)
    feedback_rating: int | None = Field(default=None, ge=1, le=5)
    assigned_by: Literal["self", "manager", "hr"] | None = None


class DatasetMeta(Schema):
    dataset: str = "Career Quest"
    version: str = "1.0"
    as_of_date: Date | None = None
    synthetic: bool = False


class EmployeesFile(Schema):
    meta: DatasetMeta = Field(default_factory=DatasetMeta)
    employees: list[Employee]


class HistoryFile(Schema):
    meta: DatasetMeta = Field(default_factory=DatasetMeta)
    history: list[ActivityHistory]


class EventsFile(Schema):
    meta: DatasetMeta = Field(default_factory=DatasetMeta)
    events: list[Event]


class SkillsFile(Schema):
    meta: DatasetMeta = Field(default_factory=DatasetMeta)
    proficiency_scale: dict[str, str] = Field(default_factory=dict)
    skills: list[Skill]
    role_profiles: list[GradeRequirement]


class SkillGap(Schema):
    skill_id: Identifier
    current_level: SkillLevel
    required_level: SkillLevel
    deficit: SkillLevel


class SkillImpact(SkillGap):
    gain: SkillLevel
    max_level: SkillLevel
    level_after: SkillLevel
    effective_gain: SkillLevel
    covered_deficit: SkillLevel
    critical: bool
    importance: int = Field(ge=1, le=2)


class ScoringWeights(Schema):
    deficit: float = 100
    importance: float = 30
    grade: float = 5
    no_show: float = 10
    declined: float = 15
    history_penalty_cap: float = 30


class RecommendationFactors(Schema):
    employee_grade: Grade
    target_grade: Grade
    audience_grade_count: int = Field(ge=1)
    skill_impacts: list[SkillImpact]
    total_deficit: int = Field(gt=0)
    covered_deficit: int = Field(gt=0)
    weighted_total_deficit: int = Field(gt=0)
    weighted_covered_deficit: int = Field(gt=0)
    similar_event_ids: list[Identifier]
    no_show_count: int = Field(ge=0)
    declined_count: int = Field(ge=0)
    deficit_score: float
    importance_score: float
    grade_score: float
    history_penalty: float
    weights: ScoringWeights


class Recommendation(Schema):
    event: Event
    score: float
    reasons: list[str]
    factors: RecommendationFactors
    explanation: str


class RecommendationsResponse(Schema):
    employee_id: Identifier
    status: RecommendationStatus
    source: Source
    next_grade: Grade | None
    recommendations: list[Recommendation]
    gaps: list[SkillGap]


class CompleteRequest(Schema):
    event_id: Identifier
    completion_id: Identifier


class CompletionResponse(Schema):
    employee_id: Identifier
    event_id: Identifier
    completion_id: Identifier
    status: Literal["completed", "already_completed", "not_implemented"]
    skills: dict[Identifier, SkillLevel]


class ImportRequest(Schema):
    meta: DatasetMeta = Field(default_factory=DatasetMeta)
    employees: list[Employee]
    history: list[ActivityHistory]


class ImportResponse(Schema):
    status: Literal["imported"]
    employees_received: int = Field(ge=0)
    history_received: int = Field(ge=0)
    employees_imported: int = Field(ge=0)
    history_imported: int = Field(ge=0)
    employees_created: int = Field(ge=0)
    employees_updated: int = Field(ge=0)
    history_created: int = Field(ge=0)
    history_updated: int = Field(ge=0)


class ImportFieldError(Schema):
    loc: list[str | int]
    msg: str
    type: str


class ImportValidationResponse(Schema):
    detail: list[ImportFieldError]


class SkillDeficiency(Schema):
    skill_id: Identifier
    name: str
    employees_affected: int = Field(ge=0)
    employees_assessed: int = Field(ge=0)
    total_deficit: int = Field(ge=0)


class EmployeeStep(Schema):
    employee_id: Identifier
    full_name: str | None
    role: str
    grade: Grade
    next_grade: Grade | None


class EmployeesWithoutStep(Schema):
    requirements_met: list[EmployeeStep]
    no_suitable_event: list[EmployeeStep]


class ActivityParticipation(Schema):
    event_id: Identifier
    title: str | None
    enrolled: int = Field(ge=0, description="All participation records, including completed ones")
    completed: int = Field(ge=0)
    missed: int = Field(ge=0)
    declined: int = Field(ge=0)
    in_progress: int = Field(ge=0)
    dropped: int = Field(ge=0)
    overdue: int = Field(ge=0)


class HRSummaryResponse(Schema):
    status: Literal["ready"]
    total_employees: int = Field(ge=0)
    total_events: int = Field(ge=0)
    completed_activities: int = Field(ge=0)
    employees_by_grade: dict[Grade, int]
    current_grade_skill_gaps: list[SkillDeficiency]
    next_grade_skill_gaps: list[SkillDeficiency]
    employees_without_step: EmployeesWithoutStep
    participation_by_event: list[ActivityParticipation]


class EmployeeListItem(Employee):
    recommendation_status: RecommendationStatus
    next_grade: Grade | None


class EmployeesResponse(Schema):
    employees: list[EmployeeListItem]
    total: int = Field(ge=0)


class ErrorResponse(Schema):
    detail: str
