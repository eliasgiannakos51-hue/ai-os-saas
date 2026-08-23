import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { MAX_UPLOAD_BYTES, readUpload } from "@/lib/data-analysis/store";
import { suggestCharts } from "@/lib/data-analysis/charts";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

/**
 * UPLOADING A SPREADSHEET.
 *
 * NO AI RUNS HERE, and no credits are charged. Parsing, profiling and
 * the first charts are arithmetic — they cost nothing and they work with
 * no API key at all, which is why the page is useful before anything has
 * been analysed. Charging for an upload would be charging for a file
 * read.
 *
 * The reader is chosen by the BYTES, not the file name (lib/data-analysis/store.ts).
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "too_large", limitBytes: MAX_UPLOAD_BYTES }, { status: 400 });
    }

    const sheet = typeof form.get("sheet") === "string" ? String(form.get("sheet")) : undefined;
    const bytes = Buffer.from(await file.arrayBuffer());
    const outcome = readUpload(bytes, sheet);
    if (!outcome.ok) return NextResponse.json({ error: "unreadable", detail: outcome.reason }, { status: 400 });

    const { dataset } = outcome;
    const title = String(form.get("title") ?? "").trim().slice(0, 120) || file.name.slice(0, 120);

    // THROUGH THE ADMIN CLIENT, SCOPED TO THIS USER. The table grants the
    // user insert too, so RLS would serve; going through the service role
    // keeps the row's derived fields (profile, row counts, truncation) out
    // of the browser's reach, so a client cannot claim a file had columns
    // it did not.
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("data_analyses")
      .insert({
        user_id: user.id,
        title,
        source_kind: dataset.sourceKind,
        file_name: file.name.slice(0, 200),
        sheet_name: dataset.sheetName,
        row_count: dataset.rows.length,
        column_count: dataset.headers.length,
        truncated: dataset.truncated,
        ragged_rows: dataset.raggedRows,
        headers: dataset.headers,
        rows: dataset.rows,
        profile: dataset.profile,
      })
      .select("id")
      .single();
    if (error) throw error;

    // THE PAGE IS NOT EMPTY WITHOUT A KEY. These come from the column
    // types alone, so an upload draws something true immediately — and
    // whatever the AI proposes later has to be better than these.
    const suggested = suggestCharts(dataset.profile);
    if (suggested.length > 0) {
      const { error: chartError } = await admin.from("data_analysis_charts").insert(
        suggested.map((spec, index) => ({
          analysis_id: row.id,
          user_id: user.id,
          kind: spec.kind,
          title: spec.title,
          x_column: spec.x,
          y_column: spec.y ?? null,
          aggregation: spec.aggregation,
          reason: spec.reason ?? null,
          origin: "suggested",
          position: index,
        }))
      );
      if (chartError) logApiError("/api/data-analysis/upload", chartError, { stage: "seed_charts" });
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
      rowCount: dataset.rows.length,
      columnCount: dataset.headers.length,
      truncated: dataset.truncated,
      raggedRows: dataset.raggedRows,
      sheetNames: dataset.sheetNames,
    });
  } catch (err) {
    logApiError("/api/data-analysis/upload", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
