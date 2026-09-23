import { expect, test, type Page } from "@playwright/test";
import type { components } from "../src/api/types";

type S = components["schemas"];
const identityKey = "career-quest-api-session-v1";
const employee: S["EmployeeListItem"] = {
  employee_id: "SYN_API_1",
  full_name: "Synthetic API Employee",
  role: "Backend Engineer",
  grade: "Junior",
  tenure_months: 2,
  skills: { SK_PYTHON: 1 },
  synthetic: true,
  next_grade: "Middle",
  recommendation_status: "ready",
};
function profile(level = 1): S["EmployeeProfile"] {
  return {
    employee_id: employee.employee_id,
    full_name: employee.full_name,
    role: employee.role,
    grade: employee.grade,
    tenure_months: 2,
    synthetic: true,
    skills: { SK_PYTHON: level },
    progress: {
      status: level === 2 ? "requirements_met" : "needs_development",
      next_grade: "Middle",
      requirements: {
        role: "Backend Engineer",
        grade: "Middle",
        required_skills: { SK_PYTHON: 2 },
      },
      gaps: [
        {
          skill_id: "SK_PYTHON",
          current_level: level,
          required_level: 2,
          deficit: 2 - level,
        },
      ],
      remaining_points: 2 - level,
    },
    history:
      level === 1
        ? []
        : [
            {
              record_id: "SYN_HISTORY",
              employee_id: employee.employee_id,
              event_id: "SYN_EVENT",
              date: "2026-09-23",
              status: "completed",
              completion_pct: 100,
              synthetic: true,
            },
          ],
  };
}
const recommendations: S["RecommendationsResponse"] = {
  employee_id: employee.employee_id,
  status: "ready",
  source: "fallback",
  next_grade: "Middle",
  gaps: profile().progress.gaps,
  recommendations: [
    {
      event: {
        event_id: "SYN_EVENT",
        title: "Synthetic Python",
        type: "course",
        audience: { roles: [employee.role], grades: ["Junior"] },
        skills: [{ skill_id: "SK_PYTHON", gain: 1, max_level: 2 }],
        synthetic: true,
      },
      score: 135,
      reasons: ["Grade", "Deficit", "Requirements", "History"],
      explanation: "Synthetic factual explanation",
      factors: {
        employee_grade: "Junior",
        target_grade: "Middle",
        audience_grade_count: 1,
        skill_impacts: [
          {
            skill_id: "SK_PYTHON",
            current_level: 1,
            required_level: 2,
            deficit: 1,
            gain: 1,
            max_level: 2,
            level_after: 2,
            effective_gain: 1,
            covered_deficit: 1,
            critical: true,
            importance: 2,
          },
        ],
        total_deficit: 1,
        covered_deficit: 1,
        weighted_total_deficit: 2,
        weighted_covered_deficit: 2,
        similar_event_ids: ["SYN_EVENT"],
        no_show_count: 0,
        declined_count: 0,
        deficit_score: 100,
        importance_score: 30,
        grade_score: 5,
        history_penalty: 0,
        weights: {},
      },
    },
  ],
};
const summary: S["HRSummaryResponse"] = {
  status: "ready",
  total_employees: 1,
  total_events: 1,
  completed_activities: 0,
  employees_by_grade: { Junior: 1 },
  current_grade_skill_gaps: [],
  next_grade_skill_gaps: [],
  employees_without_step: { requirements_met: [], no_suitable_event: [] },
  participation_by_event: [],
};
async function identity(page: Page, role: "employee" | "hr" = "employee") {
  await page.addInitScript(
    ({ key, role, id }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ role, employeeId: id, employeeIds: [id] }),
      );
    },
    { key: identityKey, role, id: employee.employee_id },
  );
}
async function mockApi(
  page: Page,
  options: { delay?: number; failCompletion?: boolean } = {},
) {
  let level = 1;
  const completions: Record<string, string>[] = [];
  const requests: { path: string; role: string; id: string }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({
      path,
      role: request.headers()["x-role"],
      id: request.headers()["x-employee-id"],
    });
    if (path.endsWith("/recommendations")) {
      if (options.delay)
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      return route.fulfill({
        json:
          level === 1
            ? recommendations
            : {
                ...recommendations,
                status: "requirements_met",
                gaps: profile(2).progress.gaps,
                recommendations: [],
              },
      });
    }
    if (path.endsWith("/complete")) {
      completions.push(request.postDataJSON());
      if (options.failCompletion && completions.length === 1)
        return route.fulfill({ status: 500, json: { detail: "unavailable" } });
      level = 2;
      return route.fulfill({
        json: {
          employee_id: employee.employee_id,
          ...request.postDataJSON(),
          status: "completed",
          skills_before: { SK_PYTHON: 1 },
          skills_after: { SK_PYTHON: 2 },
          progress_after: profile(2).progress,
        },
      });
    }
    if (path === "/api/employees")
      return route.fulfill({ json: { employees: [employee], total: 1 } });
    if (path === "/api/hr/summary") return route.fulfill({ json: summary });
    return route.fulfill({ json: profile(level) });
  });
  return { requests, completions };
}

test("fresh employee session opens a usable default profile", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/me");
  await expect(
    page.getByRole("heading", { name: employee.full_name!, exact: true }),
  ).toBeVisible();
  expect(api.requests.some((request) => request.id === "SYN_E001")).toBe(true);
});

test("profile remains usable while recommendations load, then completion refreshes state", async ({
  page,
}) => {
  await identity(page);
  const api = await mockApi(page, { delay: 1200 });
  await page.goto("/me");
  await expect(
    page.getByRole("heading", { name: employee.full_name!, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Подбираем рекомендации" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выполнил" }).click();
  await expect(
    page.getByText("Все требования следующего грейда закрыты."),
  ).toBeVisible();
  await expect(
    page.getByText("2 / 5", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Требования следующего грейда закрыты", { exact: true }),
  ).toBeVisible();
  expect(api.completions).toHaveLength(1);
  expect(api.completions[0].completion_id).toBeTruthy();
  expect(
    api.requests.every(
      (request) =>
        request.role === "employee" && request.id === employee.employee_id,
    ),
  ).toBe(true);
  expect(
    api.requests.some((request) => request.path === "/api/employees"),
  ).toBe(false);
});

test("completion retry reuses its idempotency key", async ({ page }) => {
  await identity(page);
  const api = await mockApi(page, { failCompletion: true });
  await page.goto("/me");
  await page.getByRole("button", { name: "Выполнил" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Сервер временно недоступен",
  );
  await page.reload();
  await page.getByRole("button", { name: "Выполнил" }).click();
  await expect(
    page.getByText("Все требования следующего грейда закрыты."),
  ).toBeVisible();
  expect(api.completions).toHaveLength(2);
  expect(api.completions[0]).toEqual(api.completions[1]);
});

test("HR selection persists, employee cannot fetch HR routes, and direct links work", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/hr");
  await expect(page.getByRole("alert")).toContainText("только роли HR");
  await page.getByRole("button", { name: "HR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Развитие команды" }),
  ).toBeVisible();
  await page.getByLabel("Выбор сотрудника").selectOption(employee.employee_id);
  await page.getByRole("link", { name: "Сотрудники", exact: true }).click();
  await page.getByRole("link", { name: employee.employee_id, exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/hr/employees/${employee.employee_id}$`),
  );
  await expect(
    page.getByRole("heading", { name: employee.full_name!, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сотрудник", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.reload();
  await expect(page.getByLabel("Выбор сотрудника")).toHaveValue(
    employee.employee_id,
  );
  await expect(
    page.getByRole("button", { name: "Сотрудник", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    api.requests
      .filter(
        (request) =>
          request.path === "/api/employees" ||
          request.path === "/api/hr/summary",
      )
      .every((request) => request.role === "hr"),
  ).toBe(true);
});

test("import shows nested 422 fields and refreshes the employee list after success", async ({
  page,
}) => {
  await identity(page, "hr");
  const api = await mockApi(page);
  let imports = 0;
  await page.route("**/api/import", (route) => {
    imports++;
    if (imports === 1)
      return route.fulfill({
        status: 422,
        json: {
          detail: [
            {
              loc: ["body", "employees", 0, "skills", "SK_PYTHON"],
              msg: "Input should be less than or equal to 5",
              type: "less_than_equal",
            },
          ],
        },
      });
    return route.fulfill({
      json: {
        status: "imported",
        employees_received: 1,
        history_received: 0,
        employees_imported: 1,
        history_imported: 0,
        employees_created: 1,
        employees_updated: 0,
        history_created: 0,
        history_updated: 0,
      },
    });
  });
  await page.goto("/hr/import");
  await page
    .getByRole("button", { name: "Импортировать", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "employees.0.skills.SK_PYTHON",
  );
  const count = api.requests.filter(
    (request) => request.path === "/api/employees",
  ).length;
  await page
    .getByRole("button", { name: "Импортировать", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Импорт завершён");
  expect(
    api.requests.filter((request) => request.path === "/api/employees").length,
  ).toBeGreaterThan(count);
});

test("API screen handles nullable fields and fits a mobile viewport", async ({
  page,
}) => {
  await identity(page);
  await mockApi(page);
  await page.route(`**/api/employees/${employee.employee_id}`, (route) =>
    route.fulfill({
      json: { ...profile(), full_name: null, department: null, skills: {} },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me");
  await expect(
    page.getByRole("heading", { name: employee.employee_id, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Выполнил" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/api-mobile.png",
    fullPage: true,
  });
});
