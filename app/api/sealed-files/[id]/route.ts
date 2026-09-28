import { assertVaultOwner } from "@/lib/vault/request-owner";
import { requireUser } from "@/lib/auth";
import { json, failure, input } from "@/lib/http";
import { idSchema } from "@/lib/domain/validation";
import { HttpError } from "@/lib/security";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const { user, db } = await requireUser();
    assertVaultOwner(request, user.id);
    z.object({})
      .strict()
      .parse(await input(request));
    const id = idSchema.parse((await params).id);
    const { data: row, error } = await db
      .from("sealed_files")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "找不到加密檔案");
    if (!row.ready) {
      const path = user.id + "/" + id + ".bin";
      const { data: info, error: infoError } = await db.storage
        .from("sealed-resumes")
        .info(path);
      if (infoError || !info || Number(info.size) !== Number(row.size))
        throw new HttpError(400, "密文上傳未完成，請重試");
      const { error: finalizeError } = await db
        .from("sealed_files")
        .update({ ready: true })
        .eq("id", id)
        .eq("owner_id", user.id);
      if (finalizeError) throw finalizeError;
    }
    return json({ id, ready: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request, { params }: Context) {
  try {
    const { user, db } = await requireUser();
    assertVaultOwner(request, user.id);
    const id = idSchema.parse((await params).id);
    const { data: row, error } = await db
      .from("sealed_files")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .eq("ready", true)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "找不到加密檔案");
    const { data, error: signError } = await db.storage
      .from("sealed-resumes")
      .createSignedUrl(user.id + "/" + id + ".bin", 60);
    if (signError) throw signError;
    return json({ url: data.signedUrl });
  } catch (e) {
    return failure(e);
  }
}
