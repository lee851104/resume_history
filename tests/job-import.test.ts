import { it, expect } from "vitest";
import { previewJobImport, jobIdentity } from "@/lib/jobs/import";
it("accepts link-only records and JSON fences while retaining optional text", () => {
  const rows = previewJobImport(
    '```json\n[{"jobUrl":"https://example.com/jobs/1"},{"jobUrl":"https://example.com/jobs/2","notes":"第一行\\n第二行","company":" 公司 "}]\n```',
  );
  expect(rows[0].job).toEqual({
    jobUrl: "https://example.com/jobs/1",
    company: null,
    title: null,
    notes: null,
  });
  expect(rows[1].job?.notes).toBe("第一行\n第二行");
  expect(rows[1].job?.company).toBe("公司");
});
it("reports each invalid row and never turns untrusted text into a link", () => {
  const rows = previewJobImport(
    JSON.stringify([
      { jobUrl: "javascript:alert(1)" },
      { jobUrl: "https://u:p@example.com/job" },
      { title: "沒有連結" },
      {
        jobUrl: "https://example.com/1",
        unknown: "do not silently lose fields",
      },
      {
        jobUrl: "https://example.com/2",
        title: "<img src=x onerror=alert(1)>",
      },
    ]),
  );
  expect(rows.slice(0, 4).every((r) => r.error && !r.job)).toBe(true);
  expect(rows[4].job?.title).toContain("<img");
});
it("deduplicates tracking URLs against existing records and batch but preserves job identifiers", () => {
  const rows = previewJobImport(
    JSON.stringify([
      { jobUrl: "https://example.com/?job=1&utm_source=ai" },
      { jobUrl: "https://example.com/?job=2" },
      { jobUrl: "https://example.com/?job=2&fbclid=tracking" },
    ]),
    [{ jobUrl: "https://example.com/?job=1" }],
  );
  expect(rows.map((r) => !!r.duplicate)).toEqual([true, false, true]);
  expect(jobIdentity("https://example.com/#job1")).not.toBe(
    jobIdentity("https://example.com/#job2"),
  );
});
it("rejects malformed, oversized and empty batches", () => {
  for (const input of [
    "[]",
    "{}",
    "not JSON",
    JSON.stringify(
      Array.from({ length: 201 }, () => ({ jobUrl: "https://example.com" })),
    ),
    " ".repeat(1_000_001),
  ])
    expect(() => previewJobImport(input)).toThrow();
});
