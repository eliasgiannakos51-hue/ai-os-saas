import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { MAX_PROPOSED_ACTIONS, type ProposedAction } from "@/lib/meetings/meeting-analysis";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * THE ONLY PLACE public.meeting_actions IS EVER WRITTEN.
 *
 * "No action is ever created automatically" is not a rule about
 * intentions here — it is an arrangement. The analysis route writes the
 * model's reading into `meetings.proposed_actions`, a jsonb column that
 * is data about a meeting and an entity nowhere. Nothing becomes an
 * action until this route runs, and this route needs INDEXES the user
 * chose.
 *
 * scripts/tests/meetings.test.mjs holds that: exactly one file in
 * src/app/api inserts into meeting_actions, and it is this one.
 *
 * ---------------------------------------------------------------------
 * THE INDEXES ARE RE-READ, NOT TRUSTED
 * ---------------------------------------------------------------------
 *
 * The browser sends which proposals were ticked. It does NOT send their
 * text. If it did, this route would be a way to write any sentence into
 * somebody's action list and have it look as though a meeting produced
 * it — and the meeting row is the only thing that can say otherwise.
 *
 * So the text comes out of the row, by index, every time.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const meetingId = params.id;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated" },
        { status: 401 }
      );
    }

    const limited = await checkRateLimit({
      scope: "meeting_actions",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited" },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "bad_request" },
        { status: 400 }
      );
    }
    const raw = (body as { keep?: unknown } | null)?.keep;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { ok: false, code: "bad_request" },
        { status: 400 }
      );
    }
    // Whole, in range, de-duplicated, and bounded by the same ceiling the
    // analysis is bounded by. An index list is user input like any other.
    const chosen = [
      ...new Set(
        raw
          .map((value) => Number(value))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < MAX_PROPOSED_ACTIONS)
      ),
    ];
    if (chosen.length === 0) {
      return NextResponse.json(
        { ok: false, code: "nothing_chosen" },
        { status: 400 }
      );
    }

    // Read through the USER'S client, so RLS decides ownership.
    const { data: meeting, error: readError } = await supabase
      .from("meetings")
      .select("id, proposed_actions")
      .eq("id", meetingId)
      .maybeSingle();
    if (readError) {
      logApiError("/api/meetings/[id]/actions", readError, { stage: "read" });
      return NextResponse.json(
        { ok: false, code: "failed" },
        { status: 500 }
      );
    }
    if (!meeting) {
      return NextResponse.json(
        { ok: false, code: "not_found" },
        { status: 404 }
      );
    }

    const proposals: ProposedAction[] = Array.isArray(meeting.proposed_actions)
      ? (meeting.proposed_actions as ProposedAction[])
      : [];

    // Already-kept indexes are skipped rather than duplicated: a double
    // submit, or a second tab, must not put the same sentence in the list
    // twice.
    const { data: existing } = await supabase
      .from("meeting_actions")
      .select("source_index")
      .eq("meeting_id", meetingId);
    const alreadyKept = new Set(
      (existing ?? []).map((r) => r.source_index).filter((n): n is number => typeof n === "number")
    );

    const rows = chosen
      .filter((index) => !alreadyKept.has(index))
      .map((index) => ({ index, proposal: proposals[index] }))
      .filter(
        (entry): entry is { index: number; proposal: ProposedAction } =>
          Boolean(entry.proposal) && typeof entry.proposal.what === "string" &&
          entry.proposal.what.trim().length > 0
      )
      .map((entry) => ({
        user_id: user.id,
        meeting_id: meetingId,
        // NULL, never "". The column is nullable precisely so an action
        // the meeting assigned to nobody stays assigned to nobody — an
        // empty string renders as a blank that looks like a bug and sorts
        // like a name.
        who: entry.proposal.who?.trim() || null,
        what: entry.proposal.what.trim(),
        when_text: entry.proposal.when?.trim() || null,
        // NO DATE IS PARSED HERE. «μέχρι την Παρασκευή» has no date until
        // somebody decides which Friday, and writing one would put a
        // deadline in a list that nobody in the room agreed to.
        due_date: null,
        source_index: entry.index,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, created: 0, actions: [] });
    }

    const { data: created, error: writeError } = await supabase
      .from("meeting_actions")
      .insert(rows)
      .select("id, who, what, when_text, due_date, done, source_index, created_at");
    if (writeError || !created) {
      logApiError("/api/meetings/[id]/actions", writeError, { stage: "insert" });
      return NextResponse.json(
        { ok: false, code: "failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, created: created.length, actions: created });
  } catch (err) {
    logApiError("/api/meetings/[id]/actions", err);
    return NextResponse.json(
      { ok: false, code: "failed" },
      { status: 500 }
    );
  }
}
