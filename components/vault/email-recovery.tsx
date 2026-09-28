"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "@/lib/client-api";
import {
  decryptJson,
  restoreFromMaterial,
  type createVault,
} from "@/lib/crypto/vault";
import type { VaultRow } from "@/lib/crypto/schema";
import type { RecoveryStatus } from "@/lib/recovery/types";
import { snapshotSchema } from "@/lib/vault/snapshot";
type Keys = Awaited<ReturnType<typeof createVault>>;
export default function EmailRecovery({
  owner,
  status,
  onRecovered,
  onBack,
}: {
  owner: string;
  status: RecoveryStatus | null;
  onRecovered: (keys: Keys, row: VaultRow) => void;
  onBack: () => void;
}) {
  const [sent, setSent] = useState(false),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [verified, setVerified] = useState<{
    material: string;
    row: VaultRow;
  } | null>(null);
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [cooldown, setCooldown] = useState(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function send() {
    setBusy(true);
    setError("");
    try {
      await api("/api/vault/recovery", {
        method: "POST",
        headers: { "X-Vault-Owner": owner },
        body: JSON.stringify({ action: "send" }),
      });
      if (active.current) {
        setSent(true);
        setToken("");
        setCooldown(60);
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!verified) {
        const result = await api<{ material: string; row: VaultRow }>(
          "/api/vault/recovery",
          {
            method: "POST",
            headers: { "X-Vault-Owner": owner },
            body: JSON.stringify({ action: "verify", token }),
          },
        );
        if (active.current) {
          setVerified(result);
          setToken("");
        }
      } else {
        if (password !== confirm) throw new Error("兩次輸入的密碼不一致");
        const keys = await restoreFromMaterial(
          owner,
          verified.material,
          password,
          verified.row.envelope,
        );
        snapshotSchema.parse(
          await decryptJson(
            keys.key,
            owner,
            keys.envelope.vaultId,
            verified.row.payload,
          ),
        );
        if (active.current) {
          setVerified(null);
          setPassword("");
          setConfirm("");
          onRecovered(keys, verified.row);
        }
      }
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "復原失敗，請重新驗證");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div>
      <p className="notice">
        {status?.email ? `驗證信箱：${status.email}` : "正在確認綁定信箱…"}
      </p>
      {!status?.enabled ? (
        <p role="status" className="notice">
          {status?.message || "正在確認信箱復原狀態…"}
        </p>
      ) : verified ? (
        <form onSubmit={submit}>
          <p className="notice">
            信箱驗證成功。設定新密碼後，原本的履歷與紀錄會保留。
          </p>
          <label className="field" htmlFor="email-new-password">
            新私人解鎖密碼
            <input
              id="email-new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field" htmlFor="email-confirm-password">
            再次輸入解鎖密碼
            <input
              id="email-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <p className="helper">至少 12 個字元；請勿使用 Google 密碼。</p>
          <button className="button primary full-width" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={17} />}設定新密碼
          </button>
        </form>
      ) : (
        <div>
          {!sent ? (
            <button
              className="button primary full-width"
              disabled={busy}
              onClick={send}
            >
              {busy && <LoaderCircle className="spin" size={17} />}寄送驗證碼
            </button>
          ) : (
            <>
              <p className="helper">
                請查看收件匣或垃圾郵件，輸入信件中的驗證碼。
              </p>
              <form onSubmit={submit}>
                <label className="field" htmlFor="email-otp">
                  信箱驗證碼
                  <input
                    id="email-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,10}"
                    maxLength={10}
                    required
                    value={token}
                    onChange={(e) =>
                      setToken(e.target.value.replace(/\D/g, ""))
                    }
                  />
                </label>
                <button className="button primary full-width" disabled={busy}>
                  {busy && <LoaderCircle className="spin" size={17} />}驗證信箱
                </button>
              </form>
              <button
                className="vault-text-button"
                disabled={busy || cooldown > 0}
                onClick={send}
              >
                {cooldown > 0 ? `${cooldown} 秒後可重新寄送` : "重新寄送驗證碼"}
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="vault-text-button"
        disabled={busy}
        onClick={() => {
          setVerified(null);
          onBack();
        }}
      >
        返回密碼解鎖
      </button>
    </div>
  );
}
