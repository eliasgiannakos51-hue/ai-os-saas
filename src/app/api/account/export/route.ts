import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  EXCLUDED_TABLES,
  EXPORTED_TABLES,
  MAX_ROWS_PER_TABLE,
} from "@/lib/gdpr/export-manifest";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * GDPR Article 20 — take your data with you.
 *
 * Returns one JSON file containing every row this product holds about
 * the caller, table by table, plus a manifest explaining what is in it
 * and what is deliberately not.
 *
 * READ THROUGH THE CALLER'S OWN CLIENT, not the service-role one. That
 * is the whole security design: every query is subject to the same RLS
 * policies as the rest of the app, so an export cannot return a row the
 * caller could not already read. A service-role export with a `user_id`
 * filter would work identically until the day a table name or a scope
 * column is wrong in the manifest, and then it would hand somebody else's
 * rows to whoever asked. Here that same mistake returns nothing.
 *
 * The failures are REPORTED, never swallowed. A table that errors
 * appears in the manifest with its error, and a table that hit the row
 * cap says so. An export that silently drops a table is indistinguishable
 * from an account that never had that data — which is the specific way
 * this obligation gets failed while appearing to be met.
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

    // Low, because this is expensive and nobody needs it often. Three an
    // hour is a person retrying after a failed download; more than that
    // is a script.
    const limited = await checkRateLimit({
      scope: "account_export",
      identifier: user.id,
      maxAttempts: 3,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "You can export your data a few times an hour. Try again shortly." },
        { status: 429 }
      );
    }

    const data: Record<string, unknown[]> = {};
    const problems: { table: string; error: string }[] = [];
    const truncated: string[] = [];

    // Sequential, not parallel. Sixty concurrent queries against one
    // connection pool is how an export takes the rest of the app down
    // with it, and nobody is waiting on this in a hurry.
    for (const entry of EXPORTED_TABLES) {
      const { data: rows, error } = await supabase
        .from(entry.table)
        .select(entry.select ?? "*")
        .eq(entry.column, user.id)
        .limit(MAX_ROWS_PER_TABLE);

      if (error) {
        logApiError("/api/account/export", error, { table: entry.table });
        problems.push({ table: entry.table, error: "could not be read" });
        continue;
      }
      data[entry.table] = rows ?? [];
      if ((rows?.length ?? 0) >= MAX_ROWS_PER_TABLE) truncated.push(entry.table);
    }

    const payload = {
      // A README first, because the person opening this file is a person.
      readme: [
        "This file contains the data Ionexa AI holds about your account.",
        "It is provided under Article 20 of the GDPR (data portability).",
        "",
        "`data` holds one entry per table, keyed by table name.",
        "`manifest` lists what was included, what was deliberately left out and why,",
        "and anything that could not be read or was truncated.",
        "",
        "NOT INCLUDED: the raw bytes of files you uploaded. The extracted text of",
        "each file is in `data.user_files`; the original documents stay in private",
        "storage and can be downloaded individually from the Files page.",
        "Your connected-account tokens are also excluded — they are encrypted",
        "credentials for services that are not ours, and putting them in a",
        "downloadable file would put you at risk rather than serve you.",
      ].join("\n"),
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      manifest: {
        tablesIncluded: EXPORTED_TABLES.map((t) => t.table),
        tablesExcluded: EXCLUDED_TABLES,
        // Named explicitly rather than left to be inferred from a short
        // array — "your chat history stops at 5,000 messages" is
        // something a person has to be told, not something they should
        // have to count.
        truncatedAtRowCap: truncated,
        rowCap: MAX_ROWS_PER_TABLE,
        couldNotBeRead: problems,
      },
      data,
    };

    const body = JSON.stringify(payload, null, 2);
    const filename = `ionexa-data-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // The filename is entirely server-generated (a fixed prefix and
        // a date), so nothing user-controlled reaches this header.
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logApiError("/api/account/export", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
