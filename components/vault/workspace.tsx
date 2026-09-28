"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Dashboard from "@/components/tracker/dashboard";
import VaultGate from "./vault-gate";
import AccountControls from "@/components/account-controls";
import { VaultClient } from "@/lib/vault/client";
import { type VaultRow } from "@/lib/crypto/schema";
import { api } from "@/lib/client-api";
import {
  AUTH_INVALID_EVENT,
  SESSION_CHANNEL,
} from "@/lib/vault/session-events";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { isConfigured } from "@/lib/supabase/config";
export type Session = {
  configured: boolean;
  user: { id: string; email?: string } | null;
};
export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null),
    [row, setRow] = useState<VaultRow | null>(null);
  const [client, setClient] = useState<VaultClient | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [epoch, setEpoch] = useState(0);
  const current = useRef<VaultClient | null>(null),
    lastActivity = useRef(Date.now()),
    generation = useRef(0),
    requestSequence = useRef(0);
  const identity = useRef<string | null | undefined>(undefined);
  const lock = useCallback(() => {
    current.current?.destroy();
    current.current = null;
    lastActivity.current = Date.now();
    generation.current += 1;
    setEpoch(generation.current);
    setClient(null);
    setError("");
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const next = await api<Session>("/api/session");
      if (sequence !== requestSequence.current) return;
      if (
        identity.current !== undefined &&
        identity.current !== (next.user?.id ?? null)
      )
        lock();
      identity.current = next.user?.id ?? null;
      const latest = next.user
        ? await api<VaultRow | null>("/api/vault", {
            headers: { "X-Vault-Owner": next.user.id },
          })
        : null;
      if (sequence !== requestSequence.current) return;
      setSession(next);
      setRow(latest);
      setError("");
    } catch {
      if (sequence !== requestSequence.current) return;
      lock();
      setError("暫時無法確認保險箱狀態，已鎖定。請重新整理。");
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }, [lock]);
  useEffect(() => {
    void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") {
        if (identity.current && Date.now() - lastActivity.current >= 900_000)
          lock();
        void refresh();
      }
    };
    const pagehide = () => lock();
    const invalid = () => {
      identity.current = null;
      ++requestSequence.current;
      lock();
      setRow(null);
      setSession((s) => (s ? { ...s, user: null } : s));
      setBusy(false);
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(SESSION_CHANNEL)
        : null;
    if (channel)
      channel.onmessage = (e) => {
        if (e.data === "signed-out") invalid();
      };
    const subscription = isConfigured()
      ? createBrowserSupabase().auth.onAuthStateChange((event, next) => {
          if (event === "SIGNED_OUT") invalid();
          else if (
            identity.current !== undefined &&
            (next?.user.id ?? null) !== identity.current
          ) {
            invalid();
          }
          if (event === "SIGNED_IN") void refresh();
        }).data.subscription
      : null;
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("focus", visible);
    window.addEventListener(AUTH_INVALID_EVENT, invalid);
    document.addEventListener("visibilitychange", visible);
    const poll = setInterval(visible, 60_000);
    return () => {
      ++requestSequence.current;
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("focus", visible);
      window.removeEventListener(AUTH_INVALID_EVENT, invalid);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(poll);
      channel?.close();
      subscription?.unsubscribe();
      current.current?.destroy();
    };
  }, [lock, refresh]);
  useEffect(() => {
    // Gate screens can hold recovery material before a VaultClient exists.
    if (!session?.user) return;
    lastActivity.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lock();
        void refresh();
      }, 900_000);
    };
    const activity = () => {
      if (Date.now() - lastActivity.current >= 900_000) {
        lock();
        void refresh();
        return;
      }
      lastActivity.current = Date.now();
      schedule();
    };
    schedule();
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
      window.addEventListener(event, activity, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
        window.removeEventListener(event, activity);
    };
  }, [client, session?.user?.id, lock, refresh]);
  if (busy || !session)
    return (
      <main className="vault-screen">
        <div className="vault-card">
          <h1>正在確認私人工作台…</h1>
          {error && <p role="alert">{error}</p>}
          <button className="button secondary" onClick={() => void refresh()}>
            重新整理
          </button>
        </div>
      </main>
    );
  if (error && !client)
    return (
      <main className="vault-screen">
        <div className="vault-card">
          <p className="error" role="alert">
            {error}
          </p>
          <button className="button secondary" onClick={() => void refresh()}>
            重新整理
          </button>
        </div>
      </main>
    );
  if (!session.user) return <Dashboard session={session} />;
  if (!client)
    return (
      <div className="vault-with-account">
        <header className="vault-account-header">
          <AccountControls session={session} />
        </header>
        <VaultGate
          key={session.user.id + ":" + epoch}
          owner={session.user.id}
          row={row}
          onReady={(key, latest) => {
            if (
              generation.current !== epoch ||
              identity.current !== session.user!.id ||
              Date.now() - lastActivity.current >= 900_000
            )
              return;
            current.current?.destroy();
            const next = new VaultClient(session.user!.id, key, latest);
            current.current = next;
            setRow(latest);
            setClient(next);
          }}
        />
      </div>
    );
  return (
    <Dashboard
      key={client.owner}
      session={session}
      client={client}
      onLock={() => {
        lock();
        void refresh();
      }}
    />
  );
}
