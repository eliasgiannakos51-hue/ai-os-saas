// The guided start (V3 Task 9).
//
// Two properties matter and both are about NOT showing things:
//
//   EARNED, NEVER TICKED — a step is done when the row exists, so the
//   guide can never disagree with the account. There is nothing to mark
//   and nothing to game.
//
//   IT EXPIRES — after the window it is gone, finished or not, because
//   by then an unfinished step is a decision, not a knowledge gap.
//
// Run: node scripts/tests/onboarding.test.mjs
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
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const ob = await loadTs("src/lib/onboarding.ts");

const NOW = new Date("2026-08-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ageDays = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const empty = { ideas: 0, aiActions: 0, missions: 0, presentations: 0, websitesPublished: 0 };
const build = (over = {}) =>
  ob.buildOnboardingGuide({ counts: empty, accountCreatedAt: ageDays(1), now: NOW, ...over });

console.log("== 1. when the guide exists at all ==");
check("a day-old account gets the guide", build().kind, "guide");
check("the last day of the window still shows it", build({ accountCreatedAt: ageDays(13.9) }).kind, "guide");
check("past the window it is gone", build({ accountCreatedAt: ageDays(14.1) }).kind, "hidden");
// Showing a starter checklist to an account of unknown age risks showing
// it to a two-year-old one. Fail closed.
check("no creation date fails closed", build({ accountCreatedAt: null }).kind, "hidden");
check("garbage creation date fails closed", build({ accountCreatedAt: "not-a-date" }).kind, "hidden");
check("dismissed is dismissed", build({ dismissed: true }).kind, "hidden");

console.log("\n== 2. steps are earned from rows, not ticked ==");
const fresh = build();
check("a fresh account has every step open", fresh.completed, 0);
check("...and the first step is the highlighted one", fresh.next.id, "capture");
const some = build({ counts: { ...empty, ideas: 3, aiActions: 1 } });
check("existing rows arrive already ticked", some.completed, 2);
check("...and the highlight moves to the first gap", some.next.id, "direction");
// Out-of-order completion must not confuse the highlight: the next step
// is the first UNDONE one, not the one after the last done one.
const skipped = build({ counts: { ...empty, presentations: 1 } });
check("finishing a later step first keeps the earlier gap highlighted", skipped.next.id, "capture");
checkTrue(
  "...while the later step shows done",
  skipped.steps.find((s) => s.id === "present").done
);

console.log("\n== 3. finishing is the end of it ==");
const done = build({
  counts: { ideas: 1, aiActions: 1, missions: 1, presentations: 1, websitesPublished: 1 },
});
// The reward for completing a checklist is that it goes away.
check("a finished guide is hidden, not celebrated forever", done.kind, "hidden");

console.log("\n== 4. it never points at a locked door ==");
const lockedOut = build({
  lockedHrefs: ["/dashboard/presentations", "/dashboard/website-builder"],
});
check("locked steps are dropped, not greyed out", lockedOut.steps.length, 3);
checkTrue(
  "...and none of the survivors point at a locked href",
  lockedOut.steps.every((s) => !["/dashboard/presentations", "/dashboard/website-builder"].includes(s.href))
);
// A Free account (which locks presentations and the website builder) must
// still be able to FINISH its shorter guide — that is the point of
// dropping rather than greying.
const freeDone = build({
  counts: { ...empty, ideas: 1, aiActions: 1, missions: 1 },
  lockedHrefs: ["/dashboard/presentations", "/dashboard/website-builder"],
});
check("the shorter guide is completable", freeDone.kind, "hidden");
check(
  "a plan that locks everything gets no guide at all",
  build({
    lockedHrefs: [
      "/dashboard",
      "/dashboard/chat",
      "/dashboard/mission",
      "/dashboard/presentations",
      "/dashboard/website-builder",
    ],
  }).kind,
  "hidden"
);

console.log("\n== 5. the steps the guide teaches are real destinations ==");
// Each href must be an actual page, or the guide's first suggestion 404s.
const { existsSync } = await import("node:fs");
const g = build();
for (const step of g.steps) {
  const dir = "src/app" + step.href;
  checkTrue(`${step.href} exists`, existsSync(`${dir}/page.tsx`), `${dir}/page.tsx not found`);
}

console.log("\n== 6. the rule is pure and the dismissal is browser-side ==");
const { readFileSync } = await import("node:fs");
const src = readFileSync("src/lib/onboarding.ts", "utf8");
checkTrue("no database in the rule", !/supabase/i.test(src));
checkTrue("no model call in the rule", !/anthropic/i.test(src));
// No onboarding table: the component stores the dismissal in the
// browser, and everything else is derived from rows that already exist.
const component = readFileSync("src/components/overview/onboarding-guide.tsx", "utf8");
checkTrue("dismissal lives in localStorage", /localStorage/.test(component));
checkTrue("the component never queries", !/supabase/i.test(component));

console.log("\n== 7. the overview gates the queries on age ==");
// The guide only exists for a fortnight, so an old account must not pay
// for it. The page checks the age BEFORE running any onboarding count.
const overview = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
checkTrue(
  "overview checks ONBOARDING_WINDOW_DAYS before counting",
  /accountAgeDays\s*<=\s*ONBOARDING_WINDOW_DAYS/.test(overview),
  "the age gate around the onboarding counts is gone"
);

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
