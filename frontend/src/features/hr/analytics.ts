import { data, levels, target, today, readiness } from "@/lib/career";
import type { Employee, History } from "@/lib/domain";
/** One history index and one skill calculation per employee, only when HR data changes. */
export function teamAnalytics(employees: Employee[], history: History[]) {
  const byEmployee = new Map<string, History[]>();
  for (const row of history) {
    const rows = byEmployee.get(row.employee_id) ?? [];
    rows.push(row);
    byEmployee.set(row.employee_id, rows);
  }
  const counts = new Map<string, number>();
  const profiles = new Map<string, { readiness: number; hasGoal: boolean }>();
  let selectedTotal = 0,
    selectedSum = 0,
    inactive = 0;
  for (const employee of employees) {
    const own = byEmployee.get(employee.employee_id) ?? [],
      current = levels(employee, own),
      goal = target(employee);
    const percent = readiness(current, goal);
    profiles.set(employee.employee_id, {
      readiness: percent,
      hasGoal: !!employee.career_goal,
    });
    if (employee.career_goal) {
      selectedTotal++;
      selectedSum += percent;
    }
    for (const [id, required] of Object.entries(goal.required_skills))
      if ((current[id] ?? 0) < (required ?? 0))
        counts.set(id, (counts.get(id) ?? 0) + 1);
    if (
      !own.some(
        (h) =>
          h.status === "completed" && h.date >= "2026-07-03" && h.date <= today,
      )
    )
      inactive++;
  }
  return {
    profiles,
    inactive,
    selectedTotal,
    average: selectedTotal ? Math.round(selectedSum / selectedTotal) : null,
    deficits: data.skills
      .map((skill) => ({ ...skill, count: counts.get(skill.skill_id) ?? 0 }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
