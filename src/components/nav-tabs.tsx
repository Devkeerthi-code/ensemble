"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/studio", mark: "B", label: "Setup Studio" },
  { href: "/agents", mark: "C", label: "Subagents" },
  { href: "/doctor", mark: "D", label: "Doctor" },
  { href: "/orchestrator", mark: "E", label: "Orchestrator", auth: true },
];

export function NavTabs({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.filter((t) => !t.auth || signedIn).map((t) => (
        <Link key={t.href} href={t.href} aria-current={path.startsWith(t.href) ? "true" : undefined}>
          <span className="mark" aria-hidden="true">{t.mark}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
