import { createServerSupabase } from "@/lib/supabase/server";
import { appOrigin, failure } from "@/lib/http";
export async function GET() {
  try {
    const db = await createServerSupabase();
    const { data, error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: appOrigin() + "/auth/callback",
        queryParams: { access_type: "online" },
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) throw error || new Error("Login URL missing");
    return Response.redirect(data.url, 303);
  } catch (e) {
    return failure(e);
  }
}
