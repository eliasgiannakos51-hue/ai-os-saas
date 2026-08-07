import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { normaliseSlides, withUniqueIds } from "@/lib/presentations/slides";
import { isThemeId, DEFAULT_THEME_ID } from "@/lib/presentations/themes";
import { sanitiseAgentText } from "@/lib/agents/agent-config";
import { MAX_PAYLOAD_BYTES, type ListingKind } from "@/lib/marketplace/listing-kinds";

/**
 * Turning one of the seller's own items into merchandise, and back into
 * one of the buyer's items.
 *
 * The only module that knows the shape of a payload. Two functions,
 * deliberately symmetric, and three rules that hold across every kind:
 *
 * 1. WHAT IS SOLD IS A CONFIGURATION, NEVER A RESULT OR AN IDENTITY.
 *    An agent listing carries the prompt and the schedule; it does not
 *    carry the seller's past run outputs, their delivery address, or the
 *    Slack channel they wired it to. A presentation listing carries the
 *    slides; it does not carry the seller's research sources or their
 *    original brief. What leaves with a listing is what the buyer needs
 *    to run it, and nothing about the person who made it.
 *
 * 2. THE BUYER'S OWNERSHIP IS ASSERTED HERE, NOT COPIED. Every insert
 *    sets `user_id` from the buyer's session id, and no install path
 *    reads a user id out of a payload. A payload is a document that was
 *    once written by somebody else; treating any identity in it as
 *    authoritative is how "buy a template" becomes "write a row into
 *    another account".
 *
 * 3. NOTHING INSTALLS RUNNING. An agent arrives paused and an automation
 *    arrives inactive. Buying a thing that immediately starts spending
 *    your credits on a schedule you have not read is not consent, and it
 *    is the one purchase in this marketplace that could cost more after
 *    the sale than during it.
 */

export type BuiltPayload = {
  payload: Record<string, unknown>;
  /** What a browser may see before paying — structural only. */
  preview: Record<string, unknown>;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The payload as it will be stored, measured. A jsonb column will
 *  happily take megabytes; the browse page and the install path both
 *  have to move it. */
export function payloadTooLarge(payload: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(payload ?? {}), "utf8") > MAX_PAYLOAD_BYTES;
}

// ---------------------------------------------------------------------
// Export: the seller's row -> merchandise.
// ---------------------------------------------------------------------

export function buildPayload(
  kind: ListingKind,
  source: Record<string, unknown>
): { ok: true; built: BuiltPayload } | { ok: false; error: string } {
  switch (kind) {
    case "website_template": {
      const html = typeof source.html_content === "string" ? source.html_content : "";
      if (!html.trim()) return { ok: false, error: "That website has no generated content yet." };
      return {
        ok: true,
        built: {
          payload: { html, name: text(source.name, 120) },
          // Size only. A "preview" containing the markup would be the
          // product, given away to anyone who opens the listing page.
          preview: { characters: html.length },
        },
      };
    }

    case "agent_config": {
      const prompt = text(source.prompt, 4000);
      if (!prompt) return { ok: false, error: "That agent has no task to sell." };
      // The seller's own prompt is sanitised on the way OUT, not only on
      // the way in. A listing is read by a model on somebody else's
      // account, which makes an instruction-override phrase in it an
      // attack on the buyer rather than on its author.
      const { text: safePrompt, neutralised } = sanitiseAgentText(prompt);
      return {
        ok: true,
        built: {
          payload: {
            name: text(source.name, 120),
            description: text(source.description, 500),
            prompt: safePrompt,
            schedule_cron: text(source.schedule_cron, 100),
            timezone: text(source.timezone, 60) || "UTC",
            // `config` carries output format and whether the agent
            // searches the web. It does NOT carry delivery: see the
            // omissions below.
            config: source.config && typeof source.config === "object" ? source.config : {},
          },
          preview: {
            schedule_cron: text(source.schedule_cron, 100),
            sanitised: neutralised,
          },
          // DELIBERATELY ABSENT: delivery_method, delivery_target,
          // slack_channel, and every run row. The buyer's agent delivers
          // to the buyer's own verified address, resolved at install
          // time. Carrying the seller's address across would turn a
          // marketplace purchase into a subscription to somebody else's
          // inbox — in the direction nobody asked for.
        },
      };
    }

    case "mission_template": {
      const goal = text(source.goal, 2000);
      if (!goal) return { ok: false, error: "That mission has no goal to sell." };
      const steps = Array.isArray(source.plan_steps) ? source.plan_steps : [];
      return {
        ok: true,
        built: {
          payload: { goal, plan_steps: steps },
          preview: { stepCount: steps.length },
        },
      };
    }

    case "presentation_template": {
      const slides = withUniqueIds(normaliseSlides(source.slides));
      if (slides.length === 0) return { ok: false, error: "That presentation has no slides to sell." };
      return {
        ok: true,
        built: {
          payload: {
            title: text(source.title, 160),
            theme: isThemeId(source.theme) ? source.theme : DEFAULT_THEME_ID,
            slides,
          },
          preview: {
            slideCount: slides.length,
            theme: isThemeId(source.theme) ? source.theme : DEFAULT_THEME_ID,
            // The first slide's title only. Enough to tell a buyer what
            // the deck is; not enough to be the deck.
            openingTitle: slides[0]?.title ?? "",
          },
          // DELIBERATELY ABSENT: `sources` and `brief`. The sources are
          // the seller's research and the brief is often a description
          // of their own business.
        },
      };
    }

    case "automation": {
      const description = text(source.description, 2000);
      if (!description) return { ok: false, error: "That automation has nothing to sell." };
      const { text: safeDescription } = sanitiseAgentText(description);
      const frequency = ["daily", "weekly", "monthly"].includes(String(source.frequency))
        ? String(source.frequency)
        : "weekly";
      return {
        ok: true,
        built: {
          payload: {
            description: safeDescription,
            frequency,
            day_of_week: Number.isInteger(source.day_of_week) ? source.day_of_week : null,
            day_of_month: Number.isInteger(source.day_of_month) ? source.day_of_month : null,
          },
          preview: { frequency },
        },
      };
    }
  }
}

// ---------------------------------------------------------------------
// Install: merchandise -> the buyer's row.
// ---------------------------------------------------------------------

/**
 * Write the buyer's copy.
 *
 * Runs on the SERVICE-ROLE client, because the payload lives in a table
 * the buyer has no read policy on. That makes the `buyerId` argument the
 * only thing standing between this and writing into an arbitrary
 * account, so it is threaded from the verified session (or, for the
 * webhook path, from the purchase row Stripe's signed event resolved to)
 * and never from anything in the payload.
 */
export async function installPayload(params: {
  admin: SupabaseClient;
  kind: ListingKind;
  payload: Record<string, unknown>;
  buyerId: string;
  /** The buyer's own verified address. The only delivery target an
   *  installed agent may ever have. */
  buyerEmail: string;
}): Promise<{ ok: true; entityId: string } | { ok: false; error: string }> {
  const { admin, kind, payload, buyerId, buyerEmail } = params;

  try {
    switch (kind) {
      case "website_template": {
        const { data, error } = await admin
          .from("user_websites")
          .insert({
            user_id: buyerId,
            name: text(payload.name, 120) || "Purchased template",
            html_content: typeof payload.html === "string" ? payload.html : "",
            status: "completed",
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("insert returned nothing");
        return { ok: true, entityId: data.id };
      }

      case "agent_config": {
        const { data, error } = await admin
          .from("user_agents")
          .insert({
            user_id: buyerId,
            name: text(payload.name, 120) || "Purchased agent",
            description: text(payload.description, 500),
            prompt: text(payload.prompt, 4000),
            schedule_cron: text(payload.schedule_cron, 100) || "0 9 * * *",
            timezone: text(payload.timezone, 60) || "UTC",
            // Not from the payload. Ever.
            delivery_method: "email",
            delivery_target: buyerEmail,
            // Paused. The buyer reads what they bought and starts it
            // themselves; an agent that begins spending their credits on
            // a schedule they have not seen is not something a purchase
            // consented to.
            status: "paused",
            config: payload.config && typeof payload.config === "object" ? payload.config : {},
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("insert returned nothing");
        return { ok: true, entityId: data.id };
      }

      case "mission_template": {
        const { data, error } = await admin
          .from("ai_missions")
          .insert({
            user_id: buyerId,
            goal: text(payload.goal, 2000) || "Purchased mission",
            plan_steps: Array.isArray(payload.plan_steps) ? payload.plan_steps : [],
            // 'planning', not 'in_progress': the buyer reviews the plan
            // before anything runs against it.
            status: "planning",
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("insert returned nothing");
        return { ok: true, entityId: data.id };
      }

      case "presentation_template": {
        const slides = withUniqueIds(normaliseSlides(payload.slides));
        const { data, error } = await admin
          .from("user_presentations")
          .insert({
            user_id: buyerId,
            title: text(payload.title, 160) || "Purchased presentation",
            // The buyer's brief is empty rather than the seller's: the
            // deck is theirs to take somewhere else now, and the brief
            // described somebody else's business.
            brief: "",
            theme: isThemeId(payload.theme) ? payload.theme : DEFAULT_THEME_ID,
            slides,
            sources: [],
            status: "ready",
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("insert returned nothing");
        return { ok: true, entityId: data.id };
      }

      case "automation": {
        const { data, error } = await admin
          .from("user_automations")
          .insert({
            user_id: buyerId,
            description: text(payload.description, 2000) || "Purchased automation",
            frequency: ["daily", "weekly", "monthly"].includes(String(payload.frequency))
              ? String(payload.frequency)
              : "weekly",
            day_of_week: Number.isInteger(payload.day_of_week) ? payload.day_of_week : null,
            day_of_month: Number.isInteger(payload.day_of_month) ? payload.day_of_month : null,
            // Inactive, for the same reason an agent installs paused.
            is_active: false,
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("insert returned nothing");
        return { ok: true, entityId: data.id };
      }
    }
  } catch (err) {
    logApiError("marketplace:installPayload", err, { kind, buyerId });
    return { ok: false, error: "Could not add the purchase to your account." };
  }
}
