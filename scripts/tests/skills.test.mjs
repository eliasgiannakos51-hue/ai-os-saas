// SKILLS, ΚΟΜΜΑΤΙ 1 — the owner's directive 29 («SKILLS: ΤΟ ΜΑΘΑΙΝΕΙΣ ΜΙΑ
// ΦΟΡΑ», 2026-10-31). His Κομμάτι 1, in his own words:
//
//   «Η σελίδα Skills στις Ρυθμίσεις: λίστα, και πατάς για να ανοίξει.
//    Ένα skill έχει: όνομα, πότε χρησιμοποιείται, βήματα, αρχεία
//    (πρότυπα, παραδείγματα).»
//
// and his stop-gate sits immediately after it, so NOTHING beyond that
// screen may be wired: «ΜΟΝΟ ΕΔΩ: στιγμιότυπο και σταματάς μέχρι να
// γράψω «εγκρίνω»».
//
// THE TWO WAYS THIS PIECE CAN LIE, and neither is visible in a
// screenshot, which is why they are checked here rather than assumed:
//
// 1. A SCREEN THAT QUIETLY WRITES. Κομμάτι 2 is «Skill από περιγραφή ή
//    από μια συνομιλία» — the first write path is HIS next piece, not
//    this one's. A «New skill» button added here would look like
//    progress and would be the stop-gate broken. §2 and §5 hold the
//    whole round to read-only from both ends: the migration grants
//    `select` and revokes the other three, and no component, lib or
//    route in this feature carries a write.
//
// 2. A LIST THAT DROPS WHAT IT WAS GIVEN. `steps` and `files` are jsonb,
//    so what comes back is `unknown` and the mapping decides what the
//    screen sees. A mapping that passes junk through renders a blank
//    step; one that is too eager throws the whole row away. §6 does not
//    read that mapping for plausibility — it RUNS `loadSkills` against
//    hostile rows (a number inside `steps`, a `files` entry with no url,
//    nulls everywhere, a numeric id) and asserts what survives.
//
// Every claim about code is read with comments stripped: this file's own
// subject matter is a round that deliberately did LESS than it could, and
// a comment saying «no edit here» is exactly what must not be allowed to
// satisfy a check (CLAUDE.md, «a gate that reads a COMMENT instead of the
// code under it»). The screen itself is pressed, on a computer and on a
// phone, in scripts/tests/skills.prodtest.mjs.
//
// Run: node scripts/tests/skills.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");

const PAGE = "src/app/dashboard/skills/page.tsx";
const WORKSPACE = "src/components/skills/skills-workspace.tsx";
const LIST = "src/components/skills/skills-list.tsx";
const DETAILS = "src/components/skills/skills-details.tsx";
const LOAD = "src/lib/skills/load.ts";
const TYPES = "src/lib/skills/types.ts";
const MIGRATION = "supabase/migrations/20261107000000_user_skills.sql";

const read = (f) => stripComments(readFileSync(f, "utf8"));
const page = read(PAGE);
const workspace = read(WORKSPACE);
const list = read(LIST);
const details = read(DETAILS);
const load = read(LOAD);
const migration = readFileSync(MIGRATION, "utf8");
const flags = read("src/lib/flags/flags.ts");
const sidebar = read("src/lib/sidebar-nav.ts");
const navPath = read("src/lib/nav/nav-path.ts");
const settings = read("src/app/dashboard/settings/page.tsx");
const catalog = read("src/lib/billing/feature-catalog.ts");
const helpTips = read("src/lib/help-tips.ts");
const gdpr = read("src/lib/gdpr/user-data-registry.ts");
const canaries = read("src/lib/health/schema-canaries.ts");
const allTools = read("src/lib/nav/all-tools.ts");
const labelKeys = read("src/lib/sidebar-label-keys.ts");

const LOCALES = ["el", "en", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

// IS THIS A SENTENCE, OR A STUB? — the measured ratio of
// scripts/tests/sheets.test.mjs, for the same reason: a character count
// is a Latin-alphabet assumption, and one Chinese character carries what
// four or five English ones do. English is held to an absolute floor and
// every other language to a share of it.
const ENGLISH_FLOOR = 40;
const SHARE_OF_ENGLISH = 0.3;
function isSentence(locale, value, englishLength) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (locale === "en") return value.trim().length >= ENGLISH_FLOOR;
  return value.trim().length >= Math.floor(englishLength * SHARE_OF_ENGLISH);
}

// ---------------------------------------------------------------------
console.log("== 1. one door, one switch, and no dead link to it ==");
check("the page exists", existsSync(PAGE));
check("it is behind the switch, and notFound() for everyone else",
  /isFeatureOn\("skills-tool", user\)/.test(page) && /notFound\(\)/.test(page));
check("...and signed out goes to /login rather than to a 404", /redirect\("\/login"\)/.test(page));
check("the switch is declared, so /dashboard/system-health can open it", /"skills-tool":/.test(flags));
// THE CARD AND ITS GUARD IN ONE EXPRESSION. A card drawn for everyone
// over a page that 404s is the dead link this piece must not create, and
// the two halves being in the same file is not enough to prove they are
// in the same condition — so the guard is located and the card required
// to be inside the 400 characters it opens.
const guarded = /isFeatureOn\("skills-tool", user\)\)+ && \([\s\S]{0,450}?dashboard\/skills/.test(settings);
check("the Settings card renders only when the switch is on for the reader", guarded);
check("...and it is a real link to the page, not a label", /href="\/dashboard\/skills"/.test(settings));
check("the route is tracked, so nav_events does not file it under a module slug",
  /^\s*"skills",$/m.test(navPath));
// THE WAY IN. entry-points.test.mjs accepts a hidden row as a way in
// because the command palette flattens every group; what it cannot check
// is that THIS row is the Skills one, so that is checked here.
check("the sidebar carries a hidden row for it, the shape Affiliate already has",
  /href: "\/dashboard\/skills"[^}]*hidden: true/.test(sidebar));
check("...and the row's label resolves to a translation key, not raw English",
  /Skills: "skills",/.test(labelKeys));
// NOT ON THE GRID, ON PURPOSE. The owner's «ALL TOOLS» message enumerated
// twenty-five squares and Skills is not one of them; where its door goes
// is his question, not a tile added quietly here.
check("it is NOT a tile on the All tools grid, which is his decision to make",
  !/dashboard\/skills/.test(allTools));

// ---------------------------------------------------------------------
console.log("\n== 2. read-only by construction, from the database up ==");
check("the migration exists", existsSync(MIGRATION));
check("row-level security is on", /alter table public\.user_skills enable row level security/i.test(migration));
check("the only policy is the reader's own select",
  /create policy "select_own_user_skills"/.test(migration) && /for select/.test(migration));
const WRITE_POLICY = /for (insert|update|delete)/i;
check("no policy grants a write, because nothing in this piece writes",
  !WRITE_POLICY.test(migration), (migration.match(WRITE_POLICY) ?? []).join(", "));
check("...and the three writes are revoked outright",
  /revoke insert, update, delete on public\.user_skills from anon, authenticated/i.test(migration));
check("it says how to undo it, as every migration must (CLAUDE.md)",
  /-- How to undo: drop table if exists public\.user_skills;/.test(migration));
check("the list's own order has an index behind it",
  /create index[\s\S]{0,120}user_skills[\s\S]{0,80}\(user_id, created_at desc\)/i.test(migration));
// THE OTHER TWO REGISTRIES A NEW TABLE OWES. Neither is about this
// screen; both are about what happens to the rows afterwards.
check("the table is classified for export and erasure (GDPR registry)",
  /table: "user_skills"/.test(gdpr));
check("...and a canary names the migration, so /api/health can say it ran",
  /table: "user_skills",[\s\S]{0,120}20261107000000_user_skills\.sql/.test(canaries));

// ---------------------------------------------------------------------
console.log("\n== 3. the four things a skill HAS, in his own order ==");
// «Ένα skill έχει: όνομα, πότε χρησιμοποιείται, βήματα, αρχεία.» All four
// are in the details pane, each findable by the prodtest.
check("the name is drawn, and whole", /<h2[^>]*>\{skill\.name\}<\/h2>/.test(details));
for (const [thing, testid] of [
  ["πότε χρησιμοποιείται", "skills-when-used"],
  ["βήματα", "skills-steps"],
  ["αρχεία", "skills-files"],
]) {
  check(`«${thing}» has a section of its own`, new RegExp(`data-testid="${testid}"`).test(details));
}
check("the steps are an ORDERED list, because a procedure has an order",
  /<ol[\s\S]{0,400}data-testid="skills-step"/.test(details));
check("the files are real links", /<a[\s\S]{0,200}href=\{file\.url\}/.test(details));
check("...opened in a new tab, with the referrer withheld",
  /target="_blank"[\s\S]{0,60}rel="noreferrer"/.test(details));
// A SECTION THAT VANISHES WHEN EMPTY reads as «files are not part of a
// skill», which is a different claim from «nobody has attached one yet».
// All three say so instead.
for (const key of ["whenUsedEmpty", "stepsEmpty", "filesEmpty"]) {
  check(`an empty «${key.replace("Empty", "")}» says so rather than disappearing`,
    new RegExp(`t\\("details\\.${key}"\\)`).test(details));
}

// ---------------------------------------------------------------------
console.log("\n== 4. a list you press to open ==");
check("every row is a button, so a keyboard reaches it too",
  /<button[\s\S]{0,400}onClick=\{\(\) => onSelect\(skill\)\}/.test(list));
check("the open one says so to a screen reader", /aria-current=\{active \? "true" : undefined\}/.test(list));
check("the target is 44px tall, like every other control on a phone", /min-h-\[44px\]/.test(list));
// THE STANDING RULE: «κανένα όνομα δεν κόβεται». A name is wrapped, never
// truncated — so the class that would truncate it must be absent from the
// element that draws it.
const nameLine = (list.match(/^.*\{skill\.name\}.*$/m) ?? [""])[0];
check("a skill's name wraps instead of being cut",
  /break-words/.test(nameLine) && !/truncate|line-clamp|text-ellipsis/.test(nameLine), nameLine.trim());
check("an empty list says what a skill is for, not just «nothing here»",
  /data-testid="skills-empty"/.test(list) && /t\("empty\.title"\)/.test(list) && /t\("empty\.why"\)/.test(list));
// THE PHONE. 390px has room for one column, so the list gives way to the
// details pane and a back arrow brings it back — the same rule
// my-stuff-workspace.tsx keeps, for the same reason.
check("on a phone the list steps aside once something is open",
  /selected \? "hidden lg:block" : ""/.test(workspace));
check("...and a back arrow brings it back, drawn only there",
  /data-testid="skills-details-back"/.test(workspace) && /lg:hidden/.test(workspace));
check("the title is the page's own, beside a «?» that says what this is",
  /<h1[\s\S]{0,120}t\("name"\)/.test(workspace) && /helpKey="help\.skills"/.test(workspace));
check("...and that tip is declared where the gate for tips reads it",
  /keyPrefix: "help\.skills"/.test(helpTips) && /route: "src\/app\/dashboard\/skills\/page\.tsx"/.test(helpTips));
// THE CATALOG. Every surface is claimed by exactly one entry, and the
// entry's own proof must be the line that is really in the page.
check("one catalog entry claims both the page and the row",
  /pages: \["skills"\],[\s\S]{0,120}sidebar: \["\/dashboard\/skills"\]/.test(catalog));
const enforced = catalog.match(/enforcedSymbol: '(if \(!\(await isFeatureOn\("skills-tool", user\)\)\) notFound\(\);)'/);
check("...and the line it cites as the enforcement is in the page, exactly",
  Boolean(enforced) && page.includes(enforced[1]), enforced ? enforced[1] : "no enforcedSymbol found");

// ---------------------------------------------------------------------
console.log("\n== 5. nothing past the stop-gate ==");
// His Κομμάτι 2 opens the first write path. Until «εγκρίνω», this screen
// shows what is there and offers no way to change it — and the check
// ranges over every file this feature owns rather than over the one
// somebody remembered.
const FEATURE_FILES = { PAGE: page, WORKSPACE: workspace, LIST: list, DETAILS: details, LOAD: load };
const WRITES = /\.(insert|update|upsert|delete)\(|method:\s*"(POST|PUT|PATCH|DELETE)"|fetch\(/;
const writing = Object.entries(FEATURE_FILES).filter(([, src]) => WRITES.test(src));
check("no file of this feature writes anything, or calls out to do it",
  writing.length === 0, writing.map(([f]) => f).join(", "));
const FORMS = /<form|<input|<textarea|contentEditable/;
const typing = Object.entries(FEATURE_FILES).filter(([, src]) => FORMS.test(src));
check("...and there is nothing to type into yet", typing.length === 0, typing.map(([f]) => f).join(", "));
check("no API route exists for skills, because none is wired",
  !existsSync("src/app/api/skills"));
check("the page only reads, through the loader", /loadSkills\(supabase, user\.id\)/.test(page));

// ---------------------------------------------------------------------
console.log("\n== 6. the mapping RUNS, against rows that are wrong on purpose ==");
// jsonb arrives as `unknown`. What the screen sees is whatever this
// mapping decides, so the mapping is executed rather than read.
const mod = await loadTs(LOAD);
// EVERY STAGE ANSWERS EVERY STAGE, on purpose. A fake shaped like exactly
// today's chain (`from → select → eq → order`) turns the removal of
// `.eq(...)` into a TypeError, and a gate that CRASHES reports no failing
// check at all — its own mutation suite found that: the hole read "red
// with no FAIL line". Tolerating either order means the scoping mutant is
// caught by the check that names it, which is the point.
const client = (result) => {
  const stage = { eq: () => stage, order: async () => result, then: undefined };
  return { from: () => ({ select: () => stage }) };
};
const hostile = await mod.loadSkills(
  client({
    data: [
      {
        id: 7,
        name: "Προσφορά",
        when_used: "όταν ζητούν τιμή",
        steps: ["άνοιξε το πρότυπο", 5, null, "στείλ' το"],
        files: [{ name: "προσφορά.docx", url: "https://example.test/f" }, { name: "no url" }, "nope"],
        created_at: "2026-10-30T10:00:00Z",
      },
      { id: "x", name: null, when_used: null, steps: "not an array", files: null, created_at: null },
    ],
    error: null,
  }),
  "u1"
);
check("both rows survive, neither throws", hostile.length === 2);
check("a numeric id becomes the string the screen keys on", hostile[0].id === "7");
check("a step that is not text is dropped, and the real ones keep their order",
  JSON.stringify(hostile[0].steps) === JSON.stringify(["άνοιξε το πρότυπο", "στείλ' το"]));
check("a file with no url is dropped rather than drawn as a dead link",
  hostile[0].files.length === 1 && hostile[0].files[0].url === "https://example.test/f");
check("nulls become empty strings, so nothing renders «null»",
  hostile[1].name === "" && hostile[1].whenUsed === "" && hostile[1].createdAt === "");
check("...and a jsonb column that is not an array at all reads as empty",
  Array.isArray(hostile[1].steps) && hostile[1].steps.length === 0 && hostile[1].files.length === 0);
const failed = await mod.loadSkills(client({ data: null, error: { message: "relation does not exist" } }), "u1");
check("a failed read is an empty list and a logged error, never a thrown page",
  Array.isArray(failed) && failed.length === 0);
// THE QUERY ITSELF, which the fake client above cannot assert: the loader
// must scope to the caller and order newest first, or RLS is the only
// thing standing between two accounts' skills.
check("the read is scoped to the caller", /\.eq\("user_id", userId\)/.test(load));
check("...and ordered newest first, which is the order the list claims",
  /\.order\("created_at", \{ ascending: false \}\)/.test(load));
check("the shape the screen reads is declared once, in its own file",
  existsSync(TYPES) && /export type Skill =/.test(read(TYPES)));

// ---------------------------------------------------------------------
console.log("\n== 7. ten languages, and no English on a Greek screen ==");
const enSkills = messages.en.dashboard.skills;
for (const l of LOCALES) {
  const m = messages[l].dashboard.skills;
  const missing = [];
  if (typeof m?.name !== "string" || !m.name.trim()) missing.push("name");
  for (const k of ["title", "why"]) {
    if (typeof m?.empty?.[k] !== "string" || !m.empty[k].trim()) missing.push(`empty.${k}`);
  }
  for (const k of ["empty", "back", "whenUsedLabel", "whenUsedEmpty", "stepsLabel", "stepsEmpty", "filesLabel", "filesEmpty"]) {
    if (typeof m?.details?.[k] !== "string" || !m.details[k].trim()) missing.push(`details.${k}`);
  }
  check(`${l}: every string of the screen`, missing.length === 0, missing.join(", "));
  // The three things the "?" says, and the third is the one that matters
  // here: Κομμάτι 1 cannot be edited, and a reader who expects to type
  // into it has been misled by the name alone.
  const help = messages[l].help?.skills;
  const helpMissing = ["is", "does", "doesNot"].filter((k) => typeof help?.[k] !== "string" || !help[k].trim());
  check(`${l}: the tip says what it is, does, and does not do`, helpMissing.length === 0, helpMissing.join(", "));
  check(`${l}: and «what it does not do» is a sentence, not a stub`,
    isSentence(l, help?.doesNot, messages.en.help.skills.doesNot.length), help?.doesNot);
  check(`${l}: «what a skill is» is a sentence too`,
    isSentence(l, m.empty.why, enSkills.empty.why.length), m.empty.why);
  check(`${l}: the row's name, its hint and the tab title are all written`,
    typeof messages[l].sidebar.items.skills === "string" && messages[l].sidebar.items.skills.trim() !== "" &&
    typeof messages[l].sidebar.hints.skills === "string" && messages[l].sidebar.hints.skills.trim() !== "" &&
    typeof messages[l].dashboard.tools.names.skills === "string" && messages[l].dashboard.tools.names.skills.trim() !== "");
  check(`${l}: the Settings card's three strings`,
    ["title", "description", "open"].every((k) => typeof messages[l].settings.skills?.[k] === "string" && messages[l].settings.skills[k].trim() !== ""));
  // ICU: '{x}' is the literal text {x} in every language (CLAUDE.md, the
  // second thing that lied to the owner). This screen has no placeholder
  // at all, so none may appear quoted away either.
  const all = [m.name, m.empty.title, m.empty.why, ...Object.values(m.details), help.is, help.does, help.doesNot];
  check(`${l}: no placeholder is quoted away`, !all.some((s) => /'\{/.test(s)));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
