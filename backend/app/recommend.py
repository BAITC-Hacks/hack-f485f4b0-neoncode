import asyncio

from app.config import Settings
from app.gaps import calculate_gaps, next_requirement
from app.llm import select_recommendations
from app.schemas import (
    ActivityHistory,
    Employee,
    Event,
    GradeRequirement,
    Recommendation,
    RecommendationFactors,
    RecommendationsResponse,
    ScoringWeights,
    SkillImpact,
)


def similar_event_ids(candidate: Event, events: list[Event]) -> set[str]:
    skills = {skill.skill_id for skill in candidate.skills}
    return {
        event.event_id
        for event in events
        if skills.intersection(skill.skill_id for skill in event.skills)
    }


def factual_reasons(factors: RecommendationFactors) -> list[str]:
    skills = "; ".join(
        f"{skill.skill_id}: current {skill.current_level}, required {skill.required_level}, "
        f"gain {skill.gain}, cap {skill.max_level}, after {skill.level_after}, "
        f"deficit {skill.deficit}, closes {skill.covered_deficit}, "
        f"critical {'yes' if skill.critical else 'no'}, importance {skill.importance}"
        for skill in factors.skill_impacts
    )
    return [
        f"Grade: {factors.employee_grade} is in the audience; next grade "
        f"{factors.target_grade}; audience covers {factors.audience_grade_count} grades; "
        f"grade score {factors.grade_score}.",
        f"Deficit: closes {factors.covered_deficit} of {factors.total_deficit} missing "
        f"skill levels; deficit score {factors.deficit_score}.",
        f"Next-grade requirements: {skills}; importance score {factors.importance_score}.",
        f"History: {factors.no_show_count} no-shows and {factors.declined_count} declines "
        f"for events sharing developed skills; penalty {factors.history_penalty}; "
        "completed instances of this event: 0.",
    ]


def rank_candidates(
    employee: Employee,
    requirement: GradeRequirement,
    events: list[Event],
    history: list[ActivityHistory],
    completed_event_ids: set[str] | None = None,
) -> list[Recommendation]:
    history = [record for record in history if record.employee_id == employee.employee_id]
    completed = set(completed_event_ids or ()) | {
        record.event_id for record in history if record.status == "completed"
    }
    gaps = {gap.skill_id: gap for gap in calculate_gaps(employee, requirement)}
    total_deficit = sum(gap.deficit for gap in gaps.values())
    if not total_deficit:
        return []
    critical = set(requirement.critical_skills)
    weighted_total = sum(
        gap.deficit * (2 if gap.skill_id in critical else 1) for gap in gaps.values()
    )
    weights = ScoringWeights()
    ranked = []
    for event in events:
        if (
            event.mandatory
            or event.event_id in completed
            or employee.role not in event.audience.roles
            or employee.grade not in event.audience.grades
            or any(
                employee.skills.get(skill, 0) < level
                for skill, level in event.prerequisites.items()
            )
        ):
            continue
        impacts = []
        for developed in event.skills:
            gap = gaps.get(developed.skill_id)
            if gap is None or not gap.deficit:
                continue
            after = min(
                5,
                max(
                    gap.current_level, min(gap.current_level + developed.gain, developed.max_level)
                ),
            )
            covered = min(gap.deficit, after - gap.current_level)
            if covered:
                impacts.append(
                    SkillImpact(
                        **gap.model_dump(),
                        gain=developed.gain,
                        max_level=developed.max_level,
                        level_after=after,
                        effective_gain=after - gap.current_level,
                        covered_deficit=covered,
                        critical=gap.skill_id in critical,
                        importance=2 if gap.skill_id in critical else 1,
                    )
                )
        if not impacts:
            continue
        impacts.sort(key=lambda item: item.skill_id)
        related_ids = similar_event_ids(event, events)
        no_shows = sum(r.status == "no_show" for r in history if r.event_id in related_ids)
        declined = sum(r.status == "declined" for r in history if r.event_id in related_ids)
        covered = sum(impact.covered_deficit for impact in impacts)
        weighted_covered = sum(impact.covered_deficit * impact.importance for impact in impacts)
        grade_count = len(set(event.audience.grades))
        factors = RecommendationFactors(
            employee_grade=employee.grade,
            target_grade=requirement.grade,
            audience_grade_count=grade_count,
            skill_impacts=impacts,
            total_deficit=total_deficit,
            covered_deficit=covered,
            weighted_total_deficit=weighted_total,
            weighted_covered_deficit=weighted_covered,
            similar_event_ids=sorted(related_ids),
            no_show_count=no_shows,
            declined_count=declined,
            deficit_score=round(weights.deficit * covered / total_deficit, 6),
            importance_score=round(weights.importance * weighted_covered / weighted_total, 6),
            grade_score=round(weights.grade / grade_count, 6),
            history_penalty=min(
                weights.history_penalty_cap,
                weights.no_show * no_shows + weights.declined * declined,
            ),
            weights=weights,
        )
        reasons = factual_reasons(factors)
        ranked.append(
            Recommendation(
                event=event,
                score=round(
                    factors.deficit_score
                    + factors.importance_score
                    + factors.grade_score
                    - factors.history_penalty,
                    6,
                ),
                factors=factors,
                reasons=reasons,
                explanation=" ".join(reasons),
            )
        )
    return sorted(ranked, key=lambda item: (-item.score, item.event.event_id))


def recommend_events(
    employee: Employee,
    requirements: list[GradeRequirement],
    events: list[Event],
    history: list[ActivityHistory],
    settings: Settings,
    completed_event_ids: set[str] | None = None,
) -> RecommendationsResponse:
    requirement = next_requirement(employee, requirements)
    gaps = calculate_gaps(employee, requirement) if requirement else []
    response = RecommendationsResponse(
        employee_id=employee.employee_id,
        status="no_suitable_event",
        source="fallback",
        next_grade=requirement.grade if requirement else None,
        recommendations=[],
        gaps=gaps,
    )
    if requirement is None:
        return response
    if not any(gap.deficit for gap in gaps):
        response.status = "requirements_met"
        return response
    candidates = rank_candidates(employee, requirement, events, history, completed_event_ids)
    if not candidates:
        return response
    response.status = "ready"
    response.recommendations = candidates[:3]
    if settings.llm_api_key:
        shortlist = candidates[:8]
        related_ids = set().union(*(set(c.factors.similar_event_ids) for c in shortlist))
        relevant_history = [
            record
            for record in history
            if record.employee_id == employee.employee_id and record.event_id in related_ids
        ]
        selected = asyncio.run(
            select_recommendations(employee, gaps, relevant_history, shortlist, settings)
        )
        if selected is not None:
            response.source = "llm"
            response.recommendations = selected
    return response
