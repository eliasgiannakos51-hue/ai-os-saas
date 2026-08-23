// "Share this to Ionexa" — the part that carries the shared thing.
//
// The share arrives as an OS form POST and has to reach Create Studio
// through a redirect. Two things can quietly ruin it and neither shows up
// in a typecheck: text that survives the trip mangled (Greek, Arabic,
// emoji, a hashtag), and a link the user sees twice because Android put it
// in `url` while the app that shared it also put it in `text`.
//
// Run: node scripts/tests/share-target.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const {
  composeSharedText,
  encodeSharePayload,
  decodeSharePayload,
  readSharedTextFromHash,
  MAX_SHARED_TEXT,
  SHARE_HASH_KEY,
} = await loadTs("src/lib/pwa/share-payload.ts");

console.log("== 1. three fields become one sentence ==");
check(
  "text alone",
  composeSharedText({ text: "quarterly numbers" }) === "quarterly numbers"
);
check(
  "title and text",
  composeSharedText({ title: "Q3", text: "quarterly numbers" }) === "Q3\nquarterly numbers"
);
check(
  "title, text and url",
  composeSharedText({ title: "Q3", text: "the numbers", url: "https://x.test/q3" }) ===
    "Q3\nthe numbers\nhttps://x.test/q3"
);
check("nothing at all is empty, not 'undefined'", composeSharedText({}) === "");
check(
  "whitespace-only fields are nothing",
  composeSharedText({ title: "   ", text: "\n\n", url: " " }) === ""
);

console.log("\n== 2. the same link is not pasted twice ==");
// Android puts a shared link in `url`. Several apps ALSO put it in `text`,
// and some put it only there. Appending blindly hands the user their own
// URL twice, which looks like the app is broken.
check(
  "url already inside text is not repeated",
  composeSharedText({ text: "look: https://x.test/a", url: "https://x.test/a" }) ===
    "look: https://x.test/a"
);
check(
  "a DIFFERENT url is still appended",
  composeSharedText({ text: "look: https://x.test/a", url: "https://x.test/b" }) ===
    "look: https://x.test/a\nhttps://x.test/b"
);
check(
  "title already inside text is not repeated",
  composeSharedText({ title: "Q3 report", text: "Q3 report — the numbers" }) ===
    "Q3 report — the numbers"
);
check(
  "url in the title is not repeated either",
  composeSharedText({ title: "https://x.test/a", url: "https://x.test/a" }) === "https://x.test/a"
);

console.log("\n== 3. the trip through a URL fragment, in every script ==");
const SAMPLES = [
  "plain ascii",
  "Τα έσοδα του τριμήνου — 3 προτάσεις",
  "المبيعات في الربع الثالث",
  "第三季度的销售额",
  "四半期の売上",
  "emoji 🚀📊 and a #hashtag & an ampersand",
  "a=1&b=2#not-a-fragment",
  "line one\nline two\ttabbed",
  "100% – “quoted” ‘curly’ «γωνιακά»",
];
let roundTripped = 0;
for (const sample of SAMPLES) {
  const back = decodeSharePayload(encodeSharePayload({ text: sample }));
  if (back?.text === sample) roundTripped++;
  else console.log(`        MANGLED: ${JSON.stringify(sample)} -> ${JSON.stringify(back?.text)}`);
}
check(`all ${SAMPLES.length} samples survive encode → decode`, roundTripped === SAMPLES.length);

check(
  "the encoding contains nothing that could end a fragment",
  SAMPLES.every((s) => !/[#&=?/+]/.test(encodeSharePayload({ text: s })))
);

console.log("\n== 4. reading it back off the location hash ==");
const hash = `#${SHARE_HASH_KEY}=${encodeSharePayload({ text: "Τα έσοδα #Q3" })}`;
check("with the leading '#'", readSharedTextFromHash(hash) === "Τα έσοδα #Q3");
check("without it", readSharedTextFromHash(hash.slice(1)) === "Τα έσοδα #Q3");
check("alongside another fragment parameter", readSharedTextFromHash(`#tab=files&${hash.slice(1)}`) === "Τα έσοδα #Q3");

console.log("\n== 5. a corrupt fragment is IGNORED, never shown as content ==");
// A half-copied URL must not put base64 gibberish into the user's input
// box, and must never throw inside a layout effect.
for (const bad of ["", "#", "#share=", "#share=!!!!", "#share=" + btoa("not json"), "#other=abc", "#share=" + encodeSharePayload({}) ]) {
  const got = readSharedTextFromHash(bad);
  check(`${JSON.stringify(bad).slice(0, 28)} → null`, got === null, JSON.stringify(got));
}
check(
  "a decoded payload that is not an object → null",
  decodeSharePayload(encodeSharePayload("just a string")) === null
);
check(
  "non-string fields are dropped rather than trusted",
  JSON.stringify(
    decodeSharePayload(Buffer.from(JSON.stringify({ text: 42, url: { a: 1 }, title: "ok" })).toString("base64url"))
  ) === JSON.stringify({ title: "ok" })
);

console.log("\n== 6. length is bounded ==");
const huge = "x".repeat(MAX_SHARED_TEXT * 3);
check(`composed text is capped at ${MAX_SHARED_TEXT}`, composeSharedText({ text: huge }).length === MAX_SHARED_TEXT);

console.log("\n== 7. the manifest and the route agree ==");
// A share target is a contract between three files. If the manifest names
// an action the app does not serve, the OS offers Ionexa in the share
// sheet and the share lands on a 404.
const manifest = readFileSync("src/app/manifest.ts", "utf8");
const route = readFileSync("src/app/share/route.ts", "utf8");
check("the manifest declares a share_target", /share_target:/.test(manifest));
check("...pointing at /share", /action:\s*"\/share"/.test(manifest));
check("...by POST (the only method that can carry files)", /method:\s*"POST"/.test(manifest));
check("...as multipart/form-data", /enctype:\s*"multipart\/form-data"/.test(manifest));
check('...with a files param named "files"', /name:\s*"files"/.test(manifest));
check("src/app/share/route.ts exports POST", /export async function POST/.test(route));
check("...and reads the SAME field name", /getAll\("files"\)/.test(route));
// Stronger than "a 303 appears somewhere": there is exactly ONE redirect
// in the file, every exit goes through it, and it is a 303. A share is a
// POST — any other redirect code leaves the method as POST, so reloading
// the landing page re-submits the share and uploads the files again.
const redirectCalls = [...route.matchAll(/NextResponse\.redirect\(/g)].length;
check("there is exactly ONE redirect in the route", redirectCalls === 1, `found ${redirectCalls}`);
check(
  "...and it is a 303",
  /NextResponse\.redirect\(new URL\(path, getSiteUrl\(\)\), 303\)/.test(route)
);
const helperReturns = [...route.matchAll(/return NextResponse/g)].length;
const viaHelper = [...route.matchAll(/return seeOther\(/g)].length;
check(
  "...the only `return NextResponse` is the helper itself",
  helperReturns === 1,
  `found ${helperReturns}`
);
check(
  `...and every other exit goes through seeOther (${viaHelper} of them)`,
  viaHelper >= 6,
  `found ${viaHelper}`
);
check(
  "...and refuses a signed-out share rather than dropping it silently",
  /login\?shared=1/.test(route)
);
check(
  "...and goes through the same ingest as an ordinary upload",
  /ingestFileBytes/.test(route) && /checkRateLimit/.test(route)
);

// The accepted types are a promise to the operating system. Offering one
// the Files workspace refuses puts Ionexa in the share sheet for files it
// is about to reject.
const fileTypes = readFileSync("src/lib/files/file-types.ts", "utf8");
const kinds = [...fileTypes.matchAll(/^\s{2}(pdf|docx|xlsx|txt|csv|md):\s*\[([^\]]*)\]/gm)].flatMap((m) =>
  [...m[2].matchAll(/"(\.[a-z]+)"/g)].map((e) => e[1])
);
const declared = [...manifest.matchAll(/"(\.[a-z]+)"/g)].map((m) => m[1]);
const missing = kinds.filter((ext) => !declared.includes(ext));
check(
  `every extension the app accepts is offered (${kinds.length} kinds)`,
  kinds.length > 0 && missing.length === 0,
  `not offered: ${missing.join(", ")}`
);
const overPromised = [...new Set(declared)].filter((ext) => !kinds.includes(ext));
check(
  "and nothing is offered that the app would refuse",
  overPromised.length === 0,
  `promised but unsupported: ${overPromised.join(", ")}`
);

console.log("\n== 8. file_handlers keeps the same promise ==");
check("the manifest declares file_handlers", /file_handlers:/.test(manifest));
check("...landing on the Files workspace", /action:\s*"\/dashboard\/files"/.test(manifest));
const workspace = readFileSync("src/components/files/files-workspace.tsx", "utf8");
check(
  "...and the Files workspace actually consumes launchQueue",
  /launchQueue/.test(workspace) && /setConsumer/.test(workspace)
);
check(
  "...reading each handle into a real File before uploading",
  /getFile\(\)/.test(workspace)
);
check(
  "...through the same uploadMany as a drag-and-drop",
  /await uploadMany\(opened\)/.test(workspace)
);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
