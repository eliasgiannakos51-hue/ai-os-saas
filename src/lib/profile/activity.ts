import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import type { ActivityCounts } from "@/lib/profile/maturity";
import type { ActivitySummary } from "@/lib/profile/observers";

// Gathering what somebody actually did, for the profile refresh.
//
// Bounded on purpose. Every list query has a LIMIT, and the caps are
// chosen so a heavy account costs the same as a light one: this runs for
// every user on a daily cron, and a collector whose cost scales with the
// biggest account is a cron that eventually stops finishing.
//
// The samples are recent-first, which also makes the observations track
// how someone works NOW rather than how they worked when they signed up —
// the decay in store.ts handles the rest.
const SAMPLE_LIMIT = 400;

export async function collectActivity(
  userId: string
): Promise<{ counts: ActivityCounts; activity: ActivitySummary }> {
  const empty = {
    counts: { chatMessages: 0, aiActions: 0, createdRecords: 0 },
    activity: {
      chatMessageLengths: [],
      actionHoursUtc: [],
      actionWeekdays: [],
      recordsByModule: {},
      missionGoals: [],
      missionsCompleted: 0,
      missionsFailed: 0,
      websiteRegenerations: 0,
      websitesGenerated: 0,
    } as ActivitySummary,
  };

  try {
    const admin = createAdminClient();

    const [messages, transactions, missions, websites, versions] = await Promise.all([
      admin
        .from("chat_messages")
        .select("content, created_at")
        .eq("user_id", userId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(SAMPLE_LIMIT),
      admin
        .from("credit_transactions")
        .select("created_at")
        .eq("user_id", userId)
        .lt("amount", 0)
        .order("created_at", { ascending: false })
        .limit(SAMPLE_LIMIT),
      admin
        .from("ai_missions")
        .select("goal, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("user_websites")
        .select("id")
        .eq("user_id", userId)
        .limit(200),
      // A version beyond the first means the user asked for the output to
      // be changed — the clearest "I did not like that" signal the app
      // records anywhere.
      admin
        .from("website_versions")
        .select("website_id, version_number")
        .eq("user_id", userId)
        .gt("version_number", 1)
        .limit(400),
    ]);

    const messageRows = (messages.data as { content: string; created_at: string }[] | null) ?? [];
    const transactionRows = (transactions.data as { created_at: string }[] | null) ?? [];
    const missionRows =
      (missions.data as { goal: string; status: string; created_at: string }[] | null) ?? [];
    const websiteRows = (websites.data as { id: string }[] | null) ?? [];
    const versionRows = (versions.data as { website_id: string }[] | null) ?? [];

    // Per-module row counts, from the same module registry the rest of the
    // app uses. head:true so no row bodies cross the wire — the count is
    // the whole point.
    const modules = [...CLASSIFIER_MODULES, ...BUILD_MODULES];
    const moduleCounts = await Promise.all(
      modules.map(async (module) => {
        const { count } = await admin
          .from(module.table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        return [module.title, count ?? 0] as const;
      })
    );
    const recordsByModule: Record<string, number> = {};
    let createdRecords = 0;
    for (const [title, count] of moduleCounts) {
      if (count > 0) recordsByModule[title] = count;
      createdRecords += count;
    }
    createdRecords += missionRows.length + websiteRows.length;

    const stamps = [...messageRows, ...transactionRows].map((r) => new Date(r.created_at));
    // getUTCDay() is 0-6 with Sunday 0; the observers expect ISO 1-7.
    const toIsoWeekday = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;

    return {
      counts: {
        chatMessages: messageRows.length,
        aiActions: transactionRows.length,
        createdRecords,
      },
      activity: {
        chatMessageLengths: messageRows.map((m) => (m.content ?? "").length),
        actionHoursUtc: stamps.map((d) => d.getUTCHours()),
        actionWeekdays: stamps.map(toIsoWeekday),
        recordsByModule,
        missionGoals: missionRows.map((m) => m.goal).filter(Boolean),
        missionsCompleted: missionRows.filter((m) => m.status === "completed").length,
        missionsFailed: missionRows.filter((m) => m.status === "failed").length,
        // Distinct websites that were regenerated, not total versions: ten
        // edits to one site is one dissatisfied person, not ten.
        websiteRegenerations: new Set(versionRows.map((v) => v.website_id)).size,
        websitesGenerated: websiteRows.length,
      },
    };
  } catch (err) {
    logApiError("profile:activity", err, { userId });
    return empty;
  }
}
