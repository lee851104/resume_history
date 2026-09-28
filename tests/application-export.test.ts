import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { load } from "cheerio";
import { exportApplicationsXlsx } from "../lib/export/applications-xlsx";
import type { Application, ResumeVersion } from "../lib/domain/types";

const item: Application = {
  id: "application-1", jobUrl: "https://example.com/jobs/1?a=1&b=2",
  title: "Python 工程師", company: "公司 & <團隊>", platform: "104",
  appliedOn: "2026-09-28", status: "interviewing", resumeId: "resume-1",
  notes: '=HYPERLINK("https://example.com", "不要執行")\n第二行 😀',
  followUpOn: "2026-10-01", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T01:00:00Z",
};
const resume: ResumeVersion = {
  id: "resume-1", displayName: "Python 版", originalName: "履歷.pdf",
  size: 100, contentType: "application/pdf", createdAt: item.createdAt,
};
function read(items: Application[], resumes: ResumeVersion[] = []) {
  const files = unzipSync(exportApplicationsXlsx(items, resumes));
  const xml = (path: string) => load(strFromU8(files[path]), { xml: true });
  return { sheet: xml("xl/worksheets/sheet1.xml"), workbook: xml("xl/workbook.xml"), links: xml("xl/worksheets/_rels/sheet1.xml.rels") };
}
describe("application Excel export", () => {
  it("exports complete records, real dates, linked titles and resume names", () => {
    const { sheet: $, links, workbook } = read([item], [resume]);
    expect(workbook("sheet").attr("name")).toBe("投遞紀錄");
    expect($('c[r="B2"] t').text()).toBe(item.title);
    expect($('c[r="C2"] t').text()).toBe(item.company);
    expect($('c[r="D2"] t').text()).toBe(item.jobUrl);
    expect($('c[r="F2"] t').text()).toBe("面試中");
    expect($('c[r="G2"] t').text()).toBe("Python 版");
    expect($('c[r="H2"] t').text()).toBe("履歷.pdf");
    expect(Number($('c[r="A2"] v').text())).toBe(Date.parse("2026-09-28T00:00:00Z") / 86400000 + 25569);
    expect($('hyperlink[ref="B2"]').length).toBe(1);
    expect($('hyperlink[ref="D2"]').length).toBe(1);
    expect(links("Relationship").attr("Target")).toBe(item.jobUrl);
    expect($("pane").attr("state")).toBe("frozen");
    expect($("autoFilter").attr("ref")).toBe("A1:L2");
  });
  it("preserves formula-looking content as text and strips invalid XML controls", () => {
    const { sheet: $ } = read([{ ...item, title: '+SUM(1,2)', notes: item.notes + '\u0000\u000b' }]);
    expect($("f").length).toBe(0);
    expect($('c[r="J2"]').attr("t")).toBe("inlineStr");
    expect($('c[r="J2"] t').text()).toBe(item.notes);
    expect($('c[r="B2"] t').text()).toBe('+SUM(1,2)');
  });
  it("keeps rows with missing optional fields or unavailable resumes", () => {
    const { sheet: $ } = read([{ ...item, title: null, company: null, notes: null, followUpOn: null }]);
    expect($("sheetData row").length).toBe(2);
    expect($('c[r="B2"] t').text()).toBe("");
    expect($('c[r="G2"] t').text()).toBe("");
    expect($('c[r="I2"] v').length).toBe(0);
    expect($('c[r="D2"] t').text()).toBe(item.jobUrl);
  });
  it("exports all supplied records and supports an empty header-only workbook", () => {
    const { sheet: $ } = read([item, { ...item, id: "application-2", status: "offer" }]);
    expect($("sheetData row").length).toBe(3);
    expect($('c[r="F3"] t').text()).toBe("錄取");
    expect(read([]).sheet("sheetData row").length).toBe(1);
  });
});
