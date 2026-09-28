import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createVault,
  encryptJson,
  exportRecoveryMaterial,
} from "@/lib/crypto/vault";
const state = vi.hoisted(() => ({
  user: null as any,
  rows: {} as Record<string, any>,
  otpUser: null as any,
  otpError: false,
  consumed: false,
  sent: "",
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!state.user)
      throw new (await import("@/lib/security")).HttpError(401, "登入已過期");
    return {
      user: state.user,
      db: {
        from: (table: string) => {
          let value = state.rows[table] ?? null;
          const q: any = {
            select: () => q,
            eq: () => q,
            maybeSingle: async () => ({ data: value, error: null }),
            upsert: (row: any) => {
              state.rows[table] = row;
              value = row;
              return q;
            },
            then: (resolve: any) =>
              Promise.resolve({ data: value, error: null }).then(resolve),
          };
          return q;
        },
      },
    };
  },
}));
vi.mock("@/lib/recovery/otp", () => ({
  createOtpClient: () => ({
    auth: {
      signInWithOtp: async ({ email }: any) => {
        state.sent = email;
        return { error: null };
      },
      verifyOtp: async ({ token }: any) => {
        if (state.otpError || state.consumed || token !== "123456")
          return { data: { user: null }, error: new Error("invalid") };
        state.consumed = true;
        return { data: { user: state.otpUser }, error: null };
      },
      signOut: async () => ({ error: null }),
    },
  }),
}));
const routes = await import("@/app/api/vault/recovery/route").catch(() => null);
const owner = "10000000-0000-4000-8000-000000000001";
const email = "owner@gmail.com";
const user = {
  id: owner,
  email,
  email_confirmed_at: "2026-09-28",
  identities: [
    { provider: "google", identity_data: { email, email_verified: true } },
  ],
};
let material: string, vaultId: string;
function request(body?: unknown, id = owner, origin = "https://app.example") {
  return new Request("https://app.example/api/vault/recovery", {
    method: body ? "POST" : "GET",
    headers: {
      "X-Vault-Owner": id,
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(async () => {
  process.env.VAULT_RECOVERY_SECRET = "ab".repeat(32);
  process.env.VAULT_EMAIL_RECOVERY_ENABLED = "true";
  process.env.APP_ORIGIN = "https://app.example";
  state.user = structuredClone(user);
  state.otpUser = structuredClone(user);
  state.otpError = false;
  state.consumed = false;
  state.sent = "";
  const v = await createVault(owner, "A long private password!");
  vaultId = v.envelope.vaultId;
  material = await exportRecoveryMaterial(
    owner,
    "A long private password!",
    v.envelope,
    "password",
  );
  state.rows = {
    encrypted_vaults: {
      owner_id: owner,
      vault_id: vaultId,
      key_envelope: v.envelope,
      payload: await encryptJson(v.key, owner, vaultId, { secret: "private" }),
      revision: 4,
    },
  };
});
describe("email recovery API", { timeout: 30000 }, () => {
  it("enrolls only a working key, sends to the bound email, and releases the key only after fresh OTP", async () => {
    expect(routes).not.toBeNull();
    let response = await routes!.POST(
      request({ action: "enroll", vaultId, material }),
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(state.rows.vault_email_recovery)).not.toContain(
      material,
    );
    response = await routes!.GET(request());
    expect(await response.json()).toMatchObject({ enabled: true, email });
    response = await routes!.POST(request({ action: "send" }));
    expect(response.status).toBe(200);
    expect(state.sent).toBe(email);
    response = await routes!.POST(
      request({ action: "verify", token: "000000" }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(material);
    response = await routes!.POST(
      request({ action: "verify", token: "123456" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      material,
      row: { revision: 4 },
    });
    response = await routes!.POST(
      request({ action: "verify", token: "123456" }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(material);
  });
  it("rejects stale owner, cross-origin writes, unknown fields, wrong vault and incorrect key", async () => {
    expect(routes).not.toBeNull();
    expect(
      (await routes!.POST(request({ action: "send" }, "another-owner"))).status,
    ).toBe(401);
    expect(
      (
        await routes!.POST(
          request({ action: "send" }, owner, "https://evil.example"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await routes!.POST(
          request({ action: "send", email: "victim@gmail.com" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await routes!.POST(
          request({
            action: "enroll",
            vaultId: "20000000-0000-4000-8000-000000000099",
            material,
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await routes!.POST(
          request({
            action: "enroll",
            vaultId,
            material: Buffer.alloc(32, 9).toString("base64url"),
          }),
        )
      ).status,
    ).toBe(400);
    expect(state.rows.vault_email_recovery).toBeUndefined();
  });
  it("does not recover an unenrolled vault or accept a different verified identity", async () => {
    expect(routes).not.toBeNull();
    expect((await routes!.POST(request({ action: "send" }))).status).toBe(409);
    await routes!.POST(request({ action: "enroll", vaultId, material }));
    state.otpUser = { ...user, id: "other-user" };
    const response = await routes!.POST(
      request({ action: "verify", token: "123456" }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(material);
  });
  it("fails closed on missing setup, unverified or changed Google email and anonymous requests", async () => {
    expect(routes).not.toBeNull();
    delete process.env.VAULT_RECOVERY_SECRET;
    expect(await (await routes!.GET(request())).json()).toMatchObject({
      available: false,
      enabled: false,
    });
    expect((await routes!.POST(request({ action: "send" }))).status).toBe(503);
    process.env.VAULT_RECOVERY_SECRET = "ab".repeat(32);
    state.user = { ...user, email: "changed@gmail.com" };
    expect((await routes!.POST(request({ action: "send" }))).status).toBe(403);
    state.user = { ...user, email_confirmed_at: null };
    expect((await routes!.POST(request({ action: "send" }))).status).toBe(403);
    state.user = null;
    expect((await routes!.GET(request())).status).toBe(401);
  });
});
