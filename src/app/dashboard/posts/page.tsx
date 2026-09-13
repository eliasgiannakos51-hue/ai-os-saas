import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { POSTS_ICON } from "@/lib/module-icons";
import { normalisePlatforms, parseStoredPostSet } from "@/lib/posts/platforms";
import { PostsWorkspace, type PostRow } from "@/components/posts/posts-workspace";
import { readExampleParam } from "@/lib/overview/first-screen-examples";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.posts");
}

/**
 * POSTS, WRITTEN — one per platform, from one brief, and copied out by
 * hand. There was no page here before V5 #22: the Content module is a
 * log a person types captions into, and the roadmap's "Social posting"
 * (still under "soon") is the publishing step this page deliberately
 * does not take. What it will not do is stated on the screen by
 * PostsWorkspace rather than left to the name.
 */
// THE BRIEF ARRIVES IN THE URL when Home's field routed a post request
// here. Read through the shared clamp, and the parameter's name is
// compared against the emitter by scripts/tests/producer-routes.test.mjs.
export default async function PostsPage({
  searchParams,
}: {
  searchParams: { brief?: string };
}) {
  const t = await getTranslations("posts");
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // THE WALL, BEFORE THE BUTTON. The route refuses too
  // (api/posts/generate), and that is the line that actually protects
  // the spend — this one exists so a person on the wrong plan reads a
  // sentence naming the plan and its price instead of pressing a button
  // that returns 403.
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  if (!accountHasCapability(planSlug, "posts", isAdmin)) {
    return (
      <div className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader icon={POSTS_ICON} title={t("title")} helpKey="help.posts" />
          <UpgradeRequired {...upgradeWallProps("posts", t("title"))!} />
        </div>
      </div>
    );
  }

  // RLS scopes this to the caller.
  const { data: rows } = await supabase
    .from("generated_posts")
    .select("id, description, platforms, posts, status, error, credits_charged, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  const history: PostRow[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    description: String(row.description ?? ""),
    platforms: normalisePlatforms(row.platforms),
    set: row.status === "done" ? parseStoredPostSet(row.posts) : null,
    error: (row.error as string | null) ?? null,
    creditsCharged: Number(row.credits_charged ?? 0),
    createdAt: String(row.created_at ?? ""),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader icon={POSTS_ICON} title={t("title")} description={t("description")} helpKey="help.posts" />
      <PostsWorkspace history={history} initialDescription={readExampleParam(searchParams.brief)} />
    </div>
  );
}
