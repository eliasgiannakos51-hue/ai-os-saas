#!/usr/bin/env node
/*
 * CAN marketplace-browse.test.mjs TELL A WORKING LIBRARY FROM A PAGE THAT
 * ONLY LOOKS LIKE ONE?
 *
 * Everything this page needs existed before the page did — the table, the
 * share route, the adopt route, the matcher. That is exactly the shape a
 * gate lies about: a check can pass because some OTHER file in the repo
 * happens to contain the word it looks for. Two of the checks here did
 * precisely that before this suite was written and are stronger now:
 * `subject` appears a dozen times in the adopt route without anything
 * filling a slot, and `keywords` is declared on the template type whether or
 * not the search ever reads it.
 *
 * So every mutation below is applied to a REAL source file — the page, the
 * browser component, the shared matcher, the adopt route, the English
 * strings — and the gate is run against it. A mutation the gate does not
 * notice is a hole in the gate, not an opinion about one.
 *
 * AND RED IS NOT ENOUGH. A gate with twenty-seven checks goes red easily;
 * what has to be true is that it goes red ON THE CLAUSE THAT OWNS THE
 * DEFECT. Each mutant names the check it must break, and a run that turns
 * red somewhere else is recorded as a miss — otherwise one loud clause
 * would vouch for twenty-six dead ones.
 *
 * Run: node scripts/tests/marketplace-browse.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/marketplace-browse.test.mjs";
const PAGE = "src/app/dashboard/marketplace/page.tsx";
const BROWSER = "src/components/marketplace/template-browser.tsx";
const MATCHER = "src/lib/text/search-match.ts";
const ADOPT = "src/app/api/agents/templates/adopt/route.ts";
const EN = "messages/en.json";

const TARGETS = [GATE, PAGE, BROWSER, MATCHER, ADOPT, EN];

// The one line the search is built on, quoted here because three separate
// mutations damage it in three different ways.
const FILTER_LINE =
  "    return templates.filter((tpl) => matchesSearch(searchHaystack(tpl), query));";

const HAYSTACK_BODY =
  '  return [tpl.title, tpl.description, tpl.taskPattern, ...tpl.keywords].join(\n    " ",\n  );';

const SELECT_LINE =
  '      "slug, title, description, task_pattern, schedule_cron, depth, output_format, keywords, use_count, shared_by",';

const MUTANTS = [
  // ---- 1. the read: the right table, the right client, the right order ----
  {
    name: "the page reads a table that is not the library",
    file: PAGE,
    from: '    .from("agent_templates")',
    to: '    .from("agent_templates_public")',
    expect: "queries agent_templates",
  },
  {
    name: "the page reads with the admin client, so RLS stops deciding",
    file: PAGE,
    from: "  const supabase = createClient();",
    to: "  const supabase = createAdminClient();",
    expect: "through the caller's client",
  },
  {
    name: "the sign-in check stops redirecting",
    file: PAGE,
    from: '  if (!user) redirect("/login");',
    to: "  void user;",
    expect: "signs the user in first",
  },
  {
    name: "the tiebreak goes, so two never-used templates swap places per load",
    file: PAGE,
    from: '    .order("created_at", { ascending: false })\n',
    to: "",
    expect: "stable tiebreak",
  },
  {
    // A DENIED READ AND AN EMPTY LIBRARY BOTH COME BACK AS []. Deleting the
    // branch is the whole defect; the destructured name has to go with it,
    // or the file still contains the word `error` and a weaker check would
    // shrug. It did, until this mutant was run.
    name: "the failed read is rendered as an empty library",
    edits: [
      {
        file: PAGE,
        from: "  const { data, error } = await supabase",
        to: "  const { data } = await supabase",
      },
      {
        file: PAGE,
        from:
          "        {error ? (\n" +
          '          <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">\n' +
          '            {t("loadError")}\n' +
          "          </p>\n" +
          "        ) : (\n" +
          "          <TemplateBrowser templates={templates} />\n" +
          "        )}",
        to: "        <TemplateBrowser templates={templates} />",
      },
    ],
    expect: "not shown as an empty library",
  },
  {
    name: "the page selects a column no migration ever created",
    file: PAGE,
    from: SELECT_LINE,
    to: SELECT_LINE.replace(', shared_by"', ', shared_by, author_handle"'),
    expect: "created by a migration",
  },
  {
    // The column check is only worth anything over a real list of columns.
    // Narrowed to three, every one of them real, it would pass while the
    // page had stopped reading most of the row.
    name: "the page selects almost nothing, so there is little to check",
    file: PAGE,
    from: SELECT_LINE,
    to: '      "slug, title, description",',
    expect: "names columns to check",
  },
  {
    name: "a disabled button comes back to the page",
    file: PAGE,
    from: "        {error ? (",
    to: '        <button type="button" disabled>\n          {t("comingSoon")}\n        </button>\n        {error ? (',
    expect: "no longer renders a disabled button",
  },

  // ---- 2. adopting goes through the route that already does it ----------
  {
    name: "the browser posts somewhere other than the adopt route",
    file: BROWSER,
    from: 'const response = await fetch("/api/agents/templates/adopt", {',
    to: 'const response = await fetch("/api/agents/create", {',
    expect: "posts to the adopt route",
  },
  {
    name: "the browser inserts the agent itself, skipping the route",
    file: BROWSER,
    from: '      const response = await fetch("/api/agents/templates/adopt", {',
    to:
      '      await supabase.from("user_agents").insert({ slug });\n' +
      '      const response = await fetch("/api/agents/templates/adopt", {',
    expect: "never inserts an agent itself",
  },
  {
    name: "the route stops rate-limiting adoption",
    file: ADOPT,
    from: "    const limited = await checkRateLimit({",
    to: "    const limited = await unlimited({",
    expect: "rate-limits adoption",
  },
  {
    name: "the route stops filling the slot with the subject",
    file: ADOPT,
    from: "    const prompt = fillTemplate(pattern, subject);",
    to: "    const prompt = pattern;",
    expect: "fills the {subject} slot",
  },
  {
    name: "the route stops counting the use",
    file: ADOPT,
    from: '    const { error: countError } = await admin.rpc("record_template_use", { p_slug: slug });',
    to: "    const countError = null;",
    expect: "counts the use",
  },
  {
    name: "an empty subject becomes a round trip instead of a refusal",
    file: BROWSER,
    from: '      addToast(t("subjectRequired"), "error");\n      return;',
    to: "      // fall through",
    expect: "refuses an empty subject",
  },
  {
    name: "the user is left on the page the new agent is not on",
    file: BROWSER,
    from: '      router.push("/dashboard/agents");',
    to: "      // stay here",
    expect: "goes to where the new agent is",
  },

  // ---- 3. nothing here claims a shop -----------------------------------
  {
    name: "one locale loses a browse string",
    file: EN,
    from: '      "searchPlaceholder": "Search templates",\n',
    to: "",
    expect: "has the browse strings",
  },
  {
    name: "the disabled-button string comes back",
    file: EN,
    from: '      "searchPlaceholder": "Search templates",',
    to: '      "comingSoon": "Coming soon",\n      "searchPlaceholder": "Search templates",',
    expect: "promises an unbuilt feature",
  },
  {
    name: "the description goes back to promising the page later",
    file: EN,
    from: '      "description": "Agent templates people have built and shared. Free — nothing is bought or sold here.",',
    to: '      "description": "A marketplace for agent templates. Coming soon.",',
    expect: "promises an unbuilt feature",
  },

  {
    // "used 1 times". It shipped that way in ten locales before the plural
    // check existed.
    name: "the use count goes back to a bare interpolation",
    file: EN,
    from: '      "usedTimes": "{count, plural, =0 {not used yet} one {used once} other {used # times}}",',
    to: '      "usedTimes": "used {count} times",',
    expect: "real plural",
  },
  {
    // A BRACE SHORT. This is what a regex cannot see and a render can: the
    // string still contains the word `plural` and still looks like ICU.
    name: "the plural is malformed, so it throws where the page renders",
    file: EN,
    from: '      "usedTimes": "{count, plural, =0 {not used yet} one {used once} other {used # times}}",',
    to: '      "usedTimes": "{count, plural, =0 {not used yet} one {used once} other {used # times}",',
    expect: "real plural",
  },

  // ---- 4. the search --------------------------------------------------
  {
    // THE BUG THIS CHECK WAS WRITTEN OVER. matchesSearch takes the haystack
    // first; called the other way round it asks whether the QUERY contains
    // the template, which is false for every row, and the list empties as
    // soon as anybody types. The component shipped this way until the gate
    // ran.
    name: "the arguments go back to front, so search matches nothing",
    file: BROWSER,
    from: FILTER_LINE,
    to: "    return templates.filter((tpl) => matchesSearch(query, searchHaystack(tpl)));",
    expect: "passes the haystack first",
  },
  {
    name: "the search goes back to toLowerCase().includes()",
    file: BROWSER,
    from: FILTER_LINE,
    to:
      "    return templates.filter((tpl) =>\n" +
      "      searchHaystack(tpl).toLowerCase().includes(query.toLowerCase()),\n" +
      "    );",
    expect: "through the shared matcher",
  },
  {
    // `keywords` stays on the type either way — this is what made the old
    // check pass over a search that could not see the only column a
    // translated spelling lives in.
    name: "the keywords column drops out of the haystack",
    file: BROWSER,
    from: HAYSTACK_BODY,
    to: '  return [tpl.title, tpl.description, tpl.taskPattern].join(" ");',
    expect: "includes the keywords column",
  },
  {
    name: "the shared matcher stops folding accents",
    file: MATCHER,
    from: '  return foldForMatch(String(text ?? ""));',
    to: '  return String(text ?? "").toLowerCase();',
    expect: "really is accent-blind",
  },
  {
    name: "the shared matcher stops folding case",
    file: MATCHER,
    from: '  return foldForMatch(String(text ?? ""));',
    to: '  return String(text ?? "").normalize("NFD").replace(/\\p{Diacritic}/gu, "");',
    expect: "case-blind",
  },
  {
    name: "the matcher matches everything, so search is not a filter",
    file: MATCHER,
    from: "  return normalizeForSearch(haystack).includes(q);",
    to: "  return true;",
    expect: "unrelated word still does not match",
  },

  // ---- 5. the gate's own clauses, where a second one covers ------------
  {
    // A pair, because one edit proves nothing. Defanging the shared-matcher
    // check is not wrong on a healthy tree — it is wrong the day somebody
    // writes the search back as toLowerCase().includes(), which is the
    // second edit. The argument-order check has to see it anyway: there is
    // then no matchesSearch call left to be in the right order.
    name: "the gate stops requiring the shared matcher AND the search goes back to includes()",
    edits: [
      {
        file: GATE,
        from:
          "    /matchesSearch\\(/.test(browser) &&\n" +
          "      /@\\/lib\\/text\\/search-match/.test(browser),",
        to: "    true,",
      },
      {
        file: BROWSER,
        from: FILTER_LINE,
        to:
          "    return templates.filter((tpl) =>\n" +
          "      searchHaystack(tpl).toLowerCase().includes(query.toLowerCase()),\n" +
          "    );",
      },
    ],
    expect: "passes the haystack first",
  },
  {
    // The other way round: stop checking that the browser calls the adopt
    // route, and have it write the agent row itself. The insert clause is
    // what still has to notice — a page that inserts its own row skips the
    // rate limit, the slot fill and the counter all at once.
    name: "the gate stops requiring the adopt route AND the browser writes the row itself",
    edits: [
      {
        file: GATE,
        from: '    /fetch\\("\\/api\\/agents\\/templates\\/adopt"/.test(browser),',
        to: "    true,",
      },
      {
        file: BROWSER,
        from: '      const response = await fetch("/api/agents/templates/adopt", {',
        to:
          '      const response = await supabase.from("user_agents").insert({\n' +
          "        slug,\n" +
          "      });\n" +
          "      void ({",
      },
    ],
    expect: "never inserts an agent itself",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]),
    };
  }
}

console.log("marketplace-browse mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    // A `from` that is no longer in the file re-introduces nothing, so it is
    // a miss and not a note — the defect it stood for is unguarded either
    // way, and only the report would say otherwise.
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({
        ...m,
        why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}`,
      });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (
      [...byFile.entries()].every(
        ([file, text]) => text === originals.get(file),
      )
    ) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({
        ...m,
        why: "the gate stayed green — nothing here is load-bearing",
      });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    // RED FOR THE RIGHT REASON. Red anywhere would let one clause vouch for
    // all the others.
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`,
      );
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
