import { createBrowserClient } from "@supabase/ssr";
import { publicConfig } from "./config";
export function createBrowserSupabase() {
  const { url, key } = publicConfig();
  return createBrowserClient(url, key);
}
