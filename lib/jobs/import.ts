import { z } from "zod";
import { jobUrlSchema, idSchema } from "@/lib/domain/validation";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
export const jobInputSchema = z
  .object({
    jobUrl: jobUrlSchema,
    company: text(200),
    title: text(300),
    notes: text(5000),
  })
  .strict();
export type JobInput = z.infer<typeof jobInputSchema>;
export const prospectStatuses = [
  "review",
  "ready",
  "paused",
  "dismissed",
  "applied",
] as const;
export type ProspectStatus = (typeof prospectStatuses)[number];
export const prospectLabels: Record<ProspectStatus, string> = {
  review: "待評估",
  ready: "準備投遞",
  paused: "暫緩",
  dismissed: "不考慮",
  applied: "已投遞",
};
export const prospectSchema = jobInputSchema.extend({
  id: idSchema,
  status: z.enum(prospectStatuses),
  applicationId: idSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Prospect = z.infer<typeof prospectSchema>;
export function jobIdentity(value: string) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()])
    if (
      /^utm_/i.test(key) ||
      ["fbclid", "gclid", "msclkid"].includes(key.toLowerCase())
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export const AI_JOB_PROMPT = `請將你幫我找到的職缺整理為 JSON 陣列，方便匯入我的職缺待辦。
只輸出 JSON，不要附加說明。每筆只使用以下四個欄位：
- jobUrl：必填，真實、完整的 http 或 https 職缺連結。不要編造連結；沒有連結的職缺不要列入。
- company：公司名稱，找不到請填 null。
- title：職稱，找不到請填 null。
- notes：可填工作地點、薪資、推薦原因、注意事項與資訊查詢日期；未確認的資訊需註明，沒有請填 null。
同一職缺不要重複，每次最多 200 筆。不需要履歷、投遞日期或狀態。
格式範例（請換成實際搜尋結果）：
[
  {"jobUrl":"https://example.com/jobs/123","company":"範例公司","title":"Python 工程師","notes":"地點、薪資及推薦原因"}
]`;
export type ImportRow = {
  index: number;
  job?: JobInput;
  error?: string;
  duplicate?: string;
};
export function previewJobImport(
  source: string,
  existing: { jobUrl: string }[] = [],
): ImportRow[] {
  if (source.length > 1_000_000)
    throw new Error("貼上的內容太大，請分批匯入（每次最多 200 筆）");
  let text = source.trim();
  if (text.startsWith("```")) {
    const match = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    if (!match) throw new Error("請貼上完整的 JSON 陣列");
    text = match[1];
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正確，請使用「給 AI 的整理指令」重新產生");
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 200)
    throw new Error("請提供包含 1 至 200 筆職缺的 JSON 陣列");
  const seen = new Set(existing.map((j) => jobIdentity(j.jobUrl)));
  return value.map((raw, index) => {
    const result = jobInputSchema.safeParse(raw);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join(".") || "欄位");
      return {
        index,
        error:
          "請檢查 " +
          [...new Set(paths)].join("、") +
          "；每筆必須有有效的職缺連結，其他欄位可省略。",
      };
    }
    const identity = jobIdentity(result.data.jobUrl);
    const duplicate = seen.has(identity)
      ? "重複網址（待辦、投遞紀錄或本次列表已有）"
      : undefined;
    seen.add(identity);
    return { index, job: result.data, duplicate };
  });
}
