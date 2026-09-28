import { requireUser } from "@/lib/auth";
import { assertVaultOwner } from "@/lib/vault/request-owner";
import { json, failure, input } from "@/lib/http";
import { HttpError } from "@/lib/security";
import {
  googleEmail,
  recoveryInput,
  recoverySecret,
} from "@/lib/recovery/server";
import { sealMaterial, openMaterial } from "@/lib/recovery/escrow";
import { createOtpClient } from "@/lib/recovery/otp";
import { importRecoveryMaterial, decryptJson } from "@/lib/crypto/vault";
const setupMessage = "網站尚未完成信箱復原設定，請先使用私人密碼或離線復原碼";
async function context(request: Request) {
  const { user, db } = await requireUser();
  assertVaultOwner(request, user.id);
  return { user, db, email: googleEmail(user) };
}
export async function GET(request: Request) {
  try {
    const { user, db, email } = await context(request),
      secret = recoverySecret();
    if (!secret)
      return json({
        available: false,
        enabled: false,
        email,
        message: setupMessage,
      });
    const { data, error } = await db
      .from("vault_email_recovery")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error)
      return json({
        available: false,
        enabled: false,
        email,
        message: setupMessage,
      });
    let enabled = false;
    if (data && data.email === email) {
      try {
        openMaterial(
          data.sealed_key,
          { owner: user.id, vaultId: data.vault_id, email },
          secret,
        );
        enabled = true;
      } catch {
        /* Unlock first to repair escrow. */
      }
    }
    return json({
      available: true,
      enabled,
      email,
      message: enabled
        ? "已啟用 Google 信箱復原"
        : "尚未啟用信箱復原；請先解鎖一次，再啟用",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user, db, email } = await context(request);
    const v = recoveryInput.parse(await input(request, 2000));
    const secret = recoverySecret();
    if (!secret) throw new HttpError(503, setupMessage);
    const { data: vault, error: vaultError } = await db
      .from("encrypted_vaults")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (vaultError) throw vaultError;
    if (!vault) throw new HttpError(409, "請先建立保險箱");
    const binding = { owner: user.id, vaultId: vault.vault_id, email };
    if (v.action === "enroll") {
      if (v.vaultId !== vault.vault_id)
        throw new HttpError(409, "保險箱已變更，請重新解鎖");
      try {
        await decryptJson(
          await importRecoveryMaterial(v.material),
          user.id,
          vault.vault_id,
          vault.payload,
        );
      } catch {
        throw new HttpError(400, "復原資料不符，請重新解鎖後再啟用");
      }
      const sealed = sealMaterial(v.material, binding, secret);
      const { error } = await db
        .from("vault_email_recovery")
        .upsert(
          {
            owner_id: user.id,
            vault_id: vault.vault_id,
            email,
            sealed_key: sealed,
          },
          { onConflict: "owner_id" },
        );
      if (error) throw new HttpError(503, setupMessage);
      return json({ enabled: true, email });
    }
    const { data: escrow, error } = await db
      .from("vault_email_recovery")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw new HttpError(503, setupMessage);
    if (!escrow || escrow.vault_id !== vault.vault_id || escrow.email !== email)
      throw new HttpError(
        409,
        "此保險箱尚未啟用信箱復原，請使用私人密碼或離線復原碼解鎖一次",
      );
    const otp = createOtpClient();
    if (v.action === "send") {
      try {
        openMaterial(escrow.sealed_key, binding, secret);
      } catch {
        throw new HttpError(
          409,
          "信箱復原備份無法讀取，請用私人密碼或離線復原碼解鎖後重新啟用",
        );
      }
      const { error: sendError } = await otp.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (sendError)
        throw new HttpError(
          sendError.status === 429 ? 429 : 503,
          "驗證碼寄送失敗，請稍後重試；若持續失敗，需檢查寄信設定",
        );
      return json({ sent: true, email });
    }
    const { data: verified, error: verifyError } = await otp.auth.verifyOtp({
      email,
      token: v.token,
      type: "email",
    });
    try {
      if (
        verifyError ||
        verified.user?.id !== user.id ||
        verified.user?.email?.toLowerCase() !== email ||
        !verified.user.email_confirmed_at
      )
        throw new HttpError(400, "驗證碼錯誤、過期或已使用，請重新取得驗證碼");
      let material: string;
      try {
        material = openMaterial(escrow.sealed_key, binding, secret);
      } catch {
        throw new HttpError(409, "信箱復原備份無法讀取，請改用離線復原碼");
      }
      return json({
        material,
        row: {
          envelope: vault.key_envelope,
          payload: vault.payload,
          revision: vault.revision,
        },
      });
    } finally {
      // Revoke only the temporary OTP session, never the existing Google sessions.
      if (verified.user)
        await otp.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  } catch (e) {
    return failure(e);
  }
}
