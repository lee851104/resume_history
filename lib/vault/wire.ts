import { z } from "zod";
export const sealedPrepareSchema = z
  .object({
    id: z.string().uuid(),
    size: z.number().int().min(30).max(20_000_029),
  })
  .strict();
export interface SealedPrepared {
  id: string;
  path: string;
  token?: string;
  ready: boolean;
}
