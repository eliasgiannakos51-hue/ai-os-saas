import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { findRelevantArticles } from "@/lib/support/retrieve";
import { checkGrounding } from "@/lib/support/grounding";
import {
  buildSupportContext,
  supportSystemPrompt,
  SUPPORT_MODEL,
  SUPPORT_MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
} from "@/lib/support/answer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

// The support widget's one endpoint.
//
// COSTS THE USER NOTHING, ON PURPOSE. Charging credits to ask how credits
// work is a fee for not understanding the product, and it would make the
// widget useless to exactly the people who need it. It is free, and the
// cost is contained the way a free thing has to be: a small model budget
// (500 output tokens), a short question, no history replay, one call per
// question, a per-user hourly cap, and the same daily-spend circuit
// breaker every other AI route sits behind.
//
// ANSWERED ONLY FROM THE CORPUS. Whatever comes back is checked against
// the exact text the model was shown (lib/support/grounding.ts). An answer
// containing a number or a capability claim that is not in that text is
// discarded and the user is offered a human instead. That check, not the
// system prompt, is what makes "it never invents a price" true.
const MAX_QUESTIONS_PER_HOUR = 20;

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
      scope: "support_question",
      identifier: user.id,
      maxAttempts: MAX_QUESTIONS_PER_HOUR,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many questions in the last hour. Please try again later." },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      question?: unknown;
      language?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json({ ok: false, error: "Ask a shorter question." }, { status: 400 });
    }
    const language = typeof body.language === "string" ? body.language.slice(0, 12) : "en";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Not an error the user should have to parse: with no model
      // available, the honest outcome is the same one an unanswerable
      // question gets — a human.
      return NextResponse.json({ ok: true, escalate: true, reason: "unavailable" });
    }

    // Same breaker every other AI route sits behind: the daily platform
    // spend cap, the per-user hourly cap, and the identical-request
    // breaker. A tripped breaker is not an error here — it is one more
    // reason the assistant cannot answer, which already has a path.
    const allowed = await checkAiCallAllowed(
      user.id,
      "support",
      fingerprintRequest(question, language)
    );
    if (!allowed.allowed) {
      return NextResponse.json({ ok: true, escalate: true, reason: "unavailable" });
    }

    const articles = await findRelevantArticles(question);
    // No matching article means the corpus does not cover this. Answering
    // anyway from the price sheet and the product blurb alone is how a
    // support bot starts improvising, so it does not get the chance.
    if (articles.length === 0) {
      return NextResponse.json({ ok: true, escalate: true, reason: "no_answer" });
    }

    const context = buildSupportContext(articles);

    let raw = "";
    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: SUPPORT_MODEL,
        max_tokens: SUPPORT_MAX_OUTPUT_TOKENS,
        system: supportSystemPrompt(language),
        messages: [
          {
            role: "user",
            content: `MATERIAL:\n${context}\n\nQUESTION: ${question}`,
          },
        ],
      });
      raw = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    } catch (err) {
      logApiError("/api/support", err, { stage: "model_call" });
      return NextResponse.json({ ok: true, escalate: true, reason: "unavailable" });
    }

    // The same `context` object the model was given — not a rebuilt copy.
    const verdict = checkGrounding({ answer: raw, context, question });
    if (!verdict.grounded) {
      // Logged with the offending fragments, because a repeated
      // "ungrounded_number" is a missing fact sheet entry and a repeated
      // "no_answer" is a missing help article — two different fixes.
      logApiError("/api/support", new Error(`answer rejected: ${verdict.reason}`), {
        reason: verdict.reason,
        offenders: "offenders" in verdict ? verdict.offenders.join(",") : undefined,
      });
      return NextResponse.json({ ok: true, escalate: true, reason: verdict.reason });
    }

    return NextResponse.json({
      ok: true,
      escalate: false,
      answer: raw,
      // Named so the user can go and read the same thing the answer came
      // from, rather than having to take the assistant's word for it.
      sources: articles.map((a) => ({ slug: a.slug, title: a.title })),
    });
  } catch (err) {
    logApiError("/api/support", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
