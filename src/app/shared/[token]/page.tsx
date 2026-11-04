import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProjectDetail } from "@/lib/projects/load-project-detail";
import { projectKindCounts, PROJECT_KIND_TABLES } from "@/lib/projects/project";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  // NEVER INDEXED, belt-and-braces with robots.ts's own "/shared"
  // disallow: that line stops a crawler from fetching this page at all;
  // this stops it being indexed on the (rarer) path of arriving here
  // some other way — a link followed from an indexed page, say.
  return { title: "Ionexa", robots: { index: false, follow: false } };
}

// Reusing the KIND_LABEL_KEYS mapping project-detail.tsx's own count boxes
// use (Κομμάτι 3) — same five kinds, same words, read server-side here
// instead of through useTranslations/tKey since this page has no client
// component at all.
const KIND_LABEL_KEYS: Record<string, string> = {
  site: "dashboard.tools.names.site",
  posts: "dashboard.tools.names.posts",
  images: "dashboard.myStuff.filters.images",
  video: "dashboard.myStuff.filters.video",
  documents: "dashboard.myStuff.filters.documents",
};

/**
 * THE READ-ONLY PUBLIC PAGE A SHARE LINK RESOLVES TO (Projects Κομμάτι 7,
 * owner's message 2026-10-28).
 *
 * NO SESSION, so this is the one place in the app that reads a project
 * by a SECRET rather than by RLS: createAdminClient() bypasses RLS
 * entirely, and loadProjectDetail()'s own `.eq("id", projectId)` (no
 * `user_id` filter — ownership is normally the caller's RLS context,
 * which does not exist here) is exactly why the LOOKUP here is by
 * share_token first, admin-client, selecting ONLY `id` — the project id
 * this reaches is never attacker-chosen, it is whatever share_token
 * resolved to, same shape as every token-gated public page needs.
 *
 * NOTES ARE NEVER SHOWN. loadProjectDetail()'s own return value DOES
 * carry `header.notes` (it is one function for both the owner's page and
 * this one, on purpose — see that file's own comment), but nothing below
 * reads `detail.header.notes`: a Server Component only ships what its
 * JSX actually renders, so the private "What Ionexa knows" paragraph
 * never reaches this page's HTML, let alone a stranger's browser.
 *
 * REVOKED AND NEVER-EXISTED LOOK IDENTICAL. A token that resolves to
 * nothing says the same "this link isn't available" either way — there
 * is no way for a visitor to tell a live project apart from one that was
 * never shared, which is the only safe answer to "did this specific
 * token ever work?".
 */
export default async function SharedProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("projects");
  const tKey = await getTranslations();

  const admin = createAdminClient();
  const { data: byToken } = await admin.from("projects").select("id").eq("share_token", token).maybeSingle();

  if (!byToken) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t("share.public.notFound.heading")}</h1>
        <p className="mt-2 text-sm text-muted">{t("share.public.notFound.body")}</p>
      </main>
    );
  }

  // admin CLIENT, NOT createClient(): there is no session for RLS to
  // scope to here, and loadProjectDetail()'s own query has no user_id
  // filter — it trusts whatever client it is handed, the same as every
  // other admin-client call in this app (api/projects/[id]/share's own
  // POST/DELETE use the person's own client instead, for the opposite
  // reason: there, a real session IS what proves ownership).
  const detail = await loadProjectDetail(admin as unknown as Parameters<typeof loadProjectDetail>[0], String(byToken.id));
  if (!detail) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t("share.public.notFound.heading")}</h1>
        <p className="mt-2 text-sm text-muted">{t("share.public.notFound.body")}</p>
      </main>
    );
  }

  const kindCounts = projectKindCounts(detail.members);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("share.public.readOnly")}</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{detail.header.name}</h1>
      {detail.header.goal && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-foreground">{t("sections.goal")}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{detail.header.goal}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-5 gap-2">
        {PROJECT_KIND_TABLES.map(({ kind }) => (
          <div key={kind} className="surface-tight text-center">
            <p className="text-lg font-semibold text-foreground">{kindCounts[kind]}</p>
            <p className="text-[11px] text-muted">{tKey(KIND_LABEL_KEYS[kind])}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 surface">
        <h2 className="text-sm font-semibold text-foreground">{t("sections.activity")}</h2>
        {detail.members.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("sections.empty")}</p>
        ) : (
          // READ-ONLY: plain text, no Link anywhere — each tool's own page
          // needs a session this visitor does not have, so a link here
          // would only ever dead-end at a login wall.
          <ul className="mt-2 divide-y divide-border">
            {detail.members.slice(0, 10).map((member) => (
              <li key={`${member.table}:${member.id}`} className="py-2 text-sm text-foreground">
                {member.headline || t("untitled")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
