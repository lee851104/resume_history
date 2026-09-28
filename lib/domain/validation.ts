import { z } from "zod";
import { statuses } from "./types";
export const MAX_FILE_SIZE = 20_000_000;
export const mimeTypes = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export const idSchema = z.string().uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "日期不存在");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
export const jobUrlSchema = z
  .string()
  .trim()
  .max(4096)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "請貼上 http 或 https 職缺連結");
const fields = {
  jobUrl: jobUrlSchema,
  resumeId: idSchema,
  appliedOn: date,
  status: z.enum(statuses).default("applied"),
  company: optionalText(200),
  title: optionalText(300),
  notes: optionalText(5000),
  followUpOn: date
    .nullable()
    .optional()
    .transform((v) => v || null),
};
export const applicationSchema = z.object(fields).strict();
export function parseApplication(input: unknown) {
  return applicationSchema.parse(input);
}
export function parsePatch(input: unknown) {
  return z
    .object({ ...fields, status: z.enum(statuses) })
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .parse(input);
}
export function validateUpload(input: unknown) {
  const v = z
    .object({
      fileName: z.string().trim().min(1).max(200),
      size: z.number().int().min(1).max(MAX_FILE_SIZE),
      contentType: z.string().max(150),
    })
    .strict()
    .parse(input);
  const extension = v.fileName
    .split(".")
    .pop()
    ?.toLowerCase() as keyof typeof mimeTypes;
  if (
    !(extension in mimeTypes) ||
    !["", "application/octet-stream", mimeTypes[extension]].includes(
      v.contentType,
    )
  )
    throw new Error("請選擇 PDF、DOC 或 DOCX 履歷");
  return { ...v, extension, contentType: mimeTypes[extension] };
}
export function platformFor(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const platforms: Record<string, string> = {
    "104.com.tw": "104",
    "1111.com.tw": "1111",
    "linkedin.com": "LinkedIn",
    "yourator.co": "Yourator",
    "cakeresume.com": "Cake",
    "cake.me": "Cake",
    "yes123.com.tw": "yes123",
    "518.com.tw": "518",
  };
  return (
    Object.entries(platforms).find(
      ([domain]) => host === domain || host.endsWith("." + domain),
    )?.[1] ?? host
  );
}
