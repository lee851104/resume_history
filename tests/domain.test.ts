import { describe, it, expect } from "vitest";
import {
  parseApplication,
  parsePatch,
  validateUpload,
} from "@/lib/domain/validation";
import { summarize, localDate } from "@/lib/domain/summary";
const base = {
  jobUrl: "https://example.com/jobs/1",
  resumeId: "f8c8a6e0-142c-4a1a-93c7-53d1ecaa9f46",
  appliedOn: "2026-09-28",
};
describe("application input", () => {
  it("accepts a link, resume and date with default status", () => {
    expect(parseApplication(base)).toMatchObject({
      ...base,
      status: "applied",
      company: null,
      title: null,
    });
  });
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (jobUrl) => {
    expect(() => parseApplication({ ...base, jobUrl })).toThrow();
  });
  it("rejects missing resume and impossible date", () => {
    expect(() => parseApplication({ ...base, resumeId: "" })).toThrow();
    expect(() =>
      parseApplication({ ...base, appliedOn: "2026-02-30" }),
    ).toThrow();
  });
  it("forbids ownership changes and unknown status", () => {
    expect(() => parsePatch({ owner_id: "other" })).toThrow();
    expect(() => parsePatch({ status: "unknown" })).toThrow();
  });
});
describe("upload validation", () => {
  it("accepts maximum size and rejects oversized files", () => {
    expect(
      validateUpload({
        fileName: "履歷.pdf",
        size: 20000000,
        contentType: "application/pdf",
      }).extension,
    ).toBe("pdf");
    expect(() =>
      validateUpload({
        fileName: "履歷.pdf",
        size: 20000001,
        contentType: "application/pdf",
      }),
    ).toThrow();
  });
  it("rejects executable extensions, empty files and mismatched types", () => {
    for (const input of [
      { fileName: "x.exe", size: 100, contentType: "application/pdf" },
      { fileName: "x.pdf", size: 0, contentType: "application/pdf" },
      { fileName: "x.pdf", size: 100, contentType: "text/html" },
    ])
      expect(() => validateUpload(input)).toThrow();
  });
});
describe("dashboard", () => {
  it("counts due today and overdue only for active applications", () => {
    const items = [
      { status: "applied", followUpOn: "2026-09-28" },
      { status: "interviewing", followUpOn: "2026-09-27" },
      { status: "offer", followUpOn: "2026-09-27" },
      { status: "rejected", followUpOn: "2026-09-27" },
      { status: "applied", followUpOn: "2026-09-29" },
    ] as Parameters<typeof summarize>[0];
    expect(summarize(items, "2026-09-28")).toMatchObject({
      total: 5,
      interviewing: 1,
      due: 2,
    });
  });
  it("uses local date components", () => {
    expect(localDate(new Date(2026, 8, 28, 0, 1))).toBe("2026-09-28");
  });
});
