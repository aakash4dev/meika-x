"use client";

import { useActionState, useState } from "react";
import { sendPasswordReset, signIn, signInAsDemo, signUp, type AuthState } from "@/app/login/actions";

type Mode = "signin" | "signup" | "reset";

const TITLES: Record<Mode, string> = { signin: "Sign in", signup: "Create your account", reset: "Reset your password" };

export default function AuthForm({ next, initialMode = "signin", initialError, demo = false }: { next: string; initialMode?: Mode; initialError?: string; demo?: boolean }) {
  const [demoState, demoAction, demoPending] = useActionState<AuthState, FormData>(signInAsDemo, {});
  const [mode, setMode] = useState<Mode>(initialMode);
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, { error: initialError });
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const [rsState, rsAction, rsPending] = useActionState<AuthState, FormData>(sendPasswordReset, {});
  const [state, action, pending] = mode === "signin" ? [inState, inAction, inPending] : mode === "signup" ? [upState, upAction, upPending] : [rsState, rsAction, rsPending];

  return (
    <div className="auth-card card">
      <div className="eyebrow">MEIKA-X account</div>
      <h1>{TITLES[mode]}</h1>
      {mode !== "reset" && (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "signin"} className={`tab ${mode === "signin" ? "on" : ""}`} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={`tab ${mode === "signup" ? "on" : ""}`} onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>
      )}
      {demo && mode !== "reset" && (
        <form action={demoAction} className="auth-demo">
          <input type="hidden" name="next" value={next} />
          <button className="btn demo auth-submit" disabled={demoPending}>
            {demoPending ? <span className="spinner" /> : null}Continue with the demo account
          </button>
          <p className="tiny muted">No sign-up needed. Full access to every feature, shared with other demo visitors.</p>
          {demoState.error && <p className="auth-msg err" role="alert">{demoState.error}</p>}
          <div className="auth-or"><span>or use your own account</span></div>
        </form>
      )}
      <p className="muted small">
        {mode === "signin" && "Sign in to open cases, chat with Our AI and manage monitoring. Browsing cases and reports needs no account."}
        {mode === "signup" && "Free. We send one email to confirm your address."}
        {mode === "reset" && "Enter your email and we will send you a link to choose a new password."}
      </p>

      <form action={action} key={mode}>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        {mode !== "reset" && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </div>
        )}
        {mode === "signup" && (
          <div className="field">
            <label htmlFor="confirm">Repeat password</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
        )}
        {state.error && <p className="auth-msg err" role="alert">{state.error}</p>}
        {state.message && <p className="auth-msg ok" role="status">{state.message}</p>}
        <button className="btn primary auth-submit" disabled={pending}>
          {pending ? <span className="spinner" /> : null}
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>

      <div className="auth-links small">
        {mode === "signin" && (
          <button type="button" className="linkish" onClick={() => setMode("reset")}>
            Forgot your password?
          </button>
        )}
        {mode === "reset" && (
          <button type="button" className="linkish" onClick={() => setMode("signin")}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
