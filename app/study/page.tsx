import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { account, returnTo } from "../../lib/auth";
import { studyState } from "../../lib/study-state";
import { StudyApp } from "../study-app";

export const metadata: Metadata = { title: "Study workspace | Nihon Sar Loat" };

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ view?: string; start?: string }> }) {
  const [user, { view, start }] = await Promise.all([account(), searchParams]);
  const next = returnTo(view ? `/study?view=${view}` : "/study");
  if (!user) redirect(`/log-in?next=${encodeURIComponent(next)}`);
  if (!user.onboarded && !(start === "1" && (view === "library" || view === "imports"))) redirect("/onboarding");
  return <StudyApp key={user.id} initial={await studyState(user.id)} />;
}
