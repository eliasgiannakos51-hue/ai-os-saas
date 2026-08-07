import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { normaliseSlides, withUniqueIds } from "@/lib/presentations/slides";
import { PrintDeck } from "@/components/presentations/print-deck";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Print presentation" };

/**
 * The PDF export.
 *
 * There is no PDF writer in this codebase and deliberately so. A deck's
 * appearance is defined by a CSS renderer (components/presentations/
 * slide-view.tsx); a hand-written PDF generator would be a SECOND layout
 * engine that has to agree with the first about five themes, eight
 * layouts, text wrapping and web fonts — and the day it disagrees, the
 * file the user sends out is not the deck they approved.
 *
 * The browser's own print pipeline renders the exact component, with the
 * exact fonts, and writes a PDF. "Save as PDF" is in every print dialog
 * on every platform. The cost is one extra click; the benefit is that
 * the PDF cannot drift from the screen because it IS the screen.
 *
 * PPTX gets the opposite treatment (lib/presentations/pptx.ts, written
 * by hand) because it is not a rendering — it is a document the
 * recipient will open and edit, and a PDF of slides is not that.
 */
export default async function PrintPresentationPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.presentations");

  const { data: deck } = await supabase
    .from("user_presentations")
    .select("id, title, theme, slides")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!deck) {
    notFound();
  }

  return (
    <PrintDeck
      title={deck.title ?? ""}
      themeId={deck.theme ?? "professional"}
      slides={withUniqueIds(normaliseSlides(deck.slides))}
      printLabel={t("print")}
      hint={t("printHint")}
    />
  );
}
