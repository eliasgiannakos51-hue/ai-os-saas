// The learned profile: how it grows, how it fades, and who controls it.
//
// Two properties are load-bearing and both are easy to lose without
// noticing:
//
//   MATURITY IS ACTIONS, NEVER DAYS. A time-based model would let an
//   account that signed up eleven months ago and did nine things be
//   treated as well known, and the assistant would then act familiar with
//   a stranger — which is more off-putting than not knowing them.
//
//   THE PERSON IS IN CHARGE OF IT. They can read every conclusion, rewrite
//   any of it, delete any of it, and clear the lot. A correction the
//   observer silently reverts on its next run is worse than no correction,
//   because they believe it took.
//
// Run: node scripts/tests/profile-maturity.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}
const read = (p) => readFileSync(p, "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const m = await loadTs("src/lib/profile/maturity.ts");
const observers = await loadTs("src/lib/profile/observers.ts");

console.log("== 1. levels are the brief's, and they count actions ==");
{
  check("0 actions is level 0", m.levelForActions(0), 0);
  check("19 actions is still level 0", m.levelForActions(19), 0);
  check("20 actions is level 1", m.levelForActions(20), 1);
  check("99 is level 1", m.levelForActions(99), 1);
  check("100 is level 2", m.levelForActions(100), 2);
  check("499 is level 2", m.levelForActions(499), 2);
  check("500 is level 3", m.levelForActions(500), 3);
  check("50,000 is still level 3", m.levelForActions(50000), 3);

  // The shape the brief asks for, stated as arithmetic rather than as an
  // intention: a heavy user reaches level 2 within a month, a light one
  // takes half a year or more.
  const heavyPerDay = 6;
  const lightPerWeek = 4;
  checkTrue(
    `a heavy user (${heavyPerDay}/day) is level 2 within a month`,
    m.levelForActions(heavyPerDay * 30) >= 2,
    String(heavyPerDay * 30)
  );
  checkTrue(
    `a light user (${lightPerWeek}/week) is not level 2 after a month`,
    m.levelForActions(lightPerWeek * 4) < 2
  );
  checkTrue(
    "...and reaches it somewhere past six months",
    m.levelForActions(lightPerWeek * 26) >= 2,
    String(lightPerWeek * 26)
  );
}

console.log("\n== 2. what counts as an action ==");
{
  check(
    "the three signals add up",
    m.totalMeaningfulActions({ chatMessages: 10, aiActions: 5, createdRecords: 3 }),
    18
  );
  // Nothing here counts attention — no page views, no logins, no scrolls.
  // A definition that counted those would level up somebody who left a tab
  // open.
  // Comments stripped: the module's own header lists the things that are
  // deliberately NOT counted, and a scanner that fails on its subject's
  // rationale teaches people to delete the rationale.
  const counts = stripComments(read("src/lib/profile/maturity.ts"));
  for (const forbidden of ["pageView", "sessions", "logins", "visits", "scroll"]) {
    checkTrue(`"${forbidden}" is not an input`, !new RegExp(`\\b${forbidden}\\b`, "i").test(counts));
  }
  // A negative count (a corrupted read) must not shrink the total.
  check(
    "a nonsensical negative count cannot reduce maturity",
    m.totalMeaningfulActions({ chatMessages: -100, aiActions: 5, createdRecords: 0 }),
    5
  );
}

console.log("\n== 3. the progress bar always moves and never goes backwards ==");
{
  check("nothing done reads 0%", m.knowledgePercent(0), 0);
  check("the top of the scale reads 100%", m.knowledgePercent(500), 100);
  // The failure mode being avoided: a bar computed against level 3 would
  // move from 4% to 5% over a month of work and read as "you are getting
  // nowhere".
  checkTrue("ten actions already shows progress", m.knowledgePercent(10) > 0);
  let previous = -1;
  let monotonic = true;
  for (const actions of [0, 5, 19, 20, 60, 99, 100, 300, 499, 500, 900]) {
    const percent = m.knowledgePercent(actions);
    if (percent < previous) monotonic = false;
    previous = percent;
  }
  checkTrue("it never decreases as actions grow", monotonic);
  // Crossing a level must not make the bar jump backwards.
  checkTrue("crossing into level 1 does not drop the bar", m.knowledgePercent(20) >= m.knowledgePercent(19));
  check("the next milestone is stated in actions", m.actionsToNextLevel(15), 5);
  check("...and is null at the top", m.actionsToNextLevel(600), null);
}

console.log("\n== 4. confidence rises with evidence and never reaches certainty ==");
{
  let c = m.INITIAL_CONFIDENCE;
  for (let i = 0; i < 50; i++) c = m.confirmedConfidence(c);
  checkTrue(`fifty confirmations approach but do not pass the ceiling (${c})`, c <= m.MAX_CONFIDENCE);
  checkTrue("...and never reach certainty", c < 1);
  // Diminishing returns: the second sighting should move the needle far
  // more than the tenth.
  const first = m.confirmedConfidence(m.INITIAL_CONFIDENCE) - m.INITIAL_CONFIDENCE;
  let high = m.INITIAL_CONFIDENCE;
  for (let i = 0; i < 9; i++) high = m.confirmedConfidence(high);
  const tenth = m.confirmedConfidence(high) - high;
  checkTrue(`the tenth confirmation moves less than the first (${tenth.toFixed(4)} < ${first.toFixed(4)})`, tenth < first);
}

console.log("\n== 5. what is not confirmed fades, but is never lost ==");
{
  let c = 0.9;
  const path = [];
  for (let i = 0; i < 12; i++) {
    c = m.decayedConfidence(c);
    path.push(c);
  }
  // Strictly decreasing until it reaches the floor, then flat — never
  // rising, and never falling through to zero.
  checkTrue(
    "it drops on every missed refresh until it reaches the floor",
    path.every((v, i) => i === 0 || v < path[i - 1] || v === m.MIN_CONFIDENCE),
    JSON.stringify(path)
  );
  checkTrue("...and it did keep dropping for a while", path[3] < path[0]);
  checkTrue(`it stops at the floor rather than reaching zero (${c})`, c >= m.MIN_CONFIDENCE);
  // A well-established observation survives a couple of quiet weeks; a
  // shaky one does not.
  checkTrue("a strong observation survives two misses", m.isActive(m.decayedConfidence(0.9, 2)));
  checkTrue("a new one does not survive two misses", !m.isActive(m.decayedConfidence(m.INITIAL_CONFIDENCE, 2)));
  // Kept below the threshold rather than deleted, so a habit somebody
  // returns to recovers instead of being rediscovered from scratch.
  checkTrue("a faded observation still has a value to recover from", m.decayedConfidence(0.11) > 0);
}

console.log("\n== 6. what goes into the prompt, and how it is framed ==");
{
  const many = Array.from({ length: 10 }, (_, i) => ({
    category: "communication",
    observation: `obs ${i}`,
    confidence: 0.5 + i * 0.03,
  }));
  check(
    "one category cannot crowd out the others",
    m.selectForPrompt(many).length,
    m.MAX_OBSERVATIONS_PER_CATEGORY
  );
  check(
    "faded observations are not used",
    m.selectForPrompt([{ category: "work", observation: "x", confidence: 0.2 }]),
    []
  );

  // Level 0 says nothing at all. Acting on a handful of weak guesses means
  // being confidently wrong about a stranger.
  const strong = [{ category: "work", observation: "Δουλεύει κυρίως πρωί.", confidence: 0.8 }];
  check("level 0 contributes nothing to the prompt", m.buildProfilePromptAddition({ level: 0, observations: strong }), "");
  const addition = m.buildProfilePromptAddition({ level: 2, observations: strong });
  checkTrue("level 2 does", addition.includes("Δουλεύει κυρίως πρωί"));

  // The instruction matters as much as the data: an assistant handed facts
  // about somebody will recite them, and being recited back at is
  // unsettling in a way that being forgotten is not.
  checkTrue("it says to use them naturally", /ΦΥΣΙΚΑ/.test(addition));
  checkTrue("...and explicitly not to show off", /ΜΗΝ τα επιδεικνύεις/.test(addition));
  checkTrue("...nor to mention that it has them", /μην αναφέρεις καν ότι έχεις τέτοιες παρατηρήσεις/.test(addition));
  // Old evidence must not override what the person is saying right now.
  checkTrue("the present tense wins over the profile", /ΤΟ ΤΩΡΑ ΝΙΚΑΕΙ/.test(addition));
  check("an empty profile contributes nothing", m.buildProfilePromptAddition({ level: 3, observations: [] }), "");
}

console.log("\n== 7. the observers only speak when the evidence is there ==");
{
  const blank = {
    chatMessageLengths: [],
    actionHoursUtc: [],
    actionWeekdays: [],
    recordsByModule: {},
    missionGoals: [],
    missionsCompleted: 0,
    missionsFailed: 0,
    websiteRegenerations: 0,
    websitesGenerated: 0,
  };
  // The most important case. An observer that always finds something is an
  // observer that is guessing.
  check("no activity produces no observations", observers.deriveObservations(blank), []);
  check(
    "three messages are not enough to characterise anyone",
    observers.deriveObservations({ ...blank, chatMessageLengths: [10, 12, 9] }),
    []
  );
  // An ordinary-length writer is not a fact worth telling an assistant.
  check(
    "an average writer gets no observation",
    observers.deriveObservations({ ...blank, chatMessageLengths: Array(20).fill(200) }),
    []
  );

  const terse = observers.deriveObservations({ ...blank, chatMessageLengths: Array(20).fill(30) });
  checkTrue("a consistently terse writer does", terse.some((o) => o.category === "communication"));
  const verbose = observers.deriveObservations({ ...blank, chatMessageLengths: Array(20).fill(900) });
  checkTrue("so does a consistently verbose one", verbose.some((o) => o.category === "communication"));

  // A spread across modules is a person using the product, not a person
  // with a speciality.
  check(
    "an even spread is not a focus",
    observers.deriveObservations({ ...blank, recordsByModule: { Ideas: 5, Sales: 5, Finance: 5 } }),
    []
  );
  const focused = observers.deriveObservations({ ...blank, recordsByModule: { Sales: 20, Ideas: 2 } });
  checkTrue("a real focus is", focused.some((o) => o.category === "work" && o.observation.includes("Sales")));

  const mornings = observers.deriveObservations({
    ...blank,
    actionHoursUtc: Array(30).fill(8),
    actionWeekdays: Array(30).fill(3),
  });
  checkTrue("a morning worker is noticed", mornings.some((o) => o.observation.includes("πρωί")));
  checkTrue("...as is their strongest day", mornings.some((o) => o.category === "patterns"));

  // Goals are the one category that is quoted rather than inferred,
  // because the user wrote them.
  const goals = observers.deriveObservations({ ...blank, missionGoals: ["Find 5 new customers"] });
  checkTrue("a stated goal is carried verbatim", goals.some((o) => o.observation.includes("Find 5 new customers")));
  checkTrue("at most two goals are kept", observers.deriveObservations({ ...blank, missionGoals: ["a", "bb", "ccc", "dddd"] }).filter((o) => o.category === "goals").length <= 2);

  // "What they reject" — the brief's word — from the clearest rejection
  // signal the app records.
  const picky = observers.deriveObservations({ ...blank, websitesGenerated: 4, websiteRegenerations: 3 });
  checkTrue("someone who keeps regenerating is noticed", picky.some((o) => o.category === "preferences"));
  check(
    "one regeneration out of four is not a pattern",
    observers.deriveObservations({ ...blank, websitesGenerated: 4, websiteRegenerations: 1 }),
    []
  );
  const abandons = observers.deriveObservations({ ...blank, missionsCompleted: 1, missionsFailed: 5 });
  checkTrue(
    "somebody who abandons plans gets smaller ones suggested",
    abandons.some((o) => o.observation.includes("μικρότερα βήματα"))
  );

  // Every category the brief names is reachable.
  const everything = observers.deriveObservations({
    chatMessageLengths: Array(20).fill(30),
    actionHoursUtc: Array(30).fill(20),
    actionWeekdays: Array(30).fill(6),
    recordsByModule: { Sales: 20 },
    missionGoals: ["Ship the beta"],
    missionsCompleted: 5,
    missionsFailed: 0,
    websiteRegenerations: 3,
    websitesGenerated: 4,
  });
  for (const category of m.PROFILE_CATEGORIES) {
    checkTrue(`${category} can be observed`, everything.some((o) => o.category === category));
  }
  // Nothing an observer emits may be too long for the column's CHECK.
  checkTrue(
    "every observation fits the column",
    everything.every((o) => o.observation.length >= 3 && o.observation.length <= 300)
  );
}

console.log("\n== 8. the person controls it ==");
{
  const store = stripComments(read("src/lib/profile/store.ts"));
  checkTrue("they can delete one", /export async function deleteObservation/.test(store));
  checkTrue("they can delete all of it", /export async function forgetEverything/.test(store));
  // Forgetting everything must reset the counter too, or the assistant has
  // no memory and full confidence — the worst of both.
  checkTrue(
    "forgetting resets the maturity counter as well",
    /from\("user_profile_state"\)\.delete\(\)/.test(store)
  );
  checkTrue("they can rewrite one", /export async function editObservation/.test(store));
  // The correction has to stick. An observer that overwrites it on its
  // next run makes the fix a suggestion.
  checkTrue("an edit is marked", /user_edited: true/.test(store));
  checkTrue("...and the observer skips edited rows when confirming", /if \(row\.user_edited\) continue;/.test(store));
  checkTrue("...and when decaying", /derivedKeys\.has\(key\) \|\| row\.user_edited/.test(store));

  const route = stripComments(read("src/app/api/profile/route.ts"));
  checkTrue("editing needs a session", /if \(!user\)[\s\S]{0,120}status: 401/.test(route));
  checkTrue("deleting one is supported", /deleteObservation\(user\.id, id\)/.test(route));
  checkTrue("clearing everything is supported", /searchParams\.get\("all"\) === "1"[\s\S]{0,140}forgetEverything/.test(route));
  // Withdrawing consent to be profiled must always work on the first
  // press, whatever else the account has been doing.
  const forgetAt = route.indexOf('searchParams.get("all")');
  const limitAt = route.indexOf('scope: "profile_edit"');
  checkTrue("clearing everything is not rate limited", forgetAt > 0 && (limitAt === -1 || limitAt < route.indexOf("export async function DELETE")));
}

console.log("\n== 9. the UI shows all of it, including what it stopped believing ==");
{
  const ui = stripComments(read("src/components/settings/learned-profile.tsx"));
  checkTrue("the progress percentage is shown", /t\("progress", \{ percent \}\)/.test(ui));
  checkTrue("it is described in actions, not days", /actionsToNext|actionsMax/.test(ui));
  checkTrue("observations are grouped by category", /PROFILE_CATEGORIES\.filter/.test(ui));
  checkTrue("each one can be edited", /saveEdit\(row\.id\)/.test(ui));
  checkTrue("each one can be deleted", /remove\(row\.id\)/.test(ui));
  checkTrue('"forget everything" is there', /forgetAll/.test(ui));
  // A faded observation is hidden from the assistant but not from the
  // person — "why did it stop doing that?" deserves an answer.
  checkTrue("faded ones are shown, marked", /isActive\(row\.confidence\)/.test(ui) && /t\("fading"\)/.test(ui));
  checkTrue("an edited one says so", /yourWording/.test(ui));
  checkTrue("the bar is announced to screen readers", /role="progressbar"/.test(ui));
}

console.log("\n== 10. GDPR: it is theirs ==");
{
  const sql = read("user_profile_learned_migration.sql");
  checkTrue("RLS is on", /alter table public\.user_profile_learned enable row level security/.test(sql));
  const policies = [...sql.matchAll(/create policy "[^"]+" on public\.user_profile_learned\s+for (\w+)/g)].map((x) => x[1]).sort();
  // Select and delete, and NOTHING else. An UPDATE policy broad enough to
  // fix the wording is broad enough to forge `confidence` and
  // `evidence_count` — how strongly the assistant believes something.
  check("the owner can read and delete, and nothing more", policies, ["delete", "select"]);
  checkTrue("no client can insert an observation", !/for insert/.test(sql));
  checkTrue("no client can update one", !/for update/.test(sql));

  // Deleting the account deletes the profile with it.
  checkTrue(
    "erasure cascades from the account",
    (sql.match(/references auth\.users\(id\) on delete cascade/g) ?? []).length >= 2
  );
  checkTrue("the maturity row is the user's to delete too", /create policy "delete_own_profile_state"/.test(sql));
  checkTrue("the migration is idempotent", !/create table (?!if not exists)/.test(sql));
  // The column is what the person reads, so it has to be a sentence.
  checkTrue("an observation is bounded, readable text", /observation text not null check \(length\(observation\) between 3 and 300\)/.test(sql));
  checkTrue("confidence can never be 1", /confidence <= 0\.950/.test(sql));

  // The export has to include it — it is the one thing in there the user
  // never typed, which makes it the part a data request is actually about.
  const exporter = read("src/components/settings/export-data-button.tsx");
  checkTrue("data export includes the learned profile", /from\("user_profile_learned"\)/.test(exporter));

  const backup = read("supabase_full_project_backup.sql");
  for (const table of ["user_profile_learned", "user_profile_state"]) {
    checkTrue(`${table} is in the full schema file`, backup.includes(`create table if not exists public.${table}`));
  }
}

console.log("\n== 11. refreshed on a schedule, not on a page view ==");
{
  const cron = stripComments(read("src/app/api/cron/profile-refresh/route.ts"));
  checkTrue("it is behind the cron guard", /checkCronAuth\(request\)/.test(cron));
  // A page-triggered refresh would let anyone inflate their own profile by
  // reloading Settings — thirty reloads would take a guess to
  // near-certainty — and somebody who never opened Settings would never
  // have anything decay.
  const settings = read("src/app/dashboard/settings/page.tsx");
  checkTrue("Settings reads but never refreshes", !/refreshProfile/.test(settings));
  checkTrue("...and the chat route does not either", !/refreshProfile/.test(read("src/app/api/chat/route.ts")));
  // Refreshing a dormant account would decay its observations for its
  // owner's absence, which is the calendar thinking the whole feature
  // avoids.
  checkTrue("only recently active accounts are refreshed", /ACTIVE_WINDOW_DAYS/.test(cron));
  checkTrue("one account's failure does not stop the rest", /catch \(err\)[\s\S]{0,200}failed \+= 1/.test(cron));

  const vercel = JSON.parse(read("vercel.json"));
  checkTrue(
    "the refresh is scheduled",
    (vercel.crons ?? []).some((c) => c.path === "/api/cron/profile-refresh")
  );

  // And no model call anywhere in it: the observations are derived, so
  // they cost nothing and cannot be hallucinated.
  for (const file of [
    "src/lib/profile/observers.ts",
    "src/lib/profile/store.ts",
    "src/lib/profile/activity.ts",
    "src/app/api/cron/profile-refresh/route.ts",
  ]) {
    checkTrue(`${file} makes no model call`, !/Anthropic|messages\.create/.test(read(file)));
  }
}

console.log("\n== 12. the chat actually uses it ==");
{
  const chat = stripComments(read("src/app/api/chat/route.ts"));
  checkTrue("the profile is loaded", /getProfileState\(user\.id\)[\s\S]{0,80}listProfile\(user\.id\)/.test(chat));
  checkTrue("...and appended to the system prompt", /profileAddition \+/.test(chat));
  // A failure to load must cost a slightly less tailored reply, never the
  // user's message.
  checkTrue("a failure degrades to knowing nothing", /catch \(err\)[\s\S]{0,140}learned_profile/.test(chat));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
