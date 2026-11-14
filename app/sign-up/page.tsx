import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { account } from "../../lib/auth";
import { AccountFlow } from "../account-flow";

export const metadata: Metadata = { title: "Sign up | Nihon Sar Loat" };

export default async function SignupPage() {
  const user = await account();
  if (user) redirect(user.onboarded ? "/study" : "/onboarding");
  return <AccountFlow mode="signup" />;
}
