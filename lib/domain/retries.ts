import { HttpError } from "@/lib/security";
export function checkRetry(
  existing: Record<string, unknown>,
  requested: Record<string, unknown>,
) {
  if (
    Object.entries(requested).some(
      ([key, value]) => (existing[key] ?? null) !== (value ?? null),
    )
  ) {
    throw new HttpError(
      409,
      "這筆投遞已儲存，但重試內容不同。請保留修改內容，關閉表單並重新整理，再編輯原紀錄。",
    );
  }
}
