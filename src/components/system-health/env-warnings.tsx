import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { EnvWarning } from "@/lib/env-check";

/**
 * THE PROBLEMS NO SINGLE ROW SHOWS.
 *
 * CapabilityStatus below this renders one row per variable: set, or not
 * set, with the sentence saying what goes quiet. It cannot show a problem
 * that belongs to a PAIR — and the worst configuration failure in this
 * product is exactly that shape.
 *
 * RESEND_API_KEY set, RESEND_FROM_EMAIL unset: two rows, both reading as
 * fine, the second with a documented fallback. The fallback is Resend's
 * shared test address, which delivers only to the Resend account owner.
 * The operator's own mail arrives; every customer's is refused. The
 * deployment looks configured from the only seat that would have noticed.
 *
 * NO VALUE CROSSES. Same rule as CapabilityStatus: the server computes
 * the warnings from process.env and passes prose and variable NAMES. A
 * screen that exists to say "a key is misconfigured" must not be the
 * screen that shows what the key is.
 */
const CRITICAL_SUMMARY = "Something the product does today is silently not working.";
const QUIET_SUMMARY = "Nothing is broken, but a feature is dark for a reason worth knowing.";

export function EnvWarnings({ warnings }: { warnings: EnvWarning[] }) {
  if (warnings.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-fg">Configuration</h2>
        <p className="mt-1 text-xs text-muted">
          No half-configured pairs. Every variable that needs a partner has one.
        </p>
      </section>
    );
  }

  const critical = warnings.filter((w) => w.severity === "critical");
  const rest = warnings.filter((w) => w.severity !== "critical");
  // Named rather than inlined as a ternary branch: see the note on the
  // page's other panels — the literals here are owner-only English on
  // purpose, but the TERNARY shape is banned everywhere because it is how
  // a string escapes every scanner that looks for a translated call.
  const summary =
    critical.length > 0
      ? CRITICAL_SUMMARY
      : QUIET_SUMMARY;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-fg">Configuration</h2>
      <p className="mt-1 text-xs text-muted">{summary}</p>

      {[
        { rows: critical, tone: "border-red-800 bg-red-950/30 text-red-300", Icon: ShieldAlert },
        { rows: rest, tone: "border-amber-800 bg-amber-950/20 text-amber-300", Icon: AlertTriangle },
      ].map(({ rows, tone, Icon }, i) =>
        rows.length === 0 ? null : (
          <ul key={i} className="mt-3 space-y-2">
            {rows.map((w) => (
              <li key={w.key} className={`rounded-xl border px-3 py-2.5 ${tone}`}>
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{w.title}</p>
                    <p className="mt-1 text-xs opacity-90">{w.detail}</p>
                    <p className="mt-1.5 font-mono text-[11px] opacity-70">
                      {w.variables.join(" · ")}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
