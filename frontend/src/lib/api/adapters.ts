import type { Employee, Event, Grade, SkillGain, SkillLevels } from "../domain";
import { validateEmployees } from "../validation";
/** DTOs reflect the current backend contract; the UI never stores API-specific field names. */
export interface EmployeeDto {
  employee_id: string;
  role: string;
  grade: Grade;
  tenure_months: number;
  skills: SkillLevels;
  full_name?: string | null;
  department?: string | null;
  last_review_date?: string | null;
  career_goal?: Employee["career_goal"];
}
export interface EventDto {
  event_id: string;
  type: Event["type"];
  audience: { roles: string[]; grades: Grade[] };
  skills: SkillGain[];
  title?: string | null;
  description?: string;
  format?: Event["format"] | null;
  duration_hours?: number | null;
  mandatory?: boolean;
  prerequisites?: SkillLevels;
  upcoming_sessions?: string[];
}
export function employeeFromApi(dto: EmployeeDto): Employee {
  return validateEmployees([dto])[0];
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
