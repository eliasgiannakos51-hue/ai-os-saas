import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { normaliseAgentConfig } from "@/lib/agents/agent-config";
import {
  anonymiseTaskPrompt,
  validateShareableTemplate,
  type ShareRefusalReason,
} from "@/lib/agents/agent-templates";

export const dynamic = "force-dynamic";

/**
 * SHARING YOUR OWN AGENT'S SHAPE — opt-in, and refusal-first.
 *
 * WHAT LEAVES THE ACCOUNT: the task sentence with the specific thing
 * replaced by {subject}, the schedule, the depth, the output shape, and a
 * title and description THE SHARER TYPES FOR THE LIBRARY. Nothing else.
 * Not the agent's own name or description (people name an agent after
 * their company), not the delivery target, not the timezone — a timezone
 * is a location.
 *
 * WHY THE SHARER NAMES THE SUBJECT. The obvious implementation is to find
 * the proper nouns and replace them. That cannot work in this product:
 * German capitalises every noun, and Greek, Arabic, Japanese and Chinese
 * do not mark proper nouns with case at all. A capitalisation heuristic
 * would leak names in four languages while LOOKING like it had
 * anonymised something — which is worse than no anonymiser, because it
 * would be trusted. So the person who knows which words are theirs says
 * so, and the code's job is to verify the result and to refuse on the
 * categories a machine really can recognise.
 *
 * AND IT IS NOT A GUARANTEE, stated plainly rather than implied: a sharer
 * who types a subject that is not the personal part can still publish a
 * sentence containing their own name. What this does is make that a
 * deliberate act rather than an accident — explicit opt-in, a mandatory
 * slot, a preview of exactly what will be published, and a delete that
 * works immediately.
 */

/**
 * THE CODE IS THE MESSAGE.
 *
 * A refusal here is the sentence that tells somebody how to fix their
 * share, which makes it the one that most needs to be in their own
 * language — so the route returns `code` and the component looks up
 * `dashboard.agents.share.refused.<code>` in all ten locales. The short
 * English `error` alongside it is a fallback for a client that does not
 * know the code, not the text anybody is meant to read.
 */
const REFUSAL_FALLBACK: Record<ShareRefusalReason, string> = {
  no_slot: "Name the words that are specific to you.",
  subject_still_present: "That wording still appears in the task.",
  contains_contact_details: "Remove contact details before sharing.",
  contains_numbers: "Remove long numbers before sharing.",
  too_short: "Too short to share.",
  too_long: "Too long to share.",
};

export async function POST(request: Request) {
  try {
    let agentId: string;
    let subject: string;
    let title: string;
    let description: string;
    try {
      const body = await request.json();
      agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
      subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      title = typeof body?.title === "string" ? body.title.trim() : "";
      description = typeof body?.description === "string" ? body.description.trim() : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (!agentId) return NextResponse.json({ ok: false, error: "Missing agent." }, { status: 400 });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const limited = await checkRateLimit({
      scope: "agent_template_share",
      identifier: user.id,
      maxAttempts: 5,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many templates shared in the last hour." },
        { status: 429 }
      );
    }

    // OWNERSHIP THROUGH RLS. Reading the agent with the caller's own
    // client is what stops somebody publishing a template made out of
    // another account's task.
    const { data: agent, error: agentError } = await supabase
      .from("user_agents")
      .select("id, prompt, schedule_cron, config")
      .eq("id", agentId)
      .maybeSingle();
    if (agentError || !agent) {
      return NextResponse.json({ ok: false, error: "Agent not found." }, { status: 404 });
    }

    const anonymised = anonymiseTaskPrompt(String(agent.prompt ?? ""), subject);
    if (!anonymised.ok) {
      // A REFUSAL IS THE CORRECT OUTCOME, and it says which rule and why.
      // "Sharing failed" would send somebody back to try the same thing.
      return NextResponse.json(
        { ok: false, code: anonymised.reason, error: REFUSAL_FALLBACK[anonymised.reason] },
        { status: 422 }
      );
    }

    const config = normaliseAgentConfig(agent.config as Record<string, unknown> | null);
    const validated = validateShareableTemplate({
      title,
      description,
      taskPattern: anonymised.pattern,
      scheduleCron: String(agent.schedule_cron ?? "0 9 * * 1"),
      depth: config.depth,
      needsWebSearch: config.needsWebSearch,
      outputFormat: config.outputFormat,
    });
    if (!validated.ok) {
      return NextResponse.json({ ok: false, error: validated.reason }, { status: 422 });
    }

    // The slug is derived from the TITLE THE SHARER TYPED plus a short
    // random suffix — never from the agent's own name, which is one of
    // the things that must not leave the account.
    const base = validated.template.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const slug = `${base || "shared"}-${Math.random().toString(36).slice(2, 8)}`;

    // WRITTEN WITH THE ADMIN CLIENT because there is deliberately no
    // insert policy on the table: a user who could insert directly could
    // publish anything into everybody else's library without passing any
    // of the rules above. The table's own CHECK constraints are the last
    // line — if this insert is refused by one of them, that is the
    // database catching a bug in this route, and it is reported as such
    // rather than as the user's mistake.
    const admin = createAdminClient();
    const { data: created, error: insertError } = await admin
      .from("agent_templates")
      .insert({
        slug,
        shared_by: user.id,
        title: validated.template.title,
        description: validated.template.description,
        task_pattern: validated.template.taskPattern,
        schedule_cron: validated.template.scheduleCron,
        depth: validated.template.depth,
        needs_web_search: validated.template.needsWebSearch,
        output_format: validated.template.outputFormat,
      })
      .select("slug, title, description, task_pattern")
      .maybeSingle();

    if (insertError || !created) {
      logApiError("/api/agents/templates/share", insertError, { stage: "insert" });
      return NextResponse.json(
        { ok: false, error: "That could not be shared. Nothing was published." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, template: created });
  } catch (err) {
    logApiError("/api/agents/templates/share", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Withdrawing one. Through the CALLER'S OWN client, so the
 * agent_templates_delete_own policy is what decides — which also makes it
 * impossible to delete a built-in, whose shared_by is null.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return NextResponse.json({ ok: false, error: "Missing template." }, { status: 400 });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const { error, count } = await supabase
      .from("agent_templates")
      .delete({ count: "exact" })
      .eq("slug", slug);
    if (error) throw error;
    if (!count) {
      return NextResponse.json(
        { ok: false, error: "That template is not yours to withdraw." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/agents/templates/share", err, { stage: "delete" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
