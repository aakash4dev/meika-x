"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/account/actions";
import type { AuthState } from "@/app/login/actions";

export default function PasswordForm({ highlight }: { highlight?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className={`card ${highlight ? "auth-highlight" : ""}`}>
      <div className="eyebrow">{highlight ? "Choose a new password" : "Change password"}</div>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus={highlight} />
      </div>
      <div className="field">
        <label htmlFor="confirm">Repeat new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && <p className="auth-msg err" role="alert">{state.error}</p>}
      {state.message && <p className="auth-msg ok" role="status">{state.message}</p>}
      <button className="btn primary" disabled={pending}>
        {pending ? <span className="spinner" /> : null}Save password
      </button>
    </form>
  );
}
