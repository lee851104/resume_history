import { unzipSync } from "fflate";
import { mimeTypes, MAX_FILE_SIZE } from "@/lib/domain/validation";
export function detectResume(bytes: Uint8Array, extension: string) {
  if (!bytes.length || bytes.length > MAX_FILE_SIZE)
    throw new Error("檔案大小不符合限制");
  const starts = (sig: number[]) => sig.every((n, i) => bytes[i] === n);
  if (extension === "pdf" && starts([37, 80, 68, 70, 45])) return mimeTypes.pdf;
  if (extension === "doc" && starts([208, 207, 17, 224, 161, 177, 26, 225]))
    return mimeTypes.doc;
  if (extension === "docx" && starts([80, 75, 3, 4])) {
    // Inspect directory entries without decompressing untrusted XML or ZIP bombs.
    const names = new Set<string>();
    let total = 0;
    unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        if (total > 100_000_000) throw new Error("文件解壓縮大小過大");
        names.add(file.name);
        return false;
      },
    });
    if (names.has("[Content_Types].xml") && names.has("word/document.xml"))
      return mimeTypes.docx;
  }
  throw new Error("檔案內容與履歷格式不符");
}
