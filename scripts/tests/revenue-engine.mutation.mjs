#!/usr/bin/env node
/*
 * CAN THE REVENUE GATE GO RED?
 *
 * Every defect below is somebody's money, and every one of them produces
 * a screen that looks fine.
 *
 *   A CHARGE NOBODY AGREED TO. Default the opt-in to on, skip the consent
 *   version, or let the client send its own price, and the app bills
 *   people who never saw the dialog. Nothing on screen changes.
 *
 *   A CAP THAT IS NOT A CEILING. Part-charge an action that crosses the
 *   cap and the customer paid for half a thing.
 *
 *   A DOUBLE INVOICE. Drop the "not yet billed" filter or the idempotency
 *   key and last month's overage goes on twice — a bill the customer
 *   disputes and we cannot defend.
 *
 *   A BILL FOR THE MONTH STILL RUNNING. Charges are still arriving.
 *
 *   A PAID ADD-ON THAT GRANTS NOTHING. One creator route still reading
 *   the plan alone and the +5 agents is money for nothing.
 *
 *   A BADGE THAT SURVIVES AN UPGRADE. Bake it into html_content and a
 *   paying customer's site still advertises us.
 *
 *   A METRIC THAT LOOKS LIKE A MEASUREMENT. A CAC from a spend nobody
 *   entered is infinitely good and a lie; a zero-churn LTV is infinite.
 *
 *   A CHURN EVENT THAT IS A CARD UPDATE. Stripe sends one event for both.
 *
 * Run: node scripts/tests/revenue-engine.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/revenue-engine.test.mjs";
const AGENTS_GATE = "scripts/tests/agents.test.mjs";

const OVERAGE = "src/lib/billing/overage.ts";
const STORE = "src/lib/billing/overage-store.ts";
const INVOICE = "src/lib/billing/overage-invoice.ts";
const RESERVE = "src/lib/billing/reservations.ts";
const ADDONS = "src/lib/billing/addons.ts";
const BADGE = "src/lib/publishing/badge.ts";
const METRICS = "src/lib/billing/metrics.ts";
const KIND = "src/lib/billing/subscription-kind.ts";
const ROUTE = "src/app/api/billing/overage/route.ts";
const AGENTS_ROUTE = "src/app/api/agents/route.ts";
const UI = "src/components/settings/overage-settings.tsx";
const SQL = "supabase/migrations/20260903000000_revenue_engine.sql";

const MUTANTS = [
  // ------------------------------------------------------------------
  // A CHARGE NOBODY AGREED TO.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "overage defaults to ON when there is no settings row",
    file: OVERAGE,
    from: "  if (!settings.enabled) return refuse(\"not_enabled\");",
    to: "  if (false) return refuse(\"not_enabled\");",
  },
  {
    gate: GATE,
    name: "consent under superseded terms is still treated as consent",
    file: OVERAGE,
    from: "  if (settings.consentVersion === null || settings.consentVersion < version) {",
    to: "  if (false) {",
  },
  {
    gate: GATE,
    name: "the stored OFF default has enabled: true",
    file: OVERAGE,
    from: "export const OVERAGE_OFF: OverageSettings = {\n  enabled: false,",
    to: "export const OVERAGE_OFF: OverageSettings = {\n  enabled: true,",
  },
  {
    gate: GATE,
    name: "the client gets to send its own price per credit",
    file: ROUTE,
    from: "      pricePerCreditEur: OVERAGE_PRICE_EUR_PER_CREDIT,",
    to: "      pricePerCreditEur: Number((body as { price?: unknown }).price) || OVERAGE_PRICE_EUR_PER_CREDIT,",
  },
  {
    gate: GATE,
    name: "a load failure falls back to overage ON",
    file: STORE,
    from: "    return { ...OVERAGE_OFF, spentEur: 0, month };\n  }\n}",
    to: "    return { ...OVERAGE_OFF, enabled: true, spentEur: 0, month };\n  }\n}",
  },

  // ------------------------------------------------------------------
  // A CAP THAT IS NOT A CEILING.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "an action that crosses the cap is part-charged up to it",
    file: OVERAGE,
    from: "  if (amountEur > remainingEur) {\n    return { allowed: false, reason: \"would_exceed_cap\", spentEur, capEur: settings.capEur };\n  }",
    to: "  if (amountEur > remainingEur) {\n    return { allowed: true, credits: shortfall, pricePerCreditEur: settings.pricePerCreditEur, amountEur: remainingEur };\n  }",
  },
  {
    gate: GATE,
    name: "a cap already reached no longer stops anything",
    file: OVERAGE,
    from: "  const remainingEur = round2(settings.capEur - spentEur);\n  if (remainingEur <= 0) return refuse(\"cap_reached\");",
    to: "  const remainingEur = round2(settings.capEur - spentEur);\n  if (false) return refuse(\"cap_reached\");",
  },

  // ------------------------------------------------------------------
  // THE ORDER THAT DECIDES WHO LOSES ON A CRASH.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "a ledger write that failed no longer stops the action",
    file: RESERVE,
    from: "    if (!ledgerId) return unavailable;",
    to: "    if (!ledgerId) { /* carry on */ }",
  },
  {
    gate: GATE,
    name: "the overage grant is no longer idempotent, so a retry grants twice",
    file: RESERVE,
    from: "{ purchased: true, idempotencyKey: `overage:${ledgerId}` }",
    to: "{ purchased: true }",
  },
  {
    gate: GATE,
    name: "an insufficient refusal stops saying why overage did not cover it",
    file: RESERVE,
    from: "        overage: topUp.ok\n          ? { reason: \"unavailable\", spentEur: 0, capEur: null }\n          : topUp.refusal,",
    to: "        overage: { reason: \"unavailable\", spentEur: 0, capEur: null },",
  },
  {
    gate: GATE,
    name: "the pre-check goes back to balance only, so ten routes refuse before overage is reached",
    file: "src/lib/billing/credits.ts",
    from: "    const { checkOverage } = await import(\"@/lib/billing/overage-store\");",
    to: "    const checkOverage = async () => ({ decision: { allowed: false } });",
  },
  {
    gate: GATE,
    name: "the 80% and 100% warnings stop being sent after a charge",
    file: RESERVE,
    from: "    await sendOverageWarnings({ userId: params.userId, state: await loadOverageState(params.userId) });",
    to: "    // warnings removed",
  },
  {
    gate: GATE,
    name: "a warning repeats on every action for the rest of the month",
    file: OVERAGE,
    from: "  if (share >= WARN_AT[0] && params.warned80Month !== params.month) due.push(\"80\");",
    to: "  if (share >= WARN_AT[0]) due.push(\"80\");",
  },

  // ------------------------------------------------------------------
  // A DOUBLE INVOICE, AND A BILL FOR THE MONTH STILL RUNNING.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "already-invoiced ledger rows are billed again",
    file: INVOICE,
    from: "    .is(\"stripe_invoice_item_id\", null)\n    .is(\"invoiced_at\", null)",
    to: "    .is(\"invoiced_at\", null)",
  },
  {
    gate: GATE,
    name: "the Stripe call loses its idempotency key, so a retried cron bills twice",
    file: INVOICE,
    from: "        { idempotencyKey: `overage:${userId}:${month}` }",
    to: "        {}",
  },
  {
    gate: GATE,
    name: "a day is re-appended to a date that already has one, so nobody is ever billed",
    file: INVOICE,
    from: "    .eq(\"billing_month\", month)",
    to: "    .eq(\"billing_month\", `${month}-01`)",
  },
  {
    gate: GATE,
    name: "the month still running is invoiced",
    file: INVOICE,
    from: "  const month = previousMonth(monthKey(now));",
    to: "  const month = monthKey(now);",
  },
  {
    gate: GATE,
    name: "the invoice amount is sent in euros, so everyone is charged a hundredfold",
    file: INVOICE,
    from: "          amount: Math.round(amountEur * 100),",
    to: "          amount: Math.round(amountEur),",
  },
  {
    gate: GATE,
    name: "an overage billing failure takes the monthly credit grant down with it",
    file: "src/app/api/cron/monthly-credits/route.ts",
    from: "    } catch (invoiceError) {\n      logApiError(\"/api/cron/monthly-credits\", invoiceError, { stage: \"overage_invoice\" });\n    }",
    to: "    } finally {\n      // swallowed\n    }",
  },

  // ------------------------------------------------------------------
  // A PAID ADD-ON THAT GRANTS NOTHING.
  // ------------------------------------------------------------------
  {
    gate: AGENTS_GATE,
    name: "one creator route goes back to reading the plan cap alone",
    file: AGENTS_ROUTE,
    from: "maxAgentsForAccount(",
    to: "maxAgentsForPlan(",
  },
  {
    gate: GATE,
    name: "priority execution can be bought a second time, at EUR20/month for nothing",
    file: ADDONS,
    from: "  if (spec.stackable) return { ok: true };",
    to: "  return { ok: true };\n  if (spec.stackable) return { ok: true };",
  },
  {
    gate: GATE,
    name: "an add-on with no configured price id is offered anyway",
    file: ADDONS,
    from: "  if (!priceId || !priceId.trim()) return { available: false, reason: \"not_configured\", envVar: spec.priceEnvVar };",
    to: "  if (false) return { available: false, reason: \"not_configured\", envVar: spec.priceEnvVar };",
  },
  {
    gate: GATE,
    name: "a cancelled add-on the customer already paid for is revoked immediately",
    file: ADDONS,
    from: "  if (addon.status === \"active\") return true;\n  if (!addon.expiresAt) return false;",
    to: "  if (addon.status !== \"active\") return false;\n  if (!addon.expiresAt) return false;",
  },

  // ------------------------------------------------------------------
  // A BADGE ON THE WRONG SITES.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "the badge goes on every plan, not just Free",
    file: BADGE,
    from: "export const BADGED_PLANS = new Set([\"free\"]);",
    to: "export const BADGED_PLANS = new Set([\"free\", \"starter\", \"growth\", \"professional\", \"ultimate\", \"enterprise\"]);",
  },
  {
    gate: GATE,
    name: "an account with no plan slug is treated as paid, so Free sites lose the badge",
    file: BADGE,
    from: "  return BADGED_PLANS.has((planSlug ?? \"free\").trim().toLowerCase() || \"free\");",
    to: "  return BADGED_PLANS.has((planSlug ?? \"\").trim().toLowerCase());",
  },
  {
    gate: GATE,
    name: "the badge is injected twice on a re-served page",
    file: BADGE,
    from: "  if (html.includes(BADGE_MARKER)) return html;",
    to: "  if (false) return html;",
  },
  {
    gate: GATE,
    name: "the serve route stops reading the owner's CURRENT plan",
    file: "src/app/s/[subdomain]/route.ts",
    from: "readOwnerTier(admin, site.user_id),",
    to: "Promise.resolve(\"free\"),",
  },

  // ------------------------------------------------------------------
  // A METRIC THAT LOOKS LIKE A MEASUREMENT.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "CAC is computed from a marketing spend nobody entered",
    file: METRICS,
    from: "  if (inputs.marketingSpendEur === null) {\n    out.push({ key: \"cacEur\", unit: \"eur\", state: \"needs_input\", missing: [\"marketing_spend\"] });",
    to: "  if (false) {\n    out.push({ key: \"cacEur\", unit: \"eur\", state: \"needs_input\", missing: [\"marketing_spend\"] });",
  },
  {
    gate: GATE,
    name: "LTV divides by a churn of zero and reports infinity",
    file: METRICS,
    from: "  } else if (churnMetric.value <= 0) {",
    to: "  } else if (false) {",
  },
  {
    gate: GATE,
    name: "a metric computed from one month of history is presented as a trend",
    file: METRICS,
    from: "export const MIN_MONTHS_FOR_COHORT = 2;",
    to: "export const MIN_MONTHS_FOR_COHORT = 0;",
  },
  {
    gate: GATE,
    name: "a trend from a zero base reports an infinite percentage change",
    file: METRICS,
    from: "  if (first <= 0) return null;",
    to: "  if (false) return null;",
  },

  // ------------------------------------------------------------------
  // A CHURN EVENT THAT IS A CARD UPDATE.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "a card update on an unchanged plan is recorded as a subscription event",
    file: KIND,
    from: "  return null;\n}",
    to: "  return \"upgraded\";\n}",
  },
  {
    gate: GATE,
    name: "a win-back is counted as a brand new customer, inflating acquisition",
    file: KIND,
    from: "    return params.fromTier === null ? \"started\" : \"reactivated\";",
    to: "    return \"started\";",
  },
  {
    gate: GATE,
    name: "a downgrade is recorded as an upgrade",
    file: KIND,
    from: "  if (params.fromTier !== params.toTier) return after > before ? \"upgraded\" : after < before ? \"downgraded\" : \"upgraded\";",
    to: "  if (params.fromTier !== params.toTier) return \"upgraded\";",
  },
  {
    gate: GATE,
    name: "free to free is recorded as a started subscription",
    file: KIND,
    from: "  if (!fromPaid && !toPaid) return null;",
    to: "  if (!fromPaid && !toPaid) return \"started\";",
  },

  // ------------------------------------------------------------------
  // THE UI THAT ASKS THE QUESTION.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "the cap arrives pre-filled, so the limit is one we chose for them",
    file: UI,
    from: "  const [cap, setCap] = useState(\"\");",
    to: "  const [cap, setCap] = useState(\"50\");",
  },
  {
    gate: GATE,
    name: "the agree button is live before a valid cap is typed",
    file: UI,
    from: "            disabled={busy || !capValid}",
    to: "            disabled={busy}",
  },
  {
    gate: GATE,
    name: "the panel disappears from the settings page",
    file: "src/app/dashboard/settings/page.tsx",
    from: "        <OverageSettings />",
    to: "        {null}",
  },

  // ------------------------------------------------------------------
  // THE SCHEMA.
  // ------------------------------------------------------------------
  {
    gate: GATE,
    name: "the revenue tables become readable by any signed-in client",
    file: SQL,
    from: "revoke all on public.revenue_snapshots from anon, authenticated;",
    to: "grant select on public.revenue_snapshots to authenticated;",
  },
  {
    gate: GATE,
    name: "the delete policy goes, so cancelling silently deletes zero rows",
    file: SQL,
    from: "create policy usage_overage_settings_delete_own on public.usage_overage_settings\n  for delete using (auth.uid() = user_id);",
    to: "-- policy removed",
  },
  {
    gate: GATE,
    name: "the tier lookup the badge uses becomes callable by anyone",
    file: SQL,
    from: "revoke all on function public.account_tier(uuid) from public, anon, authenticated;",
    to: "-- revoked",
  },
];

let caught = 0;
const missed = [];

for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
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
  // DECIDED BY THE EXIT CODE, never by grepping stdout for FAIL: a gate
  // that dies on a syntax error and prints nothing has still gone red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [m.gate], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

for (const gate of [GATE, AGENTS_GATE]) {
  try {
    execFileSync("node", [gate], { stdio: "pipe" });
  } catch {
    console.log(`\nBASELINE IS RED (${gate}) — a mutation was not restored. Check \`git diff\`.`);
    process.exit(1);
  }
}
console.log("\nbaseline: both gates are green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a gate red.");
