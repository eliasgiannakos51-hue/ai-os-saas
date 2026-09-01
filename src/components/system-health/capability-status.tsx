import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";

/**
 * WHICH FEATURES ARE SWITCHED OFF, AND WHAT WOULD SWITCH THEM ON.
 *
 * V4.6. "A feature that does not work and does not say so is worse than a
 * feature that does not exist."
 *
 * lib/env-check.ts has known this the whole time. It carries, for every
 * one of the ~130 variables, a level and a sentence about what goes
 * SILENT without it — including the good ones: "nothing is sent and
 * nothing errors: welcome emails, agent results, form-submission
 * notifications, the weekly digest, and the cost and error alerts
 * addressed to the operator all stop silently".
 *
 * And it printed all of it to the SERVER LOG, once, at boot, through
 * instrumentation.ts. Nowhere else. lib/ai/providers/registry.ts is the
 * same story: providerStatuses() computes `disabledReason: "GOOGLE_API_KEY
 * is not set"` for every provider and hands it to the failover chain,
 * which uses it to pick the next provider and never says a word.
 *
 * So an operator looking at a running deployment could not tell a feature
 * that was never built from one whose key is missing. Both look like
 * nothing happening.
 *
 * ------------------------------------------------------------------
 * WHY IT IS BUILT FROM ENV_REQUIREMENTS RATHER THAN FROM A LIST HERE
 * ------------------------------------------------------------------
 *
 * A second list would be a second thing to keep in step, and
 * scripts/tests/env-documented.test.mjs already records what happens to
 * hand-kept lists in this codebase: "it was being kept by hand, and by
 * hand it had drifted by fifty-nine variables". The requirements array
 * is the one the boot check reads, so a variable added there appears
 * here without anybody remembering to add it.
 *
 * ------------------------------------------------------------------
 * NO VALUES, EVER
 * ------------------------------------------------------------------
 *
 * This renders NAMES and STATUSES. checkEnv already refuses to put a
 * secret's value in its report, and this component never receives one:
 * the server passes booleans and names. A page that exists to say "your
 * key is missing" must not be the page that shows somebody else's key.
 */
export type CapabilityRow = {
  /** The env var, e.g. "RESEND_API_KEY". */
  name: string;
  level: "required" | "recommended" | "optional";
  /** What it enables, and what goes silent without it. From env-check. */
  what: string;
  set: boolean;
};

export function CapabilityStatus({ rows }: { rows: CapabilityRow[] }) {
  // ONLY WHAT IS OFF, plus a one-line count of what is on. An operator
  // reading this page is looking for what is broken; a hundred green
  // rows is where a missing one hides.
  const off = rows.filter((r) => !r.set);
  const on = rows.length - off.length;

  const byLevel = (level: CapabilityRow["level"]) => off.filter((r) => r.level === level);
  const groups = [
    {
      level: "required" as const,
      title: "Missing and required — the app is meaningfully broken",
      icon: AlertTriangle,
      tone: "border-red-900 bg-red-950/30 text-red-300",
    },
    {
      level: "recommended" as const,
      title: "Missing and recommended — a feature is silently off",
      icon: AlertTriangle,
      tone: "border-amber-800/50 bg-amber-500/5 text-amber-300",
    },
    {
      level: "optional" as const,
      title: "Not configured — the feature is off by design until set",
      icon: MinusCircle,
      tone: "border-border bg-panel text-muted",
    },
  ];

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">Capabilities</h2>
      <p className="mt-1 text-xs text-muted">
        Built from <code className="rounded bg-input px-1 py-0.5 font-mono text-[11px]">ENV_REQUIREMENTS</code> in
        lib/env-check.ts — the same list the boot check reads. Names and statuses only; no values.
      </p>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {on} of {rows.length} configured
      </p>

      {off.length === 0 ? (
        <p className="mt-3 rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-400">
          Every variable the code reads is set. Nothing is silently off.
        </p>
      ) : (
        groups.map((group) => {
          const items = byLevel(group.level);
          if (items.length === 0) return null;
          const Icon = group.icon;
          return (
            <div key={group.level} className={`mt-3 rounded-xl border px-3 py-2.5 ${group.tone}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {group.title} ({items.length})
              </p>
              <ul className="mt-2 space-y-2">
                {items.map((row) => (
                  <li key={row.name}>
                    <code className="font-mono text-[11px]">{row.name}</code>
                    {/* THE SENTENCE FROM env-check, verbatim. It is the
                        half that says what stops working, and rewriting
                        it here would be a second copy to keep true. */}
                    <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{row.what}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
