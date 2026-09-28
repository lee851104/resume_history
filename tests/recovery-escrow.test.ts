import { describe, it, expect } from "vitest";
const server = await import("@/lib/recovery/escrow").catch(() => null);
const secret = "ab".repeat(32);
const material = Buffer.alloc(32, 17).toString("base64url");
const binding = {
  owner: "user-one",
  vaultId: "vault-one",
  email: "owner@gmail.com",
};
describe("server recovery escrow", () => {
  it("keeps the master key out of the database and authenticates owner, vault, email and ciphertext", () => {
    expect(server).not.toBeNull();
    const packet = server!.sealMaterial(material, binding, secret);
    expect(JSON.stringify(packet)).not.toContain(material);
    expect(server!.openMaterial(packet, binding, secret)).toBe(material);
    for (const changed of [
      { ...binding, owner: "other" },
      { ...binding, vaultId: "other" },
      { ...binding, email: "other@gmail.com" },
    ])
      expect(() => server!.openMaterial(packet, changed, secret)).toThrow();
    expect(() =>
      server!.openMaterial(packet, binding, "cd".repeat(32)),
    ).toThrow();
    expect(() =>
      server!.openMaterial(
        {
          ...packet,
          ct: (packet.ct[0] === "A" ? "B" : "A") + packet.ct.slice(1),
        },
        binding,
        secret,
      ),
    ).toThrow();
    expect(server!.sealMaterial(material, binding, secret).iv).not.toBe(
      packet.iv,
    );
  });
  it("refuses weak/missing server secrets and malformed master keys", () => {
    expect(server).not.toBeNull();
    expect(() =>
      server!.sealMaterial(material, binding, "public-key"),
    ).toThrow();
    expect(() => server!.sealMaterial("short", binding, secret)).toThrow();
  });
});
