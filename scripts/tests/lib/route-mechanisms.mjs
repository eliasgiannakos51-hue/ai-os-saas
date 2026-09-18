// THE MECHANISMS THIS TREE USES TO BOUND, OWN AND IDENTIFY A REQUEST.
//
// ONE DEFINITION, because there were two. resource-ownership.test.mjs
// derived ownership from five predicates and route-contract.test.mjs
// carried a copy of the same five — so the day one of them learned an
// idiom the other kept calling the same route unowned, and the two gates
// would have disagreed about the same file with nothing to say which was
// right. That is the shape this repository found in eleven copies of an
// HTML escaper and fourteen of a sender address.
//
// Every predicate here is a thing the tree DOES, named, not a shape a
// linter would like. Each is exercised by a control in the gates that
// import it, and every one of them has a floor: a mechanism nothing
// matches any more is a renamed helper turning a whole class of route
// into "unowned" silently.
//
// Run: imported by resource-ownership.test.mjs and route-contract.test.mjs
import { readFileSync, readdirSync } from "node:fs";

export const AUTHENTICATES = /auth\s*\.\s*getUser\s*\(|getCurrentUser(?:Result)?\s*\(/;
export const CRON = /checkCronAuth\s*\(/;
export const STRIPE_SIG = /constructEvent\s*\(/;
export const ADMIN_CLIENT = /createAdminClient\s*\(/;
export const CALLER_CLIENT = /createClient\s*\(\s*\)/;
export const FROM_REQUEST = /params\.[a-zA-Z_]+|body\??\.[a-zA-Z_]*[Ii]d\b|searchParams\.get\(/;

/**
 * The SQL functions the migrations declare SECURITY INVOKER.
 *
 * This is the difference between an RPC that is scoped by RLS and one
 * that is not, and it cannot be guessed from the call site: `.rpc("x")`
 * looks identical either way. SECURITY DEFINER runs as the function's
 * owner and bypasses every policy; SECURITY INVOKER runs as the caller
 * and is scoped exactly as `.from()` would be. So the answer is read out
 * of supabase/migrations rather than assumed, and a function that is
 * neither declared nor found is treated as NOT invoker — the unsafe
 * assumption is the safe default here.
 */
export function securityInvokerFunctions(dir = "supabase/migrations") {
  const invoker = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi)) {
      const name = m[1];
      // The body runs from the signature to the function's own $$ opener;
      // `security invoker` / `security definer` is stated in between.
      const head = sql.slice(m.index, sql.indexOf("$", m.index) > -1 ? sql.indexOf("$", m.index) : m.index + 1200);
      if (/security\s+invoker/i.test(head)) invoker.add(name);
      else if (/security\s+definer/i.test(head)) invoker.delete(name);
    }
  }
  return invoker;
}

/**
 * HOW A ROUTE KNOWS THE RESOURCE IS THE CALLER'S.
 *
 * `invoker` is the set from securityInvokerFunctions(); pass it so the
 * migrations are read once per run rather than once per route.
 */
export function ownershipTable(invoker) {
  return {
    // The row is read through the CALLER's client, so RLS decided before
    // anything else touched it.
    read_under_rls: (src) => CALLER_CLIENT.test(src) && /\.from\(/.test(src),

    // THE SAME THING THROUGH AN RPC, and it needs the migrations to tell
    // the two apart. Eight routes were reported as establishing no
    // ownership on 2026-09-18 and every one of them was scoped; two of
    // them read through `.rpc("search_all_localized")` and
    // `.rpc("match_agent_templates")`, both declared SECURITY INVOKER in
    // their migrations — which is RLS, spelled differently.
    rls_rpc: (src) => {
      if (!CALLER_CLIENT.test(src)) return false;
      const calls = [...src.matchAll(/\.rpc\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1]);
      return calls.length > 0 && calls.every((fn) => invoker.has(fn));
    },

    // THE CALLER'S CLIENT HANDED TO A HELPER. api/entity-links/suggest
    // passes `supabase` into suggestEntityLinks and every query inside
    // runs as that user. The client IS the scope; where the query is
    // written does not change whose rows it can see.
    client_handed_on: (src) =>
      CALLER_CLIENT.test(src) && /\b[a-z][A-Za-z0-9_]*\s*\(\s*supabase\s*[,)]/.test(src),

    // A HELPER GIVEN THE USER ID. Five of the eight do this —
    // listDeliveryChannels(user.id), disconnectIntegration(user.id, ...),
    // recordClick({ userId: user.id }), mergeUserMetadata(user.id, ...).
    //
    // NOT "the file mentions user.id", which every route does:
    // `checkRateLimit({ identifier: user.id })` is a limiter and not an
    // ownership check, and a rule that counted it would clear the whole
    // tree. The id has to be the FIRST argument of a call or be passed
    // under the name `userId`.
    scoped_helper: (src) =>
      /\b[a-z][A-Za-z0-9_]*\s*\(\s*\n?\s*user\.id\s*[,)]/.test(src) || /\buserId:\s*user\.id\b/.test(src),

    // An explicit filter on the owning column.
    explicit_filter: (src) => /\.eq\(\s*"(user_id|owner_id|owner|created_by|shared_by)"/.test(src),

    // An explicit comparison in TypeScript.
    explicit_compare: (src) =>
      /user\.id\s*!==?\s*[a-zA-Z_$][\w$]*\.(user_id|owner_id)/.test(src) ||
      /[a-zA-Z_$][\w$]*\.(user_id|owner_id)\s*!==?\s*user\.id/.test(src) ||
      /secretsMatch\s*\([^)]*user\.id/.test(src),

    // A named helper that answers the question for a resource this app
    // has more than one way of owning.
    helper: (src) => /resolveDeliveryOwnership|referenceImagePathBelongsToUser|isProjectMemberTable/.test(src),

    // The route is owner-only, so the resource being somebody else's is
    // the point of it.
    owner_only: (src) => /isAdminEmail\s*\(/.test(src),
  };
}

/** The eight kinds of bound this tree uses. */
export const BOUNDS = {
  rate_limit: (s) =>
    /checkRateLimit\s*\(/.test(s) &&
    /scope:\s*"[a-z_0-9]+"/.test(s) &&
    (/if\s*\(\s*!\s*[A-Za-z_$][\w$]*\.allowed\s*\)/.test(s) || /if\s*\(\s*!\s*allowed\s*\)/.test(s)),
  own_limiter: (s) => /countRateLimitHits\s*\(|recordRateLimitHit\s*\(/.test(s),
  // THE NINTH KIND, found on 2026-09-18 by a claim of mine that was
  // wrong. I wrote that only the root public-site route carried a
  // limiter; all four do. publicRequestAllowed (lib/publishing/
  // public-serving.ts) is a per-instance sliding window — 240 requests a
  // minute per hashed IP, held in memory rather than in the database
  // BECAUSE the row-per-check limiter would turn a traffic spike into a
  // write storm. Its own header is honest that it is not DDoS protection.
  // It was absent from this table, which is why the tree's entire public
  // surface read as having no bound at all.
  in_memory_window: (s) => /publicRequestAllowed\s*\(/.test(s),
  cron_secret: (s) => CRON.test(s),
  reservation: (s) => /\breserveCredits\s*\(|\bstartJob\s*\(/.test(s),
  plan_cap: (s) =>
    /maxProjectsForPlan|MAX_MEMBERS|maxAgentsForAccount|checkAgentActivationCap|seat_count|maxIntegrationsForPlan|storageLimitBytes|maxAgentTemplates|maxPublishedSitesForPlan/.test(s),
  free_allowance: (s) => /consumeFreeChat/.test(s),
  stripe_signature: (s) => STRIPE_SIG.test(s),
  owner_only: (s) => /isAdminEmail\s*\(/.test(s),
};

/** What a route offers as proof of who is asking. */
export function identityOf(src) {
  const k = [];
  if (AUTHENTICATES.test(src)) k.push("session");
  if (CRON.test(src)) k.push("cron_secret");
  if (STRIPE_SIG.test(src)) k.push("stripe_signature");
  if (/signInWithPassword\s*\(/.test(src)) k.push("password");
  if (/exchangeCodeForSession\s*\(/.test(src)) k.push("oauth_code");
  if (/hashDeleteAccountToken\s*\(|hashResetToken\s*\(/.test(src)) k.push("bearer_token");
  if (/admin\s*\.\s*auth\s*\.\s*admin\s*\.\s*createUser\s*\(|auth\s*\.\s*signUp\s*\(/.test(src)) k.push("new_account");
  return k;
}

export const matching = (table, src) => Object.entries(table).filter(([, t]) => t(src)).map(([k]) => k);
