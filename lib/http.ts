import { ZodError } from "zod";
import { HttpError, assertOrigin } from "./security";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: "資料格式不正確，請重新檢查" }, 400);
  // Never log request bodies, ciphertext envelopes or decrypted content.
  console.error("Request failed");
  return json({ error: "暫時無法完成操作，請稍後重試" }, 500);
}
export async function input(request: Request, maxBytes = 20000) {
  assertOrigin(request, process.env.APP_ORIGIN);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "請使用 JSON 資料");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "資料格式不正確");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "資料容量超過單次儲存限制");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "資料格式不正確");
  }
}
export function appOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new HttpError(503, "尚未設定網站網址");
  return new URL(value).origin;
}
