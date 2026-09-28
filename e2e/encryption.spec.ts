import { test, expect, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { createVault, encryptJson } from "../lib/crypto/vault";
import type { VaultRow } from "../lib/crypto/schema";
const owner = "10000000-0000-4000-8000-000000000001";
const password = "A long private vault password 123!";
async function mockVault(page: Page, initial: VaultRow | null) {
  let row = initial;
  const outgoing: string[] = [];
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        configured: true,
        user: { id: owner, email: "test@example.com" },
      },
    }),
  );
  await page.route("**/api/vault", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: row });
    const text = r.request().postData()!;
    outgoing.push(text);
    const v = JSON.parse(text);
    if (r.request().method() === "POST") {
      if (row)
        return r.fulfill({ status: 409, json: { error: "already exists" } });
      row = { ...v, revision: 0 };
    } else {
      if (row?.revision !== v.expectedRevision)
        return r.fulfill({ status: 409, json: { error: "version conflict" } });
      row = {
        envelope: v.envelope || row!.envelope,
        payload: v.payload,
        revision: row!.revision + 1,
      };
    }
    return r.fulfill({ json: row });
  });
  return outgoing;
}
test("setup, lock, recovery and password reset keep secrets off the network", async ({
  page,
}) => {
  const outgoing = await mockVault(page, null);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "建立加密保險箱" }),
  ).toBeVisible();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByLabel("再次輸入解鎖密碼").fill(password);
  await page.getByRole("button", { name: "建立保險箱", exact: true }).click();
  const recovery = await page.getByLabel("你的復原碼").inputValue();
  await expect(
    page.getByRole("button", { name: "確認保存並開啟工作台" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "確認保存並開啟工作台" }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await page.getByRole("button", { name: "鎖定", exact: true }).click();
  await page.getByRole("button", { name: "忘記密碼？使用復原碼" }).click();
  await page.getByLabel("復原碼", { exact: true }).fill(recovery);
  const newPassword = "A different private password 456!";
  await page.getByLabel("新私人解鎖密碼", { exact: true }).fill(newPassword);
  await page.getByLabel("再次輸入解鎖密碼").fill(newPassword);
  await page.getByRole("button", { name: "重設密碼並產生新復原碼" }).click();
  await expect(page.getByLabel("你的復原碼")).not.toHaveValue(recovery);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "確認保存並開啟工作台" }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "解鎖私人工作台" }),
  ).toBeVisible();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "無法解鎖" }),
  ).toBeVisible();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  for (const body of outgoing) {
    expect(body).not.toContain(password);
    expect(body).not.toContain(newPassword);
    expect(body).not.toContain(recovery);
  }
});
test("records and filenames stay encrypted through create, status update and reload", async ({
  page,
}) => {
  await page.clock.install();
  const keys = await createVault(owner, password);
  const rid = "20000000-0000-4000-8000-000000000001";
  const snapshot = {
    v: 1,
    applications: [],
    resumes: [
      {
        id: rid,
        originalName: "secret-resume.pdf",
        displayName: "私人 Python 履歷",
        size: 1234,
        contentType: "application/pdf",
        createdAt: "2026-09-28T00:00:00Z",
      },
    ],
  };
  const outgoing = await mockVault(page, {
    envelope: keys.envelope,
    payload: await encryptJson(
      keys.key,
      owner,
      keys.envelope.vaultId,
      snapshot,
    ),
    revision: 0,
  });
  await page.goto("/");
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await page
    .getByRole("button", { name: "新增投遞", exact: true })
    .first()
    .click();
  await page.getByLabel("職缺連結").fill("https://private.example/jobs/python");
  await page.locator("#resume-select").selectOption(rid);
  await page.getByRole("button", { name: "儲存投遞", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://private.example/jobs/python" }),
  ).toBeVisible();
  await page
    .getByLabel("https://private.example/jobs/python的進度")
    .selectOption("interviewing");
  await expect(
    page.getByLabel("https://private.example/jobs/python的進度"),
  ).toHaveValue("interviewing");
  for (const body of outgoing) {
    expect(body).not.toContain("private.example");
    expect(body).not.toContain("secret-resume.pdf");
    expect(body).not.toContain("interviewing");
  }
  await page.getByRole("button", { name: "鎖定", exact: true }).click();
  await expect(
    page.getByText("https://private.example/jobs/python", { exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(
    page.getByLabel("https://private.example/jobs/python的進度"),
  ).toHaveValue("interviewing");
  await page.screenshot({
    path: "artifacts/" + test.info().project.name + "-encrypted.png",
    fullPage: true,
  });
  await page.route("**/api/vault", (r) =>
    r.request().method() === "PUT"
      ? r.fulfill({ status: 503, json: { error: "暫時無法儲存" } })
      : r.fallback(),
  );
  await page
    .getByRole("button", { name: "新增投遞", exact: true })
    .first()
    .click();
  await page
    .getByLabel("職缺連結")
    .fill("https://private.example/jobs/another");
  await page.locator("#resume-select").selectOption(rid);
  await page.getByRole("button", { name: "儲存投遞", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "暫時無法儲存",
  );
  await expect(page.getByLabel("職缺連結")).toHaveValue(
    "https://private.example/jobs/another",
  );
});

test("authentication failure, another tab logout and inactivity clear the unlocked workspace", async ({
  page,
}) => {
  await page.clock.install();
  const keys = await createVault(owner, password);
  await mockVault(page, {
    envelope: keys.envelope,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, {
      v: 1,
      applications: [],
      resumes: [],
    }),
    revision: 0,
  });
  const unlock = async () => {
    await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
    await page.getByRole("button", { name: "解鎖", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "鎖定", exact: true }),
    ).toBeVisible();
  };
  await page.goto("/");
  await unlock();
  await page.route(
    "**/api/vault",
    (r) => r.fulfill({ status: 401, json: { error: "登入已過期" } }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "鎖定", exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Google 登入" })).toBeVisible();
  await page.reload();
  await unlock();
  await page.evaluate(() => {
    const c = new BroadcastChannel("resume-tracker-session");
    c.postMessage("signed-out");
    c.close();
  });
  await expect(page.getByRole("link", { name: "Google 登入" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "鎖定", exact: true }),
  ).not.toBeVisible();
  await page.reload();
  await unlock();

  await page.clock.fastForward(900_001);
  await expect(
    page.getByRole("heading", { name: "解鎖私人工作台" }),
  ).toBeVisible();
  await page
    .getByLabel("私人解鎖密碼", { exact: true })
    .fill("typing after idle lock");
  await page.clock.fastForward(60_001);
  await expect(page.getByLabel("私人解鎖密碼", { exact: true })).toHaveValue(
    "typing after idle lock",
  );
  await expect(
    page.getByRole("heading", { name: "解鎖私人工作台" }),
  ).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/vault/recovery", (r) =>
    r.fulfill({
      json: { available: false, enabled: false, message: "信箱復原尚未設定" },
    }),
  );
});


test("optional title links to the job and Excel includes records outside the current filter", async ({ page }, testInfo) => {
  const keys = await createVault(owner, password);
  const rid = "20000000-0000-4000-8000-000000000001";
  const oldUrl = "https://example.com/jobs/existing";
  const snapshot = {
    v: 1, prospects: [],
    applications: [{ id: "30000000-0000-4000-8000-000000000001", jobUrl: oldUrl,
      title: null, company: null, platform: "example.com", appliedOn: "2026-09-28",
      status: "applied", resumeId: rid, notes: null, followUpOn: null,
      createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" }],
    resumes: [{ id: rid, originalName: "履歷.pdf", displayName: "Python 版", size: 1234,
      contentType: "application/pdf", createdAt: "2026-09-28T00:00:00Z" }],
  };
  const outgoing = await mockVault(page, {
    envelope: keys.envelope,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, snapshot), revision: 0,
  });
  await page.goto("/");
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(page.getByRole("link", { name: oldUrl, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增投遞", exact: true }).click();
  await expect(page.getByLabel("職缺標題", { exact: false })).toBeVisible();
  await page.getByLabel("職缺連結").fill("https://example.com/jobs/python");
  await page.getByLabel("職缺標題", { exact: false }).fill("Python 後端工程師");
  await page.locator("#resume-select").selectOption(rid);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-title-form.png`, fullPage: true });
  await page.getByRole("button", { name: "儲存投遞", exact: true }).click();
  await expect(page.getByRole("link", { name: "Python 後端工程師", exact: true })).toHaveAttribute("href", "https://example.com/jobs/python");
  await page.getByRole("button", { name: "編輯Python 後端工程師", exact: true }).click();
  await expect(page.getByLabel("職缺標題", { exact: false })).toHaveValue("Python 後端工程師");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByPlaceholder("搜尋公司、職缺或連結").fill("Python 後端工程師");
  await expect(page.getByRole("link", { name: oldUrl, exact: true })).not.toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出全部 Excel", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^投遞紀錄-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = `artifacts/${testInfo.project.name}-applications.xlsx`;
  await download.saveAs(path);
  const files = unzipSync(await readFile(path));
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  expect(xml).toContain("Python 後端工程師");
  expect(xml).toContain(oldUrl);
  expect(xml).toContain("履歷.pdf");
  expect(xml.match(/<row /g)).toHaveLength(3);
  for (const body of outgoing) expect(body).not.toContain("Python 後端工程師");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-excel-export.png`, fullPage: true });
});
