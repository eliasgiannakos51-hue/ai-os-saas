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
 * unchanged — chat-attachments.tsx and lib/library/sources.ts both still
 * link to /dashboard/files?record=, and neither call site needed to
 * change for that to keep working. The documents and collections this
 * page used to list are read by /dashboard/data-analysis now
 * (components/analyze/analyze-shell.tsx); nothing was deleted.
 */
export default async function FilesPage(props: { searchParams: Promise<{ record?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const record = searchParams.record;
  redirect(record ? `/dashboard/data-analysis?record=${encodeURIComponent(record)}` : "/dashboard/data-analysis");
}
