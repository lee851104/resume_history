import { createServerSupabase } from "./supabase/server";
import { isConfigured } from "./supabase/config";
import { HttpError, requireIdentity } from "./security";
export async function requireUser() {
  if (!isConfigured()) throw new HttpError(503, "尚未連接雲端");
  const db = await createServerSupabase();
  const { data, error } = await db.auth.getUser();
  if (error) throw new HttpError(401, "登入已過期，請重新登入");
  requireIdentity(data.user);
  return { user: data.user!, db };
}
