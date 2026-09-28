import { AUTH_INVALID_EVENT } from "./vault/session-events";
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = await response
    .json()
    .catch(() => ({ error: "服務暫時無法使用，請稍後再試" }));
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
  if (!response.ok) throw new Error(payload.error || "操作失敗，請重試");
  return payload as T;
}
