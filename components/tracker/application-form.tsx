"use client";
import { useState, useRef } from "react";
import { ChevronDown, Link2, LoaderCircle } from "lucide-react";
import Dialog from "./dialog";
import ResumePicker from "./resume-picker";
import {
  Application,
  ResumeVersion,
  statuses,
  statusLabels,
  NewApplication,
} from "@/lib/domain/types";
import { localDate } from "@/lib/domain/summary";
import { parseApplication } from "@/lib/domain/validation";
export default function ApplicationForm({
  item,
  draft,
  resumes,
  canSave,
  onClose,
  onSave,
}: {
  item?: Application;
  draft?: {
    jobUrl: string;
    company: string | null;
    title: string | null;
    notes: string | null;
  };
  resumes: ResumeVersion[];
  canSave: boolean;
  onClose: () => void;
  onSave: (
    data: NewApplication,
    file: File | null,
    requestId: string,
    resumeLabel: string,
  ) => Promise<void>;
}) {
  const [url, setUrl] = useState(item?.jobUrl || draft?.jobUrl || "");
  const [resumeId, setResumeId] = useState(item?.resumeId || "");
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(item?.appliedOn || localDate());
  const [status, setStatus] = useState(item?.status || "applied");
  const [company, setCompany] = useState(item?.company || draft?.company || "");
  const [title, setTitle] = useState(item?.title || draft?.title || "");
  const [notes, setNotes] = useState(item?.notes || draft?.notes || "");
  const [followUp, setFollowUp] = useState(item?.followUpOn || "");
  const [resumeLabel, setResumeLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!resumeId && !file) throw new Error("請選擇或上傳當次投遞的履歷");
      const data = parseApplication({
        jobUrl: url,
        resumeId: resumeId || "00000000-0000-4000-8000-000000000000",
        appliedOn: date,
        status,
        company,
        title,
        notes,
        followUpOn: followUp || null,
      });
      setBusy(true);
      await onSave(data, file, requestId.current, resumeLabel);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "請檢查職缺連結、日期與履歷是否正確",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={item ? "編輯投遞" : "新增一筆投遞"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="application-form">
        <p className="form-intro">貼上職缺連結，選好履歷，就能記下這次投遞。</p>
        <div className="field">
          <label htmlFor="job-url">
            職缺連結 <span className="required">*</span>
          </label>
          <div className="input-icon">
            <Link2 size={18} />
            <input
              id="job-url"
              type="url"
              placeholder="https://www.104.com.tw/job/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              maxLength={4096}
            />
          </div>
          <small className="helper">
            連結會加密保存，不會傳給伺服器讀取職缺。
          </small>
        </div>
        <div className="field">
          <label htmlFor="title">職缺標題 <span className="optional">選填</span></label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="例如：Python 後端工程師"
          />
          <small className="helper">填寫後，列表會以標題顯示職缺連結。</small>
        </div>
        <ResumePicker
          resumes={resumes}
          value={resumeId}
          file={file}
          onSelect={setResumeId}
          onFile={(f) => {
            setFile(f);
            setResumeLabel(f?.name || "");
          }}
          error={setError}
        />
        {file && (
          <div className="field">
            <label htmlFor="resume-label">
              履歷版本名稱 <span className="optional">選填</span>
            </label>
            <input
              id="resume-label"
              value={resumeLabel}
              onChange={(e) => setResumeLabel(e.target.value)}
              maxLength={200}
              placeholder="例如：Python 工程師版"
            />
          </div>
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="applied-on">投遞日期</label>
            <input
              id="applied-on"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="status">目前進度</label>
            <select
              id="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as Application["status"])
              }
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <details
          open={
            !!(item?.notes || item?.company || item?.followUpOn)
          }
          className="optional-fields"
        >
          <summary>
            <ChevronDown size={16} />
            補充資訊 <span>選填</span>
          </summary>
          <div className="form-row">
            <div className="field">
              <label htmlFor="company">公司</label>
              <input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="follow-up">下次追蹤日期</label>
            <input
              id="follow-up"
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="notes">備註</label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="聯絡窗口、面試資訊，或想記下的事…"
            />
          </div>
        </details>
        {!canSave && (
          <p className="notice">
            連接雲端、登入並解鎖後，即可加密儲存投遞與履歷。
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!canSave || busy}
          >
            {busy && <LoaderCircle size={17} className="spin" />}
            {busy ? "儲存中…" : "儲存投遞"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
