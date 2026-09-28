import { assertVaultOwner } from "@/lib/vault/request-owner";
import { requireUser } from "@/lib/auth";
import { json, failure, input } from "@/lib/http";
import { HttpError } from "@/lib/security";
import { sealedPrepareSchema } from "@/lib/vault/wire";
export async function POST(request: Request) {
  try {
    const { user, db } = await requireUser();
    assertVaultOwner(request, user.id);
    const v = sealedPrepareSchema.parse(await input(request));
    const { data: vault, error: vaultError } = await db
      .from("encrypted_vaults")
      .select("vault_id")
      .eq("owner_id", user.id)
      .single();
    if (vaultError || !vault) throw new HttpError(400, "請先建立加密保險箱");
    const { error: insertError } = await db.from("sealed_files").insert({
      id: v.id,
      owner_id: user.id,
      vault_id: vault.vault_id,
      size: v.size,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
    const { data: row } = await db
      .from("sealed_files")
      .select("*")
      .eq("id", v.id)
      .eq("owner_id", user.id)
      .eq("vault_id", vault.vault_id)
      .single();
    if (!row || Number(row.size) !== v.size)
      throw new HttpError(409, "加密檔案識別碼衝突");
    const path = user.id + "/" + v.id + ".bin";
    if (row.ready) return json({ id: v.id, path, ready: true });
    const { data, error } = await db.storage
      .from("sealed-resumes")
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    return json({ id: v.id, path, token: data.token, ready: false }, 201);
  } catch (e) {
    return failure(e);
  }
}
