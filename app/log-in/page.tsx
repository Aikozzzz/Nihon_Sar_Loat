import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { account, returnTo } from "../../lib/auth";
import { AccountFlow } from "../account-flow";

export const metadata: Metadata = { title: "Log in | Nihon Sar Loat" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const [user, params] = await Promise.all([account(), searchParams]);
  const next = returnTo(params.next);
  if (user) redirect(user.onboarded ? next : "/onboarding");
  return <AccountFlow mode="login" next={next} reset={params.reset === "1"} />;
}
