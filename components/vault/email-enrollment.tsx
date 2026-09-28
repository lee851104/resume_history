"use client";
import { useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { api } from "@/lib/client-api";
export default function EmailEnrollment({
  owner,
  vaultId,
  material,
  email,
  onContinue,
}: {
  owner: string;
  vaultId: string;
  material: string;
  email?: string;
  onContinue: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      await api("/api/vault/recovery", {
        method: "POST",
        headers: { "X-Vault-Owner": owner },
        body: JSON.stringify({ action: "enroll", vaultId, material }),
      });
      onContinue();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="vault-screen">
      <a className="vault-brand" href="/">
        投遞日誌<span>PRIVATE WORKSPACE</span>
      </a>
      <section className="vault-card">
        <div className="vault-emblem">
          <Mail size={28} />
        </div>
        <p className="eyebrow">EMAIL RECOVERY</p>
        <h1>啟用 Google 信箱復原</h1>
        <p className="vault-description">
          忘記私人密碼時，可驗證 {email || "綁定的 Google 信箱"}
          ，重設密碼並保留原有資料。
        </p>
        <p className="notice">
          啟用後會將解密金鑰交由伺服器加密保管。持有伺服器與復原密鑰權限的管理員具備解密能力；其他使用者仍看不到你的資料。
        </p>
        <button
          className="button primary full-width"
          disabled={busy}
          onClick={enroll}
        >
          {busy && <LoaderCircle className="spin" size={17} />}
          啟用信箱復原並繼續
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="vault-text-button"
          disabled={busy}
          onClick={onContinue}
        >
          暫時略過（尚未啟用）
        </button>
        <p className="helper">
          略過後仍可正常使用；下次解鎖可再啟用。啟用前請保存私人密碼與離線復原碼。
        </p>
      </section>
    </main>
  );
}
