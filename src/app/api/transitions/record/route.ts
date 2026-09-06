import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { destinationById } from "@/lib/transitions/destinations";

export const dynamic = "force-dynamic";

/** The three things that can happen to a button, and nothing else. Kept
 *  here as well as in the CHECK constraint on purpose: the constraint is
 *  what survives a second writer, this is what gives that writer a 400
 *  instead of a 500. */
const OUTCOMES = ["shown", "taken", "dismissed"] as const;
const SOURCES = ["offline", "model"] as const;

/**
 * Record one transition-button event.
 *
 * WHY THIS EXISTS AT ALL. nav_events already records a button that was
 * TAKEN — the navigation lands there like any other. It records neither
 * how often one was OFFERED nor how often one was refused, so a
 * suggestion that irritated every user on every answer looked exactly
 * like one nobody ever needed. Without both halves, "it suggests the
 * wrong thing too often" is an argument that can never be settled.
 *
 * THE DESTINATION IS VALIDATED AGAINST THE CLOSED LIST, HERE, NOT
 * TRUSTED FROM THE BODY. destinationById() returns null for anything that
 * is not one of the five ids this app can produce — so a hand-written
 * POST cannot put free text in a column whose whole claim is that it
 * contains no free text. The CHECK constraint in the migration is the
 * second line of that defence, for the day somebody adds a writer and
 * forgets this one.
 *
 * THROUGH THE CALLER'S OWN CLIENT, never createAdminClient. `user_id`
 * comes from auth.getUser(), and the row is written under the caller's
 * JWT so the insert policy (`auth.uid() = user_id`) is what makes "a user
 * may only record their own suggestions" true rather than intended.
 *
 * FAILS QUIET, for nav/track's reason: this runs on ordinary UI events
 * and a missed row costs one entry in a ninety-day window, while an error
 * toast on an answer that rendered perfectly costs the reader's trust.
 * The two non-200s are the ones a caller can act on — no session (401)
 * and a body this route refuses (400) — which is also how the dbtest can
 * tell "rejected" from "accepted and dropped".
 *
 * AND A CODE, NEVER A SENTENCE, IN ANY OF THOSE BODIES. The first draft of
 * this route wrote `error: "Unknown destination."` under a comment that
 * cited nav/track — which returns a bare status for exactly this case, and
 * says why: nothing renders these bodies (the only caller is record() in
 * components/transitions/transition-button.tsx, which discards the
 * response), so an English sentence here is one more untranslated string
 * on a server route and nothing else. i18n-coverage.test.mjs counted all
 * three and went red. The `reason` codes below are what a curl and a log
 * line need, in the shape api/websites/edit already uses.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { destination?: unknown; source?: unknown; outcome?: unknown }
      | null;

    const destination = typeof body?.destination === "string" ? destinationById(body.destination) : null;
    if (!destination) {
      return NextResponse.json({ ok: false, reason: "unknown_destination" }, { status: 400 });
    }
    const source = SOURCES.find((s) => s === body?.source);
    const outcome = OUTCOMES.find((o) => o === body?.outcome);
    if (!source || !outcome) {
      return NextResponse.json({ ok: false, reason: "unknown_source_or_outcome" }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
    }

    // ONE ROW PER EVENT AND THREE EVENTS PER ANSWER AT MOST, so the limit
    // is generous — it is here to stop a loop, not to shape behaviour.
    const limited = await checkRateLimit({
      scope: "transition_record",
      identifier: user.id,
      maxAttempts: 240,
      windowMinutes: 1,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: true, recorded: false });
    }

    const { error } = await supabase
      .from("transition_suggestions")
      .insert({ user_id: user.id, destination: destination.id, source, outcome });

    if (error) {
      logApiError("/api/transitions/record", error, { stage: "insert" });
      return NextResponse.json({ ok: true, recorded: false });
    }

    return NextResponse.json({ ok: true, recorded: true });
  } catch (err) {
    logApiError("/api/transitions/record", err, {});
    return NextResponse.json({ ok: true, recorded: false });
  }
}
