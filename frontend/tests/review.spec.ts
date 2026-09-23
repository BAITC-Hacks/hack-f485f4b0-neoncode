import { expect, test } from "@playwright/test";
import {
  data,
  levels,
  parseHistory,
  validateEmployees,
  validateHistory,
} from "../src/lib/career";

test("organizer data passes strengthened import validation", () => {
  expect(validateEmployees(data.employees)).toHaveLength(200);
  expect(validateHistory(data.history, data.employees)).toHaveLength(2743);
});
test("profile validation rejects impossible dates and non-object skills", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2027-01-01"])
    expect(() =>
      validateEmployees([{ ...data.employees[0], last_review_date: date }]),
    ).toThrow();
  expect(() =>
    validateEmployees([{ ...data.employees[0], skills: [] }]),
  ).toThrow();
  expect(() =>
    validateEmployees([{ ...data.employees[0], employee_id: " " }]),
  ).toThrow();
});
test("history validation checks dates, status progress and nonrepeatable completions", () => {
  const row = {
    record_id: "review",
    employee_id: "E0001",
    event_id: "EV_005",
    date: "2026-09-30",
    status: "completed",
    completion_pct: "100",
  };
  for (const invalid of [
    null,
    { ...row, date: "2026-02-30" },
    { ...row, date: "2027-01-01" },
    { ...row, completion_pct: "0" },
    { ...row, status: "in_progress", completion_pct: "100" },
    { ...row, completion_pct: "" },
  ])
    expect(() => validateHistory([invalid], data.employees)).toThrow();
  expect(() =>
    validateHistory([row, { ...row, record_id: "other" }], data.employees),
  ).toThrow();
  expect(
    validateHistory(
      [
        { ...row, event_id: "EV_036" },
        { ...row, record_id: "other", event_id: "EV_036" },
      ],
      data.employees,
    ),
  ).toHaveLength(2);
});
test("CSV rejects repeated columns and truncated rows", () => {
  expect(() =>
    parseHistory(
      "record_id,employee_id,event_id,date,status,completion_pct,record_id\nr,e,v,2026-01-01,completed,100,r",
    ),
  ).toThrow();
  expect(() =>
    parseHistory(
      "record_id,employee_id,event_id,date,status,completion_pct\nr,e",
    ),
  ).toThrow();
});
test("future completions do not increase current skills", () => {
  const employee = {
    ...data.employees[0],
    skills: { SK_SYSTEM_DESIGN: 1 },
    last_review_date: "2026-09-01",
  };
  expect(
    levels(employee, [
      {
        record_id: "future",
        employee_id: employee.employee_id,
        event_id: "EV_005",
        date: "2026-12-01",
        status: "completed",
        completion_pct: "100",
      },
    ]).SK_SYSTEM_DESIGN,
  ).toBe(1);
});
test("corrupt saved history is rejected atomically and the app stays usable", async ({
  page,
}) => {
  await page.addInitScript(
    ({ employees }) =>
      localStorage.setItem(
        "career-quest-v1",
        JSON.stringify({ employees, history: [null] }),
      ),
    {
      employees: [
        {
          ...data.employees[0],
          employee_id: "BROKEN",
          full_name: "Invalid Saved Profile",
        },
      ],
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".notice")).toContainText(
    "Сохранённые данные недоступны",
  );
  await expect(page.getByLabel("Демо-профиль")).toHaveValue("E0005");
  await expect(page.locator("option[value=BROKEN]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
