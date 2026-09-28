import { assertVaultOwner } from "@/lib/vault/request-owner";
import { isDeepStrictEqual } from "node:util";
import { requireUser } from "@/lib/auth";
import { json, failure, input } from "@/lib/http";
import { HttpError } from "@/lib/security";
import { vaultCreateSchema, vaultUpdateSchema } from "@/lib/crypto/schema";
function wire(row: Record<string, unknown>) {
  return {
    envelope: row.key_envelope,
    payload: row.payload,
    revision: row.revision,
  };
}
export async function GET(request: Request) {
  try {
    const { user, db } = await requireUser();
    assertVaultOwner(request, user.id);
    const { data, error } = await db
      .from("encrypted_vaults")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return json(data ? wire(data) : null);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user, db } = await requireUser();
    assertVaultOwner(request, user.id);
    const v = vaultCreateSchema.parse(await input(request, 6_000_000));
    const { data, error } = await db
      .from("encrypted_vaults")
      .insert({
        owner_id: user.id,
        vault_id: v.envelope.vaultId,
        key_envelope: v.envelope,
        payload: v.payload,
      })
      .select()
      .single();
    if (error?.code === "23505") {
      const { data: existing } = await db
        .from("encrypted_vaults")
        .select("*")
        .eq("owner_id", user.id)
        .single();
      if (
        existing &&
        isDeepStrictEqual(existing.key_envelope, v.envelope) &&
        isDeepStrictEqual(existing.payload, v.payload)
      )
        return json(wire(existing));
      throw new HttpError(409, "此帳號已建立保險箱，請重新整理後解鎖");
    }
    if (error) throw error;
    return json(wire(data), 201);
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { user, db } = await requireUser();
    assertVaultOwner(request, user.id);
    const v = vaultUpdateSchema.parse(await input(request, 6_000_000));
    const changes: Record<string, unknown> = { payload: v.payload };
    if (v.envelope) changes.key_envelope = v.envelope;
    const { data, error } = await db
      .from("encrypted_vaults")
      .update(changes)
      .eq("owner_id", user.id)
      .eq("revision", v.expectedRevision)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return json(wire(data));
    const { data: current } = await db
      .from("encrypted_vaults")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (
      current &&
      isDeepStrictEqual(current.payload, v.payload) &&
      (!v.envelope || isDeepStrictEqual(current.key_envelope, v.envelope))
    )
      return json(wire(current));
    throw new HttpError(
      409,
      "另一個裝置已更新資料，請重新整理後再試。你的輸入仍保留。",
    );
  } catch (e) {
    return failure(e);
  }
}
