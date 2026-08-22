import { TRADING_SESSIONS, isTradingSession, normaliseInstrument, type TradingSession } from "@/lib/trading/journal";
import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * THE RULES THE USER WROTE, IN A FORM A COMPUTER CAN COUNT.
 *
 * ============================================================
 * WHY THE MODEL PARSES ONCE AND NEVER CHECKS
 * ============================================================
 *
 * The brief asks for "the AI compares every trade against the user's own
 * rules". Read literally that means handing 200 trades and a sentence to
 * a model and asking how many broke it. The number that comes back would
 * look exactly like a count, would be different tomorrow, and nothing in
 * the product could tell — and the whole value of "you broke your 2% rule
 * eight times in March" is that the eight is TRUE. A trader who checks
 * one of the eight and finds it was 1.9% never trusts the feature again,
 * and they would be right not to.
 *
 * So the model does the part it is good at, ONCE: turning
 * "Max 2% risk. Only London. RR at least 1:2. Max 3 trades a day."
 * into four structured rules. The user CONFIRMS them — their own sentence
 * sits beside the parse, so a mis-parse is visible before it is acted on.
 * After that, evaluation is ordinary arithmetic (lib/trading/guardian.ts),
 * deterministic, re-runnable, and identical every time.
 *
 * THE DETERMINISTIC PARSER BELOW IS NOT A FALLBACK, it is the first
 * attempt. It handles the shapes people actually write — and it means the
 * Strategy Guardian works on a deployment with no ANTHROPIC_API_KEY at
 * all, which is also the only reason any of this could be tested here.
 *
 * Pure: no AI import, no network, no database.
 */

export const RULE_KINDS = [
  "max_risk_percent",
  "max_trades_per_day",
  "min_risk_reward",
  "allowed_sessions",
  "allowed_instruments",
  "max_daily_loss",
  "no_trade_after_loss",
  "max_position_size",
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export function isRuleKind(value: unknown): value is RuleKind {
  return typeof value === "string" && (RULE_KINDS as readonly string[]).includes(value);
}

export type RuleParams =
  | { kind: "max_risk_percent"; percent: number }
  | { kind: "max_trades_per_day"; count: number }
  | { kind: "min_risk_reward"; ratio: number }
  | { kind: "allowed_sessions"; sessions: TradingSession[] }
  | { kind: "allowed_instruments"; instruments: string[] }
  | { kind: "max_daily_loss"; amount: number }
  | { kind: "no_trade_after_loss"; withinMinutes: number }
  | { kind: "max_position_size"; size: number };

export type TradingRule = {
  id: string;
  accountId: string | null;
  originalText: string;
  params: RuleParams;
  isActive: boolean;
  source: "ai" | "manual";
};

/** Bounds that exist to stop a parse producing an absurd rule that then
 *  flags everything or nothing. A "max 0% risk" rule marks every trade a
 *  violation; a "max 10,000%" rule marks none. Both are useless, and
 *  both are what a mis-parse of a stray number looks like. */
export const RULE_BOUNDS = {
  percent: { min: 0.01, max: 100 },
  count: { min: 1, max: 1000 },
  ratio: { min: 0.01, max: 100 },
  amount: { min: 0.01, max: 1_000_000_000 },
  minutes: { min: 1, max: 60 * 24 * 7 },
  size: { min: 0.000_000_01, max: 1_000_000_000 },
} as const;

function finiteInRange(value: unknown, bounds: { min: number; max: number }): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < bounds.min || n > bounds.max) return null;
  return n;
}

/**
 * Validates whatever came out of the model, or out of the jsonb column.
 *
 * REJECTS RATHER THAN REPAIRS. A rule this cannot make sense of is not
 * saved, so it can never silently evaluate to "no violations" — a rule
 * that is on, is wrong, and never fires is worse than no rule, because
 * the user believes they are being watched.
 */
export function parseRuleParams(kind: unknown, raw: unknown): RuleParams | null {
  if (!isRuleKind(kind)) return null;
  const source = (raw ?? {}) as Record<string, unknown>;

  switch (kind) {
    case "max_risk_percent": {
      const percent = finiteInRange(source.percent, RULE_BOUNDS.percent);
      return percent === null ? null : { kind, percent };
    }
    case "max_trades_per_day": {
      const count = finiteInRange(source.count, RULE_BOUNDS.count);
      return count === null || !Number.isInteger(count) ? null : { kind, count };
    }
    case "min_risk_reward": {
      const ratio = finiteInRange(source.ratio, RULE_BOUNDS.ratio);
      return ratio === null ? null : { kind, ratio };
    }
    case "allowed_sessions": {
      const list = Array.isArray(source.sessions) ? source.sessions : [];
      const sessions = [...new Set(list.filter(isTradingSession))];
      // An empty allow-list would forbid every trade ever made, which is
      // never what somebody meant to write.
      return sessions.length > 0 ? { kind, sessions } : null;
    }
    case "allowed_instruments": {
      const list = Array.isArray(source.instruments) ? source.instruments : [];
      const instruments = [
        ...new Set(
          list
            .map((v) => (typeof v === "string" ? normaliseInstrument(v) : null))
            .filter((v): v is string => Boolean(v))
        ),
      ];
      return instruments.length > 0 ? { kind, instruments } : null;
    }
    case "max_daily_loss": {
      const amount = finiteInRange(source.amount, RULE_BOUNDS.amount);
      return amount === null ? null : { kind, amount };
    }
    case "no_trade_after_loss": {
      const withinMinutes = finiteInRange(source.withinMinutes, RULE_BOUNDS.minutes);
      return withinMinutes === null ? null : { kind, withinMinutes };
    }
    case "max_position_size": {
      const size = finiteInRange(source.size, RULE_BOUNDS.size);
      return size === null ? null : { kind, size };
    }
    default:
      return null;
  }
}

/**
 * THE DETERMINISTIC PARSER.
 *
 * Turns a sentence into rules with no model call. It is deliberately
 * CONSERVATIVE: a sentence it does not confidently recognise produces
 * nothing, and the caller can then offer the model. Guessing here would
 * produce a rule the user never wrote, attached to their own words, which
 * is worse than not parsing at all.
 *
 * Both English and Greek, because the product is used in both and a
 * trader writes their rules in the language they think in.
 */
export type ParsedRule = { params: RuleParams; matchedText: string };

export function parseRulesFromText(text: string): ParsedRule[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const found: ParsedRule[] = [];
  const seen = new Set<RuleKind>();
  const push = (params: RuleParams | null, matchedText: string) => {
    if (!params || seen.has(params.kind)) return;
    seen.add(params.kind);
    found.push({ params, matchedText });
  };

  // Sentences, so "Max 2% risk. Only London." yields two rules and the
  // matched text of each is the clause it came from.
  const clauses = text.split(/[.;\n·]+/).map((c) => c.trim()).filter(Boolean);

  for (const clause of clauses) {
    // FOLDED, NOT LOWER-CASED, and the difference is the whole feature in
    // Greek. `.toLowerCase()` turns "ΜΟΝΟ" into "μονο" and "Μόνο" into
    // "μόνο" — two different strings, only one of which a literal can
    // match. Greek is routinely typed in capitals without accents, so a
    // pattern written as "μόνο" silently fails for half the people who
    // write the rule. foldForMatch strips case AND diacritics AND the
    // final sigma, so every one of ΜΟΝΟ / Μόνο / μονο / μόνο folds to the
    // same "μονο" the pattern below is written in.
    //
    // EVERY GREEK LITERAL IN THIS FILE IS THEREFORE IN FOLDED FORM, and
    // scripts/tests/trading-journal.test.mjs asserts it with isFolded() —
    // a pattern written with an accent could never match anything.
    const folded = foldForMatch(clause);

    // "max 2% risk", "ρίσκο max 2%", "risk no more than 2%"
    const percent = folded.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (percent && /risk|ρισκ/.test(folded)) {
      push(parseRuleParams("max_risk_percent", { percent: num(percent[1]) }), clause);
      continue;
    }

    // "max 3 trades per day", "max 3 συναλλαγές τη μέρα"
    const perDay = folded.match(/(\d+)\s*(?:trades?|συναλλαγ\w*|θεσε\w*)[^\d]*(?:per\s*day|a\s*day|daily|τη[νσ]?\s*(?:μερα|ημερα)|ημερησ\w*)/);
    if (perDay) {
      push(parseRuleParams("max_trades_per_day", { count: Number(perDay[1]) }), clause);
      continue;
    }

    // "RR >= 1:2", "risk reward at least 1:2", "R:R 1:2"
    const rr = folded.match(/(?:rr|r\s*:\s*r|risk[\s-]*reward|ρισκο[\s-]*ανταμοιβ\w*)[^\d]*(\d+(?:[.,]\d+)?)\s*[:/]\s*(\d+(?:[.,]\d+)?)/);
    if (rr) {
      const left = num(rr[1]);
      const right = num(rr[2]);
      // "1:2" means two units of reward per unit of risk.
      push(parseRuleParams("min_risk_reward", { ratio: left > 0 ? right / left : null }), clause);
      continue;
    }

    // "only London", "μόνο London", "London session only"
    //
    // NO \b AROUND THE GREEK. JavaScript's \b is defined against
    // [A-Za-z0-9_], so \bμόνο\b never matches — not even with the `u`
    // flag, because the boundary itself is ASCII, not the pattern. This
    // silently made every Greek session rule unparseable while the
    // English one worked, which is the worst possible shape for a bug in
    // a product whose first language is Greek.
    if (/\bonly\b/.test(folded) || folded.includes("μονο")) {
      const sessions = TRADING_SESSIONS.filter((s) => {
        if (s === "other") return false;
        const spellings = SESSION_SPELLINGS[s];
        return spellings.some((word) => folded.includes(word));
      });
      if (sessions.length > 0) {
        push(parseRuleParams("allowed_sessions", { sessions }), clause);
        continue;
      }
    }

    // "max daily loss 500", "μέγιστη ημερήσια ζημιά 500"
    const dailyLoss = folded.match(/(?:daily\s*loss|loss\s*per\s*day|ημερησια\s*ζημι\w*|ζημι\w*\s*τη[νσ]?\s*(?:μερα|ημερα))[^\d]*(\d+(?:[.,]\d+)?)/);
    if (dailyLoss) {
      push(parseRuleParams("max_daily_loss", { amount: num(dailyLoss[1]) }), clause);
      continue;
    }

    // "no trade for 30 minutes after a loss"
    const afterLoss = folded.match(/(\d+)\s*(?:min\w*|λεπτ\w*)[\s\S]{0,30}?(?:after|μετα)[\s\S]{0,20}?(?:loss|ζημι\w*)/);
    if (afterLoss) {
      push(parseRuleParams("no_trade_after_loss", { withinMinutes: Number(afterLoss[1]) }), clause);
      continue;
    }

    // "max size 0.5 lots"
    const size = folded.match(/(?:max|μεγιστ\w*)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*(?:lots?|contracts?|λοτ\w*)/);
    if (size) {
      push(parseRuleParams("max_position_size", { size: num(size[1]) }), clause);
      continue;
    }
  }

  return found;
}

const SESSION_SPELLINGS: Record<Exclude<TradingSession, "other">, string[]> = {
  london: ["london", "λονδιν"],
  new_york: ["new york", "new-york", "newyork", "ny ", "νεα υορκη"],
  tokyo: ["tokyo", "τοκιο", "asian", "asia"],
  sydney: ["sydney", "σιδνει"],
};

function num(raw: string): number {
  return Number(raw.replace(",", "."));
}
