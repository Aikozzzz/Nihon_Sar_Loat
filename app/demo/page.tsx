import Link from "next/link";
import { redirect } from "next/navigation";
import { account } from "../../lib/auth";
import { Brand } from "../brand";
import { SampleSession } from "./session";
import "../entry.css";

export default async function Page() {
  const user = await account();
  if (!user) redirect("/log-in");
  return <>
    <header className="entry-header"><div className="entry-container entry-header-inner"><Brand /><Link className="entry-login-link" href={user.onboarded ? "/study" : "/onboarding"}>{user.onboarded ? "Study dashboard" : "Back to setup"}</Link></div></header>
    <main className="onboarding-main"><SampleSession onboarding={!user.onboarded} /></main>
  </>;
}
