// Node-only cryptography: never import this module into client components.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
const sealedSchema = z
  .object({
    v: z.literal(1),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    ct: z.string().regex(/^[A-Za-z0-9_-]{64}$/),
  })
  .strict();
type Binding = { owner: string; vaultId: string; email: string };
function aad(b: Binding) {
  return Buffer.from(
    JSON.stringify([
      "resume-tracker-email-recovery",
      1,
      b.owner,
      b.vaultId,
      b.email,
    ]),
  );
}
function secretBytes(secret: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(secret))
    throw new Error("Invalid server recovery secret");
  return Buffer.from(secret, "hex");
}
export function sealMaterial(
  material: string,
  binding: Binding,
  secret: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(material))
    throw new Error("Invalid recovery material");
  const raw = Buffer.from(material, "base64url"),
    key = secretBytes(secret),
    iv = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(binding));
    const ct = Buffer.concat([
      cipher.update(raw),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return {
      v: 1 as const,
      iv: iv.toString("base64url"),
      ct: ct.toString("base64url"),
    };
  } finally {
    raw.fill(0);
    key.fill(0);
  }
}
export function openMaterial(value: unknown, binding: Binding, secret: string) {
  const packet = sealedSchema.parse(value),
    key = secretBytes(secret),
    ct = Buffer.from(packet.ct, "base64url");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(packet.iv, "base64url"),
    );
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(ct.subarray(32));
    const raw = Buffer.concat([
      decipher.update(ct.subarray(0, 32)),
      decipher.final(),
    ]);
    try {
      return raw.toString("base64url");
    } finally {
      raw.fill(0);
    }
  } finally {
    key.fill(0);
  }
}
