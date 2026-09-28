import {
  jobInputSchema,
  jobIdentity,
  prospectStatuses,
  type JobInput,
  type Prospect,
  type ProspectStatus,
} from "@/lib/jobs/import";
import { api } from "@/lib/client-api";
import {
  encryptJson,
  decryptJson,
  encryptFile,
  decryptFile,
} from "@/lib/crypto/vault";
import { envelopeSchema, type VaultRow } from "@/lib/crypto/schema";
import { snapshotSchema, type Snapshot } from "./snapshot";
import {
  type ApplicationStatus,
  type NewApplication,
} from "@/lib/domain/types";
import {
  parseApplication,
  platformFor,
  validateUpload,
  idSchema,
} from "@/lib/domain/validation";
import { detectResume } from "@/lib/resumes/files";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { type SealedPrepared } from "./wire";
export function emptySnapshot(): Snapshot {
  return { v: 1, applications: [], resumes: [], prospects: [] };
}
type PendingFile = {
  id: string;
  bytes: Uint8Array;
  meta: Snapshot["resumes"][number];
  ready: boolean;
};
export class VaultClient {
  private active = true;
  private key: CryptoKey | null;
  private pendingFiles = new Map<string, PendingFile>();
  readonly vaultId: string;
  private request: typeof api;
  constructor(
    readonly owner: string,
    key: CryptoKey,
    row: VaultRow,
    request: typeof api = api,
  ) {
    this.key = key;
    this.request = (url, init) =>
      request(url, {
        ...init,
        headers: { ...init?.headers, "X-Vault-Owner": owner },
      });
    this.vaultId = envelopeSchema.parse(row.envelope).vaultId;
  }
  destroy() {
    this.active = false;
    this.key = null;
    this.pendingFiles.clear();
  }
  private assertActive() {
    if (!this.active || !this.key) throw new Error("保險箱已鎖定，請重新解鎖");
    return this.key;
  }
  private async row() {
    this.assertActive();
    const row = await this.request<VaultRow | null>("/api/vault");
    this.assertActive();
    if (!row || envelopeSchema.parse(row.envelope).vaultId !== this.vaultId)
      throw new Error("保險箱已變更，請重新解鎖");
    return row;
  }
  private async plain(row: VaultRow) {
    const data = await decryptJson(
      this.assertActive(),
      this.owner,
      this.vaultId,
      row.payload,
    );
    this.assertActive();
    return snapshotSchema.parse(data);
  }
  async load() {
    return this.plain(await this.row());
  }
  private async mutate(update: (value: Snapshot) => Snapshot) {
    const row = await this.row();
    const current = await this.plain(row);
    const next = snapshotSchema.parse(update(current));
    const payload = await encryptJson(
      this.assertActive(),
      this.owner,
      this.vaultId,
      next,
    );
    this.assertActive();
    try {
      await this.request<VaultRow>("/api/vault", {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: row.revision, payload }),
      });
    } catch (error) {
      // Reconcile an acknowledged-on-server write before retrying or announcing failure.
      const actual = await this.row().catch(() => null);
      if (
        !actual ||
        actual.payload.iv !== payload.iv ||
        actual.payload.ct !== payload.ct
      )
        throw error;
    }
    this.assertActive();
    return next;
  }
  async saveApplication(
    data: NewApplication,
    id: string,
    baseline?: Snapshot["applications"][number],
    sourceProspect?: Prospect,
  ) {
    const value = parseApplication(data);
    idSchema.parse(id);
    return this.mutate((snapshot) => {
      if (!snapshot.resumes.some((r) => r.id === value.resumeId))
        throw new Error("請先選擇或上傳履歷");
      const source =
        sourceProspect &&
        snapshot.prospects.find((j) => j.id === sourceProspect.id);
      if (sourceProspect) {
        if (source?.status === "applied") {
          const committed = snapshot.applications.find(
            (a) => a.id === source.applicationId,
          );
          if (
            source.applicationId === id &&
            committed &&
            Object.keys(value).every(
              (k) =>
                committed[k as keyof typeof committed] ===
                value[k as keyof typeof value],
            )
          )
            return snapshot;
          throw new Error("這筆職缺已投遞，請查看原投遞紀錄");
        }
        if (
          !source ||
          Object.keys(sourceProspect).some(
            (k) =>
              source[k as keyof Prospect] !==
              sourceProspect[k as keyof Prospect],
          )
        )
          throw new Error("職缺待辦已更新，請重新開啟最新紀錄");
      }
      const prior = snapshot.applications.find((a) => a.id === id);
      if (
        baseline &&
        (!prior ||
          Object.keys(baseline).some(
            (k) =>
              prior[k as keyof typeof prior] !==
              baseline[k as keyof typeof baseline],
          ))
      ) {
        throw new Error(
          "這筆紀錄已由另一個裝置更新，請保留修改內容並重新開啟最新紀錄後再編輯。",
        );
      }
      const now = new Date().toISOString();
      const item = {
        ...value,
        id,
        platform: platformFor(value.jobUrl),
        createdAt: prior?.createdAt || now,
        updatedAt: now,
      };
      return {
        ...snapshot,
        prospects: source
          ? snapshot.prospects.map((j) =>
              j.id === source.id
                ? {
                    ...j,
                    status: "applied" as const,
                    applicationId: id,
                    updatedAt: now,
                  }
                : j,
            )
          : snapshot.prospects,
        applications: prior
          ? snapshot.applications.map((a) => (a.id === id ? item : a))
          : [item, ...snapshot.applications],
      };
    });
  }
  async importProspects(entries: JobInput[]) {
    if (!entries.length || entries.length > 200)
      throw new Error("每次請匯入 1 至 200 筆職缺");
    const values = entries.map((j) => jobInputSchema.parse(j));
    let result = { added: 0, skipped: 0 };
    await this.mutate((s) => {
      const seen = new Set(
          [...s.prospects, ...s.applications].map((j) => jobIdentity(j.jobUrl)),
        ),
        added: Prospect[] = [];
      const now = new Date().toISOString();
      for (const job of values) {
        const identity = jobIdentity(job.jobUrl);
        if (seen.has(identity)) continue;
        seen.add(identity);
        added.push({
          ...job,
          id: crypto.randomUUID(),
          status: "review",
          applicationId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (s.prospects.length + added.length > 5000)
        throw new Error("待辦最多保留 5,000 筆");
      result = { added: added.length, skipped: values.length - added.length };
      return { ...s, prospects: [...added, ...s.prospects] };
    });
    return result;
  }
  async setProspectStatus(id: string, status: ProspectStatus) {
    if (!prospectStatuses.includes(status) || status === "applied")
      throw new Error("請用「記錄已投遞」選擇履歷與投遞日期");
    return this.mutate((s) => {
      const job = s.prospects.find((j) => j.id === id);
      if (!job) throw new Error("找不到職缺待辦");
      if (job.status === "applied")
        throw new Error("職缺已投遞，請在投遞紀錄更新進度");
      return {
        ...s,
        prospects: s.prospects.map((j) =>
          j.id === id
            ? { ...j, status, updatedAt: new Date().toISOString() }
            : j,
        ),
      };
    });
  }
  async editProspect(baseline: Prospect, data: JobInput) {
    const fields = jobInputSchema.parse(data);
    return this.mutate((s) => {
      const job = s.prospects.find((j) => j.id === baseline.id);
      if (
        !job ||
        Object.keys(baseline).some(
          (k) => job[k as keyof Prospect] !== baseline[k as keyof Prospect],
        )
      )
        throw new Error("職缺已更新，請重新開啟最新紀錄");
      if (job.status === "applied")
        throw new Error("請在投遞紀錄編輯已投遞職缺");
      if (
        [
          ...s.prospects.filter((j) => j.id !== baseline.id),
          ...s.applications,
        ].some((j) => jobIdentity(j.jobUrl) === jobIdentity(fields.jobUrl))
      )
        throw new Error("此職缺連結已存在");
      return {
        ...s,
        prospects: s.prospects.map((j) =>
          j.id === baseline.id
            ? { ...j, ...fields, updatedAt: new Date().toISOString() }
            : j,
        ),
      };
    });
  }
  async setStatus(id: string, status: ApplicationStatus) {
    return this.mutate((snapshot) => {
      const item = snapshot.applications.find((a) => a.id === id);
      if (!item) throw new Error("找不到紀錄");
      const updated = parseApplication({
        ...Object.fromEntries(
          Object.entries(item).filter(
            ([k]) => !["id", "platform", "createdAt", "updatedAt"].includes(k),
          ),
        ),
        status,
      });
      return {
        ...snapshot,
        applications: snapshot.applications.map((a) =>
          a.id === id
            ? { ...a, ...updated, updatedAt: new Date().toISOString() }
            : a,
        ),
      };
    });
  }
  async renameResume(id: string, displayName: string) {
    const name = displayName.trim();
    if (!name || name.length > 200)
      throw new Error("請填入 1 至 200 個字元的名稱");
    return this.mutate((s) => ({
      ...s,
      resumes: s.resumes.map((r) =>
        r.id === id ? { ...r, displayName: name } : r,
      ),
    }));
  }
  async uploadResume(file: File, displayName: string, cacheKey: string) {
    this.assertActive();
    let pending = this.pendingFiles.get(cacheKey);
    if (!pending) {
      const v = validateUpload({
        fileName: file.name,
        size: file.size,
        contentType: file.type,
      });
      const raw = new Uint8Array(await file.arrayBuffer());
      try {
        detectResume(raw, v.extension);
        const id = crypto.randomUUID();
        const bytes = await encryptFile(
          this.assertActive(),
          this.owner,
          this.vaultId,
          id,
          raw,
        );
        this.assertActive();
        pending = {
          id,
          bytes,
          ready: false,
          meta: {
            id,
            originalName: file.name,
            displayName: displayName.trim() || file.name,
            size: file.size,
            contentType: v.contentType,
            createdAt: new Date().toISOString(),
          },
        };
        this.pendingFiles.set(cacheKey, pending);
      } finally {
        raw.fill(0);
      }
    }
    if (!pending.ready) {
      const prepared = await this.request<SealedPrepared>("/api/sealed-files", {
        method: "POST",
        body: JSON.stringify({
          id: pending.id,
          size: pending.bytes.byteLength,
        }),
      });
      this.assertActive();
      if (!prepared.ready) {
        const finalize = () =>
          this.request("/api/sealed-files/" + pending!.id, {
            method: "POST",
            body: "{}",
          });
        const { error } = await createBrowserSupabase()
          .storage.from("sealed-resumes")
          .uploadToSignedUrl(
            prepared.path,
            prepared.token!,
            new Blob([new Uint8Array(pending.bytes)], {
              type: "application/octet-stream",
            }),
            { contentType: "application/octet-stream" },
          );
        this.assertActive();
        if (error) {
          try {
            await finalize();
          } catch {
            throw new Error("加密履歷上傳失敗，請重試");
          }
        } else await finalize();
      }
      this.assertActive();
      pending.ready = true;
    }
    const saved = pending;
    await this.mutate((s) =>
      s.resumes.some((r) => r.id === saved.id)
        ? s
        : { ...s, resumes: [saved.meta, ...s.resumes] },
    );
    return pending.id;
  }
  async downloadResume(id: string) {
    const snapshot = await this.load();
    const meta = snapshot.resumes.find((r) => r.id === id);
    if (!meta) throw new Error("找不到履歷");
    const { url } = await this.request<{ url: string }>(
      "/api/sealed-files/" + id,
    );
    this.assertActive();
    const response = await fetch(url, {
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("加密履歷下載失敗");
    if (!response.body) throw new Error("加密履歷下載失敗");
    const expected = meta.size + 29,
      encrypted = new Uint8Array(expected),
      reader = response.body.getReader();
    let offset = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        this.assertActive();
        if (done) break;
        if (offset + value.length > expected)
          throw new Error("履歷內容驗證失敗");
        encrypted.set(value, offset);
        offset += value.length;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (offset !== expected) throw new Error("履歷內容驗證失敗");
    const bytes = await decryptFile(
      this.assertActive(),
      this.owner,
      this.vaultId,
      id,
      encrypted,
    );
    this.assertActive();
    if (bytes.length !== meta.size) throw new Error("履歷內容驗證失敗");
    return { meta, bytes };
  }
}
