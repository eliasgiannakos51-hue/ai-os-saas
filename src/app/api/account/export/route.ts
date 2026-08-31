import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { exportableTables, redactRow } from "@/lib/gdpr/user-data-registry";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A full export reads ~60 tables. Each one is a fast indexed lookup on
// user_id, but a heavy account (thousands of chat messages, hundreds of
// website versions) can still take a while, and this must not be cut off
// half-written — a truncated export that still says "your data" is worse
// than a slow one.
export const maxDuration = 120; // @function-limit 120

// Rows per table. A ceiling exists so one enormous table cannot blow the
// function's memory and fail the whole export; when it bites, the export
// says so IN the file rather than silently returning a prefix.
const MAX_ROWS_PER_TABLE = 50_000;

// FIVE AN HOUR. A right of access is a right, not a rate — but one
// request here is ninety-two sequential queries and up to two minutes of
// function time, and nothing bounded it. A signed-in account could hold
// the connection pool open against everybody else on the instance for as
// long as it liked, at no cost to itself. Five is far more than anybody
// exercising Article 15 needs and far fewer than a loop.
const EXPORT_MAX_PER_HOUR = 5;
const EXPORT_WINDOW_MINUTES = 60;

/**
 * GDPR Article 15 — the user's complete personal data, as JSON.
 *
 * Moved server-side from components/settings/export-data-button.tsx,
 * which queried CLASSIFIER_MODULES directly from the browser. That
 * shape had two problems beyond the missing tables: RLS silently
 * returned an empty array for any table whose policy the client could
 * not satisfy (so a failure looked like "you have no data"), and adding
 * a table to the app never added it to the export.
 *
 * Reads run under the user's OWN session, not the service role — RLS is
 * the second line of defence behind the explicit user_id filter, so a
 * bug in this route cannot hand one user another user's rows.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Per account, not per IP: the cost is in the queries this user's
    // rows require, and an IP bucket would let one account spread the
    // load across connections while blocking a household behind one NAT.
    const { allowed } = await checkRateLimit({
      scope: "account_export",
      identifier: user.id,
      maxAttempts: EXPORT_MAX_PER_HOUR,
      windowMinutes: EXPORT_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `You can download a full export ${EXPORT_MAX_PER_HOUR} times an hour. Please try again shortly — your data is not going anywhere.`,
        },
        { status: 429 }
      );
    }

    const tables = exportableTables();
    const data: Record<string, unknown> = {};
    const problems: { table: string; error: string }[] = [];
    const truncated: string[] = [];

    // Sequential, not Promise.all: ~60 concurrent statements from one
    // request is a good way to exhaust the connection pool for everyone
    // else on the instance. An export is not latency-sensitive.
    for (const t of tables) {
      const { data: rows, error } = await supabase
        .from(t.table)
        .select("*")
        .eq("user_id", user.id)
        .limit(MAX_ROWS_PER_TABLE);

      if (error) {
        // A missing table (migration not applied on this deployment) is
        // not a failure of the export — but it IS recorded, so the file
        // never implies "you had nothing here" when the truth is "we
        // could not read it".
        problems.push({ table: t.table, error: error.message });
        continue;
      }

      const list = rows ?? [];
      if (list.length >= MAX_ROWS_PER_TABLE) truncated.push(t.table);
      data[t.label] = list.map((row) => redactRow(row as Record<string, unknown>, t.redactColumns));
    }

    const payload = {
      export_format_version: 2,
      generated_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        // user_metadata carries the plan slug, persona name and
        // preferences — all of it the user's own data.
        metadata: user.user_metadata ?? {},
      },
      // Stated in the file itself so the export is self-describing: a
      // person reading it later can tell what was covered without
      // reading our source.
      notes: {
        tables_exported: tables.length,
        redacted_fields:
          "Secrets that belong to your account (OAuth tokens, push keys, device hashes) are shown as [redacted]. They are credentials, not information about you — exporting them verbatim would put your connected accounts at risk if this file were ever shared.",
        ...(truncated.length > 0
          ? {
              truncated_tables: truncated,
              truncated_note: `These tables were capped at ${MAX_ROWS_PER_TABLE} rows. Contact support for a complete extract.`,
            }
          : {}),
        ...(problems.length > 0 ? { unreadable_tables: problems } : {}),
      },
      data,
    };

    const filename = `ionexa_export_${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        // octet-stream, not application/json.
        //
        // Content-Disposition: attachment is correct and was already here,
        // but Safari has a long history of rendering application/json
        // inline regardless — and this route is also reachable by direct
        // navigation, where the header is the ONLY thing deciding. A type
        // the browser has no viewer for removes the decision.
        //
        // filename* as well as filename: the RFC 5987 form is what
        // survives a non-ASCII filename, and it costs nothing to send
        // both.
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        // Belt and braces against a browser that sniffs its way back to
        // rendering the payload.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logApiError("/api/account/export", err);
    return NextResponse.json(
      { ok: false, error: "Could not build your export. Please try again." },
      { status: 500 }
    );
  }
}
