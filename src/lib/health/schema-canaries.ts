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
  // OBSERVED MISSING IN PRODUCTION, 2026-09-02, and OLDER than the window
  // the gate derives from. It is here because a live database was without
  // it, which is evidence no heuristic can argue with.
  {
    kind: "function",
    fn: "merge_user_metadata",
    migration: "20260910000000_merge_user_metadata.sql",
    breaks: "seven call sites — the Stripe webhook, /auth/callback, /api/checkout and four more — fall back to read-modify-write on user_metadata, so concurrent writes overwrite each other",
  },
  {
    kind: "function",
    fn: "settle_reservation",
    migration: "20260815_purchased_credits.sql",
    breaks: "credit reservations are never settled — users are charged and not credited",
  },
  // V4.6 — the Stop button. Without the column the cancel routes 500 and
  // the workers never see a stop; a person presses Stop and is charged
  // for the whole run.
  {
    kind: "column",
    table: "ai_jobs",
    column: "cancel_requested_at",
    migration: "20260924000000_stop_requests.sql",
    breaks: "Stop on a background job (agents, files, analysis) fails; the job runs and charges to the end",
  },
  {
    kind: "column",
    table: "user_websites",
    column: "cancel_requested_at",
    migration: "20260924000000_stop_requests.sql",
    breaks: "Stop on a website generation fails; the stream runs and charges to the end",
  },
  {
    kind: "column",
    table: "research_reports",
    column: "cancel_requested_at",
    migration: "20260924000000_stop_requests.sql",
    breaks: "Stop on a research report fails; every question is answered and charged",
  },
  // V4.6 — what the code did to a generated site. Without the column the
  // worker's final update is rejected by PostgREST and the site stays on
  // 'processing' until the stale reaper fails it — after the charge.
  {
    kind: "column",
    table: "user_websites",
    column: "generation_notes",
    migration: "20260925000000_website_generation_notes.sql",
    breaks: "every website generation ends 'failed' after being charged: the row update carrying the notes is rejected",
  },
  // V4.6 — MRR from paid subscriptions only. The function exists since the
  // revenue engine; this version is what stops a beta account with a tier
  // and no Stripe subscription from counting as EUR 2000 of MRR.
  {
    kind: "function",
    fn: "mrr_inputs",
    migration: "20260923000000_mrr_paid_only.sql",
    breaks: "Business Health shows no MRR/ARR at all, or — on the previous version — counts unpaid beta tiers as revenue",
  },
  // ------------------------------------------------------------------
  // 2026-09-11 — THE THREE SCREENS THE OWNER TRIED, none of which had a
  // canary. Their migrations are the three newest in the tree and every
  // one of them is applied by hand; /api/health answered
  // {"schema":{"ok":true,"checked":16,"missing":[]}} while nothing in the
  // list reached past 20260925.
  //
  // schema-canaries.test.mjs §3 now requires one canary per migration in
  // the window, which is what would have said so.
  // ------------------------------------------------------------------
  {
    kind: "column",
    table: "ai_presentations",
    column: "slides",
    migration: "20260929000000_presentation_decks.sql",
    breaks: "Presentations: every deck fails to save AFTER the model has run and the credits are spent — the row carrying the slides is rejected",
  },
  {
    kind: "table",
    table: "generated_posts",
    migration: "20260930000000_generated_posts.sql",
    breaks: "Posts: every generated post fails to save after the model has run; the person waits, is charged, and gets nothing",
  },
  {
    kind: "table",
    table: "projects",
    migration: "20261001000000_projects.sql",
    breaks: "Projects: the page can neither list nor create a project — every request is rejected",
  },
  // ------------------------------------------------------------------
  // 2026-09-11 — THE RPCs src CALLS, after a sweep found 27 of them with
  // no canary and one canary guarding a function nothing calls any more.
  //
  // `search_all` was the canary; api/search/route.ts moved to
  // `search_all_localized` in 20260914 and the canary stayed behind. So
  // the probe was watching a forwarder while the function every ⌘K query
  // depends on went unwatched — the same shape as the six functions this
  // endpoint once reported missing while all six existed, pointed the
  // other way.
  //
  // rpc-canaries.test.mjs now derives this set from the `.rpc("…")` calls
  // in src/ and requires each one to be either a canary here or a named
  // exemption carrying a reason, so the list cannot fall behind the code
  // again without a red build.
  // ------------------------------------------------------------------
  {
    kind: "function",
    fn: "search_all_localized",
    migration: "20260914000000_search_index_locale.sql",
    breaks: "every ⌘K search fails — api/search calls this and nothing else; search_all survives only as a forwarder nothing calls",
  },
  {
    kind: "function",
    fn: "deduct_credits_atomic",
    migration: "20260815_purchased_credits.sql",
    breaks: "every paid action refuses at the charge: credits are never deducted and no work is done",
  },
  {
    kind: "function",
    fn: "grant_credits_idempotent",
    migration: "20260805_idempotent_credit_grants.sql",
    breaks: "a completed Stripe payment never becomes credits",
  },
  {
    kind: "function",
    fn: "reset_monthly_credits",
    migration: "20260815_purchased_credits.sql",
    breaks: "a subscriber's monthly allowance never refills",
  },
  {
    kind: "function",
    fn: "reset_monthly_credits_for_unbilled",
    migration: "20260813_monthly_credit_reset.sql",
    breaks: "the monthly reset cron fails; unbilled accounts keep last month's balance indefinitely",
  },
  {
    kind: "function",
    fn: "claim_affiliate_commissions",
    migration: "20260820000000_affiliate.sql",
    breaks: "an affiliate's earned commissions can never be claimed",
  },
  {
    kind: "function",
    fn: "consume_voice_seconds",
    migration: "20260827000000_voice_usage.sql",
    breaks: "voice transcription and speech refuse every request",
  },
  {
    kind: "function",
    fn: "voice_usage_this_month",
    migration: "20260827000000_voice_usage.sql",
    breaks: "the voice quota cannot be read, so the monthly cap cannot be enforced",
  },
  {
    kind: "function",
    fn: "mark_cost_alert_delivered",
    migration: "20260823000000_cost_alerts.sql",
    breaks: "a delivered cost alert is never marked, so the same alert is sent again on every cron tick",
  },
  {
    kind: "function",
    fn: "pwa_adoption_summary",
    migration: "20260823000000_pwa_client_stats.sql",
    breaks: "/dashboard/system-health cannot report PWA adoption (the panel says so itself and names the migration)",
  },
  {
    kind: "function",
    fn: "record_template_use",
    migration: "20260826000000_agent_templates.sql",
    breaks: "adopting an agent template fails after the agent has already been created",
  },
  {
    kind: "function",
    fn: "forget_user_in_production_errors",
    migration: "20260808_gdpr_erasure_gaps.sql",
    breaks: "account deletion completes while the deleted user's id stays queryable in production_errors — an Article 17 erasure that did not erase",
  },
  {
    kind: "function",
    fn: "badge_removals_due",
    migration: "20260905000000_badge_removal_credits.sql",
    breaks: "the badge-removal cron fails, so a paid badge removal never takes effect",
  },
  {
    kind: "function",
    fn: "site_shows_badge",
    migration: "20260905000000_badge_removal_credits.sql",
    breaks: "every published site shows the badge — the decision fails towards the badge on purpose, including on sites that paid to remove it",
  },
  {
    kind: "function",
    fn: "routing_savings",
    migration: "20260904000000_model_routing.sql",
    breaks: "the routing panel cannot show what the cheaper models saved",
  },
  {
    kind: "function",
    fn: "routing_success_rates",
    migration: "20260904000000_model_routing.sql",
    breaks: "the router cannot read its own success rates, so it stops learning from outcomes",
  },
  {
    kind: "function",
    fn: "prune_transition_suggestions",
    migration: "20260927000000_transition_suggestions.sql",
    breaks: "the nav-retention cron fails, so transition_suggestions grows unbounded",
  },
  {
    kind: "function",
    fn: "subscription_cohort",
    migration: "20260903000000_revenue_engine.sql",
    breaks: "Business Health cannot show cohort retention",
  },
];
