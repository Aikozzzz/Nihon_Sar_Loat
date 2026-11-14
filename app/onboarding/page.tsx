import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { account } from "../../lib/auth";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Get started | Nihon Sar Loat" };

export default async function OnboardingPage() {
  const user = await account();
  if (!user) redirect("/log-in");
  if (user.onboarded) redirect("/study");
  return <Onboarding />;
}
