import type { NotificationType } from "@/lib/notify/types";

/**
 * RULE 1, AS A FUNCTION THAT SAYS NO.
 *
 * "Never a notification without value" is easy to agree with and hard to
 * enforce, because the tempting notification is always the one that is
 * TRUE but useless: the agent ran, the digest covered a week, the site is
 * still up. Each is a fact. None of them is worth an interruption, and a
 * product that sends them teaches people to ignore the ones that are.
 *
 * So every type carries a REASON IT MIGHT BE WORTHLESS, and dispatch.ts
 * asks this before it writes anything anywhere. A `false` here is not a
 * failure — it is the system working, and the caller logs nothing and
 * moves on.
 *
 * Pure. The build gate exercises every branch.
 */

export type NotificationPayload = {
  type: NotificationType;
  title: string;
  body: string;
  /** Type-specific facts the predicate needs. Deliberately loose: each
   *  branch reads only the fields it knows about, and a caller that
   *  omits one gets the conservative answer. */
  facts?: Record<string, unknown>;
};

export type WorthVerdict = { worth: true } | { worth: false; reason: string };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isWorthSending(payload: NotificationPayload): WorthVerdict {
  const facts = payload.facts ?? {};

  // A NOTIFICATION WITH NOTHING IN IT is worthless whatever its type.
  if (!payload.title.trim()) return { worth: false, reason: "no title" };

  switch (payload.type) {
    case "agent_completed": {
      // THE WHOLE RULE, IN ONE BRANCH. An agent that ran and found
      // nothing is the single most common notification this product
      // could send and the least worth sending — it is the daily proof
      // that a schedule is working, which is what the run history is for.
      const hasOutput = typeof facts.output === "string" && facts.output.trim().length > 0;
      if (!hasOutput) return { worth: false, reason: "the agent produced no result" };
      // "Nothing new to report" is the runner's own way of saying the
      // same thing, and it IS a result string — so it is checked by
      // value, not by emptiness.
      if (facts.foundSomething === false) {
        return { worth: false, reason: "the agent reported nothing new" };
      }
      return { worth: true };
    }

    case "research_ready": {
      const sections = num(facts.sectionCount);
      if (sections !== null && sections <= 0) {
        return { worth: false, reason: "the report came back empty" };
      }
      return { worth: true };
    }

    case "website_published": {
      if (typeof facts.url !== "string" || !facts.url.trim()) {
        return { worth: false, reason: "no published address to link to" };
      }
      return { worth: true };
    }

    case "credits_low": {
      // ONLY THE TWO THRESHOLDS THE BRIEF NAMES. A notification at 63%
      // is a notification somebody turns the whole type off for.
      const percent = num(facts.percentUsed);
      if (percent === null) return { worth: false, reason: "no usage figure" };
      if (percent < 80) return { worth: false, reason: `only ${Math.round(percent)}% used` };
      return { worth: true };
    }

    case "team_member_joined": {
      if (typeof facts.memberEmail !== "string" || !facts.memberEmail.trim()) {
        return { worth: false, reason: "no member to name" };
      }
      return { worth: true };
    }

    case "error_needs_attention": {
      // THE TEST IS "CAN THEY DO ANYTHING ABOUT IT". A transient upstream
      // failure that retried and succeeded is not something a person
      // acts on, and telling them is how an alert channel becomes noise.
      if (facts.actionable === false) {
        return { worth: false, reason: "nothing the user can act on" };
      }
      if (!payload.body.trim()) return { worth: false, reason: "no detail to act on" };
      return { worth: true };
    }

    case "payment_failed":
      // Always worth it. A declined payment is a thing that stops working
      // and only the account holder can fix.
      return { worth: true };

    default:
      return { worth: true };
  }
}

/**
 * THE DIGEST'S OWN VERSION OF THE SAME RULE.
 *
 * A weekly email of zeroes every Monday is a weekly reminder that nothing
 * happened, and it is the fastest way to get a sending domain marked as
 * spam. The existing digest already skipped empty weeks; this states the
 * rule where the build gate can see it, and widens it: a digest whose
 * only content is "0 of everything" is empty even if a row technically
 * exists somewhere.
 */
export function isDigestWorthSending(counts: Record<string, number>): WorthVerdict {
  const total = Object.values(counts).reduce((sum, n) => sum + (num(n) ?? 0), 0);
  if (total <= 0) return { worth: false, reason: "nothing happened this week" };
  return { worth: true };
}
