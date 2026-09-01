#!/usr/bin/env node
/*
 * CAN THE COST-ALERT GATE GO RED?
 *
 * Two failure modes, opposite and both silent.
 *
 *   A RULE THAT STOPS FIRING is a safety net with a hole: the runaway
 *   happens and nobody hears until the invoice.
 *
 *   A RULE THAT FIRES ON NOTHING is worse, because it is not silent — it
 *   is noisy, and the owner mutes it, and THEN the runaway happens and
 *   nobody hears.
 *
 * So the mutations come in both directions: guards removed (does the
 * quiet case go red?) and thresholds removed (does the loud case go
 * red?). A gate that only tested "it fires when it should" would pass
 * with every floor deleted.
 *
 * Run: node scripts/tests/cost-alerts.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/cost-alerts.test.mjs";

const ALERTS = "src/lib/billing/cost-alerts.ts";
const REVENUE = "src/lib/billing/monthly-revenue.ts";
const DELIVERY = "src/lib/billing/cost-alert-delivery.ts";
const ROUTE = "src/app/api/cron/cost-alerts/route.ts";
const SQL = "supabase/migrations/20260823000000_cost_alerts.sql";
const SETTINGS = "src/components/settings/margin-report.tsx";
const VERCEL = "vercel.json";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE FLOORS GO. Every one of these makes the rule fire on noise —
  // which is how the whole feature ends up muted.
  // ------------------------------------------------------------------
  {
    name: "the daily rule loses its absolute floor, so pennies become a spike",
    file: ALERTS,
    from: "  if (current < config.dailyFloorEur) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "the daily rule loses its absolute EXCESS floor",
    file: ALERTS,
    from: "  if (current - baseline < config.dailyExcessFloorEur) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "the daily rule judges on three days of history",
    file: ALERTS,
    from: "  const needed = HOURS_PER_WINDOW * (config.dailyMinDays + 1);",
    to: "  const needed = HOURS_PER_WINDOW * 2;",
  },
  {
    name: "the outlier rule fires with two users",
    file: ALERTS,
    from: "  if (eligible.length < config.userMinCount) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "the outlier rule loses its floor",
    file: ALERTS,
    from: "  if (top.costEur < config.userFloorEur) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "the margin rule judges a feature on one call",
    file: ALERTS,
    from: "    .filter((f) => f.chargedCalls >= config.marginMinChargedCalls && f.costEur >= config.marginMinCostEur)",
    to: "    .filter((f) => f.chargedCalls >= 1)",
  },
  {
    name: "the burst rule loses its floor, so 1 -> 10 calls is a burst",
    file: ALERTS,
    from: "  if (latest.calls < config.burstFloorCalls) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "a burst from a standing start needs no absolute size",
    file: ALERTS,
    from: "    if (latest.calls < config.burstFloorCalls * config.burstRatio) return null;",
    to: "    if (false) return null;",
  },
  {
    name: "a malformed env threshold disables the rule instead of falling back",
    file: ALERTS,
    from: "  return Number.isFinite(value) && value > 0 ? value : fallback;",
    to: "  return value;",
  },

  // ------------------------------------------------------------------
  // THE STATISTICS GO WRONG. Each of these still fires — on the wrong
  // thing, or not on the right one.
  // ------------------------------------------------------------------
  {
    name: "the outlier is compared against a MEAN dragged by the tail",
    file: ALERTS,
    from: "  let comparator = median(others);",
    to: "  let comparator = mean(others);",
  },
  {
    name: "the outlier is compared against a group that INCLUDES it",
    file: ALERTS,
    from: "  const others = sorted.slice(1).map((u) => u.costEur);",
    to: "  const others = sorted.map((u) => u.costEur);",
  },
  {
    name: "the owner's own account is judged like a customer",
    file: ALERTS,
    from: "  const eligible = users.filter((u) => !excludedUserIds.has(u.userId) && u.costEur > 0);",
    to: "  const eligible = users.filter((u) => u.costEur > 0);",
  },
  {
    name: "margin is averaged over calls that produced no revenue",
    file: ALERTS,
    from: "    .map((f) => ({ ...f, margin: f.marginSum / f.chargedCalls }))",
    to: "    .map((f) => ({ ...f, margin: f.marginSum / Math.max(f.chargedCalls + 100, 1) }))",
  },
  {
    name: "the margin rule reports the first shortfall rather than the worst",
    file: ALERTS,
    from: "    .sort((a, b) => a.margin - b.margin);",
    to: "    .sort(() => 0);",
  },
  {
    name: "the median of an even-length series is not a median",
    file: ALERTS,
    from: "  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;",
    to: "  return sorted[mid];",
  },

  // ------------------------------------------------------------------
  // THE DENOMINATOR. An understated revenue figure inflates every share
  // computed against it — and the first thing it decides is whether a
  // business assumption broke.
  // ------------------------------------------------------------------
  {
    // NOT `if (false) return null` — that mutant is neutralised by
    // JavaScript's own coercion (`null <= 0.02` is true), so it changes
    // nothing and proves nothing. The behaviour worth defending is that
    // an unknown share does not become an alert saying so: "we cannot
    // tell" arriving hourly is exactly the noise that gets the whole
    // feature muted.
    name: "an unknown share becomes an alert saying it is unknown",
    file: ALERTS,
    from: "  if (absorbed.shareOfRevenue === null) return null;",
    to: '  if (absorbed.shareOfRevenue === null) return { type: "absorbed_refusals", title: "Absorbed refusals: share of revenue unknown", body: "Revenue could not be computed, so the 2% ceiling could not be checked at all.", detail: { calls: absorbed.calls } };',
  },
  {
    name: "a custom-priced tier is silently counted as zero revenue",
    file: REVENUE,
    from: "    if (typeof plan.price !== \"number\") {\n      unpricedSubscribers += row.subscribers;\n      unpricedTiers.add(row.tier);\n      continue;\n    }",
    to: "    if (typeof plan.price !== \"number\") continue;",
  },
  {
    name: "a tier this app does not know is treated as free",
    file: REVENUE,
    from: "    if (!plan) {",
    to: "    if (false) {",
  },
  {
    name: "an annual subscription is priced like a monthly one",
    file: REVENUE,
    from: "    row.billingInterval === \"year\" ? (plan.price * ANNUAL_MONTHS_CHARGED) / 12 : plan.price;",
    to: "    plan.price;",
  },
  {
    name: "the exact limit fires, so 2% is a trigger rather than a ceiling",
    file: ALERTS,
    from: "  if (absorbed.shareOfRevenue <= config.absorbedShareLimit) return null;",
    to: "  if (absorbed.shareOfRevenue < config.absorbedShareLimit) return null;",
  },
  {
    name: "the margin report goes back to passing no revenue at all",
    file: SETTINGS,
    from: "  const summary = summariseMarginReport(rows, { monthlyRevenueEur: revenue });",
    to: "  const summary = summariseMarginReport(rows);",
  },
  {
    name: "the margin report passes an incomplete revenue figure",
    file: SETTINGS,
    from: "    revenue = rev.complete && rev.eur > 0 ? rev.eur : null;",
    to: "    revenue = rev.eur;",
  },

  // ------------------------------------------------------------------
  // THE RATE LIMIT AND THE DELIVERY.
  // ------------------------------------------------------------------
  {
    name: "the rate limit becomes a check-then-act race",
    file: SQL,
    from: "  insert into public.cost_alert_log (alert_type, payload)\n  select p_alert_type, coalesce(p_payload, '{}'::jsonb)\n  where not exists (",
    to: "  insert into public.cost_alert_log (alert_type, payload)\n  select p_alert_type, coalesce(p_payload, '{}'::jsonb)\n  where true or exists (",
  },
  {
    name: "the interval stops being an hour",
    file: SQL,
    from: "  p_min_interval_seconds integer default 3600",
    to: "  p_min_interval_seconds integer default 1",
  },
  {
    name: "the alert log becomes readable by customers",
    file: SQL,
    from: "alter table public.cost_alert_log enable row level security;",
    to: "alter table public.cost_alert_log enable row level security;\ncreate policy \"cost_alert_log_read\" on public.cost_alert_log for select using (true);",
  },
  {
    name: "the new functions stop being revoked from anon",
    file: SQL,
    from: "    execute format('revoke all on function public.%s from anon', fn);",
    to: "    -- removed",
  },
  {
    name: "mrr_inputs is left out of the grant loop, so anon can read the business",
    file: SQL,
    from: "    'mrr_inputs()',",
    to: "",
  },
  {
    name: "the alert is sent before the slot is claimed",
    file: DELIVERY,
    from: "  if (!outcome.fired) return outcome;\n\n  outcome.emailed = await emailOwners(alert);",
    to: "  outcome.emailed = await emailOwners(alert);\n  if (!outcome.fired) return outcome;",
  },
  {
    name: "a failed claim sends anyway",
    file: DELIVERY,
    from: "    logApiError(\"cost-alerts:claim\", err, { alertType: alert.type });\n    return outcome;",
    to: "    logApiError(\"cost-alerts:claim\", err, { alertType: alert.type });\n    outcome.fired = true;",
  },
  {
    name: "owner lookup reads only the first page again",
    file: DELIVERY,
    from: "    for (let page = 1; page <= MAX_PAGES; page += 1) {",
    to: "    for (let page = 1; page <= 1; page += 1) {",
  },

  // ------------------------------------------------------------------
  // THE SWEEP.
  // ------------------------------------------------------------------
  {
    name: "the hourly gaps are left missing, so quiet hours vanish from the baseline",
    file: ROUTE,
    from: "  const hours: HourlyPoint[] = hourRows ? fillHours(hourRows, 24 * 8) : [];",
    to: "  const hours: HourlyPoint[] = (hourRows ?? []).map((r) => ({ hour: r.hour, calls: Number(r.calls ?? 0), costEur: Number(r.cost_eur ?? 0) }));",
  },
  {
    // fillHours moved out of the route (a route file may export only its
    // handler and its config, which `next build` enforces), so the
    // anchor moved with it.
    name: "the window is anchored on the hour still being written",
    file: ALERTS,
    from: "  end.setUTCHours(end.getUTCHours() - 1);",
    to: "  // anchored on now",
  },
  {
    name: "the sweep stops excluding the owner",
    file: ROUTE,
    from: "  const excludedUserIds = new Set(await ownerUserIds());",
    to: "  const excludedUserIds = new Set<string>();",
  },
  {
    name: "a failed query is reported as a healthy zero",
    file: ROUTE,
    from: "      unavailable.push(name);\n      return null;",
    to: "      return [];",
  },
  {
    name: "the sweep runs unauthenticated",
    file: ROUTE,
    from: "  const auth = checkCronAuth(request);",
    to: "  const auth = { ok: true } as ReturnType<typeof checkCronAuth>;\n  void checkCronAuth;",
  },
  {
    name: "the sweep reads rows instead of aggregating in SQL",
    file: ROUTE,
    from: '  const hourRows = await rpc<{ hour: string; calls: number; cost_eur: string | number }>(\n    "cost_hourly_calls",\n    { p_hours: 24 * 8 }\n  );',
    to: '  const hourRows = await (async () => { await admin.from("ai_cost_log").select("created_at"); return []; })();',
  },
  {
    name: "the sweep is unscheduled",
    file: VERCEL,
    from: '    {\n      "path": "/api/cron/cost-alerts",\n      "schedule": "5 * * * *"\n    }',
    to: '    {\n      "path": "/api/cron/reset-credits",\n      "schedule": "0 3 1 * *"\n    }',
  },
  {
    name: "the sweep runs on the hour, against a half-written hour",
    file: VERCEL,
    from: '"schedule": "5 * * * *"',
    to: '"schedule": "0 * * * *"',
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // CAUGHT IS DECIDED BY THE EXIT CODE, not by the text.
  //
  // This used to be `let detail = null` … `if (detail)`, which asks "did
  // we manage to find a line saying FAIL in the child's stdout" and
  // treats a no as "the mutation was missed". A gate that exits non-zero
  // while its stdout arrives empty or truncated — which happened, twice,
  // on different mutants of the same run — was then reported as a HOLE
  // that is not there. An intermittently red mutation gate is worse than
  // none: it teaches you to re-run it until it is green.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 120)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
