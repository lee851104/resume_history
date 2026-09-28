import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/supabase/config";
/** Separate OTP session: never changes browser cookies or the user's Google session. */
export function createOtpClient() {
  const { url, key } = publicConfig();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
