/**
 * HOW OLD IS THE THING THAT IS ACTUALLY SERVING?
 *
 * THE FAILURE, measured by the owner on 2026-09-25: the production
 * deployment was FORTY DAYS behind main. Every gate green, every commit
 * pushed, /api/health reporting a healthy schema — and the code serving
 * customers was from another month. A redeploy with the build cache
 * disabled fixed it in a minute. Nothing, anywhere, would have said so.
 *
 * That is the worst shape a monitoring gap can have: every instrument was
 * telling the truth about a DIFFERENT BUILD from the one running. This
 * asks the one question none of them asked.
 *
 * NO IMPORTS AND NO server-only, so a gate can execute it against
 * hand-written dates rather than reading the route as text.
 */

/** A week. Beyond this, a deployment is stale enough to say so out loud. */
export const DEPLOYMENT_STALE_AFTER_DAYS = 7;
/** Beyond this it is not stale, it is wrong. Forty days was the real one. */
export const DEPLOYMENT_ANCIENT_AFTER_DAYS = 30;

export type DeploymentAge =
  | { known: false; reason: "no_stamp"; detail: string }
  | {
      known: true;
      /** Which timestamp answered: the commit's own, or when the build ran. */
      source: "commit" | "build";
      ageDays: number;
      level: "ok" | "stale" | "ancient";
      detail: string;
    };

/**
 * THE COMMIT DATE IS PREFERRED AND THE BUILD TIME IS A LOWER BOUND, which
 * is the safe direction: a cached build re-stamps BUILD_AT while serving
 * old code, so falling back to it can only ever UNDER-state the age. An
 * instrument that under-states staleness still eventually shouts; one
 * that over-states freshness is the thing that let forty days pass.
 *
 * The distinction is reported rather than hidden, so a reader knows which
 * of the two numbers they are looking at.
 */
export function deploymentAge(
  env: Record<string, string | undefined>,
  now: Date = new Date()
): DeploymentAge {
  const commit = (env.NEXT_PUBLIC_BUILD_COMMIT_DATE ?? "").trim();
  const built = (env.NEXT_PUBLIC_BUILD_AT ?? "").trim();
  const source: "commit" | "build" = commit ? "commit" : "build";
  const raw = commit || built;
  if (!raw) {
    return {
      known: false,
      reason: "no_stamp",
      detail:
        "This build carries no commit date. next.config.mjs bakes " +
        "NEXT_PUBLIC_BUILD_COMMIT_DATE at build time; a deployment without it " +
        "cannot report how old it is, which is the state that hid a forty-day-" +
        "stale production build.",
    };
  }
  const when = Date.parse(raw);
  if (!Number.isFinite(when)) {
    return {
      known: false,
      reason: "no_stamp",
      detail: `The build stamp "${raw}" is not a date this can read.`,
    };
  }
  // FLOORED, NOT ROUNDED. Six days and twenty-three hours is six days: a
  // threshold that rounds up fires a day early and gets ignored.
  const ageDays = Math.max(0, Math.floor((now.getTime() - when) / 86_400_000));
  const level =
    ageDays >= DEPLOYMENT_ANCIENT_AFTER_DAYS
      ? "ancient"
      : ageDays >= DEPLOYMENT_STALE_AFTER_DAYS
        ? "stale"
        : "ok";
  const which =
    source === "commit"
      ? "the commit this build was made from"
      : "when this build ran — a LOWER bound, because a cached build re-stamps it while serving older code";
  const detail =
    level === "ok"
      ? `${ageDays} day(s) old, by ${which}.`
      : `${ageDays} day(s) old, by ${which}. ` +
        (level === "ancient"
          ? "That is not stale, it is a different month's code. Redeploy with the build cache DISABLED — a cached build is what produced the forty-day-old deployment on 2026-09-25."
          : `Past the ${DEPLOYMENT_STALE_AFTER_DAYS}-day line. If main has moved, this deployment is not what the repository says it is.`);
  return { known: true, source, ageDays, level, detail };
}
