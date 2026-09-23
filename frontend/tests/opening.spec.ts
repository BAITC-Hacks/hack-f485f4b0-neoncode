import { expect, test } from "@playwright/test";

test("opening covers the viewport, then releases the page automatically", async ({
  page,
}) => {
  await page.goto("/");
  const opening = page.locator(".opening");
  await expect(opening).toBeVisible();
  const bounds = await opening.boundingBox();
  expect(bounds?.width).toBe(page.viewportSize()?.width);
  expect(bounds?.height).toBe(page.viewportSize()?.height);
  await expect(page.locator(".opening-experience > div")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(opening).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".opening-experience > div")).not.toHaveAttribute(
    "inert",
  );
  await expect(page.locator("main")).toBeFocused();
  await page.locator(".nav-item").nth(1).click();
  await expect(opening).toHaveCount(0);
});

test("opening supports skipping and Escape, restores focus and scrolling", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Перейти к пространству" }).click();
  await expect(page.locator(".opening")).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Перейти к пространству" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".opening")).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
});

test("reduced motion opens directly into an interactive workspace", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".opening")).toHaveCount(0);
  await expect(page.locator(".opening-experience > div")).not.toHaveAttribute(
    "inert",
  );
  await page.locator(".nav-item").nth(1).click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
