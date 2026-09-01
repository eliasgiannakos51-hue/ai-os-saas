import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadSampleData, clearSampleData, findSampleImport } from "@/lib/sample-data/apply";
import { SAMPLE_ROW_COUNT } from "@/lib/sample-data/dataset";

export const dynamic = "force-dynamic";

// Load and clear the sample account.
//
// NO CREDITS ARE SPENT HERE, and that is deliberate rather than an
// oversight: nothing on this path calls a model. The rows are a constant
// in lib/sample-data/dataset.ts. What the user does with them afterwards
// — asking the chat about them — charges exactly what any other question
// charges, which is the honest answer to "is the demo free": looking is
// free, asking is not.
//
// Rate-limited because it writes thirty-six rows across four tables and
// is reachable by anybody with an account. The limit is deliberately
// tight; a user needs this once.

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const limit = await checkRateLimit({
    scope: "sample-data",
    identifier: user.id,
    maxAttempts: 5,
    windowMinutes: 60,
  });
  if (!limit.allowed) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });

  // Date.now() is read HERE and passed in, so the dataset module stays
  // pure and a test can materialise it at a fixed moment.
  const result = await loadSampleData(supabase, user.id, Date.now());
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: result.reason === "already_loaded" ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, inserted: result.inserted, expected: SAMPLE_ROW_COUNT });
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const limit = await checkRateLimit({
    scope: "sample-data",
    identifier: user.id,
    maxAttempts: 5,
    windowMinutes: 60,
  });
  if (!limit.allowed) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });

  const result = await clearSampleData(supabase, user.id);
  return NextResponse.json({ ok: true, deleted: result.deleted });
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const existing = await findSampleImport(supabase, user.id);
  return NextResponse.json({ ok: true, loaded: Boolean(existing) });
}
