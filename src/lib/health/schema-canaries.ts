/**
 * THE OBJECTS A DEPLOY IS MOST LIKELY TO BE AHEAD OF.
 *
 * /dashboard/overview went down because `home_seen_at` — added by
 * 20260914000000_home_seen_at.sql — was not in the production database.
 * PostgREST answered 400, the page discarded the error, read null as "not
 * onboarded", and redirected every user to /onboarding. It never threw,
 * so nothing caught it, and /api/health said db:true because the database
 * was answering perfectly.
 *
 * IT WAS RIGHT TO SAY db:true. The probe deliberately reads
 * user_onboarding.user_id — a column present since the baseline schema —
 * because an earlier version probed the NEWEST table and reported
 * "database down" every time the schema was one migration behind, which
 * is the single most common state a deploying project is ever in.
 *
 * So drift is a SEPARATE QUESTION from liveness, and this is the list it
 * is asked about: the newest additive objects, the ones a database is
 * most likely not to have yet. `db` still means "did it answer".
 * `schema` means "does it have what this build asks for".
 *
 * DECLARED HERE, KEPT HONEST BY A GATE.
 * scripts/tests/schema-canaries.test.mjs derives the objects the newest
 * migrations add and fails if this list drifts from them — the same
 * arrangement as ROUTE_GROUPS in lib/i18n/message-slices.ts, and for the
 * same reason: a hand-written list that nothing checks is a comment.
 */

export type SchemaCanary = {
  /** What to probe. A column is `table.column`; a function is its name. */
  readonly kind: "column" | "table" | "function";
  readonly table?: string;
  readonly column?: string;
  readonly fn?: string;
  /** The migration that adds it — printed so the fix is one file away. */
  readonly migration: string;
  /** What a user sees when it is missing. */
  readonly breaks: string;
};

export const SCHEMA_CANARIES: readonly SchemaCanary[] = [
  {
    kind: "column",
    table: "user_onboarding",
    column: "home_seen_at",
    migration: "20260914000000_home_seen_at.sql",
    breaks: "/dashboard/overview redirects every user to /onboarding",
  },
  {
    kind: "table",
    table: "nav_events",
    migration: "20260915000000_nav_events.sql",
    breaks: "navigation tracking 404s on every page load",
  },
  {
    kind: "function",
    fn: "consume_rate_limit",
    migration: "20260919000000_atomic_rate_limit.sql",
    breaks: "rate limiting falls back to a read-then-write race",
  },
  {
    kind: "function",
    fn: "record_cost_alert",
    migration: "20260922000000_cost_alert_once.sql",
    breaks: "cost alerts send repeatedly instead of once",
  },
  {
    kind: "function",
    fn: "increment_daily_ai_spend",
    migration: "20260921000000_daily_spend_call_count.sql",
    breaks: "the daily spend ceiling stops counting calls",
  },
  // FOUND BY THE GATE, NOT BY ME. The first version of this list held the
  // five objects I happened to remember from one session. The rule —
  // recently added AND read by src/ — named five more, each one a page
  // that fails while `db` stays true.
  {
    kind: "function",
    fn: "search_all",
    migration: "20260824000000_unified_search.sql",
    breaks: "⌘K search returns nothing, on every query",
  },
  {
    kind: "function",
    fn: "match_agent_templates",
    migration: "20260826000000_agent_templates.sql",
    breaks: "the agent template picker offers no templates",
  },
  {
    kind: "function",
    fn: "prune_nav_events",
    migration: "20260915000000_nav_events.sql",
    breaks: "the nav-retention cron fails and nav_events grows unbounded",
  },
  {
    kind: "function",
    fn: "db_exposure_report",
    migration: "20260917000000_db_exposure_report.sql",
    breaks: "/dashboard/system-health cannot report what the database exposes",
  },
  {
    kind: "function",
    fn: "settle_reservation",
    migration: "20260815_purchased_credits.sql",
    breaks: "credit reservations are never settled — users are charged and not credited",
  },
];
