import Link from "next/link";
import { currentUser } from "@/lib/server/session";
import { signOutAction } from "@/app/(auth)/actions";
import { NavTabs } from "./nav-tabs";

export async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="top">
      <div className="wrap">
        <Link className="logo" href="/" aria-label="Ensemble home">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="5" x2="21" y2="5" /><line x1="1" y1="9" x2="21" y2="9" /><line x1="1" y1="13" x2="21" y2="13" /><line x1="1" y1="17" x2="21" y2="17" /></g>
            <ellipse cx="7" cy="13" rx="3" ry="2.2" fill="currentColor" transform="rotate(-20 7 13)" />
            <ellipse cx="15" cy="9" rx="3" ry="2.2" fill="var(--accent)" transform="rotate(-20 15 9)" />
          </svg>
          Ensemble
        </Link>
        <NavTabs signedIn={Boolean(user)} />
        {user ? (
          <form action={signOutAction}>
            <button className="btn ghost sm" type="submit" title={user.email}>Sign out</button>
          </form>
        ) : (
          <Link className="btn sm" href="/login">Sign in</Link>
        )}
      </div>
    </header>
  );
}
