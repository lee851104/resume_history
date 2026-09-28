import { isConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { json, failure } from "@/lib/http";
export async function GET() {
  try {
    if (!isConfigured()) return json({ configured: false, user: null });
    const db = await createServerSupabase();
    const { data } = await db.auth.getUser();
    return json({
      configured: true,
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    });
  } catch (e) {
    return failure(e);
  }
}
