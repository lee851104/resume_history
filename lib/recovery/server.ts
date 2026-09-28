import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { HttpError } from "@/lib/security";
export const recoveryInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("enroll"),
      vaultId: z.string().uuid(),
      material: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict(),
  z.object({ action: z.literal("send") }).strict(),
  z
    .object({
      action: z.literal("verify"),
      token: z.string().regex(/^\d{6,10}$/),
    })
    .strict(),
]);
export function googleEmail(user: User) {
  const email = user.email?.toLowerCase();
  const google = user.identities?.find(
    (i) =>
      i.provider === "google" &&
      i.identity_data?.email?.toLowerCase() === email &&
      i.identity_data?.email_verified === true,
  );
  if (!email || !user.email_confirmed_at || !google)
    throw new HttpError(
      403,
      "請先使用原本的 Google 帳號重新登入，再啟用信箱復原",
    );
  return email;
}
export function recoverySecret() {
  const secret = process.env.VAULT_RECOVERY_SECRET;
  return process.env.VAULT_EMAIL_RECOVERY_ENABLED === "true" &&
    secret &&
    /^[a-fA-F0-9]{64}$/.test(secret)
    ? secret
    : null;
}
