import { test, expect } from "@playwright/test";
import { createVault, encryptJson } from "../lib/crypto/vault";
const owner = "10000000-0000-4000-8000-000000000001",
  password = "Private shortlist password!",
  resumeId = "20000000-0000-4000-8000-000000000001";
test("AI JSON import becomes an encrypted shortlist and then a linked application", async ({
  page,
}) => {
  const keys = await createVault(owner, password);
  let row = {
    envelope: keys.envelope,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, {
      v: 1,
      applications: [],
      resumes: [
        {
          id: resumeId,
          originalName: "resume.pdf",
          displayName: "Python 履歷",
          size: 100,
          contentType: "application/pdf",
          createdAt: "2026-09-28T00:00:00Z",
        },
      ],
    }),
    revision: 0,
  };
  const writes: string[] = [];
  let failOnce = false;
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        configured: true,
        user: { id: owner, email: "test@example.com" },
      },
    }),
  );
  await page.route("**/api/vault", async (r) => {
    expect(r.request().headers()["x-vault-owner"]).toBe(owner);
    if (r.request().method() === "PUT") {
      if (failOnce) {
        failOnce = false;
        return r.fulfill({ status: 503, json: { error: "暫時無法儲存" } });
      }
      writes.push(r.request().postData()!);
      const v = r.request().postDataJSON();
      expect(v.expectedRevision).toBe(row.revision);
      row = { ...row, payload: v.payload, revision: row.revision + 1 };
    }
    return r.fulfill({ json: row });
  });
  const unlock = async () => {
    await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
    await page.getByRole("button", { name: "解鎖", exact: true }).click();
  };
  await page.goto("/");
  await unlock();
  await page.getByRole("button", { name: /^職缺待辦/ }).click();
  await page
    .getByRole("button", { name: "匯入職缺", exact: true })
    .first()
    .click();
  await page.getByText("查看整理指令與格式範例").click();
  await expect(page.getByLabel("給 AI 的整理指令")).toContainText("jobUrl");
  await page.getByText("查看整理指令與格式範例").click();
  const source = JSON.stringify([
    {
      jobUrl: "https://jobs.example/python?job=1",
      company: "測試公司",
      title: "Python 工程師",
      notes: "AI 推薦原因\n薪資待確認",
    },
    { jobUrl: "https://jobs.example/python?job=1&utm_source=ai" },
    { jobUrl: "javascript:alert(1)" },
    { jobUrl: "https://jobs.example/backend?job=2" },
  ]);
  await page.getByLabel("貼上 AI 的 JSON 列表").fill(source);
  await page.getByRole("button", { name: "預覽列表" }).click();
  await expect(page.getByLabel("匯入第 2 筆")).toBeDisabled();
  await expect(page.getByLabel("匯入第 3 筆")).toBeDisabled();
  await page.getByLabel("匯入第 4 筆").uncheck();
  await page.screenshot({
    path: "artifacts/" + test.info().project.name + "-job-import.png",
    fullPage: true,
  });
  failOnce = true;
  await page.getByRole("button", { name: "匯入 1 筆待辦" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "暫時無法儲存",
  );
  await expect(page.getByLabel("貼上 AI 的 JSON 列表")).toHaveValue(source);
  await page.getByRole("button", { name: "匯入 1 筆待辦" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Python 工程師" })).toBeVisible();
  await page.getByLabel("Python 工程師的待辦狀態").selectOption("ready");
  await expect(page.getByLabel("Python 工程師的待辦狀態")).toHaveValue("ready");
  await page
    .getByRole("button", { name: "編輯Python 工程師", exact: true })
    .click();
  await page.getByLabel("備註", { exact: true }).fill("已閱讀職缺，準備投遞");
  await page.getByRole("button", { name: "儲存待辦" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({
    path: "artifacts/" + test.info().project.name + "-job-shortlist.png",
    fullPage: true,
  });
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.getByRole("button", { name: "記錄已投遞", exact: true }).click();
  await expect(page.getByLabel("職缺連結")).toHaveValue(
    "https://jobs.example/python?job=1",
  );
  await page.locator("#resume-select").selectOption(resumeId);
  await page.getByRole("button", { name: "儲存投遞", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await expect(page.getByLabel("Python 工程師的進度")).toHaveValue("applied");
  await page.getByRole("button", { name: /^職缺待辦/ }).click();
  await expect(
    page.getByRole("button", { name: "查看投遞紀錄" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "記錄已投遞", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "匯入職缺", exact: true }).click();
  await page
    .getByLabel("貼上 AI 的 JSON 列表")
    .fill('[{"jobUrl":"https://jobs.example/python?job=1"}]');
  await page.getByRole("button", { name: "預覽列表" }).click();
  await expect(
    page.getByRole("button", { name: "匯入 0 筆待辦" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.reload();
  await unlock();
  await page.getByRole("button", { name: /^職缺待辦/ }).click();
  await expect(
    page.getByRole("button", { name: "查看投遞紀錄" }),
  ).toBeVisible();
  for (const body of writes) {
    expect(body).not.toContain("jobs.example");
    expect(body).not.toContain("測試公司");
    expect(body).not.toContain("準備投遞");
  }
});

test("a delayed old refresh cannot erase newer shortlist data", async ({
  page,
}) => {
  const keys = await createVault(owner, password);
  let row = {
    envelope: keys.envelope,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, {
      v: 1,
      applications: [],
      resumes: [],
    }),
    revision: 0,
  };
  let delay = false;
  let held: import("@playwright/test").Route | null = null;
  let oldRow = structuredClone(row);
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { configured: true, user: { id: owner } } }),
  );
  await page.route("**/api/vault", (r) => {
    if (delay) {
      delay = false;
      held = r;
      oldRow = structuredClone(row);
      return;
    }
    return r.fulfill({ json: row });
  });
  await page.goto("/");
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await page.getByRole("button", { name: /^職缺待辦/ }).click();
  await expect(page.getByText("先收集，再決定下一步")).toBeVisible();
  delay = true;
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await expect.poll(() => !!held).toBe(true);
  row = {
    ...row,
    revision: 1,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, {
      v: 1,
      applications: [],
      resumes: [],
      prospects: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          jobUrl: "https://jobs.example/new",
          company: null,
          title: "新加入的職缺",
          notes: null,
          status: "review",
          applicationId: null,
          createdAt: "2026-09-28T00:00:00Z",
          updatedAt: "2026-09-28T00:00:00Z",
        },
      ],
    }),
  };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("link", { name: "新加入的職缺" })).toBeVisible();
  await held!.fulfill({ json: oldRow });
  // Allow decryption and the late response's React update to settle before checking.
  await page.waitForTimeout(300);
  await expect(page.getByRole("link", { name: "新加入的職缺" })).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/vault/recovery", (r) =>
    r.fulfill({
      json: { available: false, enabled: false, message: "信箱復原尚未設定" },
    }),
  );
});
