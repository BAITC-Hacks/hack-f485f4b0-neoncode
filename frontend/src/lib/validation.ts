import { data, today } from "./data";
import type { Employee, History } from "./domain";
export function parseHistory(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV: незакрытая кавычка.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  if (
    ![
      "record_id",
      "employee_id",
      "event_id",
      "date",
      "status",
      "completion_pct",
    ].every((k) => header.includes(k))
  )
    throw new Error("CSV: отсутствуют обязательные столбцы истории.");
  if (
    new Set(header).size !== header.length ||
    rows.some((row) => row.some(Boolean) && row.length !== header.length)
  ) {
    throw new Error(
      "CSV: проверьте уникальность заголовков и число полей в строках.",
    );
  }
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ""])));
}
export function validateEmployees(value: unknown): Employee[] {
  const list = Array.isArray(value)
    ? value
    : (value as { employees?: unknown })?.employees;
  if (!Array.isArray(list) || !list.length)
    throw new Error("JSON должен содержать массив employees.");
  const ids = new Set<string>();
  for (const e of list) {
    if (
      !e ||
      typeof e.employee_id !== "string" ||
      !e.employee_id.trim() ||
      /\s/.test(e.employee_id) ||
      ids.has(e.employee_id) ||
      (e.full_name != null &&
        (typeof e.full_name !== "string" || !e.full_name.trim())) ||
      (e.department != null &&
        (typeof e.department !== "string" || !e.department.trim())) ||
      !Number.isInteger(e.tenure_months) ||
      e.tenure_months < 0 ||
      !data.role_profiles.some(
        (p) => p.role === e.role && p.grade === e.grade,
      ) ||
      (e.last_review_date != null && !isDatasetDate(e.last_review_date)) ||
      !e.skills ||
      typeof e.skills !== "object" ||
      Array.isArray(e.skills) ||
      !Object.entries(e.skills).every(
        ([id, n]) =>
          data.skills.some((s) => s.skill_id === id) &&
          typeof n === "number" &&
          Number.isInteger(n) &&
          n >= 0 &&
          n <= 5,
      ) ||
      (e.career_goal != null &&
        !data.role_profiles.some(
          (p) =>
            p.role === e.career_goal.target_role &&
            p.grade === e.career_goal.target_grade,
        ))
    )
      throw new Error(
        "Проверьте ID, имя, отдел, роль, грейд, цель, дату оценки и навыки (0–5).",
      );
    ids.add(e.employee_id);
  }
  return list.map((e) => ({
    ...e,
    full_name: e.full_name ?? e.employee_id,
    department: e.department ?? e.role,
    career_goal: e.career_goal ?? null,
    last_review_date: e.last_review_date ?? null,
  })) as Employee[];
}

/** Dates in the demo are bounded by the dataset snapshot, not the system clock. */
export function isDatasetDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value > today
  )
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Shared validation for file imports and restored browser state. */
export function validateHistory(
  value: unknown,
  employees: Employee[],
): History[] {
  const message =
    "История содержит неизвестные ID, статусы или некорректные даты и проценты.";
  if (!Array.isArray(value)) throw new Error(message);
  const employeeIds = new Set(employees.map((e) => e.employee_id));
  const eventById = new Map(data.events.map((e) => [e.event_id, e]));
  const ids = new Set<string>();
  const completed = new Set<string>();
  for (const row of value) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.record_id !== "string" ||
      !row.record_id.trim() ||
      /\s/.test(row.record_id) ||
      ids.has(row.record_id) ||
      !employeeIds.has(row.employee_id) ||
      !eventById.has(row.event_id) ||
      !isDatasetDate(row.date) ||
      typeof row.completion_pct !== "string" ||
      !/^\d+$/.test(row.completion_pct) ||
      (row.demo_completion !== undefined &&
        typeof row.demo_completion !== "boolean")
    )
      throw new Error(message);
    const percentage = Number(row.completion_pct);
    const validStatus =
      row.status === "completed"
        ? percentage === 100
        : ["no_show", "declined"].includes(row.status)
          ? percentage === 0
          : row.status === "dropped"
            ? percentage >= 5 && percentage <= 95
            : ["in_progress", "overdue"].includes(row.status)
              ? percentage >= 0 && percentage <= 95
              : false;
    if (!validStatus) throw new Error(message);
    ids.add(row.record_id);
    const event = eventById.get(row.event_id)!;
    // Annual mandatory training and the recurring speaking club can repeat.
    if (
      row.status === "completed" &&
      !event.mandatory &&
      event.event_id !== "EV_036"
    ) {
      const key = JSON.stringify([row.employee_id, row.event_id]);
      if (completed.has(key))
        throw new Error(
          "История содержит повторное завершение неповторяемой активности.",
        );
      completed.add(key);
    }
  }
  return value as History[];
}
