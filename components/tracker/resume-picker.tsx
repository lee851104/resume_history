"use client";
import { FileText, UploadCloud, Check } from "lucide-react";
import type { ResumeVersion } from "@/lib/domain/types";
import { MAX_FILE_SIZE } from "@/lib/domain/validation";
export default function ResumePicker({
  resumes,
  value,
  file,
  onSelect,
  onFile,
  error,
}: {
  resumes: ResumeVersion[];
  value: string;
  file: File | null;
  onSelect: (id: string) => void;
  onFile: (file: File | null) => void;
  error: (message: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor="resume-select">
        投遞的履歷 <span className="required">*</span>
      </label>
      {resumes.length > 0 && (
        <select
          id="resume-select"
          value={file ? "" : value}
          onChange={(e) => {
            onFile(null);
            onSelect(e.target.value);
          }}
        >
          <option value="">選擇已儲存的履歷</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.displayName} ·{" "}
              {new Date(r.createdAt).toLocaleDateString("zh-TW")}
            </option>
          ))}
        </select>
      )}
      <label
        className={"upload-zone " + (file ? "has-file" : "")}
        htmlFor="resume-file"
      >
        {file ? <Check size={23} /> : <UploadCloud size={25} />}
        <span>
          <strong>{file ? file.name : "上傳履歷檔案"}</strong>
          <small>
            {file
              ? (file.size / 1024).toFixed(0) + " KB · 將保留這次版本"
              : "PDF、DOC、DOCX，最大 20 MB"}
          </small>
        </span>
        <span className="upload-choice">{file ? "更換" : "選擇檔案"}</span>
      </label>
      <input
        className="visually-hidden"
        id="resume-file"
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          if (f && f.size > MAX_FILE_SIZE) {
            error("履歷不能超過 20 MB");
            e.target.value = "";
            return;
          }
          onFile(f);
          if (f) onSelect("");
        }}
      />
      {!file && value && (
        <span className="helper">
          <FileText size={14} />
          使用已儲存版本，不會覆寫原始檔案
        </span>
      )}
    </div>
  );
}
