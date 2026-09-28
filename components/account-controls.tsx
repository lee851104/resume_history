"use client";
import { ArrowUpRight, LogOut } from "lucide-react";
import { notifySignOut } from "@/lib/vault/session-events";
import type { Session } from "@/components/vault/workspace";

export default function AccountControls({ session }: { session: Session }) {
  if (!session.user) {
    return session.configured ? (
      <a className="button primary account-login" href="/auth/login">
        Google 登入<ArrowUpRight size={16} />
      </a>
    ) : null;
  }
  const email = session.user.email || "已登入 Google 帳號";
  return (
    <div className="header-account" aria-label="目前登入帳號">
      <span className="header-account-email" title={email}>{email}</span>
      <form action="/auth/logout" method="post" onSubmit={notifySignOut}>
        <button className="icon-button" aria-label="登出 Google" title="登出 Google">
          <LogOut size={17} />
        </button>
      </form>
    </div>
  );
}
