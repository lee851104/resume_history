"use client";
import { useState } from "react";
import {
  Search,
  ExternalLink,
  Pencil,
  ListChecks,
  Plus,
  Send,
} from "lucide-react";
import {
  prospectStatuses,
  prospectLabels,
  jobInputSchema,
  type Prospect,
  type ProspectStatus,
  type JobInput,
} from "@/lib/jobs/import";
import { platformFor } from "@/lib/domain/validation";
import Dialog from "./dialog";
function EditProspect({
  job,
  onClose,
  onSave,
}: {
  job: Prospect;
  onClose: () => void;
  onSave: (job: Prospect, data: JobInput) => Promise<void>;
}) {
  const [url, setUrl] = useState(job.jobUrl),
    [company, setCompany] = useState(job.company || ""),
    [title, setTitle] = useState(job.title || ""),
    [notes, setNotes] = useState(job.notes || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = jobInputSchema.safeParse({
      jobUrl: url,
      company,
      title,
      notes,
    });
    if (!parsed.success) {
      setError("請檢查職缺連結與欄位長度");
      return;
    }
    setBusy(true);
    try {
      await onSave(job, parsed.data);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="編輯職缺待辦"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="application-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="prospect-url">職缺連結</label>
          <input
            id="prospect-url"
            type="url"
            required
            value={url}
            maxLength={4096}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="prospect-company">公司名稱</label>
          <input
            id="prospect-company"
            value={company}
            maxLength={200}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="prospect-title">職稱</label>
          <input
            id="prospect-title"
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="prospect-notes">備註</label>
          <textarea
            id="prospect-notes"
            value={notes}
            maxLength={5000}
            rows={5}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "儲存中…" : "儲存待辦"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export default function ProspectBoard({
  jobs,
  loading,
  busyId,
  onStatus,
  onApply,
  onEdit,
  onView,
  onImport,
}: {
  jobs: Prospect[];
  loading: boolean;
  busyId: string | null;
  onStatus: (id: string, status: ProspectStatus) => void;
  onApply: (job: Prospect) => void;
  onEdit: (job: Prospect, data: JobInput) => Promise<void>;
  onView: (job: Prospect) => void;
  onImport: () => void;
}) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Prospect | null>(null);
  const visible = jobs.filter(
    (j) =>
      (filter === "all" || j.status === filter) &&
      [j.company, j.title, j.jobUrl, j.notes].some((s) =>
        s?.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  return (
    <>
      <section className="prospect-overview" aria-label="待辦概況">
        {(["review", "ready", "paused"] as const).map((status) => (
          <button
            key={status}
            className={"prospect-stat " + (filter === status ? "selected" : "")}
            onClick={() => setFilter(filter === status ? "all" : status)}
          >
            <span>{prospectLabels[status]}</span>
            <strong>{jobs.filter((j) => j.status === status).length}</strong>
          </button>
        ))}
      </section>
      <section className="records-panel">
        <div className="records-heading">
          <h2>
            職缺清單<span>{visible.length}</span>
          </h2>
          <div className="search-box">
            <Search size={17} />
            <input
              aria-label="搜尋職缺待辦"
              placeholder="搜尋公司、職缺或備註"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-tabs" aria-label="篩選職缺待辦">
          <button
            className={"filter " + (filter === "all" ? "active" : "")}
            onClick={() => setFilter("all")}
          >
            全部
          </button>
          {prospectStatuses.map((status) => (
            <button
              key={status}
              className={"filter " + (filter === status ? "active" : "")}
              onClick={() => setFilter(status)}
            >
              {prospectLabels[status]}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="loading-state">正在讀取職缺待辦…</div>
        ) : !visible.length ? (
          <div className="empty-state">
            <span className="file-icon large">
              <ListChecks size={30} />
            </span>
            <h3>
              {jobs.length ? "沒有符合條件的職缺" : "先收集，再決定下一步"}
            </h3>
            <p>
              {jobs.length
                ? "調整搜尋或狀態篩選。"
                : "貼上 AI 整理的列表，建立自己的職缺待辦。"}
            </p>
            {!jobs.length && (
              <button className="button secondary" onClick={onImport}>
                <Plus size={17} />
                匯入職缺
              </button>
            )}
          </div>
        ) : (
          <div className="prospect-list">
            {visible.map((job) => (
              <article className="prospect-card" key={job.id}>
                <div className="prospect-card-main">
                  <span className="platform-badge">
                    {platformFor(job.jobUrl)}
                  </span>
                  <h3>
                    <a
                      href={job.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {job.title || job.jobUrl}
                      <ExternalLink size={14} />
                    </a>
                  </h3>
                  {job.company && (
                    <p className="prospect-company">{job.company}</p>
                  )}
                  {job.notes && <p className="prospect-notes">{job.notes}</p>}
                  <small className="muted">
                    加入於 {new Date(job.createdAt).toLocaleDateString("zh-TW")}
                  </small>
                </div>
                <div className="prospect-actions">
                  {job.status === "applied" ? (
                    <>
                      <span className="prospect-applied">已投遞</span>
                      <button
                        className="button secondary"
                        onClick={() => onView(job)}
                      >
                        查看投遞紀錄
                      </button>
                    </>
                  ) : (
                    <>
                      <select
                        aria-label={(job.title || job.jobUrl) + "的待辦狀態"}
                        value={job.status}
                        disabled={busyId === job.id}
                        onChange={(e) =>
                          onStatus(job.id, e.target.value as ProspectStatus)
                        }
                      >
                        {prospectStatuses
                          .filter((s) => s !== "applied")
                          .map((s) => (
                            <option key={s} value={s}>
                              {prospectLabels[s]}
                            </option>
                          ))}
                      </select>
                      <div className="prospect-action-row">
                        <button
                          className="icon-button"
                          aria-label={"編輯" + (job.title || job.jobUrl)}
                          onClick={() => setEditing(job)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => onApply(job)}
                        >
                          <Send size={15} />
                          記錄已投遞
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="panel-foot">
          先開啟職缺連結完成投遞，再選擇履歷記錄；待辦不計入投遞統計。
        </div>
      </section>
      {editing && (
        <EditProspect
          job={editing}
          onClose={() => setEditing(null)}
          onSave={onEdit}
        />
      )}
    </>
  );
}
