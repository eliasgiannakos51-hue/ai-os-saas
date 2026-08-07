import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { normaliseSlides, withUniqueIds } from "@/lib/presentations/slides";
import {
  PresentationEditor,
  type PresentationRecord,
  type VersionRecord,
} from "@/components/presentations/presentation-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Presentation" };

export default async function PresentationPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.presentations");

  // Ownership is a filter on the query, and a miss is a 404 — never a
  // 403, which would confirm that somebody else's id exists.
  const { data: deck } = await supabase
    .from("user_presentations")
    .select("id, title, brief, language, theme, slides, sources, share_slug, share_enabled")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!deck) {
    notFound();
  }

  const { data: versions } = await supabase
    .from("presentation_versions")
    .select("version_number, change_summary, created_at")
    .eq("presentation_id", params.id)
    .eq("user_id", user.id)
    .order("version_number", { ascending: false });

  // Normalised on the way OUT of the database as well as on the way in.
  // The column is jsonb, so its shape is whatever was last written to
  // it — including by a version of this code that is no longer running.
  const record: PresentationRecord = {
    id: deck.id,
    title: deck.title ?? "",
    brief: deck.brief ?? "",
    language: deck.language ?? "en",
    theme: deck.theme ?? "professional",
    slides: withUniqueIds(normaliseSlides(deck.slides)),
    sources: Array.isArray(deck.sources) ? (deck.sources as { title: string; url: string }[]) : [],
    share_slug: deck.share_slug,
    share_enabled: deck.share_enabled,
  };

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/dashboard/presentations"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          {t("backToList")}
        </Link>

        <PresentationEditor
          presentation={record}
          versions={(versions ?? []) as unknown as VersionRecord[]}
        />
      </div>
    </main>
  );
}
