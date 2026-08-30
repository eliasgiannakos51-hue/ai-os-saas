import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { checkCronAuth } from "@/lib/cron-auth";
import {
  classifyProbeError,
  isDatabaseReachable,
  scrubSecrets,
  type HealthReason,
  type HealthStage,
} from "@/lib/health/classify";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// @service-role-justified public — the uptime probe. It takes no input,
// reads no user data and returns a fixed vocabulary, so there is nothing
// here to scope to a user and nobody to authenticate: an external monitor
// has no session, and a health check behind auth monitors the auth rather
// than the app. Its one query reads a single column of a single row of
// user_onboarding and DISCARDS it — the row is never returned, never
// counted, never described. Same class as the published contact form:
// public by design, not unguarded by oversight.

/**
 * THE UPTIME PROBE.
 *
 * PUBLIC AND UNAUTHENTICATED BY DESIGN. An external monitor has no
 * session, and a health check behind auth monitors the auth rather than
 * the app. A monitor pointed at "/" gets a 200 from a statically-rendered
 * landing page whether or not the database is reachable, which is the
 * failure this endpoint exists to distinguish.
 *
 * ------------------------------------------------------------------
 * WHAT THE FIRST VERSION GOT WRONG, found in production
 * ------------------------------------------------------------------
 *
 * IT PROBED THE NEWEST TABLE IN THE SCHEMA. The query was
 * `agent_templates`, created by 20260826000000_agent_templates.sql —
 * one of the most recent migrations in the project. Production answered
 * {"ok":false,"db":false,"ms":529} while the application itself was
 * working perfectly, because that one migration had not been run yet.
 *
 * A health probe coupled to the newest migration reports "database down"
 * every time the schema is one step behind the code, which is the single
 * most common state a deploying project is ever in. It now reads
 * user_onboarding: present since 20260803000000_baseline_schema.sql, and
 * measured across every migration in the repository, touched by exactly
 * ONE since — 20260914000000_home_seen_at.sql, which only adds a column.
 * That is the property that matters and it is what the gate now checks:
 * this probe runs `select("user_id").limit(1)`, an added column cannot
 * break it, and a drop, rename or type change can.
 * scripts/tests/health-classify.test.mjs fails on any of those three.
 *
 * "db:false" WAS TRUE AND USELESS. 529ms of latency proves a round trip
 * HAPPENED — so DNS, TLS, the host and PostgREST were all alive — and
 * then a single boolean flattened "the table is missing", "the key was
 * rejected", "the schema cache is stale" and "the database is dead" into
 * one word. Whoever that alert wakes has to guess which, and the two
 * likeliest answers send them to different dashboards.
 *
 * So the answer now carries STAGE (which step) and REASON (why), and `db`
 * means what it says: did the database ANSWER. A missing table now
 * reports db:true with reason "schema_missing", because the database is
 * up and it is the deployment that is behind. `ok` stays false — the app
 * is still broken — but nobody is sent to look at a database that is fine.
 *
 * ------------------------------------------------------------------
 * WHAT AN ANONYMOUS CALLER MAY LEARN
 * ------------------------------------------------------------------
 *
 * Only a value from the closed set in lib/health/classify.ts. No table
 * name, no column, no error text, no version, no counts, no host. A
 * public endpoint that echoes database errors hands a stranger the
 * schema one request at a time.
 *
 * THE REAL MESSAGE IS AVAILABLE, to somebody who can prove they are us:
 * `?verbose=1` with the CRON_SECRET bearer token adds the provider's own
 * code and message. That path runs everything through scrubSecrets()
 * anyway, because "a Postgres error never contains a key" is a belief,
 * not a guarantee, and this is the one place a message crosses from the
 * log into an HTTP response. Without a configured CRON_SECRET,
 * checkCronAuth fails CLOSED and verbose is simply unavailable.
 *
 * ------------------------------------------------------------------
 * IT IS NOT A DENIAL-OF-SERVICE AMPLIFIER
 * ------------------------------------------------------------------
 *
 * Rate limiting is the wrong instrument twice over: checkRateLimit() is
 * itself a database round trip, so it would double the very cost it is
 * meant to bound, and a monitor handed a 429 records an outage that did
 * not happen. Instead the probe result is cached in process.
 *
 * A RESULT CACHE ALONE DOES NOT BOUND IT, and this route shipped its
 * first draft believing it did. A cache that stores the ANSWER is only
 * consulted after an answer exists, so N requests arriving before the
 * first query returns all miss and all query: measured, fifty
 * simultaneous requests cost forty-five round trips. The IN-FLIGHT
 * PROMISE below is what actually collapses them — measured again at
 * exactly one query for fifty requests.
 *
 * THE CACHE IS SHORT ON PURPOSE. Five seconds is below any sane
 * monitor's interval, so a monitor never reads a cached result, while a
 * flood collapses to one query per five seconds.
 */
const PROBE_CACHE_MS = 5_000;

/** Present since the baseline migration and untouched by every migration
 *  after it. See the header: the probe must be the most stable thing in
 *  the schema, not the newest. */
const PROBE_TABLE = "user_onboarding";

type Probe = {
  ok: boolean;
  dbAnswered: boolean;
  stage: HealthStage;
  reason: HealthReason;
  ms: number;
  at: number;
  /** Never sent to an anonymous caller. Scrubbed even for an authorised one. */
  detail?: { code?: string; message?: string };
};

let cached: Probe | null = null;
let inFlight: Promise<Probe> | null = null;

async function probeDatabase(): Promise<Probe> {
  const startedAt = Date.now();
  const done = (stage: HealthStage, reason: HealthReason, detail?: Probe["detail"]): Probe => ({
    ok: reason === "ok",
    dbAnswered: isDatabaseReachable(reason),
    stage,
    reason,
    ms: Date.now() - startedAt,
    at: Date.now(),
    detail,
  });

  // STAGE 1: config. createAdminClient() asserts both variables with `!`,
  // so an absent one throws inside the SDK and used to surface as a
  // database failure. Checked here as BOOLEANS — this function never sees
  // either value, so neither can reach a response by any path.
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasUrl || !hasKey) {
    logApiError("/api/health", new Error("missing_supabase_env"), {
      stage: "config",
      // Which one is missing is operational, not secret. The VALUES are
      // never read here at all.
      hasUrl: String(hasUrl),
      hasKey: String(hasKey),
    });
    return done("config", "misconfigured");
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    logApiError("/api/health", err, { stage: "client" });
    return done("client", "misconfigured");
  }

  try {
    // The cheapest real query there is: one column, one row, no count. A
    // count would scan; LIMIT 1 stops at the first row. The row itself is
    // discarded — only `error` is read — so nothing about anybody's data
    // can leave through here even by accident.
    const { error } = await admin.from(PROBE_TABLE).select("user_id").limit(1);
    if (!error) return done("query", "ok");
    const reason = classifyProbeError(error);
    logApiError("/api/health", error, { stage: "query", reason, table: PROBE_TABLE });
    return done("query", reason, {
      code: error.code ? scrubSecrets(String(error.code)) : undefined,
      message: error.message ? scrubSecrets(String(error.message)) : undefined,
    });
  } catch (err) {
    // A thrown fetch — DNS, refused connection, TLS — arrives here rather
    // than as an `error` object, and carries a `cause.code` like ENOTFOUND.
    const cause = (err as { cause?: { code?: string } })?.cause;
    const reason = classifyProbeError({
      code: cause?.code ?? (err as { code?: string })?.code ?? null,
      message: err instanceof Error ? err.message : String(err),
    });
    logApiError("/api/health", err, { stage: "query", reason });
    return done("query", reason === "ok" ? "unreachable" : reason, {
      code: cause?.code ? scrubSecrets(String(cause.code)) : undefined,
      message: err instanceof Error ? scrubSecrets(err.message) : undefined,
    });
  }
}

function currentProbe(): Promise<Probe> {
  if (cached && Date.now() - cached.at <= PROBE_CACHE_MS) return Promise.resolve(cached);
  if (!inFlight) {
    // Assigned BEFORE the first await anywhere in this function, so a
    // second request cannot observe a null here while the first is
    // between starting the query and recording it.
    inFlight = probeDatabase().then(
      (probe) => {
        cached = probe;
        inFlight = null;
        return probe;
      },
      (reason) => {
        // probeDatabase catches its own errors, so this cannot normally
        // run. Clearing anyway: an inFlight promise left behind by a
        // rejection would wedge the endpoint permanently.
        inFlight = null;
        throw reason;
      }
    );
  }
  return inFlight;
}

export async function GET(request: Request) {
  const probe = await currentProbe();

  // VERBOSE IS FOR US, NOT FOR THE INTERNET. checkCronAuth fails closed
  // when CRON_SECRET is unset, so an unconfigured deployment cannot be
  // talked into verbose mode by asking nicely.
  const wantsVerbose = new URL(request.url).searchParams.get("verbose") === "1";
  const authorised = wantsVerbose && checkCronAuth(request).ok;

  const body: Record<string, unknown> = {
    ok: probe.ok,
    // WHAT THIS MEANS, stated because the old field lied by omission:
    // "did the database answer", not "is everything fine". A missing
    // table answers, so this stays true and `reason` carries the fault.
    db: probe.dbAnswered,
    ms: probe.ms,
    stage: probe.stage,
    reason: probe.reason,
  };
  if (authorised && probe.detail) body.detail = probe.detail;

  return NextResponse.json(body, {
    status: probe.ok ? 200 : 503,
    // A CDN or proxy caching a 503 keeps reporting an outage that has
    // already ended, and caching a 200 hides one that has started.
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
