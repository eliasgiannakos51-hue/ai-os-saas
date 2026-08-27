// THE ROADMAP TOLD SEVEN PEOPLE THE PRODUCT COULD NOT DO WHAT IT DOES.
//
// Coding, Data Analysis, the model router and the template library were all
// filed under "Future Vision" on the public /roadmap while all four were
// live in the product. Seven testers came away saying they had not seen the
// capabilities. A marketing surface that understates the build is the same
// class of defect as one that overstates it, and this one is worse for
// being invisible: nobody files a bug saying "you undersold yourself".
//
// A DIRECTORY IS NOT A FEATURE, and that is the whole difficulty in
// checking this. /dashboard/images exists and belongs in "future": the file
// that defines it, build-modules.ts, says of its own contents that every
// entry "is a LOG: a table of rows the user types by hand, with no AI call
// anywhere in it". The first audit of this page matched directory names and
// concluded ten features were hidden. The real number was four. So this
// gate does not ask "is there a folder" — it asks for EVIDENCE, named per
// item, and checks that the evidence still exists.
//
// THE RULE, both directions:
//   an item with evidence may not sit in "future"
//   an item without evidence may not sit in "available"
//
// And the evidence table has to stay honest: every roadmap key must appear
// in it, every entry must name a real roadmap key, and every path it cites
// must exist on disk.
//
// Run: node scripts/tests/roadmap-truth.test.mjs
import { readFileSync, existsSync } from "node:fs";

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

const PAGE = "src/app/roadmap/page.tsx";
const page = readFileSync(PAGE, "utf8");
const buildModules = readFileSync("src/lib/build-modules.ts", "utf8");

// ---------------------------------------------------------------------
// The evidence table. `produces` is the thing that makes a feature real —
// a route, a library, a table that something writes. `null` means it does
// not exist yet, with the reason.
// ---------------------------------------------------------------------
const EVIDENCE = new Map([
  [
    "modules",
    { produces: ["src/lib/modules.ts", "src/app/dashboard/[module]/page.tsx"] },
  ],
  ["createAnything", { produces: ["src/app/api/create"] }],
  ["chat", { produces: ["src/app/api/chat"] }],
  ["export", { produces: ["src/components/settings/export-data-button.tsx"] }],
  ["team", { produces: ["src/app/api/team"] }],
  ["agentBuilder", { produces: ["src/app/api/agents/build/route.ts"] }],
  ["websiteBuilder", { produces: ["src/app/api/websites/generate"] }],
  ["automationBuilder", { produces: ["src/app/api/automations"] }],
  ["aiMemory", { produces: ["src/app/dashboard/memory/page.tsx"] }],
  // The four moved out of "future".
  [
    "coding",
    {
      produces: [
        "src/lib/coding/operations.ts",
        "src/app/api/coding/run/route.ts",
      ],
    },
  ],
  [
    "dataAnalysis",
    {
      produces: [
        "src/lib/data-analysis/charts.ts",
        "src/app/api/data-analysis",
      ],
    },
  ],
  [
    "router",
    {
      produces: [
        "src/lib/ai/routing/route.ts",
        "src/lib/ai/providers/registry.ts",
      ],
    },
  ],
  [
    "marketplace",
    {
      produces: [
        "src/components/marketplace/template-browser.tsx",
        "src/app/api/agents/templates/adopt/route.ts",
      ],
    },
  ],
  // BUILT AND DARK. The code is written and the feature does not work until
  // the deployment carries provider keys. That is neither "available" —
  // nobody can use it — nor "future", and an unguarded third status is how
  // an unusable feature gets sold or a written one stays hidden.
  [
    "voice",
    {
      dark: ["src/lib/voice/voice-pricing.ts", "src/app/api/voice"],
      why: "needs the speech provider keys",
    },
  ],
  [
    "pushNotifications",
    {
      dark: ["src/app/api/push", "src/components/pwa"],
      why: "needs the deployment's VAPID keys",
    },
  ],
  // PLANNED. Not built, and named by the owner as what comes next. `plan`
  // is the one field here no scan can verify, so it is marked as a claim
  // rather than dressed up as evidence.
  ["clarity", { produces: null, plan: "a first minute that explains itself" }],
  [
    "workflowBuilder",
    { produces: null, plan: "chained steps instead of one agent per job" },
  ],
  ["desktopApp", { produces: null, plan: "the workspace in its own window" }],
  [
    "messagingChannels",
    { produces: null, plan: "Telegram and WhatsApp delivery" },
  ],
  [
    "socialPosting",
    { produces: null, plan: "publish from here instead of copying out" },
  ],
  // Not built and not next. Each `why` is a claim about the product,
  // checked below where it can be.
  [
    "mobileApps",
    {
      produces: null,
      why: "the roadmap promises NATIVE apps for four platforms; a PWA is not that",
    },
  ],
  [
    "imageGeneration",
    {
      produces: null,
      why: "/dashboard/images is a tracking log — build-modules.ts, no AI call",
    },
  ],
  [
    "videoGeneration",
    { produces: null, why: "/dashboard/videos is a tracking log" },
  ],
  [
    "presentations",
    { produces: null, why: "/dashboard/presentations is a tracking log" },
  ],
  [
    "marketingBuilder",
    { produces: null, why: "/dashboard/campaigns is a tracking log" },
  ],
  [
    "teamGenerator",
    { produces: null, why: "no multi-agent coordination exists" },
  ],
  [
    "projectManager",
    { produces: null, why: "no task-breakdown feature exists" },
  ],
  ["ceoAdvisor", { produces: null, why: "no advisor feature exists" }],
  [
    "sync",
    {
      produces: null,
      why: "promises web + mobile + desktop; there is no mobile or desktop client",
    },
  ],
]);

/** The keys the page files under each status, read from the page itself. */
function keysByStatus(source) {
  const out = new Map();
  for (const m of source.matchAll(
    /status:\s*"(\w+)"([\s\S]*?)(?=\n\s*\{\s*\n\s*status:|\n\];)/g,
  )) {
    out.set(
      m[1],
      [...m[2].matchAll(/key:\s*"(\w+)"/g)].map((k) => k[1]),
    );
  }
  return out;
}
const byStatus = keysByStatus(page);
const allKeys = [...byStatus.values()].flat();

console.log("roadmap-truth");
ok(
  `the page's sections were parsed (${byStatus.size})`,
  byStatus.size >= 3,
  [...byStatus.keys()].join(", "),
);
// A FLOOR: every check below is a filter over this list, and a filter of an
// empty list is empty.
ok(
  `roadmap entries were found (${allKeys.length})`,
  allKeys.length >= 20,
  allKeys.join(", "),
);

// ---------------------------------------------------------------------
console.log("\n== 1. the evidence table covers the page, and nothing else ==");
// ---------------------------------------------------------------------
{
  const unmapped = allKeys.filter((k) => !EVIDENCE.has(k));
  ok(
    `every roadmap entry has an evidence verdict (${unmapped.length} do not)`,
    unmapped.length === 0,
    unmapped.join(", ") + " — a new entry must be judged, not defaulted",
  );
  // AN ENTRY MAY NOT CLAIM TWO THINGS AT ONCE. "Built", "dark" and
  // "planned next" are mutually exclusive; a `plan` on something that
  // already exists is how a shipped feature ends up advertised as coming.
  const confused = [...EVIDENCE].filter(
    ([, e]) =>
      [e.produces ?? null, e.dark ?? null, e.plan ?? null].filter(Boolean)
        .length > 1,
  );
  ok(
    `no entry is both built and planned (${confused.length})`,
    confused.length === 0,
    confused.map(([k]) => k).join(", "),
  );
  const stale = [...EVIDENCE.keys()].filter((k) => !allKeys.includes(k));
  ok(
    `every evidence entry names a real roadmap key (${stale.length} do not)`,
    stale.length === 0,
    stale.join(", "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. the evidence is real ==");
// ---------------------------------------------------------------------
{
  const missing = [];
  let cited = 0;
  for (const [key, entry] of EVIDENCE) {
    for (const path of [...(entry.produces ?? []), ...(entry.dark ?? [])]) {
      cited++;
      if (!existsSync(path)) missing.push(`${key}: ${path}`);
    }
  }
  ok(`paths were cited as evidence (${cited})`, cited >= 15, `${cited}`);
  ok(
    `every cited path exists (${missing.length} do not)`,
    missing.length === 0,
    missing.join("\n        ") +
      "\n        A feature whose evidence has been deleted is a feature that moved.",
  );

  // THE TRACKING CLAIM, checked rather than trusted. Four "future" entries
  // are excused on the grounds that their page is a hand-typed log, and
  // build-modules.ts is where that is declared.
  const trackingSlugs = [...buildModules.matchAll(/slug: "([^"]+)"/g)].map(
    (m) => m[1],
  );
  ok(
    `the tracking registry was read (${trackingSlugs.length})`,
    trackingSlugs.length >= 6,
    trackingSlugs.join(", "),
  );
  const claimed = [
    ["imageGeneration", "images"],
    ["videoGeneration", "videos"],
    ["presentations", "presentations"],
    ["marketingBuilder", "campaigns"],
  ];
  const wrong = claimed.filter(([, slug]) => !trackingSlugs.includes(slug));
  ok(
    `every "it is only a tracker" excuse is still true (${wrong.length} are not)`,
    wrong.length === 0,
    wrong
      .map(
        ([k, s]) =>
          `${k}: ${s} has left build-modules.ts — it may produce something now`,
      )
      .join("\n        "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 3. nothing shipped is hidden, nothing unbuilt is sold ==");
// ---------------------------------------------------------------------
{
  const future = byStatus.get("future") ?? [];
  const available = byStatus.get("available") ?? [];

  const hidden = future.filter(
    (k) => (EVIDENCE.get(k)?.produces ?? null) !== null,
  );
  ok(
    `nothing with evidence is filed under "future" (${hidden.length})`,
    hidden.length === 0,
    hidden
      .map((k) => `${k} — ${(EVIDENCE.get(k).produces ?? []).join(", ")}`)
      .join("\n        ") +
      "\n        This is the defect seven testers reported as 'I did not see the features'.",
  );

  const oversold = available.filter(
    (k) => (EVIDENCE.get(k)?.produces ?? null) === null,
  );
  ok(
    `nothing without evidence is filed under "available" (${oversold.length})`,
    oversold.length === 0,
    oversold
      .map((k) => `${k} — ${EVIDENCE.get(k)?.why ?? "no evidence recorded"}`)
      .join("\n        "),
  );

  // THE THIRD STATUS, unguarded until it had contents. A feature that is
  // written but dark belongs here and nowhere else: selling it means
  // selling something nobody can switch on, and filing it under "future"
  // hides work that is already done.
  const soon = byStatus.get("soon") ?? [];
  const dark = [...EVIDENCE].filter(([, e]) => e.dark).map(([k]) => k);
  const misplacedDark = dark.filter((k) => !soon.includes(k));
  ok(
    `everything built-but-dark is filed under "soon" (${misplacedDark.length})`,
    misplacedDark.length === 0,
    misplacedDark
      .map((k) => `${k} — ${EVIDENCE.get(k).why}`)
      .join("\n        "),
  );
  const wrongInSoon = soon.filter((k) => {
    const entry = EVIDENCE.get(k) ?? {};
    return !entry.dark && !entry.plan;
  });
  ok(
    `everything under "soon" is either dark or planned (${wrongInSoon.length})`,
    wrongInSoon.length === 0,
    wrongInSoon.join(", ") +
      " — a roadmap section is not a place to park an item",
  );
  ok(
    `"soon" is not empty (${soon.length})`,
    soon.length > 0,
    "the section renders only when it has items, so an empty one is invisible rather than wrong",
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. the copy does not promise a different product ==");
// ---------------------------------------------------------------------
// The Marketplace shipped as a FREE library and its roadmap line said "Buy
// and sell agents, automations, and templates". Moving it to "available"
// with that sentence would have replaced an understatement with a lie.
{
  const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];
  // THE NEGATION IS THE POINT, and the first version of this pattern missed
  // it: the Japanese and Chinese replacements say "売買はありません" and
  // "不买卖任何东西" — there is NO buying and selling — and a substring test
  // for 売買 / 买卖 reported both as shops. The denial is removed before the
  // claim is looked for.
  const DENIAL =
    /nothing is (?:bought|sold)[^.]*|τίποτα δεν αγοράζεται[^.]*|nichts wird gekauft[^.]*|no se compra[^.]*|rien n'est acheté[^.]*|non si compra[^.]*|nada é comprado[^.]*|売買はありません|不买卖任何东西|لا شيء يُباع[^.]*/gi;
  const SELLING =
    /buy and sell|αγορά και πώληση|kaufen und verkaufen|comprar y vender|acheter et vendre|comprare e vendere|comprar e vender|売買|买卖|بيع وشراء/i;
  const offenders = [];
  for (const locale of LOCALES) {
    const messages = JSON.parse(
      readFileSync(`messages/${locale}.json`, "utf8"),
    );
    const description =
      messages?.roadmap?.items?.marketplace?.description ?? "";
    if (SELLING.test(description.replace(DENIAL, "")))
      offenders.push(`${locale}: ${description.slice(0, 70)}`);
  }
  ok(
    `no locale still sells a shop (${offenders.length})`,
    offenders.length === 0,
    offenders.join("\n        "),
  );
  ok(
    "...and the pattern would recognise one",
    SELLING.test("Buy and sell agents, automations, and templates."),
  );
  // AND A DENIAL IS NOT A CLAIM. Only the exact denial phrases are removed,
  // so a real shop still shows through.
  ok(
    "...while a denial is not mistaken for one",
    !SELLING.test(
      "Free — nothing is bought or sold here.".replace(DENIAL, ""),
    ) &&
      !SELLING.test("無料です — 売買はありません。".replace(DENIAL, "")) &&
      SELLING.test("エージェントの売買ができます。".replace(DENIAL, "")),
  );
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
