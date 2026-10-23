import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.files");
}

/**
 * ANALYZE AND FILES, MERGED (owner's message of 2026-10-22; the switch
 * that held the old page back was removed 2026-10-23): this address
 * redirects to the merged tool's one home, carrying `?record=` forward
 * unchanged (and every other parameter with it) — chat-attachments.tsx and
 * lib/library/sources.ts both still link to /dashboard/files?record=, and neither call site needed to
 * change for that to keep working. The documents and collections this
 * page used to list are read by /dashboard/data-analysis now
 * (components/analyze/analyze-shell.tsx); nothing was deleted.
 */
export default async function FilesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // `?record=` and what the phone's share sheet reports (src/app/share/route.ts
  // ends here with `shared`, `share_failed`, `share_dropped`, `share_reason`
  // or `share_error`) all travel on; the Analyze shell says the share's words.
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") forwarded.set(key, value);
  }
  const query = forwarded.toString();
  redirect(query ? `/dashboard/data-analysis?${query}` : "/dashboard/data-analysis");
}
