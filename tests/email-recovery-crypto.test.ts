import { describe, it, expect } from "vitest";
import * as vault from "@/lib/crypto/vault";
const owner = "10000000-0000-4000-8000-000000000001";
const password = "A long private password for tests!";
describe("email recovery material", { timeout: 30000 }, () => {
  it("restores original records and files after the password and offline code are lost", async () => {
    expect(vault).toHaveProperty("exportRecoveryMaterial");
    expect(vault).toHaveProperty("restoreFromMaterial");
    const original = await vault.createVault(owner, password);
    const id = original.envelope.vaultId;
    const payload = await vault.encryptJson(original.key, owner, id, {
      title: "私人職缺",
    });
    const file = await vault.encryptFile(
      original.key,
      owner,
      id,
      "resume",
      new TextEncoder().encode("%PDF-1.7 private"),
    );
    const material = await vault.exportRecoveryMaterial(
      owner,
      password,
      original.envelope,
      "password",
    );
    const offlineMaterial = await vault.exportRecoveryMaterial(
      owner,
      original.recoveryCode,
      original.envelope,
      "recovery",
    );
    expect(material).toBe(offlineMaterial);
    const reset = await vault.restoreFromMaterial(
      owner,
      material,
      "A new long private password!",
      original.envelope,
    );
    const key = await vault.unlockVault(
      owner,
      "A new long private password!",
      reset.envelope,
    );
    expect(await vault.decryptJson(key, owner, id, payload)).toEqual({
      title: "私人職缺",
    });
    expect(
      new TextDecoder().decode(
        await vault.decryptFile(key, owner, id, "resume", file),
      ),
    ).toBe("%PDF-1.7 private");
    await expect(
      vault.unlockVault(owner, password, reset.envelope),
    ).rejects.toThrow();
    const again = await vault.restoreFromMaterial(
      owner,
      material,
      "Another new private password!",
      reset.envelope,
    );
    expect(await vault.decryptJson(again.key, owner, id, payload)).toEqual({
      title: "私人職缺",
    });
  });
  it("refuses export with a wrong credential/owner and malformed recovery keys", async () => {
    expect(vault).toHaveProperty("exportRecoveryMaterial");
    const original = await vault.createVault(owner, password);
    await expect(
      vault.exportRecoveryMaterial(
        owner,
        "a wrong long password",
        original.envelope,
        "password",
      ),
    ).rejects.toThrow();
    await expect(
      vault.exportRecoveryMaterial(
        "another-owner",
        original.recoveryCode,
        original.envelope,
        "recovery",
      ),
    ).rejects.toThrow();
    await expect(
      vault.restoreFromMaterial(owner, "short", password, original.envelope),
    ).rejects.toThrow();
  });
});
