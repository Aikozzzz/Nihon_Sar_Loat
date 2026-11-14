"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Brand } from "./brand";
import { errorMessage, post } from "./study-api";
import "./entry.css";

export function AccountFlow({ mode, next, reset }: { mode: "login" | "signup"; next?: string; reset?: boolean }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const section = window.location.hash.slice(1);
      const destination = next === "/study" && ["home", "library", "review", "reading", "imports"].includes(section)
        ? `/study?view=${section}` : next;
      const result = await post<{ next?: string; pending?: boolean; link?: string }>(mode, { ...values, next: destination });
      if (result.pending) {
        setEmail(String(values.email));
        setLink(result.link ?? "");
      }
      if (result.next) {
        router.replace(result.next);
        router.refresh();
      }
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await post<{ link?: string }>("resend", { email, next });
      setLink(result.link ?? "");
      setNotice("Check your inbox for a new verification link.");
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-page">
      <header className="entry-header">
        <div className="entry-container entry-header-inner">
          <Brand />
          <Link href="/" className="entry-login-link account-back"><ArrowLeft size={16} /> <span>Back to home</span></Link>
        </div>
      </header>
      <main className="account-stage">
        <div className="account-shell">
          <aside className="account-print" aria-label="Study preview">
            <div className="account-print-copy">
              <p>{signup ? "Start with what you study." : "Pick up where you left off."}</p>
              <span>{signup ? "Your notes, flashcards, and reading practice in one workspace." : "Your next review is ready when you are."}</span>
            </div>
            <div className="account-term">
              <ruby lang="ja">積み重ねる<rt>つみかさねる</rt></ruby>
              <span>To build up, one step at a time</span>
            </div>
          </aside>
          {email ? <section className="account-form-panel" aria-labelledby="account-title">
            <h1 id="account-title">Check your email</h1>
            <p>Open the verification link for <strong>{email}</strong> to continue.</p>
            <div className="account-form-actions">
              {link ? <a href={link} className="button ink">Open local verification link <ArrowRight size={17} /></a> : null}
              <button className="button secondary" onClick={resend} disabled={busy}>{busy ? "Sending…" : "Resend link"}</button>
            </div>
            {notice ? <p role="status">{notice}</p> : null}
            {error ? <p className="error" role="alert">{error}</p> : null}
            <p className="account-switch"><Link href="/log-in">Back to log in</Link></p>
          </section> : <section className="account-form-panel" aria-labelledby="account-title">
            <h1 id="account-title">{signup ? "Create your account" : "Welcome back"}</h1>
            <p>{signup ? "Set up your JLPT N2 study workspace." : "Log in to open your study workspace."}</p>
            {reset ? <p className="account-notice" role="status">Password updated. Log in with your new password.</p> : null}
            <form onSubmit={submit} aria-describedby="account-form-note">
              {signup ? <label htmlFor="account-name">Name<input id="account-name" name="name" required placeholder="Your name" maxLength={60} autoComplete="name" /></label> : null}
              <label htmlFor="account-email">Email<input id="account-email" name="email" type="email" required placeholder="learner@example.com" autoComplete="email" autoCapitalize="none" /></label>
              <div className="account-field">
                <label htmlFor="account-password">Password</label>
                <div className="password-field">
                  <input id="account-password" name="password" type={visible ? "text" : "password"} required minLength={signup ? 12 : undefined} maxLength={128} placeholder={signup ? "At least 12 characters" : "Your password"} autoComplete={signup ? "new-password" : "current-password"} />
                  <button type="button" className="icon-button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </div>
              {signup ? <p className="muted">Use 12 to 128 characters.</p> : <Link href="/forgot-password" className="text-button">Forgot password?</Link>}
              {error ? <p className="error" role="alert">{error}</p> : null}
              <button className="button ink" type="submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Log in"} <ArrowRight size={17} /></button>
            </form>
            <p className="account-switch" id="account-form-note">{signup ? "Already have an account?" : "New to Nihon Sar Loat?"} <Link href={signup ? "/log-in" : "/sign-up"}>{signup ? "Log in" : "Sign up"}</Link></p>
            <p className="account-switch"><Link href="/verify-email">Resend verification link</Link></p>
          </section>}
        </div>
      </main>
    </div>
  );
}
