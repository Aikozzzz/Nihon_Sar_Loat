import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "./brand";
import "./entry.css";

export function Legal({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <header className="entry-header"><div className="entry-container entry-header-inner"><Brand /><Link className="entry-login-link" href="/">Back to home</Link></div></header>
    <main className="entry-container legal-content"><h1>{title}</h1>{children}</main>
  </>;
}
