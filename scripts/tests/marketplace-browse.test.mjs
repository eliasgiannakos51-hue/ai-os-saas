// THE MARKETPLACE SHOWS THE LIBRARY THAT WAS ALREADY THERE.
//
// WHAT THIS PAGE WAS. An honest empty state with a DISABLED "Publish a
// Template" button and a "Coming Soon" badge, written when there was no
// table behind it. There has been one since the 20260826 migration —
// agent_templates, with curated built-ins and whatever users have shared —
// plus routes to share and to adopt, and a matcher the create screen calls
// as you type. Everything existed except somewhere to LOOK, so a template
// nobody happened to describe in the right words was invisible however good
// it was.
//
// WHAT IS CHECKED HERE, and why each one is not obvious:
//
//   1. The page reads the real table under the USER'S OWN session, so RLS
//      decides access rather than a filter somebody has to remember. It
//      also has to distinguish a failed read from an empty library: both
//      come back as an empty array.
//   2. Adopting goes through the existing route rather than inserting an
//      agent from the page — that route rate-limits, fills the {subject}
//      slot and counts the use.
//   3. Nothing claims a shop. The old copy promised buying and selling; the
//      page does not do that and must not say it does.
//   4. The strings are in all ten locales, and the search is accent-blind,
//      because a Greek user typing without accents is the case this app
//      already solved once.
//
// Run: node scripts/tests/marketplace-browse.test.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";

const PAGE = "src/app/dashboard/marketplace/page.tsx";
const BROWSER = "src/components/marketplace/template-browser.tsx";
const ADOPT_ROUTE = "src/app/api/agents/templates/adopt/route.ts";
const MIGRATION_DIR = "supabase/migrations";

let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const stripTs = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l))
    .join("\n");

console.log("marketplace-browse");

ok(`the page exists (${PAGE})`, existsSync(PAGE));
ok(`the browser exists (${BROWSER})`, existsSync(BROWSER));
const page = stripTs(readFileSync(PAGE, "utf8"));
const browser = stripTs(readFileSync(BROWSER, "utf8"));

// ---------------------------------------------------------------------
console.log("\n== 1. it reads the real table, under the user's own session ==");
// ---------------------------------------------------------------------
{
  ok(
    "the page queries agent_templates",
    /\.from\(\s*"agent_templates"\s*\)/.test(page),
  );
  ok(
    "...through the caller's client, not the admin one",
    /createClient\(\)/.test(page) && !/createAdminClient/.test(page),
    "an admin read would make the RLS policy decorative and one forgotten filter fatal",
  );
  // THE USER, HOWEVER IT IS OBTAINED, AND THE REDIRECT. This pinned the
  // literal `auth.getUser()`, which stopped being how any dashboard page
  // asks: they call lib/auth/current-user.ts's cached helper so the
  // layout and the page share one round trip instead of making two. The
  // claim worth pinning is unchanged — this page identifies the caller
  // and sends an anonymous one to /login — so it is pinned against both
  // spellings rather than the one that happened to be current.
  ok(
    "...and it signs the user in first",
    (/auth\.getUser\(\)/.test(page) || /await getCurrentUser(Result)?\(\)/.test(page)) &&
      /redirect\("\/login"\)/.test(page),
  );
  // MOST USED FIRST, with a tiebreak — otherwise two never-used templates
  // swap places between page loads and the list looks like it is shuffling.
  ok(
    "the list is ordered by use, with a stable tiebreak",
    /order\(\s*"use_count"/.test(page) && /order\(\s*"created_at"/.test(page),
  );
  // A DENIED READ AND AN EMPTY LIBRARY BOTH COME BACK AS []. Without a
  // separate error branch, somebody whose request was refused is told there
  // is nothing here.
  // NOT JUST THE WORD `error`. It is destructured whether or not anything
  // renders it, so the claim is the whole chain: the read reports one, a
  // branch tests it, and something says so.
  ok(
    "a failed read is not shown as an empty library",
    /const \{ data, error \} =/.test(page) &&
      /\{error \?/.test(page) &&
      /loadError/.test(page),
    "supabase returns [] for a denied policy as readily as for no rows",
  );
  // And the table really has the columns the page selects.
  const migrations = readdirSync(MIGRATION_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`${MIGRATION_DIR}/${f}`, "utf8"))
    .join("\n");
  const selected = (page.match(/\.select\(\s*"([^"]+)"/) ?? [])[1] ?? "";
  const columns = selected
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  ok(
    `the page names columns to check (${columns.length})`,
    columns.length >= 8,
    selected,
  );
  const missing = columns.filter(
    (c) => !new RegExp(`\\b${c}\\b`).test(migrations),
  );
  ok(
    `every column it selects is created by a migration (${missing.length} are not)`,
    missing.length === 0,
    missing.join(", "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. adopting goes through the route that already does it ==");
// ---------------------------------------------------------------------
{
  ok(
    "the browser posts to the adopt route",
    /fetch\("\/api\/agents\/templates\/adopt"/.test(browser),
  );
  ok(
    "...and never inserts an agent itself",
    !/\.from\(\s*"user_agents"\s*\)/.test(browser),
  );
  const adopt = stripTs(readFileSync(ADOPT_ROUTE, "utf8"));
  // The three things the route does that a page-side insert would skip.
  ok("the route rate-limits adoption", /checkRateLimit\(/.test(adopt));
  // THE FILL, not the word. `subject` appears a dozen times in that route —
  // in the body parse, in the response, in a log — so its presence says
  // nothing. What is claimed is that the template's PATTERN is filled with
  // it, which is the step a page-side insert would skip.
  ok(
    "...fills the {subject} slot",
    /fillTemplate\(pattern, subject\)/.test(adopt),
  );
  // ONE MECHANISM, not an alternation with a dead half: `use_count` is never
  // written in this route, so an `||` on it could only ever be satisfied by
  // the first branch and would hide the day the first branch left.
  ok("...and counts the use", /rpc\("record_template_use"/.test(adopt));
  // A subject is required BEFORE the request goes out, so an empty one is
  // not a round trip that comes back with an error.
  ok(
    "the browser refuses an empty subject before asking",
    /subjectRequired/.test(browser),
  );
  // And it takes the user where the agent actually appeared.
  ok(
    "...and it goes to where the new agent is",
    /router\.push\("\/dashboard\/agents"\)/.test(browser),
    "a success toast on a page that still shows the template is the app reporting something the user cannot see",
  );
}

// ---------------------------------------------------------------------
console.log("\n== 3. nothing here claims to be a shop ==");
// ---------------------------------------------------------------------
{
  const locales = readdirSync("messages")
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
  ok(
    `the locales were found (${locales.length})`,
    locales.length >= 10,
    locales.join(", "),
  );

  const REQUIRED = [
    "searchPlaceholder",
    "counted",
    "noMatches",
    "badgeCurated",
    "badgeCommunity",
    "badgeMine",
    "usedTimes",
    "useThis",
    "subjectLabel",
    "subjectHelp",
    "subjectPlaceholder",
    "createFromTemplate",
    "adopting",
    "adopted",
    "adoptError",
    "subjectRequired",
    "loadError",
  ];
  const incomplete = [];
  const stillPromising = [];
  for (const locale of locales) {
    const m =
      JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"))?.dashboard
        ?.marketplace ?? {};
    const absent = REQUIRED.filter(
      (k) => typeof m[k] !== "string" || m[k].trim() === "",
    );
    if (absent.length > 0) incomplete.push(`${locale}: ${absent.join(", ")}`);
    // THE OLD COPY PROMISED A SHOP. "coming soon" and a publish button
    // described a feature that did not exist; the page is real now and must
    // not describe a different unbuilt one instead.
    if (m.comingSoon !== undefined || m.publishButton !== undefined) {
      stillPromising.push(
        `${locale}: the disabled-button strings are still here`,
      );
    }
    if (
      typeof m.description === "string" &&
      /coming soon|σύντομα|bientôt|demnächst|próximamente|em breve|prossimamente|قريبا|近日|即将/i.test(
        m.description,
      )
    ) {
      stillPromising.push(
        `${locale}: the description still says the page is not ready`,
      );
    }
  }
  ok(
    `every locale has the browse strings (${incomplete.length} do not)`,
    incomplete.length === 0,
    incomplete.join("\n        "),
  );
  ok(
    `no locale still promises an unbuilt feature (${stillPromising.length})`,
    stillPromising.length === 0,
    stillPromising.join("\n        "),
  );

  // A COUNT WITHOUT A PLURAL IS WRONG AT n=1 IN EVERY LANGUAGE. This key
  // read "used 1 times" in all ten locales when it was written, and Arabic
  // wants six forms where English wants two. Rendered through the app's OWN
  // formatter rather than pattern-matched, because a malformed ICU string
  // does not fail a regex — it throws where the page renders.
  {
    const { createTranslator } = await import("next-intl");
    const broken = [];
    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(`messages/${locale}.json`, "utf8"),
      );
      const errors = [];
      const t = createTranslator({
        locale,
        messages,
        namespace: "dashboard.marketplace",
        onError: (e) => errors.push(String(e)),
      });
      const rendered = [0, 1, 2, 5, 11].map((count) => {
        try {
          return t("usedTimes", { count });
        } catch (e) {
          errors.push(String(e));
          return "";
        }
      });
      if (errors.length > 0) {
        broken.push(`${locale}: ${errors[0].slice(0, 110)}`);
        continue;
      }
      if (rendered.some((r) => typeof r !== "string" || r.trim() === "")) {
        broken.push(`${locale}: renders nothing for some count`);
        continue;
      }
      // THE SINGULAR, WHERE THE LANGUAGE HAS ONE — and Intl decides that,
      // not a list written here. Japanese and Chinese put 1 in the `other`
      // bucket and are right to have no separate form, so demanding a
      // one{} branch of them would be demanding a mistake.
      const src = String(messages.dashboard.marketplace.usedTimes ?? "");
      if (
        new Intl.PluralRules(locale).select(1) === "one" &&
        !/\bone\s*\{/.test(src)
      ) {
        broken.push(
          `${locale}: has a distinct singular and no one{} branch — "${rendered[1]}"`,
        );
      }
    }
    ok(
      `the use count is a real plural in every locale (${broken.length} are not)`,
      broken.length === 0,
      broken.join("\n        "),
    );
  }

  // And the page renders none of the retired strings.
  ok(
    "the page no longer renders a disabled button",
    !/disabled/.test(page) && !/comingSoon/.test(page),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. searching is accent-blind, as it is everywhere else ==");
// ---------------------------------------------------------------------
{
  ok(
    "the browser searches through the shared matcher",
    /matchesSearch\(/.test(browser) &&
      /@\/lib\/text\/search-match/.test(browser),
    "a plain includes() would miss a Greek user typing without accents",
  );
  // The matcher is the app's own, so this is a fact about it rather than a
  // second implementation: proven here on the case it exists for.
  const { matchesSearch } = await import("./load-ts.mjs").then((m) =>
    m.loadTs("src/lib/text/search-match.ts"),
  );
  // ACCENT-BLIND, WHICH IS NOT THE SAME AS STEM-BLIND. It folds τόνοι and
  // final sigma; it does not know that "ανταγωνιστες" and "ανταγωνιστων"
  // are the same word in different cases. The first expectation written
  // here asked for stemming and failed — a fact about what was expected,
  // not about the code, and the limitation is recorded in the component.
  ok(
    "...and that matcher really is accent-blind",
    matchesSearch("παρακολούθηση ανταγωνιστών", "ανταγωνιστων"),
  );
  ok("...including final sigma", matchesSearch("Καφές", "καφεσ"));
  ok("...and case-blind", matchesSearch("Track a competitor", "COMPETITOR"));
  ok(
    "...while an unrelated word still does not match",
    !matchesSearch("παρακολούθηση ανταγωνιστών", "τιμολόγιο"),
  );
  // AND THE ORDER OF THE ARGUMENTS IS PART OF THE CLAIM. matchesSearch takes
  // the haystack first; called the other way round it asks whether the query
  // contains the template and quietly matches nothing. The component had it
  // backwards until this check ran.
  ok(
    "the browser passes the haystack first",
    /matchesSearch\(searchHaystack\(tpl\), query\)/.test(browser),
    "matchesSearch(query, text) returns false for every template",
  );
  // IN THE HAYSTACK, not in the file. `keywords` is declared on the
  // BrowsableTemplate type as well, so its presence proves nothing; what is
  // read here is the body of the one function that builds what search sees.
  const haystackFn = (browser.match(/function searchHaystack[\s\S]*?\n\}/) ?? [
    "",
  ])[0];
  ok(
    `the search includes the keywords column (${haystackFn.length} chars of builder)`,
    haystackFn.length > 0 && /keywords/.test(haystackFn),
    haystackFn || "no searchHaystack() found at all",
  );
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
