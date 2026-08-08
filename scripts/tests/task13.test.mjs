// V3 Task 13 — the five missing pieces: changelog, help centre,
// lifecycle emails, micro-celebrations, feature requests.
//
// The lifecycle DECISIONS are pure (lib/email/lifecycle.ts) and tested
// as functions — the rule "real data only, never a padded email" is
// exactly the kind of claim that must fail a build, not an inbox.
// The rest is source-level: the routes exist with their guards, the
// schema carries RLS for every new table, the GDPR manifest accounts
// for them, and every UI string exists in every locale.
//
// Run: node scripts/tests/task13.test.mjs
import { readFileSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const lifecycle = await loadTs("src/lib/email/lifecycle.ts");

console.log("== 1. lifecycle emails: real data only ==");
const quiet = {
  aiActions: 0, totalEntries: 0, topModuleSlug: null,
  recentActivity: 0, websitesPublished: 0, hasUpgradeSuggestion: false,
};
const active = {
  aiActions: 5, totalEntries: 12, topModuleSlug: "trading",
  recentActivity: 4, websitesPublished: 1, hasUpgradeSuggestion: false,
};

check("day1 goes to the account that did NOTHING", lifecycle.dueLifecycleEmails(1, quiet), ["day1"]);
check("day1 is NOT sent to an active account", lifecycle.dueLifecycleEmails(1, active), []);
check("day3's tip requires a real most-used module", lifecycle.dueLifecycleEmails(3, quiet), []);
check("day3 fires for a real user", lifecycle.dueLifecycleEmails(3, active), ["day3"]);
check("day7 needs something achieved", lifecycle.dueLifecycleEmails(7, quiet), []);
check("day7 fires with real numbers", lifecycle.dueLifecycleEmails(7, active), ["day7"]);
check("day14 re-engages only the QUIET", lifecycle.dueLifecycleEmails(14, active), []);
check(
  "day14 fires for a gone-quiet account",
  lifecycle.dueLifecycleEmails(14, { ...active, recentActivity: 0 }),
  ["day14"]
);
check("day30 requires a REAL upgrade suggestion", lifecycle.dueLifecycleEmails(30, active), []);
check(
  "day30 fires when the dashboard's own rule suggests",
  lifecycle.dueLifecycleEmails(30, { ...active, hasUpgradeSuggestion: true }),
  ["day30"]
);

console.log("\n== 2. the window is a window, not a backfill ==");
check("day7 email on day 6 is not due", lifecycle.lifecycleKeyDue(6, "day7"), false);
check("day7 email on day 7 is due", lifecycle.lifecycleKeyDue(7, "day7"), true);
check("day7 email on day 8 still due (one cron slip)", lifecycle.lifecycleKeyDue(8, "day7"), true);
check("day7 email on day 9 is GONE, not backfilled", lifecycle.lifecycleKeyDue(9, "day7"), false);

console.log("\n== 3. the cron claims BEFORE it sends ==");
const cron = readFileSync("src/app/api/cron/lifecycle-emails/route.ts", "utf8");
checkTrue("cron auth guards the route", cron.includes("checkCronAuth(request)"));
const claimIndex = cron.indexOf('from("lifecycle_email_log")');
const sendIndex = cron.indexOf("await sendLifecycleEmail(");
checkTrue("the log insert (claim) comes before the send", claimIndex > 0 && claimIndex < sendIndex);
checkTrue("one lifecycle email per user per run", /sent\+\+;\s*\n\s*\/\/ One lifecycle email per user per run/.test(cron));
checkTrue("the run is bounded", cron.includes("MAX_SENDS_PER_RUN"));
checkTrue("shipped requests notify voters through the same claim", cron.includes("fr_shipped:"));
checkTrue("...and stamp shipped_notified_at exactly once", cron.includes("shipped_notified_at"));
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
checkTrue(
  "the cron is actually scheduled",
  vercel.crons.some((c) => c.path === "/api/cron/lifecycle-emails")
);

console.log("\n== 4. opt-out is wired end to end ==");
const emailTypes = readFileSync("src/lib/email/email-types.ts", "utf8");
checkTrue("lifecycle is a non-critical (togglable) type", /lifecycle: \{ critical: false \}/.test(emailTypes));
checkTrue("feature_request_shipped too", /feature_request_shipped: \{ critical: false \}/.test(emailTypes));
const migration = readFileSync("v3_task13_missing_five_migration.sql", "utf8");
checkTrue("...and both columns land in the same migration", /add column if not exists lifecycle boolean/.test(migration) && /add column if not exists feature_request_shipped boolean/.test(migration));
const sender = readFileSync("src/lib/email/send-lifecycle-email.ts", "utf8");
checkTrue("the sender goes through the email gate", sender.includes("checkEmailAllowed(userId, type)"));

console.log("\n== 5. changelog: segmentation and tracking ==");
const changelogRoute = readFileSync("src/app/api/changelog/route.ts", "utf8");
checkTrue("plan segmentation happens SERVER-side", changelogRoute.includes("resolveEffectivePlan"));
checkTrue("empty target = everyone, targeted = viewer's plan", changelogRoute.includes("target_plans.eq.{},target_plans.cs."));
checkTrue("seen-tracking writes product_update_views", changelogRoute.includes('from("product_update_views")'));
checkTrue("the mark-seen path is rate limited", changelogRoute.includes('scope: "changelog_seen"'));
const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
checkTrue("the provider is mounted once in the dashboard shell", layout.includes("<ChangelogProvider>"));
checkTrue("the modal/banner mount under the nav", layout.includes("<ChangelogNotices />"));
const topNav = readFileSync("src/components/dashboard/top-nav.tsx", "utf8");
checkTrue("the bell placeholder is gone", !topNav.includes("noNotifications"));
checkTrue("...replaced by the real bell", topNav.includes("<ChangelogBell />"));
const notices = readFileSync("src/components/changelog/changelog-notices.tsx", "utf8");
checkTrue("features get the modal", notices.includes('u.type === "feature" && !u.seen'));
checkTrue("improvements get the banner", notices.includes("unseenMinor"));

console.log("\n== 6. help centre feeds the support assistant ==");
const knowledge = readFileSync("src/lib/support/knowledge.ts", "utf8");
checkTrue("articles append to the computed corpus", knowledge.includes("buildSupportKnowledgeWithArticles"));
checkTrue("...and a DB failure falls back, never fails the question", /catch \{\s*\n\s*return base;/.test(knowledge));
const supportRoute = readFileSync("src/app/api/support/route.ts", "utf8");
checkTrue("the support route reads published articles", supportRoute.includes('from("help_articles")') && supportRoute.includes('eq("published", true)'));
checkTrue("seed articles carry no plan numbers", !/\b\d+ (presentations|research reports|credits per month)\b/.test(migration));
const pageHeader = readFileSync("src/components/dashboard/page-header.tsx", "utf8");
checkTrue("the contextual ? exists on PageHeader", pageHeader.includes("helpSlug"));
for (const [file, slug] of [
  ["src/app/dashboard/website-builder/page.tsx", "website-builder"],
  ["src/app/dashboard/mission/page.tsx", "mission-control"],
  ["src/app/onboarding/page.tsx", "your-first-minute"],
  ["src/app/dashboard/settings/page.tsx", "how-credits-work"],
]) {
  checkTrue(`${file.split("/").at(-2)} links its article`, readFileSync(file, "utf8").includes(`helpSlug="${slug}"`));
}

console.log("\n== 7. feature requests: the rules that keep the board honest ==");
const frRoute = readFileSync("src/app/api/feature-requests/route.ts", "utf8");
checkTrue("5 per day, as specified", /MAX_REQUESTS_PER_DAY = 5/.test(frRoute) && frRoute.includes("maxAttempts: MAX_REQUESTS_PER_DAY"));
checkTrue("votes column is never written by the app", !frRoute.includes("votes:") || !/update\(.*votes/.test(frRoute));
checkTrue("the trigger maintains the count", migration.includes("bump_feature_request_votes"));
checkTrue("status transitions are NOT client-writable (no update policy)", !/create policy "update_own_feature_requests"/.test(migration));
const voteRoute = readFileSync("src/app/api/feature-requests/[id]/vote/route.ts", "utf8");
checkTrue("voting is rate limited", voteRoute.includes('scope: "feature_request_vote"'));
const roadmapPage = readFileSync("src/app/roadmap/page.tsx", "utf8");
checkTrue("the public roadmap shows the community section", roadmapPage.includes("<CommunityRoadmap"));

console.log("\n== 8. micro-celebrations use the EXISTING system ==");
const guide = readFileSync("src/components/overview/onboarding-guide.tsx", "utf8");
checkTrue("the guide card fires CelebrationBurst", guide.includes("<CelebrationBurst"));
checkTrue("once per milestone, not per visit", guide.includes("ONBOARDING_CELEBRATED_KEY"));
checkTrue('"you\'re X% set up" is computed from earned counts', guide.includes("percentReady"));

console.log("\n== 9. schema hygiene ==");
const manifest = readFileSync("src/lib/gdpr/export-manifest.ts", "utf8");
for (const table of ["feature_requests", "feature_request_votes", "product_update_views", "lifecycle_email_log"]) {
  checkTrue(`${table} is in the GDPR export`, manifest.includes(`table: "${table}"`));
}
for (const table of ["product_updates", "help_articles"]) {
  checkTrue(`${table} is excluded with a reason`, new RegExp(`table: "${table}",\\s*\\n\\s*reason:`).test(manifest));
}
const backup = readFileSync("supabase_full_project_backup.sql", "utf8");
for (const table of ["product_updates", "product_update_views", "help_articles", "lifecycle_email_log", "feature_requests", "feature_request_votes"]) {
  checkTrue(`${table} has RLS in the schema`, backup.includes(`alter table public.${table} enable row level security`));
}

console.log("\n== 10. every new string exists in every locale ==");
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const KEY_PATHS = [
  ...["bellLabel","unseenBadge","whatsNew","empty","viewAll","newFeature","dismiss","gotIt","improved","andMore","pageTitle","pageSubtitle","backHome"].map((k) => ["changelog", k]),
  ...["feature","improvement","fix"].map((k) => ["changelog", "types", k]),
  ...["title","subtitle","backHome","backToHelp","searchPlaceholder","noResults"].map((k) => ["help", k]),
  ...["getting-started","modules","credits-billing","troubleshooting"].map((k) => ["help", "categories", k]),
  ["onboarding", "percentReady"],
  ...["title","intro","requestButton","signInToRequest","signInToVote","titlePlaceholder","descriptionPlaceholder","submit","submitError","loading","empty","voteLabel"].map((k) => ["communityRoadmap", k]),
  ...["under_review","planned","in_progress","shipped"].map((k) => ["communityRoadmap", "statuses", k]),
  ["settings", "emailNotifications", "types", "lifecycle", "label"],
  ["settings", "emailNotifications", "types", "feature_request_shipped", "label"],
];
for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const missing = KEY_PATHS.filter((path) => {
    let node = messages;
    for (const part of path) node = node?.[part];
    return typeof node !== "string" || node.length === 0;
  }).map((p) => p.join("."));
  check(`${locale}: all ${KEY_PATHS.length} new keys present`, missing, []);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
