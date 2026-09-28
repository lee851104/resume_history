import { strToU8, zipSync } from "fflate";
import { statusLabels, type Application, type ResumeVersion } from "../domain/types";

const sheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const columns = [
  ["投遞日期", 14], ["職缺標題", 32], ["公司", 24], ["職缺網址", 50],
  ["投遞平台", 16], ["目前進度", 14], ["履歷版本", 26], ["履歷檔名", 30],
  ["下次追蹤日期", 16], ["備註", 50], ["建立時間（UTC）", 26], ["更新時間（UTC）", 26],
] as const;

function xml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function textCell(ref: string, value: string, style = 0) {
  // Explicit text cells keep leading =, +, - and @ as data, never formulas.
  const text = value.replace(/_x[0-9a-f]{4}_/gi, (match) => "_x005F_" + match.slice(1));
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}
function dateCell(ref: string, value: string) {
  if (!value || value < "1900-01-01") return textCell(ref, value);
  const days = Date.parse(value + "T00:00:00Z") / 86400000 + 25569;
  if (!Number.isFinite(days)) return textCell(ref, value);
  // Excel's 1900 date system includes the fictitious 1900-02-29.
  const serial = value < "1900-03-01" ? days - 1 : days;
  return `<c r="${ref}" s="2"><v>${serial}</v></c>`;
}

/** Build a single-sheet XLSX locally; no data or resume files leave the browser. */
export function exportApplicationsXlsx(items: Application[], resumes: ResumeVersion[]): Uint8Array {
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const rows = [`<row r="1" ht="26" customHeight="1">${columns.map(([label], i) => textCell(String.fromCharCode(65 + i) + "1", label, 1)).join("")}</row>`];
  const links: string[] = [], relations: string[] = [];
  items.forEach((item, index) => {
    const row = index + 2, resume = resumeById.get(item.resumeId);
    const values = [item.appliedOn, item.title || "", item.company || "", item.jobUrl,
      item.platform, statusLabels[item.status], resume?.displayName || "", resume?.originalName || "",
      item.followUpOn || "", item.notes || "", item.createdAt, item.updatedAt];
    const linkable = /^https?:\/\//i.test(item.jobUrl);
    rows.push(`<row r="${row}">${values.map((value, i) => {
      const ref = String.fromCharCode(65 + i) + row;
      if (i === 0 || i === 8) return dateCell(ref, value);
      return textCell(ref, value, linkable && (i === 3 || (i === 1 && !!item.title)) ? 3 : 0);
    }).join("")}</row>`);
    if (linkable) {
      const id = "rId" + row;
      relations.push(`<Relationship Id="${id}" Type="${relNs}/hyperlink" Target="${xml(item.jobUrl)}" TargetMode="External"/>`);
      for (const column of item.title ? ["B", "D"] : ["D"])
        links.push(`<hyperlink ref="${column}${row}" r:id="${id}"/>`);
    }
  });
  const range = `A1:L${items.length + 1}`;
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${sheetNs}" xmlns:r="${relNs}"><sheets><sheet name="投遞紀錄" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${relNs}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relNs}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${sheetNs}">
      <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
      <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF3355DD"/><u/><sz val="11"/><name val="Calibri"/></font></fonts>
      <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3355DD"/><bgColor indexed="64"/></patternFill></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${sheetNs}" xmlns:r="${relNs}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns.map(([, width], i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="${range}"/>${links.length ? `<hyperlinks>${links.join("")}</hyperlinks>` : ""}</worksheet>`,
    "xl/worksheets/_rels/sheet1.xml.rels": `<Relationships xmlns="${packageNs}">${relations.join("")}</Relationships>`,
  };
  return zipSync(Object.fromEntries(Object.entries(parts).map(([name, content]) => [name, strToU8(declaration + content)])), { level: 6 });
}
