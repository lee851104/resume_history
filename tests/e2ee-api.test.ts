import { describe, it, expect } from "vitest";
import { vaultCreateSchema, vaultUpdateSchema } from "@/lib/crypto/schema";
import { sealedPrepareSchema } from "@/lib/vault/wire";
describe("encrypted API inputs", () => {
  it("rejects plaintext records and resume filenames", () => {
    expect(() =>
      vaultCreateSchema.parse({
        jobUrl: "https://private.example",
        notes: "secret",
      }),
    ).toThrow();
    expect(() =>
      vaultUpdateSchema.parse({ expectedRevision: 0, status: "offer" }),
    ).toThrow();
    expect(() =>
      sealedPrepareSchema.parse({
        id: "20000000-0000-4000-8000-000000000001",
        size: 500,
        fileName: "secret.pdf",
      }),
    ).toThrow();
  });
  it("allows only bounded ciphertext upload lengths", () => {
    const id = "20000000-0000-4000-8000-000000000001";
    expect(sealedPrepareSchema.parse({ id, size: 20_000_029 }).size).toBe(
      20_000_029,
    );
    expect(() => sealedPrepareSchema.parse({ id, size: 20_000_030 })).toThrow();
  });
});

import { assertVaultOwner } from "@/lib/vault/request-owner";
it("refuses stale encryption requests after the Google account changes", () => {
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002";
  const request = new Request("https://app.example/api/vault", {
    headers: { "X-Vault-Owner": a },
  });
  expect(() => assertVaultOwner(request, a)).not.toThrow();
  expect(() => assertVaultOwner(request, b)).toThrow("帳號已切換");
  expect(() =>
    assertVaultOwner(new Request("https://app.example/api/vault"), a),
  ).toThrow("帳號已切換");
});
