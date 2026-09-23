import { expect, test } from "@playwright/test";
import {
  data,
  levels,
  progress,
  recommendations,
  suggestedGoal,
  target,
  validateEmployees,
  enrollmentBlock,
  type Employee,
  type History,
} from "../src/lib/career";
import { employeeFromApi, eventFromApi } from "../src/lib/api/adapters";
import { teamAnalytics } from "../src/features/hr/analytics";
const lead = data.employees.find((e) => e.grade === "Lead" && !e.career_goal)!;

test("no goal means current-grade development; a suggestion is not a selected goal", () => {
  const junior = { ...data.employees[0], career_goal: null };
  expect(target(junior).grade).toBe(junior.grade);
  expect(suggestedGoal(junior)?.target_grade).toBe("Middle");
  expect(target(lead).grade).toBe("Lead");
  for (const invalid of [false, 0, []])
    expect(() =>
      validateEmployees([{ ...lead, career_goal: invalid }]),
    ).toThrow();
  expect(suggestedGoal(lead)).toBeNull();
});
test("nullable API profiles and event DTOs are adapted without assuming scheduling or historical growth", () => {
  const employee = employeeFromApi({
    employee_id: "API01",
    role: "Backend Engineer",
    grade: "Middle",
    tenure_months: 5,
    skills: { SK_SYSTEM_DESIGN: 1 },
    full_name: null,
    department: null,
    last_review_date: null,
  });
  expect(employee.full_name).toBe("API01");
  expect(employee.department).toBe(employee.role);
  expect(
    levels(employee, [
      {
        record_id: "past",
        employee_id: "API01",
        event_id: "EV_005",
        date: "2026-09-30",
        status: "completed",
        completion_pct: "100",
      },
    ]).SK_SYSTEM_DESIGN,
  ).toBe(1);
  const event = eventFromApi({
    event_id: "API_EV",
    type: "course",
    audience: { roles: ["Backend Engineer"], grades: ["Middle"] },
    skills: [{ skill_id: "SK_PYTHON", gain: 1, max_level: 4 }],
    format: "online",
    duration_hours: 2,
  });
  expect(event.target_roles).toEqual(["Backend Engineer"]);
  expect(event.develops_skills[0].gain).toBe(1);
  expect(() =>
    eventFromApi({
      event_id: "x",
      type: "course",
      audience: { roles: [], grades: [] },
      skills: [],
    }),
  ).toThrow();
});
test("new demo completions count after same-day or missing assessment, without replaying old records", () => {
  const employee: Employee = {
    ...data.employees[0],
    last_review_date: "2026-10-01",
    skills: { SK_SYSTEM_DESIGN: 1 },
  };
  const record: History = {
    record_id: "local",
    employee_id: employee.employee_id,
    event_id: "EV_005",
    status: "completed",
    completion_pct: "100",
    date: "2026-10-01",
  };
  expect(levels(employee, [record]).SK_SYSTEM_DESIGN).toBe(1);
  expect(
    levels(employee, [{ ...record, demo_completion: true }]).SK_SYSTEM_DESIGN,
  ).toBe(2);
  expect(
    levels({ ...employee, last_review_date: null }, [
      { ...record, demo_completion: true },
    ]).SK_SYSTEM_DESIGN,
  ).toBe(2);
});
test("HR average includes selected goals only and shares the employee readiness calculation", () => {
  const withGoal = data.employees.find((e) => e.career_goal)!;
  const withoutGoal = { ...lead, employee_id: "NO_GOAL" };
  const summary = teamAnalytics([withGoal, withoutGoal], data.history);
  expect(summary.selectedTotal).toBe(1);
  expect(summary.average).toBe(progress(withGoal, data.history));
  expect(teamAnalytics([withoutGoal], []).average).toBeNull();
});
test("cross-role recommendations preserve audience restrictions and return a specific enrollment reason", () => {
  const employee = data.employees.find(
    (e) => e.career_goal && e.career_goal.target_role !== e.role,
  )!;
  for (const result of recommendations(employee, data.history))
    expect(result.event.target_roles).toContain(employee.role);
  const unavailable = data.events.find(
    (e) => !e.mandatory && !e.target_roles.includes(employee.role),
  )!;
  expect(enrollmentBlock(employee, [], unavailable)).toBe(
    "Активность недоступна для вашей текущей роли.",
  );
});
test("employee and HR demo screens are separated explicitly", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "HR-аналитика", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Демо-роль", { exact: true }).selectOption("hr");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "HR-аналитика", exact: true })
    .click();
  await page.getByLabel("Демо-роль", { exact: true }).selectOption("employee");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Рады видеть вас",
  );
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Импорт данных", exact: true }),
  ).toHaveCount(0);
});
test("Lead chooses a career change voluntarily and the choice survives reload", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByLabel("Демо-профиль").selectOption(lead.employee_id);
  await expect(
    page.getByText("РАЗВИТИЕ В ТЕКУЩЕЙ РОЛИ", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Моя траектория", exact: true })
    .click();
  await expect(
    page.getByText("Цель не выбрана", { exact: true }),
  ).toBeVisible();
  const role =
    lead.role === "Data Analyst" ? "Product Manager" : "Data Analyst";
  await page.getByLabel("Целевая роль", { exact: true }).selectOption(role);
  await page
    .getByLabel("Целевой уровень", { exact: true })
    .selectOption("Middle");
  await page
    .getByRole("button", { name: "Сохранить цель", exact: true })
    .click();
  await expect(page.getByText("Цель выбрана", { exact: true })).toBeVisible();
  await expect(page.locator(".goal-note")).toContainText(
    "Вы выбрали смену роли",
  );
  await page.reload();
  await expect(page.getByLabel("Демо-профиль")).toHaveValue(lead.employee_id);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Моя траектория", exact: true })
    .click();
  await expect(page.getByLabel("Целевая роль", { exact: true })).toHaveValue(
    role,
  );
  await page
    .getByRole("button", { name: "Продолжить без цели", exact: true })
    .click();
  await expect(
    page.getByText("Цель не выбрана", { exact: true }),
  ).toBeVisible();
});
test("unavailable activities explain why enrollment is disabled", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Каталог активностей", exact: true })
    .click();
  await page
    .getByLabel("Поиск активностей")
    .fill("Дорожные карты и гибкое планирование");
  await page.locator(".event-card").getByRole("button").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Добавить в план развития" }),
  ).toBeDisabled();
  await expect(page.locator("#enrollment-reason")).toContainText(
    "Активность недоступна для вашей текущей роли.",
  );
});
