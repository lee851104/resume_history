import { json } from "./http";
export function disabled() {
  return json({ error: "此明文 API 已停用，請使用端對端加密版本" }, 410);
}
