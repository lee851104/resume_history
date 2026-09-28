import { test, expect } from "@playwright/test";
import {
  createVault,
  encryptJson,
  exportRecoveryMaterial,
  unlockVault,
  decryptJson,
} from "../lib/crypto/vault";
const owner = "10000000-0000-4000-8000-000000000001",
  password = "Original long private password!",
  nextPassword = "New long private password!";
test("enroll an existing vault, verify email, reset password and retain jobs", async ({
  page,
}) => {
  const keys = await createVault(owner, password);
  const material = await exportRecoveryMaterial(
    owner,
    password,
    keys.envelope,
    "password",
  );
  let row = {
    envelope: keys.envelope,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, {
      v: 1,
      resumes: [],
      applications: [],
      prospects: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          jobUrl: "https://jobs.example/keep",
          company: "保留公司",
          title: "保留職缺",
          notes: null,
          status: "review",
          applicationId: null,
          createdAt: "2026-09-28T00:00:00Z",
          updatedAt: "2026-09-28T00:00:00Z",
        },
      ],
    }),
    revision: 0,
  };
  let enabled = false,
    sent = false,
    consumed = false;
  const writes: string[] = [];
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: { configured: true, user: { id: owner, email: "owner@gmail.com" } },
    }),
  );
  await page.route("**/api/vault", (r) => {
    if (r.request().method() === "PUT") {
      const v = r.request().postDataJSON();
      writes.push(r.request().postData()!);
      row = {
        envelope: v.envelope ?? row.envelope,
        payload: v.payload,
        revision: row.revision + 1,
      };
    }
    return r.fulfill({ json: row });
  });
  await page.route("**/api/vault/recovery", (r) => {
    expect(r.request().headers()["x-vault-owner"]).toBe(owner);
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          available: true,
          enabled,
          email: "owner@gmail.com",
          message: enabled
            ? "已啟用 Google 信箱復原"
            : "尚未啟用信箱復原；請先解鎖一次，再啟用",
        },
      });
    const v = r.request().postDataJSON();
    writes.push(r.request().postData()!);
    if (v.action === "enroll") {
      expect(v.material).toBe(material);
      enabled = true;
      return r.fulfill({ json: { enabled: true } });
    }
    if (v.action === "send") {
      sent = true;
      consumed = false;
      return r.fulfill({ json: { sent: true, email: "owner@gmail.com" } });
    }
    if (!sent || consumed || v.token !== "123456")
      return r.fulfill({
        status: 400,
        json: { error: "驗證碼錯誤、過期或已使用" },
      });
    consumed = true;
    return r.fulfill({ json: { material, row } });
  });
  await page.goto("/");
  await expect(
    page.getByText("尚未啟用信箱復原", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "啟用 Google 信箱復原" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "啟用信箱復原並繼續" }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await page.getByRole("button", { name: "鎖定", exact: true }).click();
  await page
    .getByRole("button", { name: "忘記密碼？使用 Google 信箱驗證" })
    .click();
  await page.getByRole("button", { name: "寄送驗證碼", exact: true }).click();
  await page.getByLabel("信箱驗證碼").fill("000000");
  await page.getByRole("button", { name: "驗證信箱", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "驗證碼錯誤" }),
  ).toBeVisible();
  await page.getByLabel("信箱驗證碼").fill("123456");
  await page.getByRole("button", { name: "驗證信箱", exact: true }).click();
  await page.getByLabel("新私人解鎖密碼", { exact: true }).fill(nextPassword);
  await page.getByLabel("再次輸入解鎖密碼").fill(nextPassword);
  await page.screenshot({
    path: "artifacts/" + test.info().project.name + "-email-recovery.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "設定新密碼", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "確認保存並開啟工作台" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "確認保存並開啟工作台" }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await page.getByRole("button", { name: /^職缺待辦/ }).click();
  await expect(page.getByText("保留職缺", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
  await expect(unlockVault(owner, password, row.envelope)).rejects.toThrow();
  expect(
    (
      await decryptJson(
        await unlockVault(owner, nextPassword, row.envelope),
        owner,
        row.envelope.vaultId,
        row.payload,
      )
    ).prospects,
  ).toHaveLength(1);
  for (const body of writes) {
    expect(body).not.toContain(password);
    expect(body).not.toContain(nextPassword);
  }
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => v.includes("123456")),
    ),
  ).toBe(false);
});

test("sensitive recovery and enrollment screens expire after inactivity", async ({
  page,
}) => {
  await page.clock.install();
  const keys = await createVault(owner, password),
    material = await exportRecoveryMaterial(
      owner,
      password,
      keys.envelope,
      "password",
    );
  const row = {
    envelope: keys.envelope,
    payload: await encryptJson(keys.key, owner, keys.envelope.vaultId, {
      v: 1,
      resumes: [],
      applications: [],
    }),
    revision: 0,
  };
  let enabled = false;
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: { configured: true, user: { id: owner, email: "owner@gmail.com" } },
    }),
  );
  await page.route("**/api/vault", (r) => r.fulfill({ json: row }));
  await page.route("**/api/vault/recovery", (r) =>
    r.fulfill({
      json:
        r.request().method() === "GET"
          ? { available: true, enabled, email: "owner@gmail.com" }
          : r.request().postDataJSON().action === "verify"
            ? { material, row }
            : { sent: true },
    }),
  );
  await page.goto("/");
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "啟用 Google 信箱復原" }),
  ).toBeVisible();
  await page.clock.fastForward(900001);
  await expect(
    page.getByRole("heading", { name: "解鎖私人工作台" }),
  ).toBeVisible();
  enabled = true;
  await page.reload();
  await page
    .getByRole("button", { name: "忘記密碼？使用 Google 信箱驗證" })
    .click();
  await page.getByRole("button", { name: "寄送驗證碼", exact: true }).click();
  await page.getByLabel("信箱驗證碼").fill("123456");
  await page.getByRole("button", { name: "驗證信箱", exact: true }).click();
  await expect(
    page.getByLabel("新私人解鎖密碼", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(900001);
  await expect(
    page.getByRole("heading", { name: "解鎖私人工作台" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "設定新密碼", exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("私人解鎖密碼", { exact: true }).fill(password);
  await page.clock.fastForward(60001);
  await expect(page.getByLabel("私人解鎖密碼", { exact: true })).toHaveValue(
    password,
  );
  await page.getByRole("button", { name: "解鎖", exact: true }).click();
  await expect(page.getByRole("heading", { name: "投遞總覽" })).toBeVisible();
});
