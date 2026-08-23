import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// @service-role-justified public — the uptime probe. It takes no input,
// reads no user data and returns a boolean, so there is nothing here to
// scope to a user and nobody to authenticate: an external monitor has no
// session, and a health check behind auth monitors the auth rather than
// the app. Its one query reads a single column of a single row of
// agent_templates, the public catalogue of starter agents, so even the
// row it touches belongs to no account. Same class as the published
// contact form above it: public by design, not unguarded by oversight.

/**
 * THE UPTIME PROBE.
 *
 * PUBLIC AND UNAUTHENTICATED BY DESIGN. An external monitor has no
 * session, and a health check behind auth monitors the auth rather than
 * the app. This is the only route in the product that is public because
 * a stranger is the intended caller rather than merely a tolerated one.
 *
 * WHY IT EXISTS. There was no way to ask this application whether it was
 * alive without logging in. /dashboard/system-health answers a richer
 * question and answers it to a signed-in owner; a monitor pointed at "/"
 * gets a 200 from a statically-rendered landing page whether or not the
 * database is reachable, which is the failure this endpoint exists to
 * distinguish. An app that renders and cannot read data is down in every
 * way a user cares about.
 *
 * IT REVEALS NOTHING BUT UP OR DOWN. No version, no counts, no table
 * names, no error text, no timings of anything but this call. The probe
 * reads one column of one row of agent_templates — the catalogue of
 * starter agents, which is public content by construction, so even a
 * leak of the row itself would disclose nothing about any account.
 *
 * IT IS NOT A DENIAL-OF-SERVICE AMPLIFIER, and that is the whole reason
 * for the cache below rather than a rate limit. Rate limiting is the
 * wrong instrument here twice over: checkRateLimit() is itself a database
 * round trip, so it would double the very cost it is meant to bound, and
 * a monitor that gets a 429 records an outage that did not happen. A
 * short in-process cache bounds the database work to one query per
 * PROBE_CACHE_MS per instance no matter how hard the endpoint is hit,
 * and every caller still gets a real answer.
 *
 * THE CACHE IS SHORT ON PURPOSE. Five seconds is below any sane monitor's
 * interval, so a monitor never reads a cached result, while a flood
 * collapses to one query per five seconds. It also means an outage is
 * reported within five seconds of the next poll rather than being masked.
 *
 * A RESULT CACHE ALONE DOES NOT DO THAT, and this route shipped its first
 * draft believing it did. A cache that stores the ANSWER is only consulted
 * after an answer exists, so N requests arriving before the first query
 * returns all miss and all query: measured, fifty simultaneous requests
 * cost forty-five round trips, against a comment claiming one. The
 * IN-FLIGHT PROMISE below is what actually collapses them — the first
 * caller starts the probe, every caller that arrives while it is running
 * awaits the same promise, and one query answers all of them.
 */
const PROBE_CACHE_MS = 5_000;

type Probe = { ok: boolean; ms: number; at: number };
let cached: Probe | null = null;
/** The probe currently running, if any. See the note above: this, not
 *  `cached`, is what makes a burst cost one query. */
let inFlight: Promise<Probe> | null = null;

async function probeDatabase(): Promise<Probe> {
  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    // The cheapest real query there is: one column, one row, no count.
    // A count would scan; LIMIT 1 stops at the first row. If this
    // round-trips then the service key, PostgREST and Postgres are all
    // alive, which is everything between the app and its data.
    const { error } = await admin.from("agent_templates").select("slug").limit(1);
    return { ok: !error, ms: Date.now() - startedAt, at: Date.now() };
  } catch {
    // Never rethrown and never logged with detail: a probe that can be
    // made to print an exception is a probe that can be read.
    return { ok: false, ms: Date.now() - startedAt, at: Date.now() };
  }
}

function currentProbe(): Promise<Probe> {
  if (cached && Date.now() - cached.at <= PROBE_CACHE_MS) return Promise.resolve(cached);
  if (!inFlight) {
    // Assigned BEFORE the first await anywhere in this function, so a
    // second request cannot observe a null here while the first is
    // between starting the query and recording it. Single-threaded
    // JavaScript makes that ordering sufficient; nothing else does.
    inFlight = probeDatabase().then(
      (probe) => {
        cached = probe;
        inFlight = null;
        return probe;
      },
      (reason) => {
        // probeDatabase catches its own errors, so this cannot normally
        // run. Clearing anyway: an inFlight promise left behind by a
        // rejection would wedge the endpoint permanently, and a health
        // check that can wedge is the worst thing this file could be.
        inFlight = null;
        throw reason;
      }
    );
  }
  return inFlight;
}

export async function GET() {
  const probe = await currentProbe();
  return NextResponse.json(
    { ok: probe.ok, db: probe.ok, ms: probe.ms },
    {
      status: probe.ok ? 200 : 503,
      // A CDN or proxy caching a 503 keeps reporting an outage that has
      // already ended, and caching a 200 hides one that has started.
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
