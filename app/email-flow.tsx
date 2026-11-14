"use client";

import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "./brand";
import { errorMessage, post } from "./study-api";
import "./entry.css";

export function EmailFlow({ mode }: { mode: "verify" | "forgot" | "reset" }) {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [link, setLink] = useState("");
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    function readToken() { setToken(window.location.hash.slice(1)); }
    readToken();
    setReady(true);
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);
  const verifying = mode === "verify" && Boolean(token);
  const title = mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : verifying ? "Verify your email" : "Resend verification";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const action = mode === "verify" && !verifying ? "resend" : mode;
      const result = await post<{ link?: string; next?: string }>(action, { ...Object.fromEntries(new FormData(event.currentTarget)), token });
      if (result.next) window.location.replace(result.next);
      else {
        setSent(true);
        setLink(result.link ?? "");
      }
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return <div className="account-page">
    <header className="entry-header"><div className="entry-container entry-header-inner"><Brand /><Link className="entry-login-link" href="/log-in">Log in</Link></div></header>
    <main className="account-stage"><section className="panel account-form-panel email-panel">
      <span className="icon-tile gold"><Mail size={22} /></span>
      <h1>{title}</h1>
      {sent ? <p role="status">If the account is eligible, an email with your link is on its way.</p> : null}
      {link ? <a className="text-button" href={link}>Open local email link <ArrowRight size={16} /></a> : null}
      {mode === "reset" && ready && !token ? <p className="error">This link is missing or expired. <Link className="text-button" href="/forgot-password">Request a new link</Link></p> : null}
      {ready && (mode !== "reset" || token) ? <form onSubmit={submit} aria-busy={busy}>
        {mode === "reset" ? <label>New password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><span className="muted">Use 12 to 128 characters.</span></label>
          : !verifying ? <label>Email<input name="email" type="email" maxLength={254} autoComplete="email" required /></label> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        {error && (verifying || mode === "reset") ? <Link className="text-button" href={mode === "reset" ? "/forgot-password" : "/verify-email"} onClick={verifying ? (event) => { event.preventDefault(); setToken(""); setError(""); } : undefined}>Request a new link</Link> : null}
        <button className="button ink" disabled={busy}>{busy ? "Please wait…" : mode === "reset" ? "Update password" : verifying ? "Verify and continue" : "Send link"} <ArrowRight size={17} /></button>
      </form> : null}
    </section></main>
  </div>;
}
