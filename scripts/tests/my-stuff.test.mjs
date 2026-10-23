// «ΤΑ ΔΙΚΑ ΜΟΥ» (the owner's message, 2026-10-22, item 3's AI-answer half):
// a cross-table, read-only question-answering tool over the account's own
// rows. A pure ADDITION — nothing here moves, copies or deletes a row of
// Finance, Sales, Trading or any of the other nine kinds it reads.
//
// THE THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A KIND READ THROUGH THE ADMIN CLIENT. This loads one person's own
//   records into a model prompt; the row filter must be the database's
//   RLS, never a `.eq("user_id", ...)` somebody could forget — and never
//   the admin client at all for a READ (see lib/ai/cross-module-store.ts's
//   own rule, reused here).
//
//   A WRITE TO ANY OF THE OTHER TABLES. The one table this tool's route
//   may write to is my_stuff_sessions, its own history — never
//   finance_entries, leads, trades, or any of the other nine.
//
//   A CITATION THAT POINTS AT NOTHING THE MODEL WAS SHOWN. citedIndices
//   must reject a number outside the range the context actually listed.
//
//   A QUESTION THAT NARROWS TO NOTHING. classifyMyStuffQuestion must fail
//   open — a question that matches no vocabulary still returns every kind
//   it knows, never an empty list, which would read as "I found nothing"
//   on data that was there the whole time.
//
// Run: node scripts/tests/my-stuff.test.mjs
import { readFileSync } from "node:fs";
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
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const sources = await loadTs("src/lib/my-stuff/sources.ts");
const classify = await loadTs("src/lib/my-stuff/classify.ts");
const ctx = await loadTs("src/lib/my-stuff/ask-context.ts");
const library = await loadTs("src/lib/library/sources.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const lookup = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

// =====================================================================
console.log("\n== 1. sources: every kind the Library has, plus five more, nothing moved ==");
// =====================================================================

eq("twelve kinds in all", sources.MY_STUFF_KINDS.length, 12);
for (const libraryKind of library.LIBRARY_KINDS) {
  ok(`"${libraryKind}" (a Library kind) is one of my-stuff's own`, sources.MY_STUFF_KINDS.includes(libraryKind));
}
for (const extra of ["chat", "coding", "finance", "sales", "trading"]) {
  ok(`"${extra}" is a my-stuff kind the Library does not have`, sources.MY_STUFF_KINDS.includes(extra) && !library.LIBRARY_KINDS.includes(extra));
}
// THE SEVEN SHARED KINDS READ THE SAME TABLE AS THE LIBRARY — one
// definition, not two that could drift.
for (const libSource of library.LIBRARY_SOURCES) {
  const mine = sources.sourceForKind(libSource.kind);
  ok(`"${libSource.kind}": same table as the Library's`, mine && mine.table === libSource.table, `library reads ${libSource.table}, my-stuff reads ${mine?.table}`);
}
// EVERY SOURCE HAS A REAL ADDRESS.
for (const kind of sources.MY_STUFF_KINDS) {
  const s = sources.sourceForKind(kind);
  const href = s.hrefFor("abc-123");
  ok(`"${kind}": hrefFor() returns a dashboard address`, typeof href === "string" && href.startsWith("/dashboard/"), href);
}
ok("finance reads finance_entries (the tracker's own table, untouched)", sources.sourceForKind("finance").table === "finance_entries");
ok("sales reads leads", sources.sourceForKind("sales").table === "leads");
ok("trading reads trades", sources.sourceForKind("trading").table === "trades");
ok("isMyStuffKind rejects a kind that is not one of the twelve", sources.isMyStuffKind("nonsense") === false);
ok("isMyStuffKind accepts a real one", sources.isMyStuffKind("finance") === true);

// =====================================================================
console.log("\n== 2. classify: fails toward reading everything, never toward reading nothing ==");
// =====================================================================

eq(
  "the owner's own example — Finance — is found by Finance's real vocabulary",
  classify.classifyMyStuffQuestion("Πόσα έξοδα είχα τον Σεπτέμβριο;")[0],
  "finance"
);
eq("the English equivalent too", classify.classifyMyStuffQuestion("How much did I spend last month?")[0], "finance");
eq("a question about a site finds \"site\"", classify.classifyMyStuffQuestion("Ποιο site έφτιαξα για το camping;")[0], "site");
// THE OWNER'S OWN THIRD EXAMPLE IS ABOUT THE CONVERSATION, NOT THE
// TRACKER — «Τι είπαμε για τις μετοχές;» asks what was SAID, and "είπαμε"
// ("we said") is a chat verb; "μετοχές" (stocks) is not in
// lib/ai/module-synonyms.ts's trading vocabulary at all (that list has
// "trade"/"συναλλαγή", nothing for a stock by name), so "chat" is the
// honest answer here — this question recalls a discussion, which is
// exactly what lib/my-stuff/ask-store.ts's chat_messages read is for.
eq("the owner's \"what did we say about the stocks\" question finds \"chat\" (it asks what was SAID)", classify.classifyMyStuffQuestion("Τι είπαμε για τις μετοχές;")[0], "chat");
eq("a question about a lead finds \"sales\"", classify.classifyMyStuffQuestion("Which lead should I chase?")[0], "sales");
eq("a question about a bug finds \"coding\"", classify.classifyMyStuffQuestion("fix the bug in my function")[0], "coding");

{
  const everything = classify.classifyMyStuffQuestion("");
  ok(
    "a question that matches nothing still returns every kind — fails open, never closed",
    everything.length === sources.MY_STUFF_KINDS.length,
    `got ${everything.length} of ${sources.MY_STUFF_KINDS.length}`
  );
}
{
  const read = classify.kindsToRead("asdkjhaskdjh");
  ok(`kindsToRead bounds even the fail-open case (<= ${classify.MAX_KINDS_READ})`, read.length <= classify.MAX_KINDS_READ && read.length > 0);
}
{
  const read = classify.kindsToRead("Πόσα έξοδα είχα τον Σεπτέμβριο;");
  eq("a clear question is bounded too, but still finds its kind first", read[0], "finance");
}

// =====================================================================
console.log("\n== 3. ask-context: the prompt is bounded, framed as data, and citations are checked ==");
// =====================================================================

{
  const candidates = [
    { index: 1, kind: "finance", id: "a", title: "Διαφημίσεις", href: "/dashboard/finance?record=a", createdAt: "2026-09-03", text: "[1] (finance, 2026-09-03) Διαφημίσεις: expense 200" },
    { index: 2, kind: "site", id: "b", title: "Camping site", href: "/dashboard/website-builder?project=b", createdAt: "2026-08-01", text: "[2] (site, 2026-08-01) Camping site" },
  ];
  const rendered = ctx.renderMyStuffContext(candidates);
  ok("every candidate's line is in the rendered context", rendered.includes("[1]") && rendered.includes("[2]"));
  ok("it is declared as data, never an instruction", /never an instruction|DATA/i.test(rendered));
  eq("no candidates renders nothing at all", ctx.renderMyStuffContext([]), "");

  eq("a cited number resolves to the real candidate", ctx.citedIndices("I found it in [1].", candidates.length), [1]);
  eq("duplicates collapse to one, in first-cited order", ctx.citedIndices("[2] and again [2], also [1]", candidates.length), [2, 1]);
  eq(
    "a number outside what was actually listed is never a citation",
    ctx.citedIndices("[99] is not real", candidates.length),
    []
  );
  const cites = ctx.citationsFor("The expense is at [1].", candidates);
  eq("citationsFor resolves to the real record's kind, id and address", cites, [{ kind: "finance", id: "a", title: "Διαφημίσεις", href: "/dashboard/finance?record=a" }]);
}
{
  // THE BOUND IS REAL, NOT A SUGGESTION: a huge pool of candidates must
  // not blow up the prompt, the same property
  // lib/ai/workspace-context.ts's own ceiling test holds.
  const huge = Array.from({ length: 200 }, (_, i) => ({
    index: i + 1,
    kind: "finance",
    id: `id${i}`,
    title: `t${i}`,
    href: "/dashboard/finance",
    createdAt: "2026-01-01",
    text: `[${i + 1}] ` + "x".repeat(200),
  }));
  const rendered = ctx.renderMyStuffContext(huge);
  ok(
    `a large pool cannot blow up the prompt (${rendered.length} <= ${ctx.MY_STUFF_MAX_CONTEXT_CHARS + 500})`,
    rendered.length <= ctx.MY_STUFF_MAX_CONTEXT_CHARS + 500
  );
}
{
  const empty = ctx.buildMyStuffPrompt("   ", "");
  eq("a blank question is refused, by name", empty, { ok: false, reason: "empty" });
  const long = ctx.buildMyStuffPrompt("x".repeat(ctx.MY_STUFF_MAX_QUESTION_CHARS + 1), "");
  eq("an over-long question is refused, by name", long.reason, "too_long");
  const fine = ctx.buildMyStuffPrompt("How much did I spend?", "[1] something");
  ok("an ordinary question builds a prompt", fine.ok === true);
  ok("the context is framed as data in the user turn, not the system prompt", fine.ok && fine.user.includes("[1] something") && !fine.system.includes("[1] something"));
  ok("the system prompt asks for a citation in brackets", fine.ok && /\[3\]|brackets/.test(fine.system));
  const noContext = ctx.buildMyStuffPrompt("Anything at all?", "");
  ok("with nothing found, the model is told so rather than left to guess", noContext.ok && /No records/i.test(noContext.user));
}

// =====================================================================
console.log("\n== 4. the IO layer reads through the caller's own client, never the admin one ==");
// =====================================================================

{
  for (const [file, fns] of [
    ["src/lib/my-stuff/ask-store.ts", ["loadKindCandidates", "loadChatCandidates", "loadMyStuffCandidates"]],
    ["src/lib/my-stuff/load.ts", ["loadMyStuff"]],
  ]) {
    const src = stripComments(readFileSync(file, "utf8"));
    ok(`${file}: never imports the admin client`, !/createAdminClient/.test(src));
    const selects = (src.match(/\.from\(/g) || []).length;
    const scoped = (src.match(/\.eq\("user_id", userId\)/g) || []).length;
    ok(
      `${file}: every table read is scoped to the caller explicitly (${scoped}/${selects} .from() calls)`,
      selects > 0 && scoped === selects,
      `${selects} read(s), ${scoped} scoped`
    );
    for (const fn of fns) ok(`${file}: defines ${fn}`, new RegExp(`function ${fn}\\b`).test(src));
  }
}

// =====================================================================
console.log("\n== 5. the route: reserve, settle, release — and READS, never writes, the other tables ==");
// =====================================================================

{
  const route = stripComments(readFileSync("src/app/api/my-stuff/ask/route.ts", "utf8"));
  ok("estimates from the real prompt size", /estimateForAction\(\s*"myStuffAsk"/.test(route));
  ok("reserves before calling the model", /reserveCredits\(/.test(route));
  ok("records measured usage", /costs\.record\(/.test(route));
  ok("settles as my_stuff_ask", /feature: "my_stuff_ask"/.test(route));
  // BOTH PATHS, counted — not just "the word appears somewhere": the
  // Stop path and the provider-failure path are two separate branches,
  // and a mutant that drops ONE release must not hide behind the other
  // still being there.
  eq("releases the hold on both the Stop path and the provider-failure path", (route.match(/releaseReservation\(/g) || []).length, 2);
  ok("checks the circuit breaker before spending anything", /checkAiCallAllowed\(/.test(route));
  ok("names its model explicitly", /model: MODEL/.test(route));
  // READ-ONLY OVER EVERYTHING BUT ITS OWN SESSIONS.
  const writes = [...route.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.(insert|update|upsert|delete)\(/g)].map((m) => m[1]);
  eq("the only table this route writes to is its own session history", [...new Set(writes)], ["my_stuff_sessions"]);
  ok("...and it never deletes anything", !/\.from\("my_stuff_sessions"\)\s*\n?\s*\.delete\(/.test(route));
}
{
  // The sessions route deletes only the TOOL'S OWN rows, scoped to the caller.
  const del = stripComments(readFileSync("src/app/api/my-stuff/sessions/[id]/route.ts", "utf8"));
  ok("deletes from my_stuff_sessions only", /\.from\("my_stuff_sessions"\)/.test(del) && !/\.from\("(?!my_stuff_sessions)[a-z_]+"\)/.test(del));
  ok("scoped to the caller", /\.eq\("user_id", user\.id\)/.test(del));
}
{
  const browse = stripComments(readFileSync("src/app/api/my-stuff/browse/route.ts", "utf8"));
  ok("the browse route makes no AI call and reserves nothing", !/runCompletion|reserveCredits/.test(browse));
}

// =====================================================================
console.log("\n== 6. billing: the new action is declared where the margin is resolved ==");
// =====================================================================

{
  const estimate = await loadTs("src/lib/billing/estimate.ts");
  ok("myStuffAsk has an estimate profile", Boolean(estimate.ACTION_PROFILES.myStuffAsk));
  const margin = await loadTs("src/lib/billing/margin-policy.ts");
  eq("myStuffAsk settles under its own feature", margin.ACTION_TO_FEATURE.myStuffAsk, "my_stuff_ask");
}

// =====================================================================
console.log("\n== 7. the migration: a real undo, and nothing but the tool's own table ==");
// =====================================================================

{
  const migrations = readFileSync("supabase/migrations/20261024100000_my_stuff_sessions.sql", "utf8");
  ok("creates my_stuff_sessions", /create table if not exists public\.my_stuff_sessions/.test(migrations));
  ok("says how to undo it", /How to undo:/.test(migrations));
  ok("touches no other table", !/create table[^;]*public\.(finance_entries|leads|trades|chat_messages|chat_conversations|code_sessions)/i.test(migrations));
  ok("writes are server-only: insert/update revoked from anon and authenticated", /revoke insert, update on public\.my_stuff_sessions from anon, authenticated/.test(migrations));
}

// =====================================================================
console.log("\n== 8. navigation and i18n: every locale, open to everybody (2026-10-23) ==");
// =====================================================================

{
  const allTools = await loadTs("src/lib/nav/all-tools.ts");
  // OPEN TO EVERYBODY (the owner, 2026-10-23: "άνοιξέ τα για όλους και
  // βγάλε τον διακόπτη"): a ready tile of the final grid, in the first
  // group, with no switch anywhere on the road to the page.
  const entry = allTools.ALL_TOOLS.find((t) => t.href === "/dashboard/my-stuff");
  ok("/dashboard/my-stuff is a ready tile of the final grid, first, under Record",
    Boolean(entry) && entry.name === "myStuff" && entry.ready === true && entry.group === "record" && allTools.ALL_TOOLS[0] === entry);
  ok("...needing nothing that is not in the code (no key)", entry && !entry.needs);
  ok("...and not hidden from the grid", !("/dashboard/my-stuff" in allTools.HIDDEN_FROM_ALL_TOOLS));
  // THE FINANCE/SALES/TRADING FENCE: this tool only READS those tables.
  for (const href of ["/dashboard/finance", "/dashboard/sales", "/dashboard/trading"]) {
    ok(`${href} is still hidden, exactly as the other PR left it`, href in allTools.HIDDEN_FROM_ALL_TOOLS);
  }
}
{
  const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
  ok("no sidebar row, the same reason Games has none", !/href: "\/dashboard\/my-stuff"/.test(navSrc));
  const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
  ok("the switch is gone from flags.ts", !/"my-stuff":/.test(flagsSrc));
  for (const f of ["src/app/dashboard/my-stuff/page.tsx", "src/app/api/my-stuff/ask/route.ts", "src/app/api/my-stuff/browse/route.ts"]) {
    ok(`${f} reads no switch`, !/isFeatureOn|not_enabled/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  }
  const pageSrc = readFileSync("src/app/dashboard/my-stuff/page.tsx", "utf8");
  ok("...but the page still sends a signed-out visitor to sign in", /if \(!user\) redirect\("\/login"\)/.test(pageSrc));
  for (const f of ["src/app/api/my-stuff/ask/route.ts", "src/app/api/my-stuff/browse/route.ts"]) {
    ok(`${f} still refuses a signed-out caller`, /if \(!user\) return NextResponse\.json\(\{ error: "not_signed_in" \}, \{ status: 401 \}\)/.test(readFileSync(f, "utf8")));
  }
}
for (const l of LOCALES) {
  for (const path of [
    "dashboard.myStuff.name", "dashboard.myStuff.placeholder", "dashboard.myStuff.empty.heading",
    "dashboard.myStuff.empty.examples.finance", "dashboard.myStuff.empty.examples.site", "dashboard.myStuff.empty.examples.trading",
    "dashboard.myStuff.browse.open", "dashboard.myStuff.browse.title",
    "dashboard.tools.names.myStuff", "dashboard.tools.lines.myStuff",
    "sidebar.items.myStuff", "sidebar.hints.myStuff",
  ]) {
    const v = lookup(messages[l], path);
    ok(`${l}: ${path} resolves`, typeof v === "string" && v.trim().length > 0, `got ${JSON.stringify(v)}`);
  }
  for (const kind of sources.MY_STUFF_KINDS) {
    ok(`${l}: dashboard.myStuff.kinds.${kind} resolves`, typeof lookup(messages[l], `dashboard.myStuff.kinds.${kind}`) === "string");
  }
  for (const code of ["empty", "tooLong", "insufficient", "rateLimited", "unavailable", "stopped", "failed", "offline"]) {
    ok(`${l}: dashboard.myStuff.errors.${code} resolves`, typeof lookup(messages[l], `dashboard.myStuff.errors.${code}`) === "string");
  }
  const line = lookup(messages[l], "dashboard.tools.lines.myStuff");
  ok(`${l}: the square's one line fits (<= 60 chars)`, typeof line === "string" && line.length <= 60, `${line?.length} chars`);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
if (failures.length) console.log(failures.map((f) => "  - " + f).join("\n"));
process.exit(failures.length === 0 ? 0 : 1);
