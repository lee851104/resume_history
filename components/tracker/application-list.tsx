"use client";
import {
  Download,
  ExternalLink,
  Pencil,
  Link2,
  Inbox,
  CalendarClock,
  FileText,
} from "lucide-react";
import {
  Application,
  ResumeVersion,
  statuses,
  statusLabels,
  ApplicationStatus,
} from "@/lib/domain/types";
import { isDue } from "@/lib/domain/summary";
export default function ApplicationList({
  items,
  resumes,
  today,
  onEdit,
  onStatus,
  onAdd,
  onDownload,
  busyId,
  filtered,
}: {
  items: Application[];
  resumes: ResumeVersion[];
  today: string;
  onEdit: (item: Application) => void;
  onStatus: (id: string, status: ApplicationStatus) => void;
  onAdd: () => void;
  onDownload: (id: string) => void;
  busyId: string | null;
  filtered: boolean;
}) {
  if (!items.length)
    return (
      <div className="empty-state">
        <div className="empty-art">
          <div className="paper-line" />
          <Inbox size={34} />
          <span>+</span>
        </div>
        <h3>{filtered ? "找不到符合的紀錄" : "從第一筆投遞開始"}</h3>
        <p>
          {filtered
            ? "試試其他關鍵字或篩選條件。"
            : "貼上職缺連結、選一份履歷。每次投遞，都有跡可循。"}
        </p>
        {!filtered && (
          <button className="button secondary" onClick={onAdd}>
            新增第一筆投遞 <span aria-hidden>＋</span>
          </button>
        )}
      </div>
    );
  return (
    <div className="applications">
      <div className="list-heading">
        <span>公司 / 職缺</span>
        <span>投遞日期</span>
        <span>目前進度</span>
        <span>投遞履歷</span>
        <span>操作</span>
      </div>
      {items.map((item) => {
        const resume = resumes.find((r) => r.id === item.resumeId);
        const due = isDue(item, today);
        return (
          <article className="application-row" key={item.id}>
            <div className="job-info">
              <div className="company-icon">
                {item.company ? item.company.charAt(0) : <Link2 size={20} />}
              </div>
              <div className="job-text">
                <a
                  href={item.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="job-title"
                >
                  {item.title || item.company || item.jobUrl}
                  <ExternalLink size={13} />
                </a>
                <div className="job-meta">
                  {item.title && item.company && <span>{item.company}</span>}
                  <span className="platform-tag">{item.platform}</span>
                  {due && (
                    <span className="due-label">
                      <CalendarClock size={12} />
                      待追蹤
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="date-cell">
              <span className="mobile-label">投遞日期</span>
              {item.appliedOn.replaceAll("-", " / ")}
              {item.followUpOn && (
                <small>追蹤 {item.followUpOn.slice(5).replace("-", "/")}</small>
              )}
            </div>
            <div className="status-cell">
              <label className={"status-select " + item.status}>
                <span className="status-dot" />
                <select
                  aria-label={
                    (item.title || item.company || item.jobUrl) + "的進度"
                  }
                  value={item.status}
                  onChange={(e) =>
                    onStatus(item.id, e.target.value as ApplicationStatus)
                  }
                  disabled={busyId === item.id}
                >
                  {statuses.map((s) => (
                    <option value={s} key={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="resume-link"
              onClick={() => onDownload(item.resumeId)}
            >
              <FileText size={15} />
              <span>{resume?.displayName || "當次履歷"}</span>
              <Download size={14} />
            </button>
            <button
              className="icon-button edit-button"
              onClick={() => onEdit(item)}
              aria-label={"編輯" + (item.title || item.company || "投遞")}
            >
              <Pencil size={16} />
            </button>
            {item.notes && <p className="row-note">{item.notes}</p>}
          </article>
        );
      })}
    </div>
  );
}
