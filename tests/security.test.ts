import { describe, it, expect } from "vitest";
import { safeReturnTo, assertOrigin, requireIdentity } from "@/lib/security";
import { detectResume } from "@/lib/resumes/files";
import { isPublicAddress, validateTarget } from "@/lib/jobs/safe-fetch";
import { parseMetadata } from "@/lib/jobs/metadata";
import { zipSync, strToU8 } from "fflate";
describe("authentication boundary", () => {
  it("rejects anonymous identity", () => {
    expect(() => requireIdentity(null)).toThrow();
  });
  it("uses verified identity only", () => {
    expect(requireIdentity({ id: "a", email: "x@y.z" })).toEqual({
      id: "a",
      email: "x@y.z",
    });
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "/%2fevil.com"])(
    "rejects redirect escape %s",
    (value) => {
      expect(safeReturnTo(value)).toBe("/");
    },
  );
  it("keeps a safe internal path", () => {
    expect(safeReturnTo("/?status=applied")).toBe("/?status=applied");
  });
  it("rejects cross-site writes and absent origin", () => {
    for (const origin of ["https://evil.com", null]) {
      const headers = new Headers();
      if (origin) headers.set("origin", origin);
      expect(() =>
        assertOrigin(
          new Request("https://site.com/api", { headers }),
          "https://site.com",
        ),
      ).toThrow();
    }
    expect(() =>
      assertOrigin(
        new Request("https://site.com/api", {
          headers: { origin: "https://site.com" },
        }),
        "https://site.com",
      ),
    ).not.toThrow();
  });
});
describe("resume content", () => {
  it("accepts a PDF signature", () => {
    expect(
      detectResume(new TextEncoder().encode("%PDF-1.7\n%%EOF"), "pdf"),
    ).toBe("application/pdf");
  });
  it("rejects renamed HTML and other file formats", () => {
    expect(() =>
      detectResume(new TextEncoder().encode("<html>bad</html>"), "pdf"),
    ).toThrow();
    expect(() =>
      detectResume(new TextEncoder().encode("%PDF-1.7"), "docx"),
    ).toThrow();
  });
  it("accepts a Word ZIP but not arbitrary ZIPs", () => {
    const valid = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8("<w:document/>"),
    });
    expect(detectResume(valid, "docx")).toContain("wordprocessingml");
    expect(() =>
      detectResume(zipSync({ "x.txt": strToU8("x") }), "docx"),
    ).toThrow();
  });
});
describe("job URL safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "0.0.0.0",
  ])("rejects internal address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it("permits public addresses", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
  it.each([
    "http://localhost/x",
    "https://example.com:8443/x",
    "http://user:pass@example.com",
  ])("rejects unsafe target %s", (url) => {
    expect(() => validateTarget(url)).toThrow();
  });
});
describe("metadata extraction", () => {
  it("extracts structured JobPosting without executing scripts", () => {
    const html =
      '<script type="application/ld+json">{"@type":"JobPosting","title":"Python 工程師","hiringOrganization":{"name":"測試公司"}}</script>';
    expect(parseMetadata(html, "https://www.104.com.tw/job/123")).toEqual({
      title: "Python 工程師",
      company: "測試公司",
      platform: "104",
    });
  });
  it("does not guess from a login or generic title", () => {
    expect(
      parseMetadata("<title>請登入</title>", "https://example.com/job"),
    ).toEqual({ title: null, company: null, platform: "example.com" });
  });
  it("handles invalid structured data and arrays", () => {
    expect(
      parseMetadata(
        '<script type="application/ld+json">{broken</script>',
        "https://example.com",
      ).title,
    ).toBeNull();
    expect(
      parseMetadata(
        '<script type="application/ld+json">[{"@type":"JobPosting","title":"Dev"}]</script>',
        "https://example.com",
      ).title,
    ).toBe("Dev");
  });
});

describe("redirect control characters", () => {
  it.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example"])(
    "rejects normalization escape %s",
    (value) => {
      expect(safeReturnTo(value)).toBe("/");
    },
  );
});
