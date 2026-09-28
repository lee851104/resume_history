"use client";
import { useState } from "react";
import { notifySignOut } from "@/lib/vault/session-events";
import {
  LockKeyhole,
  ShieldCheck,
  Download,
  ArrowLeft,
  LoaderCircle,
} from "lucide-react";
import {
  createVault,
  unlockVault,
  recoverVault,
  encryptJson,
  decryptJson,
} from "@/lib/crypto/vault";
import { type VaultRow } from "@/lib/crypto/schema";
import { api } from "@/lib/client-api";
import { emptySnapshot } from "@/lib/vault/client";
import { snapshotSchema } from "@/lib/vault/snapshot";
type Keys = Awaited<ReturnType<typeof createVault>>;
export default function VaultGate({
  owner,
  row,
  onReady,
}: {
  owner: string;
  row: VaultRow | null;
  onReady: (key: CryptoKey, row: VaultRow) => void;
}) {
  const [mode, setMode] = useState<"unlock" | "recover">("unlock");
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{
    keys: Keys;
    creating: boolean;
    row: VaultRow;
  } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!row || mode === "recover") {
        if (password !== confirm) throw new Error("兩次輸入的密碼不一致");
        const keys = !row
          ? await createVault(owner, password)
          : await recoverVault(owner, recovery, password, row.envelope);
        const payload =
          row?.payload ||
          (await encryptJson(
            keys.key,
            owner,
            keys.envelope.vaultId,
            emptySnapshot(),
          ));
        if (row)
          snapshotSchema.parse(
            await decryptJson(keys.key, owner, keys.envelope.vaultId, payload),
          );
        setPending({
          creating: !row,
          keys,
          row: {
            envelope: keys.envelope,
            payload,
            revision: row?.revision || 0,
          },
        });
        setPassword("");
        setConfirm("");
        setRecovery("");
      } else {
        const key = await unlockVault(owner, password, row.envelope);
        snapshotSchema.parse(
          await decryptJson(key, owner, row.envelope.vaultId, row.payload),
        );
        setPassword("");
        onReady(key, row);
      }
    } catch (e) {
      setError(
        (e instanceof Error && e.message.includes("字元")) ||
          (e instanceof Error && e.message.includes("不一致"))
          ? (e as Error).message
          : "無法解鎖：請檢查密碼或復原碼，資料也可能已變更。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirmBackup() {
    if (!pending || !saved) return;
    setBusy(true);
    setError("");
    try {
      const body = !pending.creating
        ? {
            expectedRevision: pending.row.revision,
            envelope: pending.keys.envelope,
            payload: pending.row.payload,
          }
        : { envelope: pending.keys.envelope, payload: pending.row.payload };
      let result: VaultRow;
      try {
        result = await api<VaultRow>("/api/vault", {
          method: pending.creating ? "POST" : "PUT",
          body: JSON.stringify(body),
          headers: { "X-Vault-Owner": owner },
        });
      } catch (error) {
        const latest = await api<VaultRow | null>("/api/vault", {
          headers: { "X-Vault-Owner": owner },
        }).catch(() => null);
        if (
          !latest ||
          latest.envelope.passwordKey.ct !==
            pending.keys.envelope.passwordKey.ct ||
          latest.envelope.passwordKey.iv !==
            pending.keys.envelope.passwordKey.iv
        )
          throw error;
        result = latest;
      }
      onReady(pending.keys.key, result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function downloadRecovery() {
    if (!pending) return;
    const blob = new Blob(
      [
        "投遞日誌復原碼\n\n" +
          pending.keys.recoveryCode +
          "\n\n請離線保存。任何持有此碼並能取得你的雲端密文的人都可能解密資料。\n此碼須在網頁確認儲存成功後才生效。",
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "投遞日誌-復原碼.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="vault-screen">
      <a className="vault-brand" href="/">
        投遞日誌<span>PRIVATE WORKSPACE</span>
      </a>
      <section className="vault-card">
        <div className="vault-emblem">
          <LockKeyhole size={28} />
        </div>
        <p className="eyebrow">END-TO-END ENCRYPTED</p>
        <h1>
          {pending
            ? "保存你的復原碼"
            : !row
              ? "建立加密保險箱"
              : mode === "recover"
                ? "復原保險箱"
                : "解鎖私人工作台"}
        </h1>
        <p className="vault-description">
          {pending
            ? "這組復原碼只在這次顯示。請存到安全的位置，勿交給網站管理員。"
            : !row
              ? "設定一組只有你知道的密碼。紀錄與履歷會在裝置上加密後才上傳。"
              : mode === "recover"
                ? "使用復原碼設定新密碼，原本的紀錄與履歷會保留。"
                : "Google 已確認你的身分。輸入私人密碼，才能在這台裝置開啟資料。"}
        </p>
        {pending ? (
          <div>
            <label className="field">
              你的復原碼
              <textarea
                className="recovery-code"
                aria-label="你的復原碼"
                readOnly
                value={pending.keys.recoveryCode}
                rows={3}
              />
            </label>
            <button
              className="button secondary full-width"
              onClick={downloadRecovery}
            >
              <Download size={16} />
              下載復原碼
            </button>
            <label className="backup-check">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              我已另行保存復原碼，知道管理員無法代為復原
            </label>
            <p className="notice">
              {row
                ? "新密碼與新復原碼會在儲存成功後生效，請替換舊復原碼。"
                : "密碼與復原碼都遺失時，資料無法救回。"}
            </p>
            <button
              className="button primary full-width"
              disabled={!saved || busy}
              onClick={confirmBackup}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}
              確認保存並開啟工作台
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === "recover" && row && (
              <div className="field">
                <label htmlFor="recovery-input">復原碼</label>
                <textarea
                  id="recovery-input"
                  rows={3}
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="private-password">
                {mode === "recover" ? "新私人解鎖密碼" : "私人解鎖密碼"}
              </label>
              <input
                id="private-password"
                type="password"
                autoComplete={
                  !row || mode === "recover"
                    ? "new-password"
                    : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={256}
                required
                autoFocus
              />
              <small className="helper">
                至少 12 個字元，請用長且獨特的密碼，不要使用 Google 密碼。
              </small>
            </div>
            {(!row || mode === "recover") && (
              <div className="field">
                <label htmlFor="confirm-password">再次輸入解鎖密碼</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={12}
                  maxLength={256}
                  required
                />
              </div>
            )}
            <button className="button primary full-width" disabled={busy}>
              {busy && <LoaderCircle className="spin" size={17} />}{" "}
              {!row
                ? "建立保險箱"
                : mode === "recover"
                  ? "重設密碼並產生新復原碼"
                  : "解鎖"}
            </button>
            {row && (
              <button
                className="vault-text-button"
                type="button"
                onClick={() => {
                  setMode(mode === "unlock" ? "recover" : "unlock");
                  setError("");
                  setPassword("");
                  setConfirm("");
                  setRecovery("");
                }}
              >
                {mode === "unlock" ? "忘記密碼？使用復原碼" : "返回密碼解鎖"}
              </button>
            )}
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="vault-footnote">
          <ShieldCheck size={15} />
          <span>
            密碼、復原碼與解密金鑰不上傳。重新整理或閒置 15 分鐘後需要再解鎖。
          </span>
        </div>
        <form action="/auth/logout" method="post" onSubmit={notifySignOut}>
          <button className="vault-text-button" disabled={busy}>
            登出 Google 帳號
          </button>
        </form>
      </section>
      <p className="vault-limits">
        雲端仍可見帳號、密文大小與存取時間。無法防止惡意修改網站程式或已被控制的裝置。
      </p>
    </main>
  );
}
