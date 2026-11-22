"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "./actions";

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
};

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";
  return (
    <div className="auth panel">
      <div className="panel-h"><h1 style={{ fontSize: "var(--t-xl)" }}>{isSignup ? "Create your account" : "Sign in"}</h1></div>
      <form action={formAction} className="panel-b stack" noValidate>
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state.email}
            aria-invalid={Boolean(state.fieldErrors?.email)} aria-describedby={state.fieldErrors?.email ? "email-err" : undefined} />
          {state.fieldErrors?.email && <span id="email-err" className="err">{state.fieldErrors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} className="input"
            autoComplete={isSignup ? "new-password" : "current-password"}
            aria-invalid={Boolean(state.fieldErrors?.password)} aria-describedby={isSignup ? "pw-hint" : undefined} />
          {isSignup && <span id="pw-hint" className="xs muted">At least 8 characters. Stored as a bcrypt hash, never in plain text.</span>}
          {state.fieldErrors?.password && <span className="err">{state.fieldErrors.password}</span>}
        </div>
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "One moment…" : isSignup ? "Create account" : "Sign in"}
        </button>
        <p className="small muted">
          {isSignup ? <>Already have an account? <Link href="/login">Sign in</Link></> : <>New here? <Link href="/signup">Create an account</Link></>}
        </p>
      </form>
    </div>
  );
}
