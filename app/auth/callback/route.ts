import { createServerSupabase } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/http";
import { safeReturnTo } from "@/lib/security";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await createServerSupabase();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error)
        return Response.redirect(
          new URL(safeReturnTo(url.searchParams.get("next")), appOrigin()),
          303,
        );
    } catch {
      /* Keep provider details out of the public error. */
    }
  }
  return Response.redirect(new URL("/?auth_error=1", appOrigin()), 303);
}
