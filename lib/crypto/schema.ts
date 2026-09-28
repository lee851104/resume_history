import { z } from "zod";
export const KDF_ITERATIONS = 600_000;
const b64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const packetSchema = z
  .object({
    v: z.literal(1),
    iv: b64.length(16),
    ct: b64.min(22).max(6_000_000),
  })
  .strict();
export type Packet = z.infer<typeof packetSchema>;
export const envelopeSchema = z
  .object({
    v: z.literal(1),
    vaultId: z.string().uuid(),
    salt: b64.length(22),
    iterations: z.literal(KDF_ITERATIONS),
    passwordKey: packetSchema,
    recoveryKey: packetSchema,
  })
  .strict()
  .refine(
    (v) => v.passwordKey.ct.length === 64 && v.recoveryKey.ct.length === 64,
    "Invalid wrapped key",
  );
export type KeyEnvelope = z.infer<typeof envelopeSchema>;
export const vaultCreateSchema = z
  .object({ envelope: envelopeSchema, payload: packetSchema })
  .strict();
export const vaultUpdateSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    payload: packetSchema,
    envelope: envelopeSchema.optional(),
  })
  .strict();
export interface VaultRow {
  envelope: KeyEnvelope;
  payload: Packet;
  revision: number;
}
