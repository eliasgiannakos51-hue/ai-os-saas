// EVERY CLAUSE OF nav-events.test.mjs, BROKEN ON PURPOSE.
//
// The gate says "the routes, the normaliser and the column agree". That
// sentence is made of four separate mechanisms — a filesystem walk, a
// pure function, a regular expression lifted out of a migration, and a
// set of source reads — and a gate assembled from four scanners is a gate
// that can report "all pass" over an empty set four different ways.
//
// It has already been wrong twice in its own short history, both caught
// by a database rather than by reading it:
//
//   * the CHECK constraint was `like '/dashboard%' and length between 10
//     and 64`, which accepts '/dashboard/finance?record=<uuid>' — the
//     exact string the table exists not to hold
//   * the retention clamp was greatest(...,1), so prune_nav_events(0)
//     deleted a row that was 89 days old
//
// Both are mutations here now, so neither can come back quietly.
//
// EVERY MUTATION IS A DELETION OR AN EDIT OF REAL CODE, never an
// `if (false)`. scripts/check-mutation-markers.mjs fails on that literal,
// so a mutation written that way is "caught" by the marker gate without
// any behavioural check having looked at it.
//
// Run: node scripts/tests/nav-events.mutation.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/nav-events.test.mjs";

function gateIsGreen() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// THE SIDECAR. A restore that only exists inside the running process is a
// restore that a kill deletes — this directory has lost that bet three
// times, once leaving a privilege escalation in the working tree. The
// original text goes to disk BEFORE anything is touched, and is healed on
// startup.
const SIDECAR = "scripts/tests/.nav-events-mutation-sidecar.json";
function healFromSidecar() {
  let saved;
  try {
    saved = JSON.parse(readFileSync(SIDECAR, "utf8"));
  } catch {
    return;
  }
  for (const [file, text] of Object.entries(saved)) writeFileSync(file, text);
  execFileSync("rm", ["-f", SIDECAR]);
  console.log(`healed ${Object.keys(saved).length} file(s) from a killed run\n`);
}
healFromSidecar();

const NAV = "src/lib/nav/nav-path.ts";
const MIG = "supabase/migrations/20260915000000_nav_events.sql";
const TRACKER = "src/components/dashboard/nav-tracker.tsx";
const ROUTE = "src/app/api/nav/track/route.ts";
const CRON = "src/app/api/cron/nav-retention/route.ts";
const LAYOUT = "src/app/dashboard/layout.tsx";
const VERCEL = "vercel.json";

const MUTATIONS = [
  // ---- the route list drifts from the app, in both directions ----
  {
    name: "a screen exists and is not tracked",
    file: NAV,
    from: '  "affiliate",\n',
    to: "",
  },
  {
    name: "a screen is deleted and left in the list",
    file: NAV,
    from: '  "affiliate",\n',
    to: '  "affiliate",\n  "a-screen-that-no-longer-exists",\n',
  },
  {
    name: "the module slugs become a hard-coded copy that has gone stale",
    file: NAV,
    from: "  return MODULES.map((m) => m.slug);",
    to: '  return ["finance", "trading", "research"];',
  },
  {
    name: "a business module is silently untracked",
    file: NAV,
    from: "  return MODULES.map((m) => m.slug);",
    to: "  return MODULES.slice(1).map((m) => m.slug);",
  },
  {
    name: "the nested dynamic route is forgotten, so /dashboard/documents/<id> becomes :unknown",
    file: NAV,
    from: 'export const NAV_NESTED_DYNAMIC: readonly string[] = ["documents"];',
    to: "export const NAV_NESTED_DYNAMIC: readonly string[] = [];",
  },

  // ---- the normaliser stops normalising ----
  {
    name: "the query string is kept, so record ids land in the column",
    file: NAV,
    from: '  const bare = raw.split("?")[0].split("#")[0];',
    to: "  const bare = raw;",
  },
  {
    name: "the fragment is kept",
    file: NAV,
    from: '  const bare = raw.split("?")[0].split("#")[0];',
    to: '  const bare = raw.split("?")[0];',
  },
  {
    name: "an unknown segment is stored verbatim instead of bucketed",
    file: NAV,
    from: "  if (!known) return NAV_UNKNOWN_PATH;",
    to: "  if (!known) return `/dashboard/${first}`;",
  },
  {
    name: "a document id is stored instead of :id",
    file: NAV,
    from: "    return `/dashboard/${first}/:id`;",
    to: "    return `/dashboard/${first}/${segments[2]}`;",
  },
  {
    name: "pages outside /dashboard start being tracked",
    file: NAV,
    from: '  if (segments[0] !== "dashboard") return null;',
    to: '  if (segments.length === 0) return null;\n  if (segments[0] !== "dashboard") return "/dashboard/:unknown";',
  },
  {
    name: "a stranger's URL is written into the referrer column",
    file: NAV,
    from: '  if (raw === "external") return "external";\n  return normaliseNavPath(raw);',
    to: '  if (raw === "external") return "external";\n  return typeof raw === "string" ? raw : null;',
  },
  {
    name: "the length cap on the raw input is dropped",
    file: NAV,
    from: "  if (raw.length === 0 || raw.length > 2048) return null;",
    to: "  if (raw.length === 0) return null;",
  },

  // ---- the column's last defence ----
  {
    name: "the CHECK goes back to a prefix and a length — the bug the database found",
    file: MIG,
    from: "  check (path ~ '^/dashboard(/:?[a-z0-9-]{1,30}){0,2}$');",
    to: "  check (path like '/dashboard%' and length(path) between 10 and 64);",
  },
  {
    name: "the CHECK allows a fourth segment",
    file: MIG,
    from: "  check (path ~ '^/dashboard(/:?[a-z0-9-]{1,30}){0,2}$');",
    to: "  check (path ~ '^/dashboard(/:?[a-zA-Z0-9-?=#]{1,30}){0,4}$');",
  },
  {
    name: "the referrer column stops having a shape rule",
    file: MIG,
    from: "    or referrer ~ '^/dashboard(/:?[a-z0-9-]{1,30}){0,2}$'",
    to: "    or referrer is not null",
  },

  // ---- retention ----
  {
    name: "the clamp goes back to greatest(...,1), so a stray 0 deletes 89 days",
    file: MIG,
    from: "  v_days integer := case\n    when p_days is null or p_days < 1 then 90\n    else least(p_days, 3650)\n  end;",
    to: "  v_days integer := greatest(least(coalesce(p_days, 90), 3650), 1);",
  },
  {
    name: "the retention default drifts from NAV_RETENTION_DAYS",
    file: MIG,
    from: "create or replace function public.prune_nav_events(p_days integer default 90)",
    to: "create or replace function public.prune_nav_events(p_days integer default 30)",
  },
  {
    name: "the cron route hard-codes a number instead of reading the constant",
    file: CRON,
    from: "      p_days: NAV_RETENTION_DAYS,",
    to: "      p_days: 90,",
  },
  {
    name: "the sweep is unregistered, so retention never runs",
    file: VERCEL,
    from: '    {\n      "path": "/api/cron/nav-retention",\n      "schedule": "0 5 * * *"\n    },\n',
    to: "",
  },
  {
    name: "the sweep stops being daily",
    file: VERCEL,
    from: '"schedule": "0 5 * * *"',
    to: '"schedule": "0 5 1 * *"',
  },

  // ---- privileges ----
  {
    name: "anon keeps its inherited grants on the table",
    file: MIG,
    from: "revoke all on public.nav_events from anon;",
    to: "",
  },
  {
    name: "the identity sequence is left granted to anon",
    file: MIG,
    from: "    execute format('revoke all on sequence %s from anon', v_seq);",
    to: "    perform v_seq;",
  },
  {
    name: "authenticated is given UPDATE, so a user can rewrite their own trail",
    file: MIG,
    from: "revoke update, delete on public.nav_events from authenticated;",
    to: "grant update on public.nav_events to authenticated;",
  },
  {
    name: "the cleanup function stays executable by every signed-in user",
    file: MIG,
    from: "  execute 'revoke all on function public.prune_nav_events(integer) from authenticated';",
    to: "  perform 1;",
  },
  {
    name: "the function's search_path is unpinned",
    file: MIG,
    from: "set search_path = public, pg_catalog\nas $prune$",
    to: "as $prune$",
  },
  {
    name: "a view loses security_invoker and starts running as its owner",
    file: MIG,
    from: "create view public.nav_user_breadth\nwith (security_invoker = true) as",
    to: "create view public.nav_user_breadth as",
  },
  {
    name: "an aggregate view over every account is handed to authenticated",
    file: MIG,
    from: "grant select on public.nav_screen_usage to service_role;",
    to: "grant select on public.nav_screen_usage to service_role;\ngrant select on public.nav_screen_usage to authenticated;",
  },
  {
    name: "RLS is turned off on the table",
    file: MIG,
    from: "alter table public.nav_events enable row level security;",
    to: "",
  },
  {
    name: "the retention DELETE loses its WHERE",
    file: MIG,
    from: "  delete from public.nav_events\n   where created_at < now() - make_interval(days => v_days);",
    to: "  delete from public.nav_events;",
  },

  // ---- the write path ----
  {
    name: "the tracker is unmounted, so nothing is ever recorded",
    file: LAYOUT,
    from: "            <NavTracker />\n",
    to: "",
  },
  {
    name: "the dedupe key becomes a ref, which StrictMode re-creates — every count inflated",
    file: TRACKER,
    from: "let lastTrackedPath: string | null = null;",
    to: "let lastTrackedPath: string | null = null;\nimport { useRef } from \"react\";",
  },
  {
    name: "keepalive is dropped, so the last navigation of a session is lost",
    file: TRACKER,
    from: "      keepalive: true,",
    to: "",
  },
  {
    name: "the route trusts the browser's own idea of the path",
    file: ROUTE,
    from: "    const path = normaliseNavPath(body?.path);",
    to: "    const path = typeof body?.path === \"string\" ? body.path : null;",
  },
  {
    name: "the route trusts the browser's referrer",
    file: ROUTE,
    from: "    const referrer = normaliseNavReferrer(body?.referrer);",
    to: "    const referrer = typeof body?.referrer === \"string\" ? body.referrer : null;",
  },
  {
    name: "user_id comes from the body — one POST attributes a navigation to anybody",
    file: ROUTE,
    from: "      .insert({ user_id: user.id, path, referrer });",
    to: "      .insert({ user_id: body?.userId ?? user.id, path, referrer });",
  },
  {
    name: "the route writes with the service role, so RLS stops scoping the insert",
    file: ROUTE,
    from: 'import { createClient } from "@/lib/supabase/server";',
    to: 'import { createAdminClient as createClient } from "@/lib/supabase/admin";',
  },
  {
    name: "an unrecognised path is accepted rather than refused",
    file: ROUTE,
    from: "      return NextResponse.json({ ok: false }, { status: 400 });",
    to: "      path = \"/dashboard\";",
  },

  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  // A gate whose scanners are broken reports "all pass" over an empty
  // set, and every one of these four has an equivalent that has already
  // been wrong somewhere in this directory.
  {
    name: "the gate reads the migration's COMMENTS as code",
    file: GATE,
    from: "const migrationCode = stripSql(migration);",
    to: "const migrationCode = migration;",
    expect: "the header quotes the old prefix-and-length constraint, so the check for it goes red",
  },
  {
    name: "the gate reads the tracker's COMMENTS as code",
    file: GATE,
    from: "const trackerCode = stripComments(tracker);",
    to: "const trackerCode = tracker;",
    expect: "the comment explaining why a useRef is wrong contains the word useRef",
  },
  {
    name: "the filesystem walk stops recursing, so nested routes vanish",
    file: GATE,
    from: "    walkRoutes(full, depth + 1, out);",
    to: "    if (depth < 0) walkRoutes(full, depth + 1, out);",
    expect: "the stale-entry half of the NAV_NESTED_DYNAMIC check",
  },
  {
    name: "the producible range is emptied, so 'they all satisfy the CHECK' is vacuous",
    file: GATE,
    from: "const accepted = producible.filter((p) => pathRe.test(p)).length;",
    to: "const accepted = [].filter((p) => pathRe.test(p)).length;",
    expect: "the count of paths that PASSED, which is 0 when none were tested",
  },
  {
    name: "the range is emptied AND the expectation is taken from it — the check grades its own homework",
    file: GATE,
    from: "const expected = 2 + nav.NAV_STATIC_SEGMENTS.length + MODULES.length + nav.NAV_NESTED_DYNAMIC.length;",
    to: "producible.length = 0;\nconst expected = producible.length;",
    // WHY THIS IS ONE MUTATION AND NOT TWO. Rewriting `expected` as
    // `producible.length` on its own is an EQUIVALENT mutation: both are
    // 51 on an intact tree, nothing observable changes, and the suite was
    // right to report it as a survivor. The regression it stands for only
    // exists in combination — a self-derived expectation over a range
    // that has gone empty, which is the shape where "51 of 51 passed"
    // becomes "0 of 0 passed" and reads identically. That composite is
    // what the floor refuses, and it is the honest thing to mutate.
    expect: "the floor on the expected count, which a self-derived 0 cannot meet",
  },
  {
    name: "the route scan looks only at the top level, so [module] is never seen",
    file: GATE,
    from: "walkRoutes(DASH, 1, routes);",
    to: "walkRoutes(DASH, 1, routes.length ? routes : []);\nroutes.length = 0;",
    expect: "the floor on how many screens were found",
  },
];

console.log("nav-events mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

const originals = new Map();
let caught = 0;
const survivors = [];
// A STALE ANCHOR IS A FAILURE, NOT A NOTE. A survivor means the gate
// cannot see a real regression; a missed anchor means this file never
// tried, and a suite that silently skips half its mutations reports the
// same "all caught" as one that ran them.
const missed = [];

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}; the mutation never applied`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}, so the edit is ambiguous`);
    continue;
  }
  originals.set(m.file, before);
  writeFileSync(SIDECAR, JSON.stringify(Object.fromEntries(originals)));
  writeFileSync(m.file, before.replace(m.from, () => m.to));

  const red = !gateIsGreen();

  writeFileSync(m.file, before);
  originals.delete(m.file);
  execFileSync("rm", ["-f", SIDECAR]);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`);
  } else {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  }
}

console.log("");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");

console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of nav-events.test.mjs is load-bearing.");
