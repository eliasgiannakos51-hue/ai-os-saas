import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { buildUpgradeSuggestion } from "@/lib/upgrade-suggestion";
import { getPlan } from "@/lib/billing/plans";
import {
  dueLifecycleEmails,
  LIFECYCLE_DAYS,
  LIFECYCLE_WINDOW_DAYS,
  type LifecycleActivity,
  type LifecycleKey,
} from "@/lib/email/lifecycle";
import { sendLifecycleEmail } from "@/lib/email/send-lifecycle-email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bounded per invocation, like agent-runs: the cron runs daily, so a
// backlog simply drains across days rather than one invocation trying to
// hold a serverless function open for a mailing list.
const MAX_USER_PAGES = 20; // x 50 per page = 1000 accounts scanned
const MAX_SENDS_PER_RUN = 200;

// The oldest account any lifecycle email can apply to. Everyone past it
// is skipped before a single per-user query runs.
const MAX_RELEVANT_AGE_DAYS = LIFECYCLE_DAYS.day30 + LIFECYCLE_WINDOW_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

// day3's tip names the thing they actually use. Plain product truths,
// not generated copy — a wrong tip in an email cannot be dismissed.
const MODULE_TIPS: Record<string, string> = {
  ideas: "Link an idea to a decision or a research note — connected entries are what the AI reasons across.",
  trading: "Import your trade history as CSV and the AI will look for real patterns in your wins and losses.",
  finance: "Import bank or invoice CSVs — the AI reads amounts in any format and flags what stands out.",
  research: "Ask Deep Research to investigate a question — it searches the web and writes a sourced report.",
  leads: "Ask the AI to summarise your pipeline: which leads are stale, which moved this week.",
  content: "Describe a piece of content you need and Create Anything will draft it into the right module.",
  products: "Set a goal in Mission Control around your product — it plans the steps and helps you finish each one.",
  decisions: "Record the outcome on old decisions — the weekly reflection uses them to show what actually worked.",
  metrics: "Log a few weekly numbers and the dashboard sparklines start showing your real trend.",
  feedback: "Paste raw customer feedback — the AI files it and can summarise themes across entries.",
  learning: "Ask the chat to quiz you on what you logged — it reads your learning entries.",
  automations: "Schedule an agent to run a step daily — it works while you're away and emails you the result.",
  competitors: "Ask the AI to compare your notes on two competitors — it answers from your own entries.",
};

function tipForModule(slug: string): string {
  return (
    MODULE_TIPS[slug] ??
    "Open the module you use most and ask the AI a question about your own entries — it answers from your data."
  );
}

type EmailContent = {
  subject: string;
  kicker: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  ctaLabel: string;
  ctaPath: string;
};

function contentFor(key: LifecycleKey, activity: LifecycleActivity, moduleTitle: string | null): EmailContent {
  switch (key) {
    case "day1":
      return {
        subject: "one thing to try in Ionexa",
        kicker: "day one",
        heading: "pick one thing — it works from the first click",
        paragraphs: [
          "You created an account yesterday and haven't tried anything yet, which usually means the product didn't make the first step obvious. Here it is: open the workspace and pick what to do first — build a website, set a goal, organise your data, or just ask something.",
          "Whichever you pick opens with the input ready. One sentence in, something real out.",
        ],
        ctaLabel: "Pick your first thing",
        ctaPath: "/dashboard/overview",
      };
    case "day3":
      return {
        subject: `a tip for ${moduleTitle ?? "your workspace"}`,
        kicker: "day three",
        heading: `you've been using ${moduleTitle ?? "the workspace"} — here's the next step`,
        paragraphs: [tipForModule(activity.topModuleSlug ?? "")],
        ctaLabel: "Open your workspace",
        ctaPath: "/dashboard/overview",
      };
    case "day7": {
      const bullets: string[] = [];
      if (activity.totalEntries > 0) bullets.push(`${activity.totalEntries} entries recorded`);
      if (activity.aiActions > 0) bullets.push(`${activity.aiActions} AI actions ran for you`);
      if (activity.websitesPublished > 0) bullets.push(`${activity.websitesPublished} websites live on the web`);
      return {
        subject: "your first week, in numbers",
        kicker: "day seven",
        heading: "here's what you actually did this week",
        paragraphs: ["Real numbers from your account — nothing padded, nothing projected:"],
        bullets,
        ctaLabel: "See your dashboard",
        ctaPath: "/dashboard/overview",
      };
    }
    case "day14":
      return {
        subject: "your workspace is still here",
        kicker: "day fourteen",
        heading: "nothing has moved in a week — want to pick one thing?",
        paragraphs: [
          "No guilt trip: tools get abandoned when they don't earn their place. If you give it one more try, make it the two-minute version — import a spreadsheet and let the AI tell you one true thing about your business.",
        ],
        ctaLabel: "Try the two-minute version",
        ctaPath: "/dashboard/overview",
      };
    case "day30":
      return {
        subject: "you're hitting the edges of the Free plan",
        kicker: "day thirty",
        heading: "your usage this month outgrew the Free plan",
        paragraphs: [
          "This is based on what you actually used this month — the same numbers your dashboard shows, not a campaign. If the current plan fits, ignore this entirely.",
        ],
        ctaLabel: "Compare plans",
        ctaPath: "/pricing",
      };
  }
}

/**
 * The daily lifecycle pass (V3 Task 13). For every account young enough
 * to matter: compute what is due from REAL activity, claim the log row,
 * send at most ONE lifecycle email. Then notify voters of any feature
 * request that shipped since the last run.
 *
 * CLAIM BEFORE SEND: the insert into lifecycle_email_log is the
 * idempotency lock (primary key user_id+email_key). A crashed run can at
 * worst lose one email; it can never double-send one.
 */
export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const now = Date.now();
    let sent = 0;
    let scanned = 0;

    for (let page = 1; page <= MAX_USER_PAGES && sent < MAX_SENDS_PER_RUN; page++) {
      const { data: userPage, error: listError } = await admin.auth.admin.listUsers({
        page,
        perPage: 50,
      });
      if (listError) {
        logApiError("/api/cron/lifecycle-emails", listError, { stage: "list_users", page });
        break;
      }
      const users = userPage?.users ?? [];
      if (users.length === 0) break;

      for (const user of users) {
        if (sent >= MAX_SENDS_PER_RUN) break;
        if (!user.email || !user.created_at) continue;
        const ageDays = Math.floor((now - new Date(user.created_at).getTime()) / DAY_MS);
        if (ageDays < 1 || ageDays >= MAX_RELEVANT_AGE_DAYS) continue;
        scanned++;

        try {
          const activity = await loadActivity(admin, user, ageDays);
          const due = dueLifecycleEmails(ageDays, activity);

          for (const key of due) {
            // The claim. A duplicate key means an earlier run already
            // handled it — not an error, just done.
            const { error: claimError } = await admin
              .from("lifecycle_email_log")
              .insert({ user_id: user.id, email_key: key });
            if (claimError) continue;

            const moduleTitle = activity.topModuleSlug
              ? CLASSIFIER_MODULES.find((m) => m.slug === activity.topModuleSlug)?.title ?? null
              : null;
            await sendLifecycleEmail({
              email: user.email,
              userId: user.id,
              type: "lifecycle",
              ...contentFor(key, activity, moduleTitle),
            });
            sent++;
            // One lifecycle email per user per run, however many are due.
            break;
          }
        } catch (err) {
          logApiError("/api/cron/lifecycle-emails", err, { stage: "per_user", userId: user.id });
        }
      }
      if (users.length < 50) break;
    }

    const shippedNotified = await notifyShippedRequests(admin);

    return NextResponse.json({ ok: true, scanned, sent, shippedNotified });
  } catch (err) {
    logApiError("/api/cron/lifecycle-emails", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

async function loadActivity(
  admin: ReturnType<typeof createAdminClient>,
  user: { id: string; created_at?: string; user_metadata?: Record<string, unknown> },
  ageDays: number
): Promise<LifecycleActivity> {
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const count = async (table: string, filters: (q: any) => any): Promise<number> => {
    try {
      const { count: n, error } = await filters(
        admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id)
      );
      if (error) return 0;
      return n ?? 0;
    } catch {
      return 0;
    }
  };

  const [aiActions, recentAiActions, websitesPublished] = await Promise.all([
    count("ai_cost_log", (q: any) => q),
    count("ai_cost_log", (q: any) => q.gte("created_at", sevenDaysAgo)),
    count("published_sites", (q: any) => q),
  ]);

  let totalEntries = 0;
  let recentEntries = 0;
  let topModuleSlug: string | null = null;
  let topCount = 0;
  for (const moduleConfig of CLASSIFIER_MODULES) {
    const n = await count(moduleConfig.table, (q: any) => q);
    totalEntries += n;
    if (n > topCount) {
      topCount = n;
      topModuleSlug = moduleConfig.slug;
    }
    if (n > 0) {
      recentEntries += await count(moduleConfig.table, (q: any) => q.gte("created_at", sevenDaysAgo));
    }
  }

  // The day-30 suggestion reuses the dashboard's own rule so the email
  // can never claim something the product would not.
  let hasUpgradeSuggestion = false;
  if (ageDays >= LIFECYCLE_DAYS.day30) {
    try {
      // The REAL auth user from listUsers, so the plan resolves from the
      // same user_metadata.subscription_tier everything else reads.
      const plan = await resolveEffectivePlan(user as never);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const since = monthStart.toISOString();
      const [presentations, researchReports, publishedThisMonth] = await Promise.all([
        count("user_presentations", (q: any) => q.gte("created_at", since)),
        count("research_reports", (q: any) => q.gte("created_at", since)),
        count("published_sites", (q: any) => q.gte("published_at", since)),
      ]);
      const suggestion = buildUpgradeSuggestion({
        accountAgeDays: ageDays,
        planSlug: plan?.slug ?? getPlan("free")!.slug,
        usedThisMonth: { presentations, researchReports, publishedSites: publishedThisMonth },
      });
      hasUpgradeSuggestion = suggestion.kind === "suggest";
    } catch {
      hasUpgradeSuggestion = false;
    }
  }

  return {
    aiActions,
    totalEntries,
    topModuleSlug,
    recentActivity: recentAiActions + recentEntries,
    websitesPublished,
    hasUpgradeSuggestion,
  };
}

/**
 * "Notify όσους το ζήτησαν όταν shipped": for every request whose status
 * flipped to shipped and has not been announced, email its author and
 * every voter (each gated by their own feature_request_shipped
 * preference and idempotent via the same claim-first log), then stamp
 * shipped_notified_at so the backlog empties exactly once.
 */
async function notifyShippedRequests(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  let notified = 0;
  try {
    const { data: shipped, error } = await admin
      .from("feature_requests")
      .select("id, title, user_id")
      .not("shipped_at", "is", null)
      .is("shipped_notified_at", null)
      .limit(20);
    if (error || !shipped?.length) return 0;

    for (const request of shipped) {
      const { data: votes } = await admin
        .from("feature_request_votes")
        .select("user_id")
        .eq("request_id", request.id)
        .limit(2000);
      const recipientIds = new Set<string>([request.user_id, ...(votes ?? []).map((v) => v.user_id)]);

      for (const userId of recipientIds) {
        const emailKey = `fr_shipped:${request.id}`;
        const { error: claimError } = await admin
          .from("lifecycle_email_log")
          .insert({ user_id: userId, email_key: emailKey });
        if (claimError) continue;

        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        const email = authUser?.user?.email;
        if (!email) continue;

        const delivered = await sendLifecycleEmail({
          email,
          userId,
          type: "feature_request_shipped",
          subject: "something you asked for just shipped",
          kicker: "from the roadmap",
          heading: `shipped: ${request.title}`,
          paragraphs: [
            "You asked for this (or voted for it) on the roadmap, and it's live now. Thank you — requests with votes are how we decide what to build next.",
          ],
          ctaLabel: "See what shipped",
          ctaPath: "/changelog",
        });
        if (delivered) notified++;
      }

      await admin
        .from("feature_requests")
        .update({ shipped_notified_at: new Date().toISOString() })
        .eq("id", request.id);
    }
  } catch (err) {
    logApiError("/api/cron/lifecycle-emails", err, { stage: "notify_shipped" });
  }
  return notified;
}
