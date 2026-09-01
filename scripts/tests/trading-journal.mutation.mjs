#!/usr/bin/env node
/*
 * CAN THE TRADING AND FINANCE GATE GO RED?
 *
 * Every defect below is silent, and several of them are the kind that
 * cost somebody money or trust:
 *
 *   A COUNT THAT IS NOT A COUNT. "You broke your 2% rule eight times in
 *   March" is the whole product. Off-by-one at the boundary, five
 *   violations reported where one rule was broken, a rounding error
 *   flagging an exactly-2% trade — each of these produces a report that
 *   is confidently wrong, and a trader who checks one loses faith in all
 *   of it.
 *
 *   A SESSION RULE THAT PUNISHES THE OVERLAP. London and New York share
 *   four hours. Reporting a 13:00 trade as breaking "only London" is
 *   wrong about the busiest part of the day.
 *
 *   A SEED PHRASE IN A DATABASE. Irreversible, and somebody else's money.
 *
 *   ADVICE OR A FORECAST REACHING A USER. Regulated, and this product is
 *   not licensed for it.
 *
 *   A STATISTIC PRINTED FROM NOTHING. A win rate over three trades reads
 *   exactly like one over three hundred.
 *
 * Run: node scripts/tests/trading-journal.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/trading-journal.test.mjs";

const JOURNAL = "src/lib/trading/journal.ts";
const STATS = "src/lib/trading/stats.ts";
const RULES = "src/lib/trading/rules.ts";
const GUARDIAN = "src/lib/trading/guardian.ts";
const CONDUCT = "src/lib/trading/conduct.ts";
const SECRET = "src/lib/finance/secret-guard.ts";
const READONLY = "src/lib/finance/read-only.ts";
const DISCLAIMER = "src/components/trading/trading-disclaimer.tsx";
const PAGE = "src/app/dashboard/trading-journal/page.tsx";
const JOURNAL_SQL = "supabase/migrations/20260830000000_trading_journal.sql";
const FINANCE_SQL = "supabase/migrations/20260831000000_bank_crypto.sql";
const EN = "messages/en.json";
const EL = "messages/el.json";

const MUTANTS = [
  // ------------------------------------------------------------------
  // SESSIONS AND THE OVERLAP.
  // ------------------------------------------------------------------
  {
    name: "Sydney stops wrapping midnight, so half the Asian session disappears",
    file: JOURNAL,
    from: "  if (range.start <= range.end) return hour >= range.start && hour < range.end;\n  return hour >= range.start || hour < range.end;",
    to: "  return hour >= range.start && hour < range.end;",
  },
  {
    name: "London's hours shift, so the overlap with New York moves",
    file: JOURNAL,
    from: "  london: { start: 7, end: 16 },",
    to: "  london: { start: 8, end: 12 },",
  },
  {
    name: "sessionsAt returns only the primary one, so 'only London' punishes the overlap",
    file: JOURNAL,
    from: "  return found.length > 0 ? found : [\"other\"];",
    to: "  return found.length > 0 ? [found[0]] : [\"other\"];",
  },
  {
    name: "the primary precedence becomes object order, so grouping changes when a literal is reordered",
    file: JOURNAL,
    from: 'const PRIMARY_ORDER: TradingSession[] = ["london", "new_york", "tokyo", "sydney", "other"];',
    to: 'const PRIMARY_ORDER: TradingSession[] = ["sydney", "tokyo", "london", "new_york", "other"];',
  },
  {
    name: "instruments stop normalising, so one market becomes three buckets",
    file: JOURNAL,
    from: '    .replace(/[^A-Z0-9]/g, "");',
    to: "    .replace(/ /g, \"\");",
  },

  // ------------------------------------------------------------------
  // WHAT A TRADE DID.
  // ------------------------------------------------------------------
  {
    name: "an unrecorded commission is treated as zero, reporting a gross figure as net",
    file: JOURNAL,
    from: "  if (typeof trade.commission !== \"number\" || !Number.isFinite(trade.commission)) {\n    return { value: gross, net: false };\n  }",
    to: "  if (false) {\n    return { value: gross, net: false };\n  }",
  },
  {
    name: "a short is scored as a long, so every short's P&L has the wrong sign",
    file: JOURNAL,
    from: "  const sign = isShort(trade.direction) ? -1 : 1;",
    to: "  const sign = 1;",
  },
  {
    name: "risk-reward is computed from the EXIT, so every stopped-out trade breaks the RR rule",
    file: JOURNAL,
    from: "  const reward = Math.abs(targetPrice - entryPrice);",
    to: "  const reward = Math.abs((trade.exitPrice ?? targetPrice) - entryPrice);",
  },
  {
    name: "a stop on the wrong side produces a confident ratio instead of nothing",
    file: JOURNAL,
    from: "  if (short ? stopPrice <= entryPrice : stopPrice >= entryPrice) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "a negative duration is averaged into the mean hold time",
    file: JOURNAL,
    from: "  return seconds >= 0 ? seconds : null;",
    to: "  return seconds;",
  },
  {
    name: "a P&L that cannot be derived becomes zero, so an unrecorded trade scores as breakeven",
    file: JOURNAL,
    from: "    return null;\n  }\n  const sign = isShort",
    to: "    return 0;\n  }\n  const sign = isShort",
  },
  {
    name: "the direction match goes back to toLowerCase, so Greek in capitals stops registering as a short",
    file: JOURNAL,
    from: "  const folded = foldForMatch((direction ?? \"\").trim());",
    to: "  const folded = (direction ?? \"\").trim().toLowerCase();",
  },

  // ------------------------------------------------------------------
  // THE STATISTICS.
  // ------------------------------------------------------------------
  {
    name: "the sample floor is removed, so three trades produce a confident win rate",
    file: STATS,
    from: "export const MIN_SAMPLE_FOR_RATE = 5;",
    to: "export const MIN_SAMPLE_FOR_RATE = 1;",
  },
  {
    name: "breakeven trades are counted as losses, deflating every win rate",
    file: STATS,
    from: "    winRatePercent: decisive >= MIN_SAMPLE_FOR_RATE ? (wins / decisive) * 100 : null,",
    to: "    winRatePercent: counted >= MIN_SAMPLE_FOR_RATE ? (wins / counted) * 100 : null,",
  },
  {
    name: "a profit factor with no losses is reported as infinity rather than absent",
    file: STATS,
    from: "    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,",
    to: "    profitFactor: grossProfit / grossLoss,",
  },
  {
    name: "the drawdown percentage is computed against an assumed balance",
    file: STATS,
    from: "      typeof startingBalance === \"number\" && startingBalance > 0\n        ? (maxDrawdown / startingBalance) * 100\n        : null,",
    to: "      (maxDrawdown / (startingBalance || 10000)) * 100,",
  },
  {
    name: "the drawdown forgets the peak, so it reports the last dip rather than the worst",
    file: STATS,
    from: "    peak = Math.max(peak, equity);\n    maxDrawdown = Math.max(maxDrawdown, peak - equity);",
    to: "    peak = equity;\n    maxDrawdown = Math.max(maxDrawdown, peak - equity);",
  },
  {
    name: "the equity curve starts at zero even with a balance, making a 5% drawdown look like 50%",
    file: STATS,
    from: "  let equity = typeof startingBalance === \"number\" && Number.isFinite(startingBalance) ? startingBalance : 0;",
    to: "  let equity = 0;",
  },
  {
    name: "an unscoreable trade is silently dropped instead of reported",
    file: STATS,
    from: "      unscoreable += 1;\n      continue;",
    to: "      continue;",
  },
  {
    name: "session buckets use every overlapping session, double-counting the busiest hours",
    file: STATS,
    from: "  return bucketed(trades, (t) => t.session ?? primarySessionAt(t.enteredAt));",
    to: "  return bucketed(trades, (t) => t.session ?? \"other\");",
  },
  {
    name: "the after-loss comparison drops its baseline, leaving a number with nothing to compare to",
    file: STATS,
    from: "    differencePercentagePoints: afterRate !== null && baseRate !== null ? baseRate - afterRate : null,",
    to: "    differencePercentagePoints: afterRate ?? null,",
  },
  {
    name: "a breakeven trade breaks the after-loss chain, so the pattern misses the trades that matter",
    file: STATS,
    from: "    let previous: TradeOutcome | null = null;\n    for (let j = i - 1; j >= 0; j -= 1) {\n      if (outcomes[j] === \"win\" || outcomes[j] === \"loss\") {\n        previous = outcomes[j];\n        break;\n      }\n    }",
    to: "    const previous: TradeOutcome | null = i > 0 ? outcomes[i - 1] : null;",
  },

  // ------------------------------------------------------------------
  // THE RULES.
  // ------------------------------------------------------------------
  {
    name: "'1:2' is read as 0.5, inverting every risk-reward rule",
    file: RULES,
    from: "      push(parseRuleParams(\"min_risk_reward\", { ratio: left > 0 ? right / left : null }), clause);",
    to: "      push(parseRuleParams(\"min_risk_reward\", { ratio: right > 0 ? left / right : null }), clause);",
  },
  {
    name: "the Greek session rule goes back to an ASCII word boundary and matches nothing",
    file: RULES,
    from: "    if (/\\bonly\\b/.test(folded) || folded.includes(\"μονο\")) {",
    to: "    if (/\\bonly\\b/.test(folded) || /\\bμόνο\\b/.test(folded)) {",
  },
  {
    name: "the parser lower-cases instead of folding, so Greek in capitals stops parsing",
    file: RULES,
    from: "    const folded = foldForMatch(clause);",
    to: "    const folded = clause.toLowerCase();",
  },
  {
    name: "a Greek pattern regains its accent, so folded text can never match it",
    file: RULES,
    from: "/risk|ρισκ/",
    to: "/risk|ρίσκ/",
  },
  {
    name: "an empty session list is accepted, forbidding every trade ever made",
    file: RULES,
    from: "      return sessions.length > 0 ? { kind, sessions } : null;",
    to: "      return { kind, sessions };",
  },
  {
    name: "an out-of-range risk percentage is accepted, so a mis-parse flags everything or nothing",
    file: RULES,
    from: "  if (n < bounds.min || n > bounds.max) return null;",
    to: "  return n;\n  if (n < bounds.min || n > bounds.max) return null;",
  },
  {
    name: "a fractional trades-per-day is accepted",
    file: RULES,
    from: "      return count === null || !Number.isInteger(count) ? null : { kind, count };",
    to: "      return count === null ? null : { kind, count };",
  },
  {
    name: "an unrecognised session name is kept rather than dropped",
    file: RULES,
    from: "      const sessions = [...new Set(list.filter(isTradingSession))];",
    to: "      const sessions = [...new Set(list)] as TradingSession[];",
  },
  {
    // THE ANCHOR MOVED BECAUSE THE LINE WAS FIXED. This read
    //     text.split(/[.;\n·]+/)
    // which is what the file said until the decimal-point bug was
    // corrected. A mutation whose `from` no longer exists does not fail —
    // the harness reports the target as missing and the hole is only
    // visible if somebody reads the summary. Re-anchored on the clause
    // split as it is now.
    name: "the parser guesses, returning a rule for a sentence it did not understand",
    file: RULES,
    from: "    .split(/[;\\n·]+|\\.(?!\\d)/)",
    to: "    .split(/(?:)/g).slice(0, 0).concat([text]).flatMap((t) => t ? [t] : [])",
  },
  {
    // THE DECIMAL POINT, WHICH IS THE DEFECT THAT MOVED THE ANCHOR ABOVE.
    // Nothing guarded it at this level: reverting `\.(?!\d)` to a plain
    // `.` is a one-character edit that turns "max 2.5% risk" into a FIVE
    // percent rule — double the risk the trader wrote — while the UI shows
    // their own sentence saying 2.5 next to it. Measured, not assumed.
    name: "a decimal point splits a clause again, doubling the risk a trader asked for",
    file: RULES,
    from: "    .split(/[;\\n·]+|\\.(?!\\d)/)",
    to: "    .split(/[.;\\n·]+/)",
  },

  // ------------------------------------------------------------------
  // THE GUARDIAN — THE COUNT.
  // ------------------------------------------------------------------
  {
    name: "exactly 2% breaks a 'max 2%' rule, flagging a trader for obeying it",
    file: GUARDIAN,
    from: "      return rounded > params.percent",
    to: "      return rounded >= params.percent",
  },
  {
    name: "the rounding is removed, so floating point flags an exactly-2% trade",
    file: GUARDIAN,
    from: "      const rounded = Math.round(percent * 100) / 100;\n      return rounded > params.percent",
    to: "      const rounded = percent;\n      return rounded > params.percent",
  },
  {
    name: "an unmeasurable trade is treated as compliant instead of uncheckable",
    file: GUARDIAN,
    from: "      if (typeof trade.riskAmount !== \"number\" || !Number.isFinite(trade.riskAmount)) {\n        return { kind: \"uncheckable\", missing: \"risk amount on the trade\" };\n      }",
    to: "      if (typeof trade.riskAmount !== \"number\" || !Number.isFinite(trade.riskAmount)) {\n        return { kind: \"ok\" };\n      }",
  },
  {
    name: "a missing account balance is assumed rather than reported",
    file: GUARDIAN,
    from: "      if (input.startingBalance === null || input.startingBalance <= 0) {\n        return { kind: \"uncheckable\", missing: \"account starting balance\" };\n      }",
    to: "      const _balance = input.startingBalance ?? 10000;\n      void _balance;",
  },
  {
    name: "five trades against a limit of three reports FIVE violations, not two",
    file: GUARDIAN,
    from: "      const position = sameDay.findIndex((t) => t.id === trade.id) + 1;\n      return position > params.count",
    to: "      const position = sameDay.length;\n      return position > params.count",
  },
  {
    name: "the session rule uses the primary session, so the London/New York overlap is punished",
    file: GUARDIAN,
    from: "      const active = sessionsAt(when);\n      return active.some((s) => params.sessions.includes(s))",
    to: "      const active = [primarySessionAt(when)].filter(Boolean) as typeof params.sessions;\n      return active.some((s) => params.sessions.includes(s))",
    extraImport: true,
  },
  {
    name: "the daily-loss rule flags the whole day, including the winning trades before the loss",
    file: GUARDIAN,
    from: "        if (other.id === trade.id) {\n          crossedHere = running < -params.amount;\n          break;\n        }",
    to: "        if (running < -params.amount) crossedHere = true;\n        if (other.id === trade.id) break;",
  },
  {
    name: "the pause-after-loss rule triggers after a WIN as well",
    file: GUARDIAN,
    from: "        if (outcome === \"loss\" && earlier.exitedAt) previousLossExit = Date.parse(earlier.exitedAt);",
    to: "        if (earlier.exitedAt) previousLossExit = Date.parse(earlier.exitedAt);",
  },
  {
    name: "an inactive rule is still evaluated",
    file: GUARDIAN,
    from: "  const active = rules.filter((r) => r.isActive);",
    to: "  const active = rules;",
  },
  {
    name: "an account-scoped rule is applied to every account",
    file: GUARDIAN,
    from: "      if (rule.accountId && trade.accountId !== rule.accountId) continue;",
    to: "      if (false) continue;",
  },
  {
    name: "two rules of the same kind are merged into one count",
    file: GUARDIAN,
    from: "    const key = `${violation.ruleKind}::${violation.ruleText}`;",
    to: "    const key = violation.ruleKind;",
  },
  {
    name: "the month window is ignored, so April's violations are counted as March's",
    file: GUARDIAN,
    from: "    if (from && at < from.getTime()) return false;\n    if (to && at >= to.getTime()) return false;",
    to: "    return true;",
  },

  // ------------------------------------------------------------------
  // RULE 2 — KEYS AND PHRASES.
  // ------------------------------------------------------------------
  {
    name: "a 12-word mnemonic is no longer recognised",
    file: SECRET,
    from: "const MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);",
    to: "const MNEMONIC_WORD_COUNTS = new Set([24]);",
  },
  {
    name: "a raw hex private key is no longer recognised",
    file: SECRET,
    from: "  if (/^[0-9a-fA-F]{64}$/.test(hex)) {",
    to: "  if (false) {",
  },
  {
    name: "an xprv is no longer recognised",
    file: SECRET,
    from: "  if (/^(?:x|y|z|t|u|v)prv[1-9A-HJ-NP-Za-km-z]{50,}$/.test(text)) {",
    to: "  if (false) {",
  },
  {
    name: "the secret scan runs AFTER the address shape test, so a hex private key sails through",
    file: SECRET,
    from: "  const secret = scanForSecret(address);\n  if (secret.looksSecret) return { ok: false, reason: \"looks_like_a_secret\", shape: secret.shape };",
    to: "  const secret = { looksSecret: false } as ReturnType<typeof scanForSecret>;\n  if (secret.looksSecret) return { ok: false, reason: \"looks_like_a_secret\" };",
  },
  {
    name: "the refusal echoes the value back, putting a seed phrase in the DOM and the logs",
    file: SECRET,
    from: "  return scan.looksSecret ? { ok: false, shape: scan.shape } : { ok: true };",
    to: "  return scan.looksSecret ? { ok: false, shape: scan.shape, value: String(value) } as never : { ok: true };",
  },
  {
    name: "a watch-only xPUB is refused as a secret, blocking a legitimate read-only key",
    file: SECRET,
    from: "  if (/^(?:x|y|z|t|u|v)prv[1-9A-HJ-NP-Za-km-z]{50,}$/.test(text)) {",
    to: "  if (/^(?:x|y|z|t|u|v)(?:prv|pub)[1-9A-HJ-NP-Za-km-z]{50,}$/.test(text)) {",
  },
  {
    name: "the crypto_wallets address column stops forbidding whitespace",
    file: FINANCE_SQL,
    from: "constraint crypto_wallets_address_single_token check (address !~ '\\s')",
    to: "constraint crypto_wallets_address_single_token check (address is not null)",
  },
  {
    name: "the address length bound rises above a mnemonic's",
    file: FINANCE_SQL,
    from: "constraint crypto_wallets_address_length check (length(address) <= 128)",
    to: "constraint crypto_wallets_address_length check (length(address) <= 4096)",
  },
  {
    name: "crypto_wallets gains a column a private key could be put in",
    file: FINANCE_SQL,
    from: "  label text,\n\n  -- Watch-only",
    to: "  label text,\n  private_key_encrypted text,\n\n  -- Watch-only",
  },

  // ------------------------------------------------------------------
  // RULES 3 AND 4 — ADVICE AND FORECASTS.
  // ------------------------------------------------------------------
  {
    name: "the advice filter stops folding, so Greek in capitals is never caught",
    file: CONDUCT,
    from: "  const folded = foldForMatch(text);",
    to: "  const folded = text;",
  },
  {
    name: "the Greek recommendation patterns regain their ASCII word boundaries and match nothing",
    file: CONDUCT,
    from: "  /(?:σου\\s+)?(?:προτεινω|συνιστω)/i,",
    to: "  /\\b(?:σου\\s+)?(?:προτείνω|συνιστώ)\\b/i,",
  },
  {
    name: "the prediction patterns are dropped, so a forecast reaches the user",
    file: CONDUCT,
    from: "  if (PREDICTION.some((p) => p.test(folded))) breaches.push(\"prediction\");",
    to: "  if (false) breaches.push(\"prediction\");",
  },
  {
    name: "the valuation patterns are dropped, so 'oversold' reaches the user",
    file: CONDUCT,
    from: "  if (VALUATION.some((p) => p.test(folded))) breaches.push(\"valuation\");",
    to: "  if (false) breaches.push(\"valuation\");",
  },
  {
    name: "only the FIRST breach is recorded, so a prompt fix that removes one looks like a fix",
    file: CONDUCT,
    from: "  if (RECOMMENDATION.some((p) => p.test(folded))) breaches.push(\"recommendation\");",
    to: "  if (RECOMMENDATION.some((p) => p.test(folded))) return [\"recommendation\"];",
  },
  {
    name: "the filter becomes so broad it eats the journal's own sentences",
    file: CONDUCT,
    from: "  /\\b(?:consider|try)\\s+(?:buying|selling|shorting|longing|going\\s+long|going\\s+short)\\b/i,",
    to: "  /\\b(?:buy|sell|bought|sold|αγορ|πουλ)/i,",
  },
  {
    name: "the Greek conduct prompt loses its forecasting ban",
    file: CONDUCT,
    from: "- πεις τι θα κάνει οποιαδήποτε αγορά, εργαλείο ή τιμή, σε οποιονδήποτε",
    to: "- (removed)",
  },
  {
    name: "the English conduct prompt stops saying what IS allowed, becoming only a wall of no",
    file: CONDUCT,
    from: "You MAY:",
    to: "Additional notes:",
  },

  // ------------------------------------------------------------------
  // RULE 1 — READ-ONLY. RULE 6 — LOGS.
  // ------------------------------------------------------------------
  {
    name: "the beneficiary stem goes back to the singular and misses /beneficiaries",
    file: READONLY,
    from: '  "beneficiar",',
    to: '  "beneficiary",',
  },
  {
    name: "'transfer' is dropped from the forbidden path fragments",
    file: READONLY,
    from: '  "transfer",',
    to: '  "transferred",',
  },
  {
    name: "DELETE and PUT become allowed methods",
    file: READONLY,
    from: 'export const READ_ONLY_METHODS = ["GET", "POST"] as const;',
    to: 'export const READ_ONLY_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;',
  },
  {
    name: "an unparseable URL is allowed through rather than refused",
    file: READONLY,
    from: "    return { ok: false, reason: \"the URL could not be parsed\" };",
    to: "    return { ok: true };",
  },
  {
    name: "the write refusal starts logging the URL it refused",
    file: READONLY,
    from: "export async function readOnlyFetch(",
    to: "export function __log(url: string) { console.warn(`refused ${url}`); }\nexport async function readOnlyFetch(",
  },
  {
    name: "the finance layer starts writing to the console",
    file: SECRET,
    from: "export function assertNoSecret(",
    to: "export function __debug(v: unknown) { console.log(v); }\nexport function assertNoSecret(",
  },

  // ------------------------------------------------------------------
  // RULE 5 — THE DISCLAIMER.
  // ------------------------------------------------------------------
  {
    name: "the journal page stops mounting the disclaimer",
    file: PAGE,
    from: "      <TradingDisclaimer variant=\"block\" />",
    to: "      {null}",
  },
  {
    name: "the disclaimer becomes a client component that a parent can skip",
    file: DISCLAIMER,
    from: "import { getTranslations } from \"next-intl/server\";",
    to: "\"use client\";\nimport { getTranslations } from \"next-intl/server\";",
  },
  {
    name: "the disclaimer gains a dismiss control",
    file: DISCLAIMER,
    from: "        <AlertTriangle className=\"mt-0.5 h-4 w-4 shrink-0 text-amber-400\" aria-hidden=\"true\" />",
    to: "        <button type=\"button\" onClick={() => {}}>x</button>\n        <AlertTriangle className=\"mt-0.5 h-4 w-4 shrink-0 text-amber-400\" aria-hidden=\"true\" />",
  },
  {
    name: "the English disclaimer stops saying it is not investment advice",
    file: EN,
    from: "It is not investment advice, it is not a forecast,",
    to: "It is a summary,",
  },
  {
    name: "the Greek disclaimer stops mentioning the risk of loss",
    file: EL,
    from: "Το trading ενέχει κίνδυνο ζημιάς.",
    to: "Καλή επιτυχία.",
  },
  {
    name: "the Greek disclaimer stops saying it is not a forecast",
    file: EL,
    from: "δεν είναι πρόβλεψη",
    to: "είναι χρήσιμο",
  },

  // ------------------------------------------------------------------
  // THE SCHEMA.
  // ------------------------------------------------------------------
  {
    name: "re-running the guardian can double a count",
    file: JOURNAL_SQL,
    from: "create unique index if not exists rule_violations_trade_rule_idx",
    to: "create index if not exists rule_violations_trade_rule_idx",
  },
  {
    name: "a violation dies with the rule, so the March report becomes unreadable",
    file: JOURNAL_SQL,
    from: "  rule_id uuid references public.trading_rules(id) on delete set null,",
    to: "  rule_id uuid references public.trading_rules(id) on delete cascade,",
  },
  {
    name: "closing an account deletes the trades made in it",
    file: JOURNAL_SQL,
    from: "alter table public.trades add column if not exists account_id uuid\n  references public.trading_accounts(id) on delete set null;",
    to: "alter table public.trades add column if not exists account_id uuid\n  references public.trading_accounts(id) on delete cascade;",
  },
  {
    name: "a user can edit a recorded violation",
    file: JOURNAL_SQL,
    from: "revoke update on public.rule_violations from authenticated;",
    to: "grant update on public.rule_violations to authenticated;",
  },
  {
    name: "a rule kind the code does not know becomes storable",
    file: JOURNAL_SQL,
    from: "    'max_position_size'\n  )),",
    to: "    'max_position_size',\n    'max_vibes'\n  )),",
  },
  {
    name: "a payment scope becomes writable into a bank connection",
    file: FINANCE_SQL,
    from: "    scopes <@ array['accounts:read', 'transactions:read', 'balances:read', 'identity:read']::text[]",
    to: "    scopes is not null",
  },
  {
    name: "a bank connection can claim write access",
    file: FINANCE_SQL,
    from: "access_mode text not null default 'read_only' check (access_mode = 'read_only')",
    to: "access_mode text not null default 'read_only'",
  },
  {
    name: "a user can write their own bank statement",
    file: FINANCE_SQL,
    from: "revoke insert, update, delete on public.bank_transactions from authenticated;",
    to: "grant insert, update, delete on public.bank_transactions to authenticated;",
  },
  {
    name: "the bank tables gain an IBAN column",
    file: FINANCE_SQL,
    from: "  description text,",
    to: "  description text,\n  counterparty_iban text,",
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
