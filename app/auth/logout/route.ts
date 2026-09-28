import { createServerSupabase } from "@/lib/supabase/server";
import { appOrigin, failure } from "@/lib/http";
import { assertOrigin } from "@/lib/security";
export async function POST(request: Request) {
  try {
    assertOrigin(request, appOrigin());
    const db = await createServerSupabase();
    await db.auth.signOut();
    return Response.redirect(appOrigin(), 303);
  } catch (e) {
    return failure(e);
  }
}
