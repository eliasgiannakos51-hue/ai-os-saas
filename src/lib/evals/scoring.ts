/**
 * THE EVAL SCORER (V4 #33).
 *
 * A baseline is only worth having if the number is reproducible, so
 * almost every check here is MECHANICAL — a regex, a structural property,
 * a numeric bound. Nothing about a mechanical check drifts between runs,
 * and a mechanical check can be argued with by reading it.
 *
 * WHERE A MODEL GRADES, IT IS SAID SO. Some qualities genuinely cannot be
 * regexed ("is this answer actually responsive to the question"), and for
 * those a rubric goes to a grader model. Those cases are tagged `graded`
 * and reported SEPARATELY in the table, because a suite that mixes them
 * silently reports a number that is part measurement and part opinion —
 * and only one of those halves is comparable between runs.
 *
 * AN UNGRADED CASE IS NOT A PASS. If the grader could not be reached, the
 * case is `error`, never `pass` and never `fail`. A missing grader that
 * scored zero would make a broken harness look like a quality regression;
 * one that scored full marks would hide one.
 *
 * Pure — no SDK, no database, no clock — so the build gate exercises every
 * branch with no API key.
 */
import { foldForMatch } from "@/lib/text/unicode-patterns";

export const CAPABILITIES = [
  "chat",
  "create",
  "website",
  "agents",
  "research",
  "files",
  "mission",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

/** Every mechanical check the datasets may use. Adding a kind here means
 *  adding it to `runCheck` — the exhaustive switch makes the compiler say
 *  so rather than a case silently always passing. */
export type Check =
  | { kind: "contains"; value: string; ci?: boolean }
  | { kind: "absent"; value: string; ci?: boolean }
  | { kind: "matches"; pattern: string; flags?: string }
  | { kind: "notMatches"; pattern: string; flags?: string }
  | { kind: "minLength"; value: number }
  | { kind: "maxLength"; value: number }
  | { kind: "jsonParses" }
  | { kind: "jsonField"; path: string; equals?: unknown; oneOf?: unknown[]; present?: boolean }
  | { kind: "anyOf"; checks: Check[] }
  | { kind: "allOf"; checks: Check[] };

export type EvalCase = {
  id: string;
  capability: Capability;
  /** What a real user actually typed. Never a synthetic template. */
  input: string;
  /** Extra context the capability needs (a pasted CSV, a code snippet). */
  attachment?: string;
  checks: Check[];
  /** Only for what a regex genuinely cannot decide. */
  rubric?: string;
  /** Why this case is in the set — the failure it is here to catch. */
  why: string;
};

export type CheckResult = { kind: string; passed: boolean; detail?: string };

export type CaseOutcome =
  | { id: string; capability: Capability; status: "pass"; score: number; checks: CheckResult[]; latencyMs: number; costUsd: number }
  | { id: string; capability: Capability; status: "fail"; score: number; checks: CheckResult[]; latencyMs: number; costUsd: number; firstFailure: string }
  /** The call itself did not happen or did not come back. NOT a fail:
   *  a rate limit is not a quality signal, and averaging it in as zero
   *  would make an outage read as a regression. */
  | { id: string; capability: Capability; status: "error"; reason: string; latencyMs: number; costUsd: number };

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function runCheck(output: string, check: Check): CheckResult {
  switch (check.kind) {
    // `ci` FOLDS, IT DOES NOT LOWER-CASE.
    //
    // toLowerCase() leaves Greek final sigma alone, so "ΛΟΝΔΙΝΟΣ"
    // lower-cases to "λονδινος" while the same word written naturally is
    // "λονδίνος" — different accent, different sigma, no match. Six of
    // the 154 cases are in Greek and this product's primary market types
    // in it, so a case-insensitive check that cannot match Greek is a
    // scorer that reports quality failures which are really its own.
    // foldForMatch is the ONE folding path in this codebase; the build
    // gate refuses a second one, and it caught this file.
    case "contains": {
      const hay = check.ci ? foldForMatch(output) : output;
      const needle = check.ci ? foldForMatch(check.value) : check.value;
      return { kind: check.kind, passed: hay.includes(needle), detail: check.value };
    }
    case "absent": {
      const hay = check.ci ? foldForMatch(output) : output;
      const needle = check.ci ? foldForMatch(check.value) : check.value;
      return { kind: check.kind, passed: !hay.includes(needle), detail: check.value };
    }
    case "matches":
      return {
        kind: check.kind,
        passed: new RegExp(check.pattern, check.flags).test(output),
        detail: check.pattern,
      };
    case "notMatches":
      return {
        kind: check.kind,
        passed: !new RegExp(check.pattern, check.flags).test(output),
        detail: check.pattern,
      };
    case "minLength":
      return { kind: check.kind, passed: output.trim().length >= check.value, detail: String(output.trim().length) };
    case "maxLength":
      return { kind: check.kind, passed: output.trim().length <= check.value, detail: String(output.trim().length) };
    case "jsonParses":
      try {
        JSON.parse(extractJson(output));
        return { kind: check.kind, passed: true };
      } catch {
        return { kind: check.kind, passed: false, detail: "did not parse" };
      }
    case "jsonField": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(output));
      } catch {
        return { kind: check.kind, passed: false, detail: "output is not JSON" };
      }
      const value = get(parsed, check.path);
      if (check.present === true) return { kind: check.kind, passed: value !== undefined, detail: check.path };
      if (check.present === false) return { kind: check.kind, passed: value === undefined, detail: check.path };
      if (check.oneOf) {
        return {
          kind: check.kind,
          passed: check.oneOf.some((v) => JSON.stringify(v) === JSON.stringify(value)),
          detail: `${check.path}=${JSON.stringify(value)}`,
        };
      }
      return {
        kind: check.kind,
        passed: JSON.stringify(value) === JSON.stringify(check.equals),
        detail: `${check.path}=${JSON.stringify(value)}`,
      };
    }
    case "anyOf": {
      const results = check.checks.map((c) => runCheck(output, c));
      return {
        kind: check.kind,
        passed: results.some((r) => r.passed),
        detail: results.map((r) => `${r.kind}:${r.passed ? "y" : "n"}`).join(" "),
      };
    }
    case "allOf": {
      const results = check.checks.map((c) => runCheck(output, c));
      return {
        kind: check.kind,
        passed: results.every((r) => r.passed),
        detail: results.map((r) => `${r.kind}:${r.passed ? "y" : "n"}`).join(" "),
      };
    }
  }
}

/**
 * The first JSON value in a response, so a model that wrapped its object
 * in a fence or a sentence is not scored as having emitted no JSON.
 *
 * BALANCED-BRACE SCAN, not a regex. `/\{[\s\S]*\}/` is greedy to the LAST
 * brace in the document, so one object followed by any prose containing a
 * `}` produces a string that never parses — the check would report "not
 * JSON" about a perfectly good answer.
 */
export function extractJson(output: string): string {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : output;
  const start = text.search(/[{[]/);
  if (start === -1) return text.trim();
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start).trim();
}

/** Every check weighted equally. A case passes only when ALL of them do —
 *  partial credit shows in `score`, which is what moves between runs. */
export function scoreCase(output: string, checks: Check[]): { score: number; results: CheckResult[] } {
  if (checks.length === 0) return { score: 1, results: [] };
  const results = checks.map((c) => runCheck(output, c));
  return { score: results.filter((r) => r.passed).length / results.length, results };
}

export type CapabilitySummary = {
  capability: Capability;
  /** Cases that ran. Errors are excluded from every rate below and
   *  reported on their own — an unreachable API is not a quality signal. */
  ran: number;
  errors: number;
  passed: number;
  /** passed / ran. Null when nothing ran: a rate over zero cases is not
   *  0%, it is unknown, and printing 0% would read as total failure. */
  successRate: number | null;
  avgScore: number | null;
  /** MEDIAN, not mean. One 40-second timeout drags a mean latency into
   *  meaninglessness while the median still describes what a user waits. */
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  totalCostUsd: number;
  avgCostUsd: number | null;
  /** How many of the cases were decided by a grader model rather than by
   *  a regex, so the reader can weigh the number. */
  graded: number;
};

export function summarise(outcomes: readonly CaseOutcome[], gradedIds: ReadonlySet<string> = new Set()): CapabilitySummary[] {
  const byCapability = new Map<Capability, CaseOutcome[]>();
  for (const o of outcomes) {
    const list = byCapability.get(o.capability);
    if (list) list.push(o);
    else byCapability.set(o.capability, [o]);
  }
  const out: CapabilitySummary[] = [];
  for (const capability of CAPABILITIES) {
    const cases = byCapability.get(capability);
    if (!cases || cases.length === 0) continue;
    const errors = cases.filter((c) => c.status === "error");
    const scored = cases.filter((c): c is Extract<CaseOutcome, { score: number }> => c.status !== "error");
    const latencies = scored.map((c) => c.latencyMs).sort((a, b) => a - b);
    const totalCostUsd = round6(cases.reduce((sum, c) => sum + c.costUsd, 0));
    out.push({
      capability,
      ran: scored.length,
      errors: errors.length,
      passed: scored.filter((c) => c.status === "pass").length,
      successRate: scored.length === 0 ? null : round4(scored.filter((c) => c.status === "pass").length / scored.length),
      avgScore: scored.length === 0 ? null : round4(scored.reduce((s, c) => s + c.score, 0) / scored.length),
      medianLatencyMs: percentile(latencies, 0.5),
      p90LatencyMs: percentile(latencies, 0.9),
      totalCostUsd,
      avgCostUsd: scored.length === 0 ? null : round6(totalCostUsd / scored.length),
      graded: cases.filter((c) => gradedIds.has(c.id)).length,
    });
  }
  return out;
}

/** Nearest-rank. With four samples the 90th percentile IS the largest
 *  one, and interpolating would invent a latency nobody measured. */
export function percentile(sortedAscending: readonly number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  // A NON-FINITE p RETURNED `undefined` FROM A FUNCTION TYPED
  // `number | null`, and TypeScript could not see it: Math.ceil(NaN) is
  // NaN, Math.max and Math.min both pass NaN through, and indexing an
  // array with NaN gives undefined rather than throwing. A caller doing
  // arithmetic on the result got NaN two steps from where it started.
  if (!Number.isFinite(p)) return null;
  // Clamped rather than trusted: p is a fraction, and a caller passing 90
  // instead of 0.9 should get the top of the range, not an index past the
  // end that reads as undefined.
  const fraction = Math.min(1, Math.max(0, p));
  const rank = Math.ceil(fraction * sortedAscending.length);
  return sortedAscending[Math.min(sortedAscending.length - 1, Math.max(0, rank - 1))];
}

/**
 * Did quality drop enough to roll back? (V4 #34's automatic rollback.)
 *
 * RELATIVE TO THE BASELINE, and only when the baseline had something to
 * compare against. A capability with no baseline cannot have regressed,
 * and treating "unknown" as "dropped" would roll back every first run.
 */
export function regressions(
  baseline: readonly CapabilitySummary[],
  candidate: readonly CapabilitySummary[],
  maxDropPercent = 10
): { capability: Capability; before: number; after: number; dropPercent: number }[] {
  const found: { capability: Capability; before: number; after: number; dropPercent: number }[] = [];
  for (const base of baseline) {
    if (base.successRate === null || base.successRate === 0) continue;
    const now = candidate.find((c) => c.capability === base.capability);
    if (!now || now.successRate === null) continue;
    const dropPercent = ((base.successRate - now.successRate) / base.successRate) * 100;
    if (dropPercent > maxDropPercent) {
      found.push({
        capability: base.capability,
        before: base.successRate,
        after: now.successRate,
        dropPercent: round4(dropPercent),
      });
    }
  }
  return found;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
