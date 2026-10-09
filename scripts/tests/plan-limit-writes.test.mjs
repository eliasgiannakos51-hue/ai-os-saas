// EVERY LIMIT THE PRICING PAGE SELLS, AND WHETHER THE ACCOUNT CAN WRITE
// PAST IT (docs/SECURITY-AUDIT.md, ΑΣ-4.11, 2026-10-08).
//
// ΑΣ-4.11 read "half: the routes check; ΑΣ-1.6 and ΑΣ-4.4 remain". Both
// were fixed on 2026-10-05, and the row still said half — because the two
// fixes named their tables, and nothing ranged over the LIMITS. A limit
// counted in a route holds only while the account cannot write the
// counted rows some other way, and the database answers that, not the
// route.
//
// THE POPULATION is the pricing page's own: every row of
// src/lib/billing/feature-catalog.ts that shows a quantity on any plan.
// Each must have an entry in LEDGER below saying how it is held, and the
// entry is checked against the migrations, not believed:
//
//   rows     the limit counts rows the account cannot create: no live
//            INSERT policy for it, or INSERT revoked, after every
//            migration in order.
//   counter  a number the server keeps: the account can neither insert,
//            update nor delete it.
//   request  checked on each request by the route that does the work;
//            no row the account writes moves it.
//   open     a known gap, with the audit row that owns it. That row must
//            still be open, or the ledger is stale.
//   none     not a limit on what the account writes: a price, a display
//            cap. Says why.
//   exempt   the account does write the rows, on purpose. Says why.
//
// Running it on the tree before 2026-10-08 failed on two rows: projects
// (the plan's project cap) and siteVersionsKept (a published site's
// history). Both are fixed in
// supabase/migrations/20261023100000_projects_site_versions_server_written.sql.
//
// THE READER IS PINNED BOTH WAYS. A policy reader that saw nothing would
// pass every `rows` entry. So it is run at two points in history for
// tables whose answer is known: team_members was insertable before
// 20261014000000_server_written_tables.sql and is not after it.
//
// Run: node scripts/tests/plan-limit-writes.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------
// The ledger. One entry per quantity row of the catalog.
// ---------------------------------------------------------------------
const LEDGER = {
  publishedSites: { rows: ["published_sites"], countedIn: "src/app/api/websites/[id]/publish/route.ts", countedBy: '.from("published_sites")' },
  freeChatMessages: { counter: ["user_credits"], countedIn: "src/lib/billing/free-chat-usage.ts", countedBy: 'rpc("consume_free_chat"' },
  chatMemory: {
    request: "how many of the account's memories one Chat message reads, applied when /api/chat reads them",
    countedIn: "src/app/api/chat/route.ts",
    countedBy: "plan.capabilities.chatMemoryLimit",
  },
  chatPins: {
    exempt:
      "the account pins and unpins its own conversations directly; src/lib/chat/pin-limits.ts calls the cap a usability floor, not a cost, and nothing is charged or sold per pin",
  },
  // Counted per calendar month from rows the account may still DELETE:
  // the create is the server's, the delete is ΑΣ-4.13's.
  deepResearch: { rows: ["research_reports"], window: true, countedIn: "src/app/api/research/route.ts", countedBy: '.from("research_reports")', open: "ΑΣ-4.13" },
  aiAgents: { rows: ["user_agents"], countedIn: "src/lib/agents/agent-cap.ts", countedBy: '.from("user_agents")' },
  files: { rows: ["user_files"], countedIn: "src/lib/files/ingest.ts", countedBy: '.from("user_files")' },
  // The rows are held; the bytes in the bucket are ΑΣ-5.5's.
  storage: { rows: ["user_files"], countedIn: "src/lib/files/ingest.ts", countedBy: '.from("user_files")', open: "ΑΣ-5.5" },
  projects: { rows: ["projects"], countedIn: "src/app/api/projects/route.ts", countedBy: '.from("projects")' },
  teamMembers: { rows: ["team_members"], countedIn: "src/app/api/team/invite/route.ts", countedBy: '.from("team_members")' },
  integrations: {
    exempt:
      "a connection works only with a token the server encrypted for this account (src/lib/integrations/store.ts); a row written any other way does not decrypt and connects nothing",
  },
  creditsPerMonth: { counter: ["user_credits"], countedIn: "src/lib/billing/credits.ts", countedBy: '.from("user_credits")' },
  listRowsShown: { none: "how many rows a list page reads before it says so; the same on every plan, a display cap (src/lib/record-cap.ts)" },
  agentRunsPerHour: { rows: ["agent_runs"], window: true, countedIn: "src/lib/agents/execute-agent.ts", countedBy: '.from("agent_runs")' },
  fileUploadsPerHour: { counter: ["rate_limit_log"], countedIn: "src/app/api/files/upload/route.ts", countedBy: "maxAttempts: maxUploadsPerHour()" },
  fileQuestionsPerHour: { counter: ["rate_limit_log"], countedIn: "src/app/api/files/ask/route.ts", countedBy: "maxAttempts: maxFileQuestionsPerHour()" },
  integrationReadsPerHour: { counter: ["rate_limit_log"], countedIn: "src/lib/integrations/chat-tool.ts", countedBy: "checkRateLimit(" },
  siteEditsPerDay: { counter: ["rate_limit_log"], countedIn: "src/app/api/websites/[id]/publish/route.ts", countedBy: "maxAttempts: MAX_LIVE_EDITS_PER_SITE_PER_DAY" },
  siteVersionsKept: { rows: ["site_versions"], countedIn: "src/app/api/websites/[id]/publish/route.ts", countedBy: '.from("site_versions")' },
  // Uploaded straight from the browser to Storage; the quota is advisory
  // and says so (src/lib/websites/storage-quota.ts).
  websiteImageStorage: { open: "ΑΣ-5.5" },
  voiceClipLength: {
    request: "the length of one recording, refused by the route that transcribes it",
    countedIn: "src/app/api/voice/transcribe/route.ts",
    countedBy: "MAX_CLIP_SECONDS",
  },
  voiceMinutes: { counter: ["voice_usage"], countedIn: "src/lib/voice/voice-usage.ts", countedBy: 'rpc("consume_voice_seconds"' },
  teamSeatsAddOn: { none: "a price per extra seat (TEAM_SEAT_PRICE in src/lib/billing/plans.ts), not a limit on anything the account writes" },
};

// ---------------------------------------------------------------------
// What the migrations leave the signed-in account able to do.
// ---------------------------------------------------------------------
const DIR = "supabase/migrations";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const VERBS = ["insert", "update", "delete"];
const ident = String.raw`(?:"([^"]+)"|([a-z0-9_]+))`;
const tableRef = String.raw`(?:(?:public|"public")\.)?"?([a-z0-9_]+)"?`;

function rolesInclude(roles, role) {
  return roles.length === 0 || roles.includes("public") || roles.includes(role);
}
function parsePolicyRest(rest) {
  const cmd = (rest.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] ?? "all").toLowerCase();
  const to = rest.match(/\bto\s+([\s\S]+?)(?=\busing\b|\bwith\s+check\b|$)/i)?.[1] ?? "";
  const roles = to.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  return { cmd, roles };
}

/** The account's verbs on every table, after the migrations up to `upTo` (inclusive). */
function accountState(upTo = "99999999999999") {
  const policies = new Map(); // table -> Map(name -> {cmd, roles})
  const revoked = new Map(); // table -> Set(verb) revoked from authenticated
  const tables = new Set();
  const pol = (t) => policies.get(t) ?? (policies.set(t, new Map()), policies.get(t));
  for (const f of FILES) {
    if (f.slice(0, 14) > upTo) break;
    const sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");
    // One pass in file order, so a drop and a create in the same file land
    // in the order they run.
    const re = new RegExp(
      [
        String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${tableRef}`,
        String.raw`create\s+policy\s+${ident}\s+on\s+${tableRef}([^;]*);`,
        String.raw`drop\s+policy\s+(?:if\s+exists\s+)?${ident}\s+on\s+${tableRef}`,
        String.raw`(grant|revoke)\s+([a-z,\s]+?)\s+on\s+(?:table\s+)?((?:(?:public\.)?[a-z0-9_]+\s*,\s*)*(?:public\.)?[a-z0-9_]+)\s+(?:to|from)\s+([a-z_,\s]+?)\s*;`,
      ].join("|"),
      "gi"
    );
    for (const m of sql.matchAll(re)) {
      if (m[1]) tables.add(m[1]);
      else if (m[4]) pol(m[4]).set(m[2] ?? m[3], parsePolicyRest(m[5]));
      else if (m[8]) pol(m[8]).delete(m[6] ?? m[7]);
      else if (m[9]) {
        const words = m[10].toLowerCase();
        const verbs = /\ball\b/.test(words) ? VERBS : VERBS.filter((v) => new RegExp(`\\b${v}\\b`).test(words));
        const roles = m[12].split(",").map((r) => r.trim().toLowerCase());
        if (!roles.includes("authenticated") && !roles.includes("public")) continue;
        for (const t of m[11].split(",").map((x) => x.trim().replace(/^public\./, ""))) {
          const set = revoked.get(t) ?? (revoked.set(t, new Set()), revoked.get(t));
          for (const v of verbs) (m[9].toLowerCase() === "revoke" ? set.add(v) : set.delete(v));
        }
      }
    }
    // Policies made by a loop over a literal array (the baseline's module
    // tables): `execute format('create policy "..%1$s.." on public.%1$s
    // for insert ...', t)`.
    for (const block of sql.matchAll(/do\s+\$([a-z_]*)\$([\s\S]*?)\$\1\$/gi)) {
      const loop = block[2].match(/unnest\s*\(\s*array\s*\[([\s\S]*?)\]/i);
      if (!loop) continue;
      const loopTables = [...loop[1].matchAll(/'([a-z0-9_]+)'/gi)].map((x) => x[1]);
      for (const tpl of block[2].matchAll(/create\s+policy\s+"([^"]*%1\$s[^"]*)"\s+on\s+(?:public\.)?%1\$s([^']*)/gi)) {
        for (const t of loopTables) pol(t).set(tpl[1].replace(/%1\$s/g, t), parsePolicyRest(tpl[2]));
      }
    }
  }
  const policyAllows = (table, verb) =>
    [...(policies.get(table)?.values() ?? [])].some((p) => (p.cmd === verb || p.cmd === "all") && rolesInclude(p.roles, "authenticated"));
  const isRevoked = (table, verb) => revoked.get(table)?.has(verb) ?? false;
  const can = (table, verb) => !isRevoked(table, verb) && policyAllows(table, verb);
  return { can, policyAllows, isRevoked, tables };
}

const now = accountState();

console.log("== 1. the reader sees a policy come and go ==");
{
  // 20261014000000_server_written_tables.sql both drops the policy and
  // revokes the verb, so each half of the reader is pinned on its own: a
  // reader blind to either would still call the table closed.
  const before = accountState("20261013000000");
  ok("team_members: insertable by the account before 20261014000000", before.can("team_members", "insert"));
  ok("...and not after it", !now.can("team_members", "insert"));
  ok("...its insert policy seen created, then dropped", before.policyAllows("team_members", "insert") && !now.policyAllows("team_members", "insert"));
  ok("...its INSERT seen granted, then revoked", !before.isRevoked("team_members", "insert") && now.isRevoked("team_members", "insert"));
  ok("research_reports: insertable before 20261011000000, not after", accountState("20261010000000").can("research_reports", "insert") && !now.can("research_reports", "insert"));
  ok("a table the account plainly writes reads as writable (chat_conversations, update)", now.can("chat_conversations", "update"));
  ok("a server-only counter reads as closed (voice_usage, insert)", !now.can("voice_usage", "insert"));
}

console.log("\n== 2. every quantity the pricing page shows has an entry ==");
const { PLANS } = await loadTs("src/lib/billing/plans.ts");
const { FEATURE_CATALOG } = await loadTs("src/lib/billing/feature-catalog.ts");
const WORDS = new Proxy({}, { get: (_t, k) => String(k) });
const quantity = FEATURE_CATALOG.filter((row) =>
  PLANS.some((p) => {
    const cell = row.cell(p, "en", WORDS);
    return cell?.type === "value" || cell?.type === "unlimited";
  })
).map((r) => r.id);
ok(`the catalog was read (${FEATURE_CATALOG.length} rows, ${quantity.length} show a quantity)`, FEATURE_CATALOG.length > 30 && quantity.length >= 15);
const missing = quantity.filter((id) => !(id in LEDGER));
ok("every one is in the ledger", missing.length === 0, `not in the ledger: ${missing.join(", ")}`);
const extra = Object.keys(LEDGER).filter((id) => !quantity.includes(id));
ok("...and the ledger names no row that is gone", extra.length === 0, `no longer a quantity row: ${extra.join(", ")}`);

console.log("\n== 3. each entry holds against the migrations ==");
const audit = readFileSync("docs/SECURITY-AUDIT.md", "utf8");
for (const id of quantity.filter((x) => x in LEDGER)) {
  const e = LEDGER[id];
  const kinds = ["rows", "counter", "request", "open", "none", "exempt"].filter((k) => k in e);
  if (kinds.length === 0) {
    ok(`${id}: says how it is held`, false);
    continue;
  }
  if (e.countedIn !== undefined) {
    ok(`${id}: counted in ${e.countedIn}, by ${e.countedBy}`, typeof e.countedBy === "string" && stripComments(readFileSync(e.countedIn, "utf8")).includes(e.countedBy));
  }
  for (const t of e.rows ?? []) {
    ok(`${id}: ${t} exists in the migrations`, now.tables.has(t));
    ok(`${id}: the account cannot create ${t} rows`, !now.can(t, "insert"));
    // A count over a window goes DOWN when a row in it is deleted, so for
    // those the delete matters too — held, or owned by an open audit row.
    if (e.window) ok(`${id}: ...nor delete one inside the window${now.can(t, "delete") ? `, or ${e.open} owns it` : ""}`, !now.can(t, "delete") || Boolean(e.open));
  }
  for (const t of e.counter ?? []) {
    const writable = VERBS.filter((v) => now.can(t, v));
    ok(`${id}: the account cannot move ${t}`, now.tables.has(t) && writable.length === 0, writable.join(", "));
  }
  if (e.open) {
    const row = audit.split("\n").find((l) => l.startsWith(`| ${e.open} |`));
    const state = row?.split("|")[3]?.trim() ?? "";
    ok(`${id}: still open as ${e.open}`, Boolean(row) && !/^(διορθώθηκε|εντάξει)/.test(state), row ?? "no such row in docs/SECURITY-AUDIT.md");
  }
  for (const k of ["request", "none", "exempt"]) {
    if (k in e) ok(`${id}: ${k} — says why`, typeof e[k] === "string" && e[k].length > 30, e[k]);
  }
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
