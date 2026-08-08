import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { recordLearnedObservation } from "@/lib/learning";
import { MAX_CSV_BYTES, CsvError, parseCsv } from "@/lib/import/csv-parse";
import { getImportTarget, isImportTargetSlug } from "@/lib/import/targets";
import { validateMapping } from "@/lib/import/map-columns";
import { buildRows } from "@/lib/import/build-rows";
import { applyRows, MAX_ROWS_PER_IMPORT } from "@/lib/import/apply";
import type { DateOrder } from "@/lib/import/coerce";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const DATE_ORDERS: DateOrder[] = ["dmy", "mdy", "ymd"];

/**
 * Write the rows the user just confirmed.
 *
 * THE FILE IS SENT AGAIN, and re-parsed here. It would be cheaper to
 * have the analyse step keep the parsed rows and let this route write
 * them from a cache — and it would mean trusting the client's copy of
 * somebody's financial data, or holding every uploaded spreadsheet in
 * server memory between two requests. Re-parsing costs milliseconds and
 * means the bytes that get imported are bytes this route read itself.
 *
 * NO AI CALL, and therefore no credit charge. The mapping was decided in
 * the analyse step and confirmed by the user; applying it is arithmetic.
 * Charging twice for one import would be charging for a database write.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "import_apply",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many imports in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const form = await request.formData().catch(() => null);
    const entry = form?.get("file");
    const rawMapping = form?.get("mapping");

    if (!form || !(entry instanceof File) || typeof rawMapping !== "string") {
      return NextResponse.json({ ok: false, error: "No file was sent." }, { status: 400 });
    }
    if (entry.size > MAX_CSV_BYTES) {
      return NextResponse.json({ ok: false, error: "Spreadsheets must be 5MB or smaller." }, { status: 413 });
    }

    let payload: { targetSlug?: unknown; mappings?: unknown; dateOrder?: unknown };
    try {
      payload = JSON.parse(rawMapping);
    } catch {
      return NextResponse.json({ ok: false, error: "The mapping was not readable." }, { status: 400 });
    }

    if (!isImportTargetSlug(payload.targetSlug)) {
      return NextResponse.json({ ok: false, error: "Unknown destination." }, { status: 400 });
    }
    const target = getImportTarget(payload.targetSlug)!;

    const dateOrder: DateOrder = DATE_ORDERS.includes(payload.dateOrder as DateOrder)
      ? (payload.dateOrder as DateOrder)
      : "dmy";

    const text = await entry.text();
    let parsed;
    try {
      parsed = parseCsv(text);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof CsvError ? `Sorry — ${err.message}.` : "That file could not be read." },
        { status: 400 }
      );
    }

    // The client's mapping goes through the SAME validator the model's
    // proposal did. A mapping that has been through a browser is not more
    // trustworthy for it — this is the only place that decides a mapping
    // is safe to apply.
    const validated = validateMapping({
      target,
      summary: "",
      columns: payload.mappings,
      headers: parsed.headers,
    });
    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, error: "That mapping is missing something required. Check the fields and try again." },
        { status: 400 }
      );
    }

    const built = buildRows({
      target,
      headers: parsed.headers,
      rows: parsed.rows,
      mappings: validated.proposal.mappings,
      dateOrder,
    });

    if (built.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No rows in that file could be imported. Check the required columns." },
        { status: 400 }
      );
    }

    // The import record exists BEFORE the rows, so every row can carry
    // its import id — which is what makes "undo this import" possible at
    // all rather than a guess based on timestamps.
    const { data: importRow, error: importError } = await supabase
      .from("user_imports")
      .insert({
        user_id: user.id,
        source: "csv",
        filename: entry.name.slice(0, 200),
        mapping: { targetSlug: target.slug, mappings: validated.proposal.mappings, dateOrder },
      })
      .select("id")
      .single();

    if (importError || !importRow) {
      logApiError("/api/import/csv/apply", importError, { stage: "insert_import" });
      return NextResponse.json({ ok: false, error: "The import could not be started." }, { status: 500 });
    }

    const result = await applyRows({
      supabase,
      userId: user.id,
      importId: String(importRow.id),
      batches: [{ targetSlug: target.slug, rows: built.rows.slice(0, MAX_ROWS_PER_IMPORT) }],
    });

    await supabase
      .from("user_imports")
      .update({
        rows_imported: result.inserted,
        rows_rejected: built.rejected.length,
        modules: result.byTable,
      })
      .eq("id", importRow.id)
      .eq("user_id", user.id);

    // Learning profile (V3 Task 14): where somebody keeps their real
    // data is the strongest module-preference signal there is.
    if (result.inserted > 0) {
      await recordLearnedObservation(user.id, "modules", `keeps ${target.slug} data here`);
    }

    return NextResponse.json({
      ok: true,
      importId: String(importRow.id),
      imported: result.inserted,
      rejected: built.rejected.length,
      failed: Object.values(result.failed).reduce((a, b) => a + b, 0),
      moduleSlug: target.slug,
      byTable: result.byTable,
    });
  } catch (err) {
    logApiError("/api/import/csv/apply", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
