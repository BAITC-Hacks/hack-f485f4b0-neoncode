import { expect, test } from "@playwright/test";
import {
  data,
  levels,
  recommendations,
  parseHistory,
  validateEmployees,
} from "../src/lib/career";
test("growth respects review date and never reduces skills above the event cap", () => {
  const employee = {
    ...data.employees[0],
    last_review_date: "2026-09-01",
    skills: {
      ...data.employees[0].skills,
      SK_SYSTEM_DESIGN: 4,
      SK_API_DESIGN: 1,
    },
  };
  const base = {
    record_id: "test",
    employee_id: employee.employee_id,
    event_id: "EV_005",
    status: "completed" as const,
    completion_pct: "100",
  };
  expect(
    levels(employee, [{ ...base, date: "2026-08-01" }]).SK_API_DESIGN,
  ).toBe(1);
  const result = levels(employee, [{ ...base, date: "2026-10-01" }]);
  expect(result.SK_API_DESIGN).toBe(2);
  expect(result.SK_SYSTEM_DESIGN).toBe(4);
});
test("recommendations are voluntary, relevant and not already completed", () => {
  for (const employee of data.employees) {
    for (const { event, gains } of recommendations(employee, data.history)) {
      expect(event.mandatory).toBe(false);
      expect(event.target_roles).toContain(employee.role);
      expect(gains.length).toBeGreaterThan(0);
      if (event.event_id !== "EV_036")
        expect(
          data.history.some(
            (h) =>
              h.employee_id === employee.employee_id &&
              h.event_id === event.event_id &&
              h.status === "completed",
          ),
        ).toBe(false);
    }
  }
});
test("import rejects invalid skills and parses quoted CSV", () => {
  expect(() =>
    validateEmployees([{ ...data.employees[0], skills: { SK_PYTHON: 6 } }]),
  ).toThrow();
  expect(
    parseHistory(
      'record_id,employee_id,event_id,date,status,completion_pct\r\n"R1","E0001",EV_005,2026-10-01,completed,100',
    )[0].record_id,
  ).toBe("R1");
  expect(() => parseHistory("invalid,header\n1,2")).toThrow();
});
test("employee can enroll, complete an activity and keep progress after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Демо-роль", { exact: true }).selectOption("hr");
  await expect(
    page.getByRole("heading", { name: "Рады видеть вас, Togzhan." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подробнее" }).first().click();
  const dialog = page.getByRole("dialog");
  const title = await dialog.getByRole("heading", { level: 2 }).innerText();
  await expect(dialog.getByText("Почему это подходит вам")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Добавить в план развития" })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Моя траектория" })
    .click();
  const row = page.locator(".plan-row").filter({ hasText: title });
  await row.getByRole("button", { name: "Завершить в демо" }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "История развития" })
    .click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: title })
      .filter({ hasText: "Завершено" }),
  ).toBeVisible();
});
test("catalog search, HR and atomic import work", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Демо-роль", { exact: true }).selectOption("hr");
  await page
    .getByRole("button", { name: "Каталог активностей", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Поиск активностей" })
    .fill("xyz-not-found");
  await expect(
    page.getByText("Ничего не найдено. Попробуйте другой запрос."),
  ).toBeVisible();
  await page.getByRole("button", { name: "HR-аналитика", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Поиск сотрудников" })
    .fill("Togzhan Yessenova");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Импорт данных", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "employees.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        employees: [
          {
            ...data.employees[0],
            employee_id: "JURY01",
            full_name: "Jury Profile",
          },
        ],
      }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("Данные импортированы");
  await page.getByLabel("Демо-профиль").selectOption("JURY01");
  await expect(page.getByLabel("Демо-профиль")).toHaveValue("JURY01");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.locator(".error[role=alert]")).toBeVisible();
  await expect(page.getByLabel("Демо-профиль")).toHaveValue("JURY01");
});
test("mobile navigation fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Демо-роль", { exact: true }).selectOption("hr");
  await expect(
    page.getByRole("heading", { name: "Рады видеть вас, Togzhan." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("desktop overview has no browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByLabel("Демо-роль", { exact: true }).selectOption("hr");
  await expect(page.getByText("Подобрано для вас")).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
