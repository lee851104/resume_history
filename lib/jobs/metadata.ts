import { load } from "cheerio";
import { platformFor } from "@/lib/domain/validation";
import { safeFetchHtml } from "./safe-fetch";
function findPosting(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 8 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = findPosting(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const item = value as Record<string, unknown>;
  if (
    item["@type"] === "JobPosting" ||
    (Array.isArray(item["@type"]) && item["@type"].includes("JobPosting"))
  )
    return item;
  return findPosting(item["@graph"], depth + 1);
}
export function parseMetadata(html: string, url: string) {
  const $ = load(html);
  let job: Record<string, unknown> | null = null;
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      job = findPosting(JSON.parse($(script).text()));
      if (job) break;
    } catch {
      /* Unreadable metadata is optional. */
    }
  }
  const clean = (v: unknown, max: number) =>
    typeof v === "string"
      ? load("<div>" + v + "</div>")("div")
          .text()
          .trim()
          .slice(0, max) || null
      : null;
  return {
    title: clean(job?.title, 300),
    company: clean(
      (job?.hiringOrganization as Record<string, unknown>)?.name,
      200,
    ),
    platform: platformFor(url),
  };
}
export async function readJobMetadata(url: string) {
  try {
    return parseMetadata(await safeFetchHtml(url), url);
  } catch {
    return { company: null, title: null, platform: platformFor(url) };
  }
}
