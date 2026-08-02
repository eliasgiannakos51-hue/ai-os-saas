import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { isBetaTester } from "@/lib/beta";
import { CREDIT_COSTS, deductCredits, insufficientCreditsMessage, resolvePlan } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

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

    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin && !isBetaTester(user)) {
      const plan = resolvePlan(user);
      const deduction = await deductCredits(
        user.id,
        CREDIT_COSTS.textAction,
        "text_action",
        `Text action — ${action}`,
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: insufficientCreditsMessage() },
          { status: 402 }
        );
      }
    }

    const anthropic = new Anthropic({ apiKey });

    try {
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
          { ok: false, error: "The model did not return a result." },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, result });
    } catch (err) {
      logApiError("/api/text-actions", err, { stage: "anthropic_call", action });
      const errMessage = err instanceof Error ? err.message : "Request failed.";
      return NextResponse.json({ ok: false, error: errMessage }, { status: 502 });
    }
  } catch (err) {
    logApiError("/api/text-actions", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
