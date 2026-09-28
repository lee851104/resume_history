import { describe, it, expect } from "vitest";
import {
  createVault,
  unlockVault,
  recoverVault,
  encryptJson,
  decryptJson,
  encryptFile,
  decryptFile,
} from "@/lib/crypto/vault";
const owner = "10000000-0000-4000-8000-000000000001";
const password = "A unique and long private password 123!";
describe("browser-side vault encryption", { timeout: 30_000 }, () => {
  it("unlocks on another device without sending plaintext keys", async () => {
    const result = await createVault(owner, password);
    const serialized = JSON.stringify(result.envelope);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(result.recoveryCode);
    const key = await unlockVault(owner, password, JSON.parse(serialized));
    const encrypted = await encryptJson(key, owner, result.envelope.vaultId, {
      url: "https://secret.example/job",
      notes: "私人備註",
    });
    expect(JSON.stringify(encrypted)).not.toContain("secret.example");
    expect(
      await decryptJson(key, owner, result.envelope.vaultId, encrypted),
    ).toEqual({ url: "https://secret.example/job", notes: "私人備註" });
  });
  it("rejects wrong password, another owner and altered ciphertext", async () => {
    const result = await createVault(owner, password);
    await expect(
      unlockVault(owner, "a different long password", result.envelope),
    ).rejects.toThrow();
    await expect(
      unlockVault("other", password, result.envelope),
    ).rejects.toThrow();
    const sealed = await encryptJson(
      result.key,
      owner,
      result.envelope.vaultId,
      { status: "interviewing" },
    );
    const changed = {
      ...sealed,
      ct: (sealed.ct[0] === "A" ? "B" : "A") + sealed.ct.slice(1),
    };
    await expect(
      decryptJson(result.key, owner, result.envelope.vaultId, changed),
    ).rejects.toThrow();
  });
  it("uses independent IVs and restores the same key with a new password", async () => {
    const first = await createVault(owner, password);
    const a = await encryptJson(first.key, owner, first.envelope.vaultId, {
      n: 1,
    });
    const b = await encryptJson(first.key, owner, first.envelope.vaultId, {
      n: 1,
    });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    const reset = await recoverVault(
      owner,
      first.recoveryCode,
      "Another strong private password!",
      first.envelope,
    );
    const key = await unlockVault(
      owner,
      "Another strong private password!",
      reset.envelope,
    );
    expect(await decryptJson(key, owner, first.envelope.vaultId, a)).toEqual({
      n: 1,
    });
    await expect(
      unlockVault(owner, password, reset.envelope),
    ).rejects.toThrow();
    await expect(
      recoverVault(owner, first.recoveryCode, password, reset.envelope),
    ).rejects.toThrow();
  });
  it("encrypts file bytes and binds them to the exact file id", async () => {
    const vault = await createVault(owner, password);
    const original = new TextEncoder().encode("%PDF-1.7 private resume");
    const sealed = await encryptFile(
      vault.key,
      owner,
      vault.envelope.vaultId,
      "file-one",
      original,
    );
    expect(sealed.byteLength).toBe(original.byteLength + 29);
    expect(new TextDecoder().decode(sealed)).not.toContain("private resume");
    expect(
      await decryptFile(
        vault.key,
        owner,
        vault.envelope.vaultId,
        "file-one",
        sealed,
      ),
    ).toEqual(original);
    await expect(
      decryptFile(vault.key, owner, vault.envelope.vaultId, "file-two", sealed),
    ).rejects.toThrow();
  });
  it("rejects weak passwords and malformed crypto parameters", async () => {
    await expect(createVault(owner, "short")).rejects.toThrow();
    const v = await createVault(owner, password);
    await expect(
      unlockVault(owner, password, { ...v.envelope, iterations: 1 }),
    ).rejects.toThrow();
  });
});
