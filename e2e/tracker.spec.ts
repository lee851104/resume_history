import { test, expect } from "@playwright/test";
test("dashboard shows setup honestly and a usable responsive form", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await expect(page.getByText("尚未連接雲端")).toBeVisible();
  await page
    .getByRole("button", { name: "新增投遞", exact: true })
    .first()
    .click();
  await page.getByLabel("職缺連結").fill("https://example.com/job/123");
  await expect(
    page.getByRole("button", { name: "儲存投遞", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("anonymous requests cannot access encrypted data and legacy plaintext routes stay disabled", async ({
  request,
}) => {
  for (const url of [
    "/api/vault",
    "/api/sealed-files/00000000-0000-4000-8000-000000000001",
  ]) {
    expect([401, 503]).toContain((await request.get(url)).status());
  }
  for (const url of [
    "/api/applications",
    "/api/resumes",
    "/api/resumes/00000000-0000-4000-8000-000000000001/download",
  ]) {
    expect((await request.get(url)).status()).toBe(410);
  }
});
