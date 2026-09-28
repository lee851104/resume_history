export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireIdentity(user: { id: string; email?: string } | null) {
  if (!user?.id) throw new HttpError(401, "請先登入");
  return { id: user.id, email: user.email };
}
export function safeReturnTo(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x1f\x7f]/.test(value) ||
    /%(?:2f|5c|0d|0a)/i.test(value)
  )
    return "/";
  const base = "https://internal.invalid";
  try {
    if (new URL(value, base).origin !== base) return "/";
  } catch {
    return "/";
  }
  return value;
}
export function assertOrigin(request: Request, configuredOrigin?: string) {
  const expected = configuredOrigin || new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected)
    throw new HttpError(403, "請從本站重新送出");
}
