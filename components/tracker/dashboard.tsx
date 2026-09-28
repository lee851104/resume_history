"use client";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  ArrowUpRight,
  Plus,
  Search,
  LayoutDashboard,
  FileText,
  Send,
  CalendarClock,
  BriefcaseBusiness,
  LogOut,
  RefreshCw,
  Cloud,
  ShieldCheck,
  Download,
  Pencil,
  Check,
  X,
  LockKeyhole,
  ListChecks,
} from "lucide-react";
import { notifySignOut } from "@/lib/vault/session-events";
import ApplicationForm from "./application-form";
import ApplicationList from "./application-list";
import JobImportDialog from "./job-import-dialog";
import ProspectBoard from "./prospect-board";
import type { Prospect, ProspectStatus, JobInput } from "@/lib/jobs/import";
import {
  Application,
  ResumeVersion,
  NewApplication,
  statuses,
  statusLabels,
  ApplicationStatus,
} from "@/lib/domain/types";
import { summarize, localDate, isDue } from "@/lib/domain/summary";
import type { Session } from "@/components/vault/workspace";
import type { VaultClient } from "@/lib/vault/client";
export default function Dashboard({
  session,
  client,
  onLock,
}: {
  session: Session;
  client?: VaultClient;
  onLock?: () => void;
}) {
  const configured = session.configured;
  const [prospects, setProspects] = useState<Prospect[]>([]),
    [importOpen, setImportOpen] = useState(false),
    [sourceProspect, setSourceProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(!!client);
  const [items, setItems] = useState<Application[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [view, setView] = useState<
    "applications" | "resumes" | "due" | "prospects"
  >("applications");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Application | "new" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setToday(localDate());
    setLoading(true);
    try {
      if (client) {
        const snapshot = await client.load();
        if (sequence !== loadSequence.current) return;
        setItems(
          [...snapshot.applications].sort(
            (a, b) =>
              b.appliedOn.localeCompare(a.appliedOn) ||
              b.createdAt.localeCompare(a.createdAt),
          ),
        );
        setResumes(snapshot.resumes);
        setProspects(snapshot.prospects);
      } else {
        setItems([]);
        setResumes([]);
        setProspects([]);
      }
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const clock = setInterval(() => setToday(localDate()), 60000);
    return () => {
      ++loadSequence.current;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(clock);
    };
  }, [load]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const stats = summarize(items, today);
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === "all" || item.status === filter) &&
          (view !== "due" || isDue(item, today)) &&
          [item.company, item.title, item.jobUrl, item.platform].some((v) =>
            v?.toLowerCase().includes(search.toLowerCase()),
          ),
      ),
    [items, filter, view, today, search],
  );
  async function save(
    data: NewApplication,
    file: File | null,
    requestId: string,
    resumeLabel: string,
  ) {
    if (!client) throw new Error("請先解鎖保險箱");
    let resumeId = data.resumeId;
    if (file)
      resumeId = await client.uploadResume(
        file,
        resumeLabel,
        requestId + ":" + file.name + ":" + file.size + ":" + file.lastModified,
      );
    const editing = typeof form === "object" && form !== null;
    await client.saveApplication(
      { ...data, resumeId },
      editing ? form.id : requestId,
      editing ? form : undefined,
      sourceProspect || undefined,
    );
    setMessage(editing ? "投遞紀錄已加密更新" : "投遞紀錄已加密保存");
    if (sourceProspect) setView("applications");
    await load();
  }
  async function importJobs(jobs: JobInput[]) {
    if (!client) throw new Error("請先解鎖保險箱");
    const result = await client.importProspects(jobs);
    setMessage(
      "已匯入 " +
        result.added +
        " 筆待辦" +
        (result.skipped ? "，略過 " + result.skipped + " 筆重複" : ""),
    );
    await load();
  }
  async function updateProspectStatus(id: string, status: ProspectStatus) {
    if (!client) return;
    setBusyId(id);
    setError("");
    try {
      await client.setProspectStatus(id, status);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function editProspect(job: Prospect, data: JobInput) {
    if (!client) throw new Error("請先解鎖保險箱");
    await client.editProspect(job, data);
    await load();
    setMessage("待辦已加密更新");
  }
  async function updateStatus(id: string, status: ApplicationStatus) {
    if (!client) return;
    setBusyId(id);
    setError("");
    try {
      await client.setStatus(id, status);
      await load();
      setMessage("進度已加密更新");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function saveRename(id: string) {
    if (!client) return;
    try {
      await client.renameResume(id, rename);
      setRenameId(null);
      await load();
      setMessage("履歷名稱已加密更新");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download(id: string) {
    if (!client) return;
    setError("");
    try {
      const { meta, bytes } = await client.downloadResume(id);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: meta.contentType }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = meta.originalName;
      link.click();
      bytes.fill(0);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const activeCount = stats.byStatus.applied + stats.byStatus.interviewing;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Send size={22} />
          </span>
          <span>
            投遞日誌<small>CAREER TRACKER</small>
          </span>
        </a>
        <div className="sidebar-label">我的工作台</div>
        <nav aria-label="主導覽">
          <button
            className={view === "prospects" ? "nav-item active" : "nav-item"}
            onClick={() => setView("prospects")}
          >
            <ListChecks size={19} />
            職缺待辦
            <span className="nav-count">
              {
                prospects.filter(
                  (j) => j.status === "review" || j.status === "ready",
                ).length
              }
            </span>
          </button>
          <button
            className={view === "applications" ? "nav-item active" : "nav-item"}
            onClick={() => setView("applications")}
          >
            <LayoutDashboard size={19} />
            投遞總覽<span className="nav-count">{items.length}</span>
          </button>
          <button
            className={view === "resumes" ? "nav-item active" : "nav-item"}
            onClick={() => setView("resumes")}
          >
            <FileText size={19} />
            我的履歷
          </button>
          <button
            className={view === "due" ? "nav-item active" : "nav-item"}
            onClick={() => setView("due")}
          >
            <CalendarClock size={19} />
            待追蹤
            {stats.due > 0 && <span className="nav-count">{stats.due}</span>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <span>
              你的求職紀錄
              <br />
              <small>解鎖後只在本機讀取</small>
            </span>
          </div>
          <div className="account">
            <span className="avatar">
              {session.user?.email?.charAt(0).toUpperCase() || "我"}
            </span>
            <div>
              <strong>{session.user ? "個人工作台" : "個人空間"}</strong>
              <small>{session.user?.email || "登入後跨裝置同步"}</small>
            </div>
            {session.user && (
              <form
                action="/auth/logout"
                method="post"
                onSubmit={notifySignOut}
              >
                <button className="icon-button" title="登出">
                  <LogOut size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            <span className="breadcrumb">我的工作台</span>
            <span className="crumb-sep">/</span>
            {view === "prospects"
              ? "職缺待辦"
              : view === "resumes"
                ? "我的履歷"
                : view === "due"
                  ? "待追蹤"
                  : "投遞總覽"}
          </span>
          <div className="topbar-right">
            {client && (
              <button className="button vault-lock" onClick={onLock}>
                <LockKeyhole size={15} />
                鎖定
              </button>
            )}
            {session.user && (
              <form
                action="/auth/logout"
                method="post"
                onSubmit={notifySignOut}
              >
                <button className="icon-button" aria-label="登出 Google">
                  <LogOut size={17} />
                </button>
              </form>
            )}
            <span className="sync-label">
              <Cloud size={15} />
              {session.user
                ? "端對端加密"
                : configured
                  ? "尚未登入"
                  : "尚未連接雲端"}
            </span>
            <button
              className="icon-button"
              onClick={() => {
                setError("");
                void load();
              }}
              aria-label="重新整理"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR NEXT CHAPTER</p>
              <h1>
                {view === "prospects"
                  ? "職缺待辦"
                  : view === "resumes"
                    ? "我的履歷"
                    : view === "due"
                      ? "待追蹤"
                      : "投遞總覽"}
                <span className="heading-dot">.</span>
              </h1>
              <p className="subtitle">
                {view === "prospects"
                  ? "把 AI 找到的機會收進來，依自己的步調做決定。"
                  : view === "resumes"
                    ? "每份版本都保留，隨時找到當時投出的那一份。"
                    : view === "due"
                      ? "留意每一個值得跟進的機會。"
                      : "記下每次投遞，把心力留給下一個機會。"}
              </p>
            </div>
            <button
              className="button primary new-button"
              onClick={() =>
                view === "prospects" ? setImportOpen(true) : setForm("new")
              }
            >
              <Plus size={18} />
              {view === "prospects" ? "匯入職缺" : "新增投遞"}
            </button>
          </div>
          {!session.user && (
            <div className="connection-banner">
              <div className="banner-icon">
                <Cloud size={21} />
              </div>
              <div>
                <strong>
                  {configured
                    ? "登入你的私人工作台"
                    : "工作台已準備好，等待連接雲端"}
                </strong>
                <p>
                  {configured
                    ? "使用 Google 登入，查看你的投遞紀錄與履歷。"
                    : "連接後，電腦與手機就能共用紀錄、保存與下載履歷。"}
                </p>
              </div>
              {configured ? (
                <a className="button secondary" href="/auth/login">
                  Google 登入
                  <ArrowUpRight size={16} />
                </a>
              ) : (
                <span className="setup-pill">尚未設定</span>
              )}
            </div>
          )}
          {error && (
            <div className="error dismissable" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="關閉錯誤"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="toast" role="status">
              <Check size={17} />
              {message}
            </div>
          )}
          {view !== "resumes" && view !== "prospects" && (
            <>
              <section className="stats-grid" aria-label="投遞統計">
                <div className="stat-card">
                  <div className="stat-label">
                    累積投遞
                    <span className="stat-icon blue">
                      <Send size={18} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {stats.total}
                    <span>筆</span>
                  </div>
                  <div className="stat-foot">每一次嘗試，都是新的可能</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">
                    面試進行中
                    <span className="stat-icon violet">
                      <BriefcaseBusiness size={18} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {stats.interviewing}
                    <span>筆</span>
                  </div>
                  <div className="stat-foot">持續推進的機會</div>
                </div>
                <button
                  className={
                    "stat-card stat-action " +
                    (view === "due" ? "selected" : "")
                  }
                  onClick={() =>
                    setView(view === "due" ? "applications" : "due")
                  }
                >
                  <div className="stat-label">
                    待追蹤
                    <span className="stat-icon amber">
                      <CalendarClock size={18} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {stats.due}
                    <span>筆</span>
                  </div>
                  <div className="stat-foot">
                    今天與已到期的追蹤
                    <ArrowUpRight size={15} />
                  </div>
                </button>
              </section>
              <section className="pipeline-card" aria-label="進度分布">
                <div className="pipeline-head">
                  <h2>進度分布</h2>
                  <span>
                    {activeCount > 0
                      ? activeCount + " 筆機會進行中"
                      : "每一步進展，都看得見"}
                  </span>
                </div>
                <div
                  className={"pipeline-bar " + (!stats.total ? "empty" : "")}
                  aria-label={"共" + stats.total + "筆"}
                >
                  {stats.total ? (
                    statuses
                      .filter((s) => stats.byStatus[s] > 0)
                      .map((s) => (
                        <div
                          key={s}
                          className={"segment " + s}
                          style={{
                            width:
                              (stats.byStatus[s] / stats.total) * 100 + "%",
                          }}
                          title={
                            statusLabels[s] + " " + stats.byStatus[s] + "筆"
                          }
                        />
                      ))
                  ) : (
                    <div />
                  )}
                </div>
                <div className="pipeline-legend">
                  {statuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilter(filter === s ? "all" : s)}
                      className={filter === s ? "legend active" : "legend"}
                    >
                      <span className={"legend-dot " + s} />
                      {statusLabels[s]}
                      <strong>{stats.byStatus[s]}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section className="records-panel">
                <div className="records-heading">
                  <h2>
                    {view === "due" ? "追蹤清單" : "投遞紀錄"}
                    <span>{visible.length}</span>
                  </h2>
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="搜尋投遞紀錄"
                      placeholder="搜尋公司、職缺或連結"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-tabs" role="group" aria-label="篩選進度">
                  {["all", ...statuses].map((s) => (
                    <button
                      key={s}
                      className={filter === s ? "filter active" : "filter"}
                      onClick={() => setFilter(s)}
                    >
                      {s === "all"
                        ? "全部"
                        : statusLabels[s as ApplicationStatus]}
                      {s === "all" && <span>{items.length}</span>}
                    </button>
                  ))}
                </div>
                {loading ? (
                  <div className="loading-state">
                    <RefreshCw size={20} className="spin" />
                    正在讀取你的紀錄…
                  </div>
                ) : (
                  <ApplicationList
                    items={visible}
                    resumes={resumes}
                    today={today}
                    onEdit={setForm}
                    onStatus={updateStatus}
                    onAdd={() => setForm("new")}
                    onDownload={download}
                    busyId={busyId}
                    filtered={!!search || filter !== "all" || view === "due"}
                  />
                )}
                <div className="panel-foot">
                  <span>
                    {items.length
                      ? "已保留 " + items.length + " 筆投遞紀錄"
                      : "投遞日期會自動填入今天，其他資訊隨時可以補上。"}
                  </span>
                  <span>
                    <ShieldCheck size={13} />
                    私人紀錄
                  </span>
                </div>
              </section>
            </>
          )}
          {view === "prospects" && (
            <ProspectBoard
              jobs={prospects}
              loading={loading}
              busyId={busyId}
              onStatus={updateProspectStatus}
              onImport={() => setImportOpen(true)}
              onEdit={editProspect}
              onApply={(job) => {
                setSourceProspect(job);
                setForm("new");
              }}
              onView={(job) => {
                const item = items.find((a) => a.id === job.applicationId);
                if (item) {
                  setView("applications");
                  setSourceProspect(null);
                  setForm(item);
                } else setError("請重新整理以讀取最新投遞紀錄");
              }}
            />
          )}
          {view === "resumes" && (
            <section className="records-panel resume-panel">
              <div className="records-heading">
                <h2>
                  履歷版本<span>{resumes.length}</span>
                </h2>
                <span className="muted">上傳新版本，舊版本依然保留</span>
              </div>
              {resumes.length ? (
                <div className="resume-grid">
                  {resumes.map((r) => (
                    <article className="resume-card" key={r.id}>
                      <span className="file-icon">
                        <FileText size={26} />
                      </span>
                      <div className="resume-card-content">
                        {renameId === r.id ? (
                          <div className="rename-row">
                            <input
                              aria-label="履歷版本名稱"
                              value={rename}
                              onChange={(e) => setRename(e.target.value)}
                              maxLength={200}
                            />
                            <button
                              className="icon-button"
                              aria-label="儲存履歷名稱"
                              onClick={() => saveRename(r.id)}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="取消更名"
                              onClick={() => setRenameId(null)}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <h3>
                            {r.displayName}
                            <button
                              className="icon-button"
                              aria-label={"重新命名" + r.displayName}
                              onClick={() => {
                                setRenameId(r.id);
                                setRename(r.displayName);
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                          </h3>
                        )}
                        <p>
                          {new Date(r.createdAt).toLocaleDateString("zh-TW")} ·{" "}
                          {(r.size / 1024).toFixed(0)} KB
                        </p>
                        <p className="muted">
                          用於 {items.filter((i) => i.resumeId === r.id).length}{" "}
                          筆投遞
                        </p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={"下載" + r.displayName}
                        onClick={() => void download(r.id)}
                      >
                        <Download size={19} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="file-icon large">
                    <FileText size={32} />
                  </div>
                  <h3>還沒有履歷版本</h3>
                  <p>新增投遞時上傳履歷，之後就能在這裡找到。</p>
                  <button
                    className="button secondary"
                    onClick={() => setForm("new")}
                  >
                    新增投遞
                    <Plus size={17} />
                  </button>
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>一步一步，靠近下一站。</span>
            <span>投遞日誌 · CAREER TRACKER</span>
          </footer>
        </div>
      </main>
      {importOpen && (
        <JobImportDialog
          existing={[...prospects, ...items]}
          canSave={!!client}
          onClose={() => setImportOpen(false)}
          onImport={importJobs}
        />
      )}
      {form && (
        <ApplicationForm
          item={form === "new" ? undefined : form}
          draft={sourceProspect || undefined}
          resumes={resumes}
          canSave={!!client}
          onClose={() => {
            setForm(null);
            setSourceProspect(null);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}
