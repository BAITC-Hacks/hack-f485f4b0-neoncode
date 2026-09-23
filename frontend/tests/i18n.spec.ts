import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { data } from "../src/lib/career";
import {
  dictionaries,
  formatDate,
  locales,
  translate,
  type Locale,
} from "../src/lib/i18n";
const names = { ru: "Русский", en: "English", kk: "Қазақша" };
const tabs = [
  "Обзор",
  "Моя траектория",
  "Каталог активностей",
  "История развития",
  "HR-аналитика",
  "Импорт данных",
];

test("all languages cover UI keys, domain content and interpolation parameters", () => {
  expect(formatDate("kk", "2026-11-23")).toBe("2026 жылғы 23 қараша");
  const keys = Object.keys(dictionaries.ru).sort();
  for (const locale of locales) {
    expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys);
    for (const key of keys) {
      expect(dictionaries[locale][key].trim()).not.toBe("");
      expect(dictionaries[locale][key].match(/\{\d+\}/g)?.sort() ?? []).toEqual(
        key.match(/\{\d+\}/g)?.sort() ?? [],
      );
    }
    for (const event of data.events) {
      expect(dictionaries[locale][event.title]).toBeTruthy();
      expect(dictionaries[locale][event.description]).toBeTruthy();
    }
    for (const skill of data.skills)
      expect(dictionaries[locale][skill.name]).toBeTruthy();
    for (const employee of data.employees) {
      expect(dictionaries[locale][employee.role]).toBeTruthy();
      expect(dictionaries[locale][employee.grade]).toBeTruthy();
      expect(dictionaries[locale][employee.department]).toBeTruthy();
    }
  }
  const text = readFileSync("src/components/career-app.tsx", "utf8");
  const source = ts.createSourceFile(
    "app.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function walk(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "t" &&
      ts.isStringLiteral(node.arguments[0])
    )
      expect(keys).toContain(node.arguments[0].text);
    if (ts.isJsxText(node)) expect(node.text).not.toMatch(/[А-Яа-яЁё]/);
    ts.forEachChild(node, walk);
  }
  walk(source);
});
for (const locale of locales) {
  test(`${locale}: translated screens, search, activity details, errors and persistence`, async ({
    page,
  }) => {
    const t = (key: string) => translate(locale, key);
    await page.goto("/");
    await page
      .getByRole("button", { name: names[locale], exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page).toHaveTitle(t("Career Quest — ваше развитие"));
    await expect(
      page.getByRole("button", { name: names[locale], exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      translate(locale, "Рады видеть вас, {0}", ["Togzhan"]),
    );
    for (const tab of tabs) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: t(tab), exact: true })
        .click();
      if (tab !== "Обзор")
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t(tab),
        );
      if (locale === "en")
        expect(await page.locator("main").innerText()).not.toMatch(
          /[А-Яа-яЁё]/,
        );
    }
    await page
      .getByRole("navigation")
      .getByRole("button", { name: t("Каталог активностей"), exact: true })
      .click();
    const event = data.events.find((e) => e.event_id === "EV_005")!;
    await page
      .getByRole("textbox", { name: t("Поиск активностей") })
      .fill(t(event.title));
    await expect(page.locator(".event-card")).toHaveCount(1);
    await page.locator(".event-card").getByRole("button").click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { level: 2 }),
    ).toHaveText(t(event.title));
    await expect(page.getByRole("dialog")).toContainText(t(event.description));
    await expect(page.getByRole("dialog")).toContainText(
      formatDate(locale, event.upcoming_sessions[0]),
    );
    await page.getByRole("button", { name: t("Закрыть"), exact: true }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: t("HR-аналитика"), exact: true })
      .click();
    await page
      .getByRole("textbox", { name: t("Поиск сотрудников") })
      .fill(t("Backend Development"));
    expect(
      await page.getByRole("table").getByRole("row").count(),
    ).toBeGreaterThan(1);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: t("Импорт данных"), exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
    await expect(page.locator(".error")).toHaveText(
      t("Некорректный JSON. Проверьте формат файла."),
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      translate(locale, "Рады видеть вас, {0}", ["Togzhan"]),
    );
  });
  test(`${locale}: mobile pages fit without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: names[locale], exact: true })
      .click();
    for (const tab of tabs) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: translate(locale, tab), exact: true })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("navigation")
      .getByRole("button", { name: translate(locale, "Обзор"), exact: true })
      .click();
    await page.screenshot({
      path: `test-results/overview-${locale}-mobile.png`,
      fullPage: true,
    });
  });
}
test("switching language preserves the current screen, selection and imported data", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
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
            employee_id: "I18N01",
            full_name: "Locale Profile",
          },
        ],
      }),
    ),
  });
  await page.getByLabel("Демо-профиль").selectOption("I18N01");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  for (const locale of ["en", "kk", "ru"] as Locale[]) {
    await page
      .getByRole("button", { name: names[locale], exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      translate(locale, "Импорт данных"),
    );
    await expect(
      page.getByLabel(translate(locale, "Демо-профиль")),
    ).toHaveValue("I18N01");
    await expect(page.locator(".error")).toHaveText(
      translate(locale, "Некорректный JSON. Проверьте формат файла."),
    );
  }
  await page.reload();
  await expect(page.locator("option[value=I18N01]")).toHaveCount(1);
});
test("language switching works when localStorage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Қазақша", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Қош келдіңіз",
  );
});
