import { data, today, grades } from "./data";
import type {
  Employee,
  Event,
  History,
  CareerGoal,
  SkillLevels,
  RoleProfile,
} from "./domain";
export { data, today, grades } from "./data";
export type { Employee, Event, History, CareerGoal, Grade } from "./domain";
export {
  parseHistory,
  validateEmployees,
  validateHistory,
  isDatasetDate,
} from "./validation";
export const skillName = (id: string) =>
  data.skills.find((s) => s.skill_id === id)?.name ?? id;
export function target(employee: Employee) {
  return data.role_profiles.find(
    (p) =>
      p.role === (employee.career_goal?.target_role ?? employee.role) &&
      p.grade === (employee.career_goal?.target_grade ?? employee.grade),
  )!;
}
export function suggestedGoal(employee: Employee): CareerGoal | null {
  const next = grades[grades.indexOf(employee.grade) + 1];
  return next ? { target_role: employee.role, target_grade: next } : null;
}
export function levels(employee: Employee, history: History[]) {
  const result: Record<string, number> = Object.fromEntries(
    Object.entries(employee.skills).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
  history
    .filter(
      (h) =>
        h.employee_id === employee.employee_id &&
        h.status === "completed" &&
        (h.demo_completion ||
          (employee.last_review_date !== null &&
            h.date > employee.last_review_date)) &&
        h.date <= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((h) => {
      data.events
        .find((e) => e.event_id === h.event_id)
        ?.develops_skills.forEach((s) => {
          result[s.skill_id] = Math.max(
            result[s.skill_id] ?? 0,
            Math.min(s.max_level, (result[s.skill_id] ?? 0) + s.gain),
          );
        });
    });
  return result;
}
export function readiness(current: SkillLevels, goal: RoleProfile) {
  const requirements = Object.entries(goal.required_skills) as [
    string,
    number,
  ][];
  const total = requirements.reduce((sum, [, n]) => sum + n, 0);
  return total
    ? Math.round(
        (100 *
          requirements.reduce(
            (sum, [id, n]) => sum + Math.min(current[id] ?? 0, n),
            0,
          )) /
          total,
      )
    : 100;
}
export function progress(employee: Employee, history: History[]) {
  return readiness(levels(employee, history), target(employee));
}
export function recommendations(employee: Employee, history: History[]) {
  const current = levels(employee, history),
    goal = target(employee);
  const own = history.filter((h) => h.employee_id === employee.employee_id);
  return data.events
    .filter(
      (event) => enrollmentBlock(employee, history, event, current) === null,
    )
    .map((event) => {
      const gains = event.develops_skills
        .map((s) => ({
          id: s.skill_id,
          current: current[s.skill_id] ?? 0,
          required:
            (goal.required_skills as Partial<Record<string, number>>)[
              s.skill_id
            ] ?? 0,
          gain: Math.max(
            0,
            Math.min(s.gain, s.max_level - (current[s.skill_id] ?? 0)),
          ),
          critical: goal.critical_skills.includes(s.skill_id),
        }))
        .filter((s) => s.gain > 0 && s.current < s.required);
      const similar = own.filter(
        (h) =>
          data.events.find((e) => e.event_id === h.event_id)?.type ===
          event.type,
      );
      const skipped = similar.filter((h) =>
        ["no_show", "dropped", "declined"].includes(h.status),
      ).length;
      const completed = similar.filter((h) => h.status === "completed").length;
      const score =
        (gains.reduce(
          (n, s) =>
            n + Math.min(s.gain, s.required - s.current) * (s.critical ? 3 : 1),
          0,
        ) *
          (1 + (completed / (similar.length + 1)) * 0.2)) /
        (1 + skipped * 0.35) /
        (1 + event.duration_hours / 40);
      return { event, gains, skipped, completed, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function enrollmentBlock(
  employee: Employee,
  history: History[],
  event: Event,
  current: SkillLevels = levels(employee, history),
): string | null {
  const own = history.filter((h) => h.employee_id === employee.employee_id);
  if (
    own.some((h) => h.event_id === event.event_id && h.status === "in_progress")
  )
    return "Активность уже в вашем плане.";
  if (event.mandatory) return "Обязательные активности назначает HR.";
  if (
    own.some(
      (h) => h.event_id === event.event_id && h.status === "completed",
    ) &&
    event.event_id !== "EV_036"
  )
    return "Эта активность уже завершена.";
  if (!event.target_roles.includes(employee.role))
    return "Активность недоступна для вашей текущей роли.";
  if (!event.target_grades.includes(employee.grade))
    return "Активность недоступна для вашего текущего уровня.";
  if (
    Object.entries(event.prerequisites).some(
      ([id, n]) => (current[id] ?? 0) < (n ?? 0),
    )
  )
    return "Сначала развейте навыки, необходимые для участия.";
  if (
    event.format !== "self_paced" &&
    !event.upcoming_sessions.some((d) => d >= today)
  )
    return "Новых сессий пока нет.";
  return null;
}
