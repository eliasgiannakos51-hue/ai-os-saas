import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  deductCredits,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// Same platform-timeout reasoning as api/create/route.ts.
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TEXT_LENGTH = 4000;
const MAX_TOKENS = 2048;

const ACTIONS = ["rewrite", "translate", "improve", "explain"] as const;
type TextAction = (typeof ACTIONS)[number];

function isTextAction(value: unknown): value is TextAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

// One-shot, non-conversational prompts — each takes the user's selected
// text and returns a single replacement candidate, never a back-and-forth.
// "Explain" is the odd one out (a genuine rewrite doesn't apply to it) but
// still returns plain replacement text, matching the same accept/reject
// flow the other three use, rather than a different response shape.
const SYSTEM_PROMPTS: Record<TextAction, string> = {
  rewrite:
    "Rewrite the given text to be clearer and better structured, preserving its original meaning and its original language. Return ONLY the rewritten text — no preamble, no quotes, no explanation.",
  translate:
    "If the given text is already in English, translate it to Greek. Otherwise, translate it to English. Return ONLY the translated text — no preamble, no quotes, no explanation.",
  improve:
    "Improve the given text — fix grammar and spelling, tighten the wording, keep the original meaning and language intact. Return ONLY the improved text — no preamble, no quotes, no explanation.",
  explain:
    "Explain the given text in simple, plain language, in the same language it's written in. Return ONLY the explanation — no preamble, no quotes.",
};

// Selection-triggered text actions (see components/text-actions/) for
// notes/description fields across the modules. Same credits-based gate as
// Ionexa Chat / Create Anything — 1 credit per action, admin bypass.
// Single non-streaming response since these are short, one-shot rewrites,
// not a conversation.
export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let action: TextAction;
    let text: string;
    try {
      const body = await request.json();
      if (!isTextAction(body?.action)) {
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
      }
      action = body.action;
      text = typeof body?.text === "string" ? body.text.trim() : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ ok: false, error: "No text selected." }, { status: 400 });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Selection is too long (${text.length}/${MAX_TEXT_LENGTH} characters) — select less text and try again.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(user.id, "text_action", fingerprintRequest(action, text));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: false, error: breakerCheck.reason }, { status: 429 });
    }

    // Credits: read-only check first, actual deduct only after the
    // Anthropic call has confirmed-successfully returned real text —
    // nothing is persisted server-side for this feature (the client
    // accepts/rejects the result itself), so a successful, non-empty
    // response IS the confirmed success here.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;
    if (!bypassCredits) {
      plan = await resolveEffectivePlan(user);
      const check = await hasEnoughCredits(user.id, CREDIT_COSTS.textAction, plan);
      if (!check.ok) {
        return NextResponse.json(
          {
            ok: false,
            insufficientCredits: true,
            error: insufficientCreditsMessage(check.remaining, CREDIT_COSTS.textAction),
          },
          { status: 402 }
        );
      }
    }

    const anthropic = new Anthropic({ apiKey });

    try {
      void recordAiCallForDailySpend(CREDIT_COSTS.textAction);
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPTS[action],
        messages: [{ role: "user", content: text }],
      });

      const block = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const result = block?.text?.trim();

      if (!result) {
        return NextResponse.json(
          { ok: false, error: "The model did not return a result. No credits were charged — please try again." },
          { status: 502 }
        );
      }

      if (!bypassCredits && plan) {
        await deductCredits(user.id, CREDIT_COSTS.textAction, "text_action", `Text action — ${action}`, plan);
      }

      return NextResponse.json({ ok: true, result });
    } catch (err) {
      logApiError("/api/text-actions", err, { stage: "anthropic_call", action });
      const errMessage = err instanceof Error ? err.message : "Request failed.";
      return NextResponse.json(
        { ok: false, error: `${errMessage} No credits were charged — please try again.` },
        { status: 502 }
      );
    }
  } catch (err) {
    logApiError("/api/text-actions", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
