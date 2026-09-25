import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEMORY_SURFACE_IDS, isMemorySurface } from "@/lib/memory/surfaces";
import { MEMORY_DISABLED_KEY, disabledSurfaces } from "@/lib/memory/memory-policy";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * "DO NOT REMEMBER IN THIS FEATURE" — one switch per feature.
 *
 * WHAT IS STORED IS WHAT IS OFF, not what is on. A map of
 * `{website: true, ...}` has to be written before a feature works, so a
 * surface added later would be silently off for everybody who signed up
 * before it existed — and nothing could report that, because "no entry"
 * and "switched off" look identical. See lib/memory/memory-policy.ts.
 *
 * ONE SWITCH, BOTH DIRECTIONS. Turning a feature off stops it READING the
 * memory and stops it WRITING to it, because memoryActiveFor is the only
 * predicate either side asks. lib/chat/memory-policy.ts records what it
 * cost the last time a read and a write disagreed about whether a feature
 * was on: a second paid model call per message, producing rows nothing
 * would ever read back.
 *
 * THE FULL LIST IS SENT, NOT A DELTA. A PATCH that toggled one surface
 * would race a second tab: two switches flipped at once and the later
 * write would carry a list built before the earlier one landed. The
 * browser sends what the switches now say and the server replaces the
 * value.
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

    let requested: unknown;
    try {
      requested = (await request.json())?.disabled;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (!Array.isArray(requested)) {
      return NextResponse.json(
        { ok: false, error: "Send `disabled` as an array of feature ids." },
        { status: 400 }
      );
    }
    // UNKNOWN NAMES ARE REFUSED, NOT DROPPED. Silently ignoring one means
    // the switch a person just moved appears to have done nothing, and
    // they try again. The list is short and closed; naming the bad entry
    // is cheap.
    const bad = requested.filter((s) => !isMemorySurface(s));
    if (bad.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Not a feature that remembers: ${bad.map(String).join(", ")}. Known: ${MEMORY_SURFACE_IDS.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const disabled = [...new Set(requested.filter(isMemorySurface))].sort();
    const { data, error } = await supabase.auth.updateUser({
      data: { [MEMORY_DISABLED_KEY]: disabled },
    });
    if (error) {
      logApiError("/api/memory/surfaces", error, { stage: "update_user", userId: user.id });
      return NextResponse.json(
        { ok: false, error: "Could not save that. Please try again." },
        { status: 500 }
      );
    }

    // THE STATE THE USER SEES IS THE ONE THAT WAS WRITTEN, read back out
    // of the updated user rather than echoing the request. A switch that
    // reports what was ASKED FOR rather than what was STORED is how a
    // failed write looks like a success.
    return NextResponse.json({ ok: true, disabled: disabledSurfaces(data.user) });
  } catch (err) {
    logApiError("/api/memory/surfaces", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
