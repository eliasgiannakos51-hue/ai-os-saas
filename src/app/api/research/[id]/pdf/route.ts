import { NextResponse } from "next/server";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { markdownToBlocks, text, type PdfBlock } from "@/lib/pdf/blocks";
import { PdfDocument } from "@/lib/pdf/document";
import { pdfResponse } from "@/lib/pdf/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Section = { heading?: unknown; body?: unknown; sourceIndexes?: unknown };
type Source = { title?: unknown; url?: unknown };

/**
 * A finished research report, as a PDF.
 *
 * BUILT FROM `sections`, NOT FROM THE SAVED HTML. The report is also written
 * into user_documents so it lives beside the user's other writing, and that
 * copy could be rendered by the Documents route instead. It is not, for two
 * reasons: the document copy is editable, so a report the user has since
 * pruned would download as the pruned version under the word "report"; and
 * `sources` are a column of their own, which the HTML flattens into a list
 * of links whose numbering no longer ties back to the claims that cite them.
 *
 * The row is read under the user's own session, so row level security is
 * what decides whether it may be read.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const { data: report, error } = await supabase
      .from("research_reports")
      .select("topic, language, status, sections, sources, completed_at, created_at")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // A report that is still running has no sections. Rendering it would
    // produce a PDF with a title and nothing under it, which reads as "the
    // research found nothing" rather than "it has not finished".
    if (report.status !== "ready") {
      return NextResponse.json({ error: "not_ready", status: report.status }, { status: 409 });
    }

    const sections: Section[] = Array.isArray(report.sections) ? report.sections : [];
    const sources: Source[] = Array.isArray(report.sources) ? report.sources : [];

    const blocks: PdfBlock[] = [];
    for (const section of sections) {
      const heading = typeof section.heading === "string" ? section.heading.trim() : "";
      if (heading) blocks.push({ kind: "heading", level: 2, runs: text(heading) });
      const body = typeof section.body === "string" ? section.body : "";
      blocks.push(...markdownToBlocks(body));
    }

    if (sources.length > 0) {
      blocks.push({ kind: "rule" });
      blocks.push({ kind: "heading", level: 2, runs: text("Sources") });
      sources.forEach((source, i) => {
        const title = typeof source.title === "string" && source.title.trim() ? source.title.trim() : "Untitled";
        const url = typeof source.url === "string" ? source.url : "";
        // NUMBERED THE WAY THE BODY CITES THEM. The sections carry
        // sourceIndexes into this array, so the marker has to be the index
        // and not a bullet, or a citation in the text points at nothing.
        blocks.push({
          kind: "listItem",
          marker: `${i + 1}.`,
          runs: url ? text(title, { href: url }) : text(title),
        });
      });
    }

    const topic = String(report.topic ?? "").trim() || "Research report";
    const when = String(report.completed_at ?? report.created_at ?? "");
    const element = React.createElement(PdfDocument, {
      title: topic,
      subtitle: when ? new Date(when).toISOString().slice(0, 10) : undefined,
      blocks,
      // The report was written in the language the user asked for, and that
      // column records which one.
      locale: typeof report.language === "string" ? report.language : "en",
      footerNote: "Researched with AI — check the sources",
    });
    return await pdfResponse(element, { filename: topic, fallbackName: "research-report" });
  } catch (err) {
    logApiError("/api/research/[id]/pdf", err, { stage: "render" });
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
