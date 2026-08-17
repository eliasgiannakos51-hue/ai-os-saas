// AN ANSWER YOU CANNOT COPY IS AN ANSWER YOU RETYPE.
//
// "Ask my documents" produced a grounded, cited answer and left it
// stranded on the page. So did every citation under it, and so did the
// text we extracted from the files themselves — the workspace would hand
// back the original PDF and never the readable text it had already
// pulled out of it. Copying existed exactly twice, both times for a URL,
// both times hand-rolled.
//
// Three things this file holds in place:
//
//   1. ONE implementation of the clipboard. Two was already one too
//      many: `navigator.clipboard` is undefined on an insecure origin
//      and can be refused by permissions policy, so a bare call inside
//      an empty catch is a button that silently does nothing on http.
//   2. VISIBLE CONFIRMATION. writeText resolves without a sound. A user
//      who cannot tell a working button from a dead one presses it four
//      times and then selects the text by hand.
//   3. THE COPY IS WORTH HAVING. An answer copied without its sources is
//      an assertion; the citations were the point.
//
// Run: node scripts/tests/copy-to-clipboard.test.mjs
import { readFileSync } from "node:fs";

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
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const buttonSrc = readFileSync("src/components/ui/copy-button.tsx", "utf8");
const button = stripComments(buttonSrc);
const workspace = stripComments(readFileSync("src/components/files/files-workspace.tsx", "utf8"));
const fileRoute = stripComments(readFileSync("src/app/api/files/[id]/route.ts", "utf8"));

console.log("== 1. one clipboard, and it survives an insecure origin ==");
// The failure this prevents by name: on plain http, or inside an iframe
// with a restrictive permissions policy, navigator.clipboard is not
// there. A bare call rejects into a catch and the button does nothing,
// forever, with no message.
check("the modern API is tried first", /navigator\.clipboard\?\.writeText/.test(button));
check("and its absence is survivable", /document\.execCommand\("copy"\)/.test(button));
// display:none and visibility:hidden both make the selection fail, which
// is the classic way this fallback stops working while looking present.
check("the fallback element is off-screen, not hidden", /position = "fixed"[\s\S]{0,120}top = "-1000px"/.test(button));
check("and it is cleaned up either way", /removeChild\(area\)/.test(button));
check("a failure returns false rather than throwing", /return false;/.test(button));
// The whole point of centralising: nothing else may talk to the
// clipboard directly, or the fallback exists for one caller.
const CLIPBOARD_USERS = [
  "src/components/files/files-workspace.tsx",
  "src/components/publishing/publish-control.tsx",
  "src/components/publishing/published-sites-list.tsx",
];
checkList(
  "no component calls navigator.clipboard itself",
  CLIPBOARD_USERS.filter((f) => /navigator\.clipboard/.test(stripComments(readFileSync(f, "utf8"))))
);
checkList(
  "and each of them goes through the shared module",
  CLIPBOARD_USERS.filter((f) => !/from "@\/components\/ui\/copy-button"/.test(readFileSync(f, "utf8")))
);
// A menu item is an onSelect callback, not a component — which is why
// the helper is exported rather than trapped inside the button.
check("the helper is exported for callers that cannot be a button", /export async function writeToClipboard/.test(button));

console.log("\n== 2. the user can tell it worked ==");
check("the label changes after a copy", /copied \? t\("copied"\) : shown/.test(button));
check("so does the icon", /const Icon = copied \? Check : Copy/.test(button));
check("and it goes back after a moment", /setTimeout\(\(\) => setCopied\(false\), 2000\)/.test(button));
// A copy button inside a row that is deleted two seconds later would
// otherwise set state on a component that is gone.
check("the timer is cleared on unmount", /return \(\) => \{\s*if \(timerRef\.current\) clearTimeout/.test(button));
// The icon swap is invisible to a screen reader, so the confirmation is
// also text — and in the icon variant it is the ONLY confirmation.
check("the confirmation is announced", /role="status" aria-live="polite"/.test(button));
check("the accessible name carries both states", /aria-label=\{copied \? t\("copied"\) : shown\}/.test(button));
// A failure has to be louder than silence.
check("a refused copy says so", /addToast\(t\("copyFailed"\), "error"\)/.test(button));
check("and copying nothing is its own message", /copyNothing/.test(button));
checkList(
  "all four strings exist in all ten locales",
  LOCALES.flatMap((l) =>
    ["copy", "copied", "copyFailed", "copyNothing"]
      .filter((k) => typeof messages[l].common[k] !== "string")
      .map((k) => `${l}.${k}`)
  )
);
// The tick is what the batch asked for by name — "Αντιγράφηκε ✓".
checkList(
  "every locale confirms with the tick",
  LOCALES.filter((l) => !messages[l].common.copied.includes("✓"))
);
// Told what to do instead, not just that it failed.
check("en's failure says what to do instead", /select the text/i.test(messages.en.common.copyFailed));
checkList(
  "and no locale is left in English",
  LOCALES.filter((l) => l !== "en").filter((l) => messages[l].common.copyFailed === messages.en.common.copyFailed)
);

console.log("\n== 3. the three things the batch named ==");
// (a) the whole answer.
check("the answer has a copy button", /data-testid="files-copy-answer"/.test(workspace));
// An answer pasted without its sources is a claim with nothing behind
// it — which is the opposite of what a citing feature is for.
check("and it takes the citations with it", /function answerForClipboard/.test(workspace));
check(
  "the sources are appended, not summarised away",
  /answer\.citations\.map\(\(c\) => `- \$\{c\.filename\} — \$\{c\.label\}`\)/.test(workspace)
);
check("an uncited answer copies as itself", /if \(answer\.citations\.length === 0\) return answer\.text;/.test(workspace));
// (b) each citation on its own.
check("every citation has its own button", /data-testid="files-copy-citation"/.test(workspace));
check("and it copies the file and the page", /text=\{`\$\{citation\.filename\} — \$\{citation\.label\}`\}/.test(workspace));
// (c) the file's text.
check("a file can hand back its text", /key: "copy-text"/.test(workspace));
check("through a route that returns it", /export async function GET/.test(fileRoute));
check("only for files we actually read", /file\.processing_status !== "ready"/.test(workspace));
checkList(
  "the three labels exist in all ten locales",
  LOCALES.flatMap((l) =>
    ["copyAnswer", "copyCitation", "copyText"]
      .filter((k) => typeof messages[l].dashboard.files[k] !== "string")
      .map((k) => `${l}.${k}`)
  )
);

console.log("\n== 4. the text route gives back text, and only yours ==");
check("ownership is filtered in the query", /\.eq\("user_id", user\.id\)/.test(fileRoute));
// A 403 for somebody else's id confirms the row exists, which is an
// existence oracle over every file in the system.
check("somebody else's id is a 404, not a 403", /code: "not_found" \}, \{ status: 404 \}/.test(fileRoute));
check("and an anonymous caller is refused", /code: "not_authenticated" \}, \{ status: 401 \}/.test(fileRoute));
// Page markers become headers rather than being stripped: text copied
// out of a 200-page manual with no page boundaries cannot be cited back.
check("page boundaries survive the copy", /--- \$\{page\.label\} ---/.test(fileRoute));
check("a file with no text is not an error", /text: "", pages: 0/.test(fileRoute));
// New handlers stop growing the English-prose count that
// i18n-coverage.test.mjs pins.
checkList(
  "the new handler returns codes, not English sentences",
  [...fileRoute.slice(fileRoute.indexOf("export async function GET")).matchAll(/error: "[A-Z][^"]{8,}"/g)].map((m) => m[0])
);
check("and the client translates them", /copyTextError|copyTextEmpty/.test(workspace));

console.log("\n== 5. the two hand-rolled copies are gone ==");
const publish = stripComments(readFileSync("src/components/publishing/publish-control.tsx", "utf8"));
const sites = stripComments(readFileSync("src/components/publishing/published-sites-list.tsx", "utf8"));
check("publish-control uses the shared button", /<CopyButton/.test(publish));
check("and no longer keeps its own copied state", !/const \[copied, setCopied\] = useState/.test(publish));
check("published-sites-list shares the clipboard", /await writeToClipboard\(site\.url\)/.test(sites));
// It keeps its own two-second state because a menu item cannot render a
// button — the thing it must NOT keep is its own clipboard call.
check("and still confirms in the menu", /setCopiedId\(site\.id\)/.test(sites));
check("its failure path survived the refactor", /addToast\(t\("copyFailed"\), "error"\)/.test(sites));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
