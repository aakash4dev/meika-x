"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const I = {
  cases: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.2 2.5 13.8 0 16M12 4c-2.5 2.2-2.5 13.8 0 16" /></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></svg>,
  monitor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h6M10 16h6" /></svg>,
  signin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 4h5v16h-5" /><path d="M4 12h11M11 8l4 4-4 4" /></svg>,
  system: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5" /></svg>,
};

const ITEMS = [
  { href: "/", label: "Cases", icon: I.cases, match: (p: string) => p === "/" || p.startsWith("/case") },
  { href: "/chat", label: "Chat", icon: I.chat, match: (p: string) => p.startsWith("/chat") },
  { href: "/monitor", label: "Monitor", icon: I.monitor, match: (p: string) => p.startsWith("/monitor") },
  { href: "/reports", label: "Reports", icon: I.reports, match: (p: string) => p.startsWith("/reports") },
  { href: "/system", label: "Agents", icon: I.system, match: (p: string) => p.startsWith("/system") },
];

export default function Rail({ user }: { user: { email: string } | null }) {
  const path = usePathname() ?? "/";
  return (
    <nav className="rail" aria-label="Main">
      <Link href="/" className="logo" aria-label="MEIKA-X home">
        <Logo size={42} />
      </Link>
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`item ${it.match(path) ? "on" : ""}`}>
          {it.icon}
          <small>{it.label}</small>
        </Link>
      ))}
      <span className="spacer" />
      {user ? (
        <Link href="/account" className={`item ${path.startsWith("/account") ? "on" : ""}`} title={user.email}>
          <span className="avatar" aria-hidden>{user.email.slice(0, 1) || "?"}</span>
          <small>Account</small>
        </Link>
      ) : (
        <Link href={`/login?next=${encodeURIComponent(path.startsWith("/login") || path.startsWith("/account") ? "/" : path)}`} className={`item ${path.startsWith("/login") ? "on" : ""}`}>
          {I.signin}
          <small>Sign in</small>
        </Link>
      )}
      <span className="team">Team Zentox</span>
    </nav>
  );
}
