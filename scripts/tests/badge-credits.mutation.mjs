#!/usr/bin/env node
/*
 * CAN THE BADGE-CREDITS GATE GO RED?
 *
 * scripts/tests/badge-credits.test.mjs asserts that badge removal cannot
 * be sold twice, cannot be paid for with credits we gave away, and cannot
 * be taken back from somebody who already paid for the month. A gate that
 * passes on a broken tree asserts nothing at all, so every defect below is
 * re-introduced into the real source and the gate has to notice.
 *
 * Each one is money, and every one of them leaves a screen that looks
 * fine:
 *
 *   A PRICE BELOW THE FREE GRANT. Free accounts are granted 100 credits a
 *   month and the reset REPLACES the grant rather than adding to it. At
 *   200 the grant can never cover removal; at 100 or 50 we pay ourselves,
 *   every month, for ever, to delete our own attribution. The button
 *   still works.
 *
 *   A DOUBLE CHARGE. A Starter+ account already has the badge removed by
 *   its plan. Check the credits first, or drop the refusal, and it is
 *   charged 200 credits for something it already bought — and the VISIBLE
 *   result is identical, because the badge is gone either way. Only the
 *   ORDER of the two checks distinguishes taking the money from not.
 *
 *   A CANCELLATION THAT TAKES BACK A PAID MONTH. Cancelling stops the
 *   NEXT charge. Read cancelled_at as "off now" and we keep their credits
 *   and their badge comes back mid-month.
 *
 *   AN OFF-BY-ONE AT THE PRICE. `<=` where `<` belongs and a customer
 *   with exactly the price is refused; the other way and one credit short
 *   is served free.
 *
 *   A WARNING THAT IS A LIE, or one that fires every day for a week until
 *   it is muted — and this is the notification that costs money to
 *   ignore. Or a lapse with the credits sitting right there.
 *
 *   A MONTH THAT ROUNDS TO THE WRONG DAY. monthStart is the ONE place the
 *   badge month is derived; return the actual day and the stored row and
 *   the renewal query disagree for ever.
 *
 *   A SCHEMA THAT LETS THE CHARGE HAPPEN TWICE. Lose the unique
 *   (site_id, covers_month) and two tabs buy 400 credits of one month of
 *   one site. Grant insert and the customer writes the row that says
 *   money moved.
 *
 *   A FAIL-SAFE POINTING THE WRONG WAY. The serve path fails TOWARDS the
 *   badge on purpose: a hiccup that badges a paying site is visible to
 *   somebody who can tell us, one that un-badges a free site costs us the
 *   upsell silently on every view.
 *
 * Run: node scripts/tests/badge-credits.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/badge-credits.test.mjs";

const CREDITS = "src/lib/publishing/badge-credits.ts";
const STORE = "src/lib/publishing/badge-credits-store.ts";
const DECISION = "src/lib/publishing/badge-decision.ts";
const BADGE = "src/lib/publishing/badge.ts";
const SQL = "supabase/migrations/20260905000000_badge_removal_credits.sql";

const MUTANTS = [
  // ------------------------------------------------------------------
  // A PRICE BELOW THE FREE GRANT.
  // ------------------------------------------------------------------
  {
    name: "removal costs exactly the free monthly grant, so we pay ourselves to delete our own badge",
    file: CREDITS,
    from: "export const BADGE_REMOVAL_CREDITS_PER_MONTH = 200;",
    to: "export const BADGE_REMOVAL_CREDITS_PER_MONTH = 100;",
  },
  {
    name: "removal is priced at half the free grant, so every free account gets it free for ever",
    file: CREDITS,
    from: "export const BADGE_REMOVAL_CREDITS_PER_MONTH = 200;",
    to: "export const BADGE_REMOVAL_CREDITS_PER_MONTH = 50;",
  },

  // ------------------------------------------------------------------
  // A DOUBLE CHARGE.
  // ------------------------------------------------------------------
  {
    name: "a paying customer's credits are checked before its plan, so Starter+ gets charged for what it already owns",
    file: CREDITS,
    from:
      "  const slug = (params.planSlug ?? \"free\").trim().toLowerCase() || \"free\";\n" +
      "  // NEVER A DOUBLE CHARGE. A Starter+ account asking to buy badge removal",
    to:
      "  const slug = (params.planSlug ?? \"free\").trim().toLowerCase() || \"free\";\n" +
      "  if (params.creditsRemaining < BADGE_REMOVAL_CREDITS_PER_MONTH) {\n" +
      "    return { ok: false, reason: \"insufficient_credits\" };\n" +
      "  }\n" +
      "  // NEVER A DOUBLE CHARGE. A Starter+ account asking to buy badge removal",
  },
  {
    name: "nothing stops a paid plan from buying badge removal a second time in credits",
    file: CREDITS,
    from: "  if (!BADGE_REMOVAL_APPLIES_TO.has(slug)) return { ok: false, reason: \"already_free\" };",
    to: "  void slug;",
  },
  {
    name: "the serve-time decision looks at the purchase before the plan, so the paid tier stops being the reason",
    file: CREDITS,
    from:
      "  if (!BADGE_REMOVAL_APPLIES_TO.has(slug)) return false;\n" +
      "  const removal = params.removal;\n" +
      "  if (!removal || !removal.active) return true;\n" +
      "  return false;",
    to:
      "  const removal = params.removal;\n" +
      "  if (!removal || !removal.active) return true;\n" +
      "  if (!BADGE_REMOVAL_APPLIES_TO.has(slug)) return false;\n" +
      "  return false;",
  },
  {
    name: "an account with no plan slug is read as paid, so free sites quietly lose the badge",
    file: CREDITS,
    from:
      "  const slug = (params.planSlug ?? \"free\").trim().toLowerCase() || \"free\";\n" +
      "  // PAID PLANS ARE DONE HERE.",
    to:
      "  const slug = (params.planSlug ?? \"starter\").trim().toLowerCase() || \"starter\";\n" +
      "  // PAID PLANS ARE DONE HERE.",
  },

  // ------------------------------------------------------------------
  // A ROW THAT IS NOT COVER, AND A MONTH TAKEN BACK.
  // ------------------------------------------------------------------
  {
    name: "a removal row that is not active still hides the badge, so an unpaid month is served as paid",
    file: CREDITS,
    from: "  if (!removal || !removal.active) return true;\n  return false;",
    to: "  if (!removal) return true;\n  return false;",
  },
  {
    name: "cancelling auto-renewal brings the badge back mid-month, on a month already paid for",
    file: CREDITS,
    from: "  if (!removal || !removal.active) return true;\n  return false;",
    to: "  if (!removal || !removal.active || removal.cancelledAt) return true;\n  return false;",
  },

  // ------------------------------------------------------------------
  // AN OFF-BY-ONE AT THE PRICE.
  // ------------------------------------------------------------------
  {
    name: "a balance of exactly the price is refused as insufficient",
    file: CREDITS,
    from: "  if (params.creditsRemaining < BADGE_REMOVAL_CREDITS_PER_MONTH) {",
    to: "  if (params.creditsRemaining <= BADGE_REMOVAL_CREDITS_PER_MONTH) {",
  },
  {
    name: "one credit short of the price buys the month anyway",
    file: CREDITS,
    from: "  if (params.creditsRemaining < BADGE_REMOVAL_CREDITS_PER_MONTH) {",
    to: "  if (params.creditsRemaining + 1 < BADGE_REMOVAL_CREDITS_PER_MONTH) {",
  },

  // ------------------------------------------------------------------
  // A WARNING THAT IS A LIE, AND A LAPSE THAT IS NOT ONE.
  // ------------------------------------------------------------------
  {
    name: "the badge-returning warning goes out to people whose credits already cover the renewal",
    file: CREDITS,
    from:
      "    if (params.creditsRemaining >= BADGE_REMOVAL_CREDITS_PER_MONTH) {\n" +
      "      return { action: \"nothing\", why: \"covered — enough credits to renew\" };\n" +
      "    }",
    to: "    // warned regardless of the balance",
  },
  {
    name: "the daily cron re-sends the same warning every day until it is muted",
    file: CREDITS,
    from:
      "    if (params.warnedForMonth === removal.coversMonth) {\n" +
      "      return { action: \"nothing\", why: \"already warned for this month\" };\n" +
      "    }",
    to: "    // warned again every day",
  },
  {
    name: "the badge comes back on expiry even though the credits to renew are sitting there",
    file: CREDITS,
    from: "  if (params.creditsRemaining >= BADGE_REMOVAL_CREDITS_PER_MONTH) return { action: \"renew\" };",
    to: "  if (false) return { action: \"renew\" };",
  },
  {
    name: "a renewal is charged on expiry to an account that cannot pay for it",
    file: CREDITS,
    from: "  return { action: \"lapse\" };",
    to: "  return { action: \"renew\" };",
  },
  {
    name: "the seven-day heads-up window closes, so the first news of a lapse is the badge",
    file: CREDITS,
    from: "export const BADGE_WARNING_DAYS = 7;",
    to: "export const BADGE_WARNING_DAYS = 0;",
  },

  // ------------------------------------------------------------------
  // A MONTH THAT ROUNDS TO THE WRONG DAY.
  // ------------------------------------------------------------------
  {
    name: "a month's cover expires on its own first day, so it is dead before it is sold",
    file: CREDITS,
    from: "  return nextMonth(coversMonth);",
    to: "  return coversMonth;",
  },
  {
    name: "the badge month is stored as the day of purchase, so no renewal query ever finds the row",
    file: CREDITS,
    from:
      "  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, \"0\")}-01`;",
    to:
      "  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, \"0\")}-${String(at.getUTCDate()).padStart(2, \"0\")}`;",
  },

  // ------------------------------------------------------------------
  // WHAT THE CUSTOMER IS SHOWN BEFORE THEY AGREE.
  // ------------------------------------------------------------------
  {
    name: "an account with no sites is told its balance covers infinitely many months",
    file: CREDITS,
    from: "      totalCreditsPerMonth <= 0 ? 0 : Math.floor(params.creditsRemaining / totalCreditsPerMonth),",
    to: "      Math.floor(params.creditsRemaining / totalCreditsPerMonth),",
  },

  // ------------------------------------------------------------------
  // THE SCHEMA.
  // ------------------------------------------------------------------
  {
    name: "one site can be charged twice for the same month, because the database stops refusing it",
    file: SQL,
    from: "  constraint site_badge_removals_one_per_site_month unique (site_id, covers_month)",
    to: "  constraint site_badge_removals_one_per_site_month check (extract(month from covers_month) between 1 and 12)",
  },
  {
    name: "the serve-path SQL asks whether they paid before it asks what they are on, so paid plans reach the credit question",
    file: SQL,
    from:
      "    when coalesce(\n" +
      "           (select public.account_tier(s.user_id) from public.published_sites s where s.id = p_site_id),\n" +
      "           'free') <> 'free'\n" +
      "      then false\n" +
      "    when exists (\n" +
      "      select 1 from public.site_badge_removals r\n" +
      "      where r.site_id = p_site_id\n" +
      "        and r.covers_month = date_trunc('month', now() at time zone 'utc')::date\n" +
      "    ) then false",
    to:
      "    when exists (\n" +
      "      select 1 from public.site_badge_removals r\n" +
      "      where r.site_id = p_site_id\n" +
      "        and r.covers_month = date_trunc('month', now() at time zone 'utc')::date\n" +
      "    ) then false\n" +
      "    when coalesce(\n" +
      "           (select public.account_tier(s.user_id) from public.published_sites s where s.id = p_site_id),\n" +
      "           'free') <> 'free'\n" +
      "      then false",
  },
  {
    name: "the customer may insert the row that says money moved, so the badge comes off without a charge",
    file: SQL,
    from: "revoke insert, delete on public.site_badge_removals from authenticated;",
    to: "grant insert, delete on public.site_badge_removals to authenticated;",
  },

  // ------------------------------------------------------------------
  // THE FAIL-SAFE, AND THE INJECTION IT FEEDS.
  // ------------------------------------------------------------------
  {
    name: "a database hiccup on the serve path hides the badge on every free site instead of showing it",
    file: DECISION,
    from:
      "    return typeof data === \"boolean\" ? data : true;\n" +
      "  } catch (err) {\n" +
      "    logApiError(\"publishing:badge-decision\", err, { siteId });\n" +
      "    return true;\n" +
      "  }",
    to:
      "    return typeof data === \"boolean\" ? data : false;\n" +
      "  } catch (err) {\n" +
      "    logApiError(\"publishing:badge-decision\", err, { siteId });\n" +
      "    return false;\n" +
      "  }",
  },
  {
    name: "an unreadable removal row is invented as a paid month, so the badge vanishes from sites nobody paid for",
    file: STORE,
    from:
      "    logApiError(\"publishing:badge-credits\", err, { stage: \"load\", siteId });\n" +
      "    return null;",
    to:
      "    logApiError(\"publishing:badge-credits\", err, { stage: \"load\", siteId });\n" +
      "    return { siteId, coversMonth: monthStart(now), active: true, cancelledAt: null };",
  },
  {
    name: "the badge is injected onto every served page regardless of the decision that was made",
    file: BADGE,
    from: "  if (!options.showBadge) return html;",
    to: "  void options.showBadge;",
  },
  {
    name: "badge.ts starts badging paid plans, so the two lists that must agree drift apart",
    file: BADGE,
    from: "export const BADGED_PLANS = new Set([\"free\"]);",
    to: "export const BADGED_PLANS = new Set([\"free\", \"starter\"]);",
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
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

for (const gate of [GATE]) {
  try {
    execFileSync("node", [gate], { stdio: "pipe" });
  } catch {
    console.log(`\nBASELINE IS RED (${gate}) — a mutation was not restored. Check \`git diff\`.`);
    process.exit(1);
  }
}
console.log("\nbaseline: the gate is green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
