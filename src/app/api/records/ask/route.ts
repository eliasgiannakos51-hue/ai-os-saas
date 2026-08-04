import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { AI_QUALITY_CHECKLIST_EL } from "@/lib/ai-quality-checklist";
import { getClassifierModule } from "@/lib/classifier-modules";
import { getBuildModule } from "@/lib/build-modules";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  deductCredits,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// Same reasoning as api/chat/route.ts — streaming, but still bounded by
// the platform's maxDuration. 120s is ample for this route's smaller
// 1024-token replies.
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOKENS = 1024;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CONTENT_LENGTH = MAX_MESSAGE_LENGTH;

type HistoryTurn = { role: "user" | "assistant"; content: string };

function ndjsonLine(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

// Bounded, best-effort parse — malformed or oversized entries are dropped
// rather than rejecting the whole request, since history is just prior
// turns of THIS record's ephemeral chat (never persisted server-side), not
// something the caller can use to smuggle anything beyond a bigger prompt.
function parseHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: HistoryTurn[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      (("role" in entry && (entry as { role: unknown }).role === "user") ||
        (entry as { role: unknown }).role === "assistant") &&
      typeof (entry as { content: unknown }).content === "string"
    ) {
      const { role, content } = entry as HistoryTurn;
      turns.push({ role, content: content.slice(0, MAX_HISTORY_CONTENT_LENGTH) });
    }
  }
  return turns.slice(-MAX_HISTORY_MESSAGES);
}

// Renders every configured field on the record ("label: value", skipping
// empty ones) so the model gets the same information the user sees on the
// card — no field allow/deny-listing to keep in sync as modules evolve.
function formatRecordForPrompt(moduleConfig: ModuleConfig, record: ModuleRecord): string {
  const lines = moduleConfig.fields
    .map((field) => {
      const value = record[field.key];
      if (value === null || value === undefined || value === "") return null;
      return `- ${field.label}: ${value}`;
    })
    .filter((line): line is string => line !== null);

  if (record.created_at) {
    lines.push(`- Logged at: ${new Date(record.created_at).toISOString()}`);
  }

  return lines.join("\n");
}

// Native web search tool (see api/chat/route.ts for the fuller comment) —
// wired in here too since this is the actual per-record AI Q&A feature
// used across every module including Research, and a question about a
// Research record ("what's the current market rate for X") is exactly
// the case that needs real, current data instead of a guessed number.
// Same copyright safeguard: paraphrase, don't quote sources verbatim.
const WEB_SEARCH_INSTRUCTION = `

Έχεις πρόσβαση σε εργαλείο αναζήτησης στο διαδίκτυο (web search). Χρησιμοποίησέ το όταν ο χρήστης ζητάει πραγματικά, τρέχοντα στοιχεία που δεν μπορείς να ξέρεις με σιγουριά μόνος/η σου (τρέχουσες τιμές, στατιστικά, πρόσφατα γεγονότα). ΜΗΝ χρησιμοποιείς αναζήτηση για γενικές ερωτήσεις γνώσης. ΣΗΜΑΝΤΙΚΟ (πνευματικά δικαιώματα): ΠΑΡΑΦΡΑΣΕ τα ευρήματα με δικά σου λόγια — ΜΗΝ αντιγράφεις κείμενο αυτούσιο από τις πηγές.`;

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

function buildSystemPrompt(moduleConfig: ModuleConfig, record: ModuleRecord): string {
  return `Έχεις πρόσβαση στα ακόλουθα δεδομένα μιας συγκεκριμένης καταγραφής (module: ${moduleConfig.title}):

${formatRecordForPrompt(moduleConfig, record)}

Δώσε αντικειμενική, ειλικρινή γνώμη/ανάλυση όταν ρωτηθείς, χωρίς να επιβεβαιώνεις αυτόματα ό,τι λέει ο χρήστης. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος). Μείνε εστιασμένος/η σε αυτή τη συγκεκριμένη καταγραφή, εκτός αν ο χρήστης ζητήσει ρητά κάτι άσχετο με αυτήν.${WEB_SEARCH_INSTRUCTION}${AI_QUALITY_CHECKLIST_EL}`;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let moduleSlug: string;
    let recordId: string;
    let message: string;
    let history: HistoryTurn[];
    try {
      const body = await request.json();
      moduleSlug = typeof body?.moduleSlug === "string" ? body.moduleSlug : "";
      recordId = typeof body?.recordId === "string" ? body.recordId.slice(0, 100) : "";
      message = typeof body?.message === "string" ? body.message.trim() : "";
      history = parseHistory(body?.history);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!moduleSlug || !recordId) {
      return NextResponse.json({ ok: false, error: "Missing module or record." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Message is too long (${message.length}/${MAX_MESSAGE_LENGTH} characters) — please shorten it and try again.`,
        },
        { status: 400 }
      );
    }

    const moduleConfig = getClassifierModule(moduleSlug) ?? getBuildModule(moduleSlug);
    if (!moduleConfig) {
      return NextResponse.json({ ok: false, error: "Unknown module." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(
      user.id,
      "records_ask",
      fingerprintRequest(moduleSlug, recordId, message)
    );
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, rateLimited: true, message: breakerCheck.reason });
    }

    // Same credits-based gate as Ionexa Chat (api/chat) and Create Anything
    // (api/create) — 1 credit per message, admin-listed accounts (see
    // lib/admin.ts) skip it entirely. Read-only check here; the actual
    // deduct happens inside the stream below, only after the model has
    // confirmed-successfully returned a real response — never before.
    const isAdmin = isAdminEmail(user.email);
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;
    if (!isAdmin) {
      plan = await resolveEffectivePlan(user);
      const check = await hasEnoughCredits(user.id, CREDIT_COSTS.chatMessage, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, CREDIT_COSTS.chatMessage),
        });
      }
    }

    // RLS (auth.uid() = user_id) means this only ever finds the row if the
    // caller actually owns it — a stranger's id simply comes back null,
    // same ownership-via-RLS pattern used by api/chat's conversation lookup
    // and api/team/remove's member lookup.
    const { data: record, error: recordError } = await supabase
      .from(moduleConfig.table)
      .select("*")
      .eq("id", recordId)
      .maybeSingle();

    if (recordError) {
      logApiError("/api/records/ask", recordError, { stage: "load_record", moduleSlug });
      return NextResponse.json(
        { ok: false, error: "Could not load that record." },
        { status: 500 }
      );
    }

    if (!record) {
      return NextResponse.json({ ok: false, error: "Record not found." }, { status: 404 });
    }

    const systemPrompt = buildSystemPrompt(moduleConfig, record as ModuleRecord);
    const anthropic = new Anthropic({ apiKey });

    const stream = new ReadableStream({
      async start(controller) {
        let assistantText = "";
        let webSearchCount = 0;
        try {
          void recordAiCallForDailySpend(CREDIT_COSTS.chatMessage);
          const claudeStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [
              ...history.map((m) => ({ role: m.role, content: m.content })),
              { role: "user" as const, content: message },
            ],
            tools: [WEB_SEARCH_TOOL],
          });

          claudeStream.on("text", (delta) => {
            assistantText += delta;
            controller.enqueue(ndjsonLine({ type: "delta", text: delta }));
          });

          const finalResponse = await claudeStream.finalMessage();
          webSearchCount = finalResponse.usage.server_tool_use?.web_search_requests ?? 0;
        } catch (err) {
          logApiError("/api/records/ask", err, { stage: "anthropic_stream", moduleSlug });
          const errMessage = err instanceof Error ? err.message : "Request failed.";
          controller.enqueue(
            ndjsonLine({ type: "error", error: `${errMessage} No credits were charged — please try again.` })
          );
          controller.close();
          return;
        }

        if (!assistantText.trim()) {
          controller.enqueue(
            ndjsonLine({
              type: "error",
              error: "The model did not return a response. No credits were charged — please try again.",
            })
          );
          controller.close();
          return;
        }

        // Only now — a real, non-empty response was confirmed — is this
        // worth charging for.
        if (!isAdmin && plan) {
          await deductCredits(user.id, CREDIT_COSTS.chatMessage, "ask_ai_record", `Ask AI — ${moduleConfig.title}`, plan);
          if (webSearchCount > 0) {
            await deductCredits(
              user.id,
              CREDIT_COSTS.webSearchPerQuery * webSearchCount,
              "web_search",
              `Ask AI (${moduleConfig.title}) — ${webSearchCount} web search${webSearchCount > 1 ? "es" : ""}`,
              plan
            );
          }
        }

        controller.enqueue(ndjsonLine({ type: "done" }));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    logApiError("/api/records/ask", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
