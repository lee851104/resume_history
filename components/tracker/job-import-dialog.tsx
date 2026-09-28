"use client";
import { useState } from "react";
import { Copy, Check, ArrowRight, LoaderCircle } from "lucide-react";
import Dialog from "./dialog";
import {
  AI_JOB_PROMPT,
  previewJobImport,
  type ImportRow,
  type JobInput,
} from "@/lib/jobs/import";
export default function JobImportDialog({
  existing,
  canSave,
  onClose,
  onImport,
}: {
  existing: { jobUrl: string }[];
  canSave: boolean;
  onClose: () => void;
  onImport: (jobs: JobInput[]) => Promise<void>;
}) {
  const [source, setSource] = useState(""),
    [rows, setRows] = useState<ImportRow[]>([]),
    [selected, setSelected] = useState<Set<number>>(new Set()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [showPrompt, setShowPrompt] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(AI_JOB_PROMPT);
      setCopied(true);
    } catch {
      setShowPrompt(true);
      setError("無法自動複製，請在下方指令框手動複製。");
    }
  }
  function preview() {
    setError("");
    try {
      const result = previewJobImport(source, existing);
      setRows(result);
      setSelected(
        new Set(
          result
            .filter((r) => r.job && !r.error && !r.duplicate)
            .map((r) => r.index),
        ),
      );
    } catch (e) {
      setRows([]);
      setSelected(new Set());
      setError((e as Error).message);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const jobs = rows
        .filter((r) => selected.has(r.index) && r.job && !r.duplicate)
        .map((r) => r.job!);
      await onImport(jobs);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="匯入 AI 職缺列表"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="application-form job-import">
        <p className="form-intro">
          讓 AI
          按固定格式整理，貼上後就能批次加入待辦。只需職缺連結，不必先選履歷。
        </p>
        <button
          type="button"
          className="button secondary full-width"
          onClick={copy}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
          {copied ? "已複製整理指令" : "複製給 AI 的整理指令"}
        </button>
        <details
          open={showPrompt}
          onToggle={(e) => setShowPrompt(e.currentTarget.open)}
        >
          <summary>查看整理指令與格式範例</summary>
          <textarea
            className="import-source"
            aria-label="給 AI 的整理指令"
            readOnly
            value={AI_JOB_PROMPT}
            rows={10}
          />
        </details>
        <div className="field">
          <label htmlFor="job-import-source">貼上 AI 的 JSON 列表</label>
          <textarea
            id="job-import-source"
            className="import-source"
            value={source}
            maxLength={1_000_001}
            rows={8}
            placeholder={
              '[\n  {"jobUrl":"https://example.com/jobs/123","company":"公司名稱","title":"職稱","notes":null}\n]'
            }
            onChange={(e) => {
              setSource(e.target.value);
              setRows([]);
              setSelected(new Set());
              setError("");
            }}
            disabled={busy}
          />
          <small className="helper">
            每次最多 200
            筆。公司、職稱與備註可省略。內容在此裝置解析，加密後才儲存。
          </small>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={!source.trim() || busy}
          onClick={preview}
        >
          預覽列表
          <ArrowRight size={16} />
        </button>
        {!!rows.length && (
          <section className="import-preview" aria-label="匯入預覽">
            <div className="import-summary">
              <strong>已選 {selected.size} 筆</strong>
              <span>
                {rows.filter((r) => r.duplicate).length} 筆重複 ·{" "}
                {rows.filter((r) => r.error).length} 筆需修正
              </span>
            </div>
            {rows.map((row) => (
              <label
                key={row.index}
                className={
                  "import-row " +
                  (row.error || row.duplicate ? "import-skipped" : "")
                }
              >
                <input
                  type="checkbox"
                  aria-label={"匯入第 " + (row.index + 1) + " 筆"}
                  checked={selected.has(row.index)}
                  disabled={busy || !!row.error || !!row.duplicate}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (e.target.checked) next.add(row.index);
                      else next.delete(row.index);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>
                    {row.index + 1}.{" "}
                    {row.job?.title || row.job?.jobUrl || "格式待修正"}
                  </strong>
                  {row.job?.company && <small>{row.job.company}</small>}
                  {row.job?.title && (
                    <small className="break-url">{row.job.jobUrl}</small>
                  )}
                  {row.job?.notes && (
                    <small className="preview-notes">{row.job.notes}</small>
                  )}
                  {(row.error || row.duplicate) && (
                    <small className={row.error ? "error-text" : "muted"}>
                      {row.error || row.duplicate}
                    </small>
                  )}
                </span>
              </label>
            ))}
          </section>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!canSave && <p className="notice">連接雲端並解鎖後即可匯入保存。</p>}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!canSave || !selected.size || busy}
            onClick={save}
          >
            {busy && <LoaderCircle size={17} className="spin" />}匯入{" "}
            {selected.size} 筆待辦
          </button>
        </div>
      </div>
    </Dialog>
  );
}
