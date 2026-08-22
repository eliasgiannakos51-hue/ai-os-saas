import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseRulesFromText } from "@/lib/trading/rules";

export const dynamic = "force-dynamic";

// The user's own trading rules.
//
// NO MODEL CALL, NO CREDITS. Parsing happens in lib/trading/rules.ts,
// which is pure — the same code the browser ran to show the user what it
// understood before they pressed save. Re-parsing here rather than
// trusting the client's parse is the ordinary reason: a client can post
// anything, and a rule is what the Strategy Guardian will measure
// somebody's trading against.
//
// WHAT THIS ROUTE CANNOT DO. It cannot store a rule it did not
// understand. A sentence that parses to nothing is refused, because a
// rule sitting in the list, marked active, that can never fire is worse
// than no rule at all — the user believes they are being watched.

const MAX_TEXT = 2000;

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "trading_rules",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many rule changes in the last hour." },
        { status: 429 }
      );
    }

    let body: { originalText?: unknown; accountId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid request body." }, { status: 400 });
    }

    const originalText = typeof body.originalText === "string" ? body.originalText.trim() : "";
    if (!originalText) {
      return NextResponse.json({ ok: false, code: "empty_rule", error: "Write the rule in your own words first." }, { status: 400 });
    }
    if (originalText.length > MAX_TEXT) {
      return NextResponse.json({ ok: false, code: "too_long", error: "That is longer than a rule needs to be." }, { status: 400 });
    }
    const accountId = typeof body.accountId === "string" && body.accountId ? body.accountId : null;

    const parsed = parseRulesFromText(originalText);
    if (parsed.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "not_understood",
          error: "That rule could not be turned into something checkable, so it was not saved.",
        },
        { status: 422 }
      );
    }

    // THE CALLER'S OWN CLIENT, not the admin one. The insert goes through
    // the RLS policy, so a user_id that is not theirs is refused by the
    // database rather than by this route remembering to check.
    const rows = parsed.map((rule) => ({
      user_id: user.id,
      account_id: accountId,
      // Each rule keeps the CLAUSE it came from, not the whole paragraph:
      // "you broke <the entire four-sentence paragraph> 8 times" is not a
      // sentence anybody can act on.
      original_text: rule.matchedText,
      kind: rule.params.kind,
      params: paramsWithoutKind(rule.params),
      source: "manual" as const,
    }));

    const { error } = await supabase.from("trading_rules").insert(rows);
    if (error) {
      logApiError("/api/trading/rules", error, { stage: "insert", userId: user.id });
      return NextResponse.json({ ok: false, code: "save_failed", error: "Could not save that rule." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, created: rows.length });
  } catch (err) {
    logApiError("/api/trading/rules", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid request body." }, { status: 400 });
    }

    // The delete policy scopes this to the caller's own rules. The
    // violations already recorded against it SURVIVE — rule_violations
    // holds rule_id ON DELETE SET NULL and carries its own copy of the
    // rule's text, so a March report does not become unreadable because
    // somebody tidied their rules in April.
    const { error } = await supabase.from("trading_rules").delete().eq("id", id);
    if (error) {
      logApiError("/api/trading/rules", error, { stage: "delete", userId: user.id });
      return NextResponse.json({ ok: false, code: "delete_failed", error: "Could not delete that rule." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/trading/rules", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}

/** The jsonb column holds the parameters only; `kind` is its own column,
 *  and storing it twice is storing it in two places that can disagree. */
function paramsWithoutKind(params: { kind: string } & Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...params };
  delete copy.kind;
  return copy;
}
