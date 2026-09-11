import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MODULE_TITLE_KEYS } from "@/lib/search/module-title-keys";
import { PageHeader } from "@/components/dashboard/page-header";
import { readExampleParam } from "@/lib/overview/first-screen-examples";
import { MODULE_ICONS } from "@/lib/module-icons";
import { CREATE_ATTACHMENT_BUCKET } from "@/lib/create-attachment-image";
import { isUnsplashConfigured } from "@/lib/unsplash";
import { parseStoredDeck } from "@/lib/presentations/deck";
import {
  PresentationsWorkspace,
  type DeckRow,
  type NoteRow,
} from "@/components/presentations/presentations-workspace";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  // NOT the literal: the key already lives in MODULE_TITLE_KEYS for the
  // search filter chips, and — as with coding and data-analysis — this
  // makes it the only place it lives.
  return pageTitle(MODULE_TITLE_KEYS.presentations);
}

/** Signed URLs live this long; the page is re-rendered on every visit. */
const OWN_IMAGE_URL_TTL_SECONDS = 60 * 60;

// /dashboard/presentations was a CRUD form for noting decks the user
// would go and make elsewhere. This is the version that makes them: a
// brief in, slides out, .pptx and PDF on the way out — and four things it
// still does not do, stated on the screen by PresentationsWorkspace
// rather than left to the name.
// `?record=<id>` IS READ HERE. A starred presentation links to
// /dashboard/presentations?record=<id> (lib/favoritable.ts), and the
// tracker's GenericList used to open that row; a page that took over the
// route and dropped the id would be the defect scripts/tests/
// deep-links.test.mjs was written for — the link works, the page loads,
// and the reader sees the newest deck instead of theirs.
export default async function PresentationsPage({
  searchParams,
}: {
  searchParams?: { record?: string; brief?: string };
}) {
  const t = await getTranslations("presentations");
  const requestedRecord = typeof searchParams?.record === "string" ? searchParams.record : null;
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS scopes this to the caller. The hand-typed notes from the old
  // form are in here too, marked `source = 'note'` — see the 20260929
  // migration.
  const { data: rows } = await supabase
    .from("ai_presentations")
    .select("id, title, description, slide_count, slides, image_source, source, error, credits_charged, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  const decks: DeckRow[] = [];
  const notes: NoteRow[] = [];
  for (const row of rows ?? []) {
    if (row.source === "generated") {
      decks.push({
        id: String(row.id),
        title: String(row.title ?? ""),
        deck: parseStoredDeck(row.slides),
        error: (row.error as string | null) ?? null,
        creditsCharged: Number(row.credits_charged ?? 0),
        createdAt: String(row.created_at ?? ""),
      });
    } else {
      notes.push({
        id: String(row.id),
        title: String(row.title ?? ""),
        description: (row.description as string | null) ?? null,
        slideCount: (row.slide_count as number | null) ?? null,
        createdAt: String(row.created_at ?? ""),
      });
    }
  }

  // The person's own photos live in a PRIVATE bucket; the viewer gets a
  // signed URL per path, minted through the same session client, so a
  // path that is not theirs signs nothing.
  const ownPaths = [
    ...new Set(
      decks.flatMap((d) => d.deck?.slides.map((s) => (s.image?.kind === "own" ? s.image.path : null)) ?? [])
    ),
  ].filter((p): p is string => Boolean(p));
  const ownImageUrls: Record<string, string> = {};
  if (ownPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(CREATE_ATTACHMENT_BUCKET)
      .createSignedUrls(ownPaths, OWN_IMAGE_URL_TTL_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) ownImageUrls[entry.path] = entry.signedUrl;
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        icon={MODULE_ICONS.presentations}
        title={t("title")}
        description={t("description")}
        helpKey="help.presentations"
      />
      <PresentationsWorkspace
        initialDescription={readExampleParam(searchParams?.brief)}
        decks={decks}
        notes={notes}
        ownImageUrls={ownImageUrls}
        unsplashConfigured={isUnsplashConfigured()}
        requestedRecord={requestedRecord}
      />
    </div>
  );
}
