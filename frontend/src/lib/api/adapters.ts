import type { Employee, Event } from "../domain";
import type { components } from "@/api/types";
import type { ImportRequest } from "@/api/client";

// Compatibility bridge for the standalone demo only. Live screens use API fields directly.
export type EmployeeDto = ImportRequest["employees"][number];
export type EventDto = components["schemas"]["Event"];
export function employeeFromApi(dto: EmployeeDto): Employee {
  return {
    ...dto,
    full_name: dto.full_name ?? dto.employee_id,
    department: dto.department ?? dto.role,
    career_goal: dto.career_goal ?? null,
    last_review_date: dto.last_review_date ?? null,
  };
}
export function eventFromApi(dto: EventDto): Event {
  // Unknown scheduling data must not be silently treated as a self-paced course.
  if (!dto.format || dto.duration_hours == null)
    throw new Error("Incomplete event scheduling data");
  return {
    event_id: dto.event_id,
    type: dto.type,
    title: dto.title ?? dto.event_id,
    description: dto.description ?? "",
    format: dto.format,
    duration_hours: dto.duration_hours,
    mandatory: dto.mandatory ?? false,
    target_roles: dto.audience.roles,
    target_grades: dto.audience.grades,
    develops_skills: dto.skills,
    prerequisites: dto.prerequisites ?? {},
    upcoming_sessions: dto.upcoming_sessions ?? [],
  };
}
