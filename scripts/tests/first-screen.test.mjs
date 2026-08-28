// THE FIRST SCREEN: ONE SENTENCE, ONE INPUT, THREE EXAMPLES THAT RUN.
//
// Seven testers, six answers to "what does it do", nobody naming a
// capability. The screen led with "What do you want to build today?" —
// the largest text on the page spent on a question the newcomer is the
// least equipped to answer.
//
// What must hold now:
//   1. The sentence IS the headline. Not a caption above a bigger,
//      vaguer question.
//   2. Three examples, three DIFFERENT capabilities. Two examples of the
//      same one teaches nothing, and "they are all present" is exactly
//      the assertion that would not notice.
//   3. Each example RUNS on one click. The failure this is written
//      against is silent: `?ask=` in the link, `searchParams.question`
//      in the page, and the button navigates, renders, and does nothing.
//      Nothing in TypeScript connects those two strings, so this gate
//      reads both sides and compares them.
//   4. Concrete, not generic. "Build something" is the disease.
//
// Run: node scripts/tests/first-screen.test.mjs
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]),
);
// A missing file is a FAILURE, not a crash: a gate that dies on the
// first absent path reports one problem and hides the rest.
const read = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
};

const { loadTs } = await import("./load-ts.mjs");
const { FIRST_SCREEN_EXAMPLES, MAX_EXAMPLE_CHARS, readExampleParam, exampleHref, forgetExampleParam } =
  await loadTs(
  "src/lib/overview/first-screen-examples.ts",
);
const { ONE_SENTENCE_KEY } = await loadTs("src/lib/i18n/one-sentence.ts");

const GREETING = "src/components/overview/greeting-header.tsx";
const STRIP = "src/components/overview/first-screen-examples.tsx";
const OVERVIEW = "src/app/dashboard/overview/page.tsx";

// ---------------------------------------------------------------------
console.log("== 1. three examples, three DIFFERENT capabilities ==");

check(`there are exactly three (${FIRST_SCREEN_EXAMPLES.length})`, FIRST_SCREEN_EXAMPLES.length === 3);

const ids = FIRST_SCREEN_EXAMPLES.map((e) => e.id);
check(
  `each names a different capability: ${ids.join(" · ")}`,
  new Set(ids).size === FIRST_SCREEN_EXAMPLES.length,
);
check(
  "the three capabilities are build, understand and repeat",
  ["build", "understand", "repeat"].every((id) => ids.includes(id)),
  `got ${ids.join(", ")}`,
);
check(
  "each lands somewhere different",
  new Set(FIRST_SCREEN_EXAMPLES.map((e) => e.path)).size === FIRST_SCREEN_EXAMPLES.length,
  FIRST_SCREEN_EXAMPLES.map((e) => e.path).join(", "),
);

// ---------------------------------------------------------------------
console.log("\n== 2. every example says a real sentence, in ten languages ==");

for (const example of FIRST_SCREEN_EXAMPLES) {
  for (const which of ["verbKey", "exampleKey"]) {
    const path = example[which].split(".");
    const missing = LOCALES.filter((locale) => {
      let node = messages[locale];
      for (const part of path) node = node?.[part];
      return typeof node !== "string" || node.trim().length === 0;
    });
    checkList(`${example.id}.${which} resolves in all ten locales`, missing);
  }
}

// It has to RENDER, not merely sit in the file. next-intl resolves a
// dotted key through its own namespace walk; a key present in JSON but
// unreachable by the translator is the shape that ships raw key names.
for (const locale of LOCALES) {
  const t = createTranslator({ locale, messages: messages[locale] });
  const broken = FIRST_SCREEN_EXAMPLES.flatMap((example) =>
    [example.verbKey, example.exampleKey].filter((key) => {
      try {
        const rendered = t(key);
        return typeof rendered !== "string" || rendered === key || rendered.includes(key);
      } catch {
        return true;
      }
    }),
  );
  checkList(`${locale}: every example renders through createTranslator`, broken);
}

// ---------------------------------------------------------------------
console.log("\n== 3. CONCRETE, which is the entire point ==");

// A sentence that could be about anything is the disease, not the cure.
// "Build a website for my shop" names a thing; "Build something" does
// not. English is the one locale this can be judged in mechanically.
const GENERIC = ["something", "anything", "your stuff", "a thing", "some data"];
const en = createTranslator({ locale: "en", messages: messages.en });
for (const example of FIRST_SCREEN_EXAMPLES) {
  const sentence = en(example.exampleKey);
  const words = sentence.trim().split(/\s+/);
  check(
    `${example.id}: "${sentence}" is a sentence, not a label (${words.length} words)`,
    words.length >= 4,
  );
  checkList(
    `${example.id}: names something specific`,
    GENERIC.filter((g) => sentence.toLowerCase().includes(g)),
  );
}
checkList(
  "no two examples say the same thing",
  FIRST_SCREEN_EXAMPLES.map((e) => en(e.exampleKey)).filter(
    (s, i, all) => all.indexOf(s) !== i,
  ),
);

// The verbs are what teach the three capabilities. If two read the same,
// the screen shows one capability three times.
const verbs = FIRST_SCREEN_EXAMPLES.map((e) => en(e.verbKey));
check(`three distinct verbs: ${verbs.join(" · ")}`, new Set(verbs).size === 3);

// ---------------------------------------------------------------------
console.log("\n== 4. ONE CLICK RUNS IT — the runtime string, on both sides ==");

for (const example of FIRST_SCREEN_EXAMPLES) {
  const href = exampleHref(example, "hello world");
  check(
    `${example.id}: the link carries ?${example.param}=`,
    href.startsWith(`${example.path}?${example.param}=`),
    href,
  );

  // THE SIDE NO COMPILER SEES. `searchParams.brief` is a property access
  // on an untyped bag; renaming the link's param leaves this compiling.
  const page = read(example.page);
  check(
    `${example.id}: ${example.page} reads searchParams.${example.param}`,
    new RegExp(`searchParams(\\?)?\\.${example.param}\\b`).test(page),
  );
  check(
    `${example.id}: ...and declares it in its searchParams type`,
    new RegExp(`\\b${example.param}\\?:\\s*string`).test(page),
  );

  // And the page must hand it on: a param read and dropped is the same
  // silence as a param never read.
  // WRAPPED, not merely imported. `page.includes("readExampleParam")`
  // stayed true when the value was read raw, because the import line
  // never went away.
  check(
    `${example.id}: the page clamps it through readExampleParam`,
    new RegExp(`readExampleParam\\(\\s*searchParams(\\?)?\\.${example.param}\\b`).test(page),
  );

  // THE WORKSPACE MUST ACT ON IT. A prop threaded all the way to a
  // component that renders it into nothing is the last place this can
  // die quietly.
  //
  // AND THE FIRST WRITING OF THIS CHECK WAS VACUOUS: it asked whether
  // the file contained `useEffect(` and the substring "initial", which
  // every one of the three already did before a line of this feature
  // existed. It passed on an unmodified tree — a check that cannot go
  // red. It now names the exact prop, derived from the param, and
  // demands the effect actually depend on it.
  const prop = `initial${example.param[0].toUpperCase()}${example.param.slice(1)}`;
  const workspace = read(example.workspace);
  check(
    `${example.id}: the page hands the workspace ${prop}`,
    new RegExp(`${prop}=`).test(page) || new RegExp(`${prop}=\\{`).test(page),
  );
  check(
    `${example.id}: ${example.workspace.split("/").pop()} accepts ${prop}`,
    new RegExp(`${prop}\\??:\\s*string`).test(workspace),
  );
  check(
    `${example.id}: ...and an effect depends on it, so arriving RUNS it`,
    new RegExp(`useEffect\\([\\s\\S]{0,4000}?\\[[^\\]]*\\b${prop}\\b[^\\]]*\\]`).test(workspace),
  );
  // ONCE, NOT ON EVERY RELOAD. The text stays in the address bar after
  // the work starts, so a refresh mounts the destination with the same
  // parameter and starts the same work again — for the chat that is a
  // second message and a second charge for one press.
  check(
    `${example.id}: ...and forgets the parameter, so a reload does not repeat it`,
    new RegExp(`forgetExampleParam\\("${example.param}"\\)`).test(workspace),
  );
}

// The pages must not disagree about how long a URL parameter may be.
check(`readExampleParam clamps at ${MAX_EXAMPLE_CHARS}`, readExampleParam("x".repeat(9999))?.length === MAX_EXAMPLE_CHARS);
check("readExampleParam refuses an empty value", readExampleParam("   ") === undefined);
check("readExampleParam refuses a repeated parameter", readExampleParam(["a", "b"]) === undefined);
check("readExampleParam refuses a missing value", readExampleParam(undefined) === undefined);
check(
  "forgetExampleParam does nothing where there is no address bar",
  (() => {
    try {
      forgetExampleParam("ask");
      return true;
    } catch {
      return false;
    }
  })(),
);

// AND IT ACTUALLY REMOVES IT. Asserting that the workspaces CALL this is
// not the same as asserting it does anything: a body that deletes
// nothing leaves every caller looking correct. Run against a stubbed
// address bar, because the alternative is a check that cannot go red.
{
  let written = null;
  const original = globalThis.window;
  globalThis.window = {
    location: { href: "https://x.test/dashboard/chat?ask=hello&c=42#tail" },
    history: { replaceState: (_s, _t, url) => { written = url; } },
  };
  try {
    forgetExampleParam("ask");
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
  check(
    `forgetExampleParam removes the parameter (${JSON.stringify(written)})`,
    typeof written === "string" && !written.includes("ask="),
  );
  check(
    "...and keeps everything else in the address bar",
    typeof written === "string" &&
      written.startsWith("/dashboard/chat") &&
      written.includes("c=42") &&
      written.includes("#tail"),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. the strip is on the first screen, under the input ==");

const overview = read(OVERVIEW);
// `<`, AND THAT ANGLE BRACKET IS THE WHOLE CHECK. Written first as
// includes("FirstScreenExamples") and indexOf("CreateChat"), both of
// which the import lines at the top of the file satisfy on their own:
// deleting the element left the gate green, and moving the strip above
// the input compared against an import 400 characters higher up. Four
// checks in this file had the same defect. The element is what is being
// asserted about, so the element is what is matched.
check("the overview renders the examples", overview.includes("<FirstScreenExamples"));
check(
  "...below the input, not above it",
  overview.indexOf("<CreateChat") !== -1 &&
    overview.indexOf("<FirstScreenExamples") !== -1 &&
    overview.indexOf("<CreateChat") < overview.indexOf("<FirstScreenExamples"),
  `CreateChat at ${overview.indexOf("<CreateChat")}, examples at ${overview.indexOf("<FirstScreenExamples")}`,
);

const strip = read(STRIP);
check("the strip is driven by the shared list", strip.includes("FIRST_SCREEN_EXAMPLES.map("));
check("...and builds its links with exampleHref", strip.includes("exampleHref"));
check(
  "...and writes no example of its own",
  !/Build a website|my shop|Every Monday/i.test(strip),
);

// ---------------------------------------------------------------------
console.log("\n== 6. the sentence is the headline now ==");

const greeting = read(GREETING);
const [ns, key] = ONE_SENTENCE_KEY.split(".");
check("the greeting header still renders the one sentence", greeting.includes(`"${key}"`));

// THE HIERARCHY, MEASURED BY POSITION. A sentence in small text above a
// larger, vaguer question leaves the vaguest thing loudest — which is
// the state seven testers were shown.
const h1 = greeting.indexOf("<h1");
const sentenceAt = greeting.indexOf(`("${key}")`);
check("there is a headline", h1 !== -1);
check(
  "the one sentence IS the headline",
  h1 !== -1 && sentenceAt > h1 && sentenceAt < greeting.indexOf("</h1>"),
  `h1 at ${h1}, sentence at ${sentenceAt}, </h1> at ${greeting.indexOf("</h1>")}`,
);
check(
  'the generic "What do you want to build today?" is gone from the screen',
  !greeting.includes("heroQuestion"),
);
checkList(
  "...and gone from every locale, not merely unused",
  LOCALES.filter((l) => messages[l]?.dashboard?.overview?.heroQuestion !== undefined),
);

// The greeting is still there, and still below the headline.
const greetingAt = greeting.indexOf("greeting.text");
check("the greeting still exists", greetingAt !== -1);
check(
  "...and is still below the headline",
  greetingAt > greeting.indexOf("</h1>"),
  `greeting at ${greetingAt}, </h1> at ${greeting.indexOf("</h1>")}`,
);

// ---------------------------------------------------------------------
const total = pass + failures.length;
console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed`,
);
if (failures.length > 0) process.exit(1);
