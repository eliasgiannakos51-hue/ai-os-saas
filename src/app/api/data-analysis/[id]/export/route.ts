import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { toCsv } from "@/lib/data-analysis/store";

export const dynamic = "force-dynamic";

/**
 * EXPORT — the parsed table back out, or the findings as JSON.
 *
 * The CSV is written with proper quoting, so a value containing a comma,
 * a quote or a newline round-trips back through our own parser unchanged.
 * That is the only definition of "export" worth having: a file the user
 * can put somewhere else and still have their data.
 *
 * The filename is sanitised rather than trusted. A stored title
 * containing a quote or a newline would otherwise break out of the
 * Content-Disposition header — a header-injection whose payload is a
 * field the user typed themselves.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

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

    const csv = toCsv((analysis.headers ?? []) as string[], (analysis.rows ?? []) as string[][]);
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
