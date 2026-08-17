// RENAMING A CONVERSATION, AND HOW MANY MAY BE PINNED.
//
// Both used to be direct client updates against chat_conversations. RLS
// made them SAFE — one account cannot touch another's row — but neither
// had any rule beyond ownership: nothing capped the number of pins, and
// nothing capped the length of a title. A limit that lives only in the
// UI is not a limit; it is a habit the next client to be written will
// not inherit.
//
// So the questions this file asks are about WHERE the rules live, not
// whether the strings exist:
//
//   · the cap is decided by the route, from the plan, not by the sidebar
//   · unpinning is never refused, so a lowered limit cannot trap an
//     account above it
//   · the pin cap fails as a tidiness problem, never as an upgrade prompt
//   · the input and the server read the SAME 100, so nothing the user
//     typed disappears on save
//   · Escape cancels, and cannot be undone by the blur that cancelling
//     causes
//
// Run: node scripts/tests/conversation-limits.test.mjs
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

const { loadTs } = await import("./load-ts.mjs");
const { DEFAULT_PIN_LIMITS, PIN_LIMIT_ENV_VARS, parsePinLimits } = await loadTs(
  "src/lib/chat/pin-limits.ts"
);
const { MAX_CONVERSATION_TITLE_LENGTH, normaliseConversationTitle } = await loadTs(
  "src/lib/chat/conversation-title.ts"
);

const routeSrc = readFileSync("src/app/api/conversations/[id]/route.ts", "utf8");
const sidebarSrc = readFileSync("src/components/chat/conversation-sidebar.tsx", "utf8");
const workspaceSrc = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");
// Comments quote the very things these checks look for ("chat_conversations",
// "update"), so scanning the raw file would find the explanation rather
// than the code. Stripped before any "does the code do X" question.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const routeCode = stripComments(routeSrc);
const sidebarCode = stripComments(sidebarSrc);
const workspaceCode = stripComments(workspaceSrc);

console.log("== 1. the numbers the batch asked for ==");
const REQUIRED = { free: 3, starter: 10, growth: 25, professional: 50, ultimate: 100 };
for (const [slug, expected] of Object.entries(REQUIRED)) {
  check(`${slug} keeps ${expected} pinned`, DEFAULT_PIN_LIMITS[slug] === expected, `got ${DEFAULT_PIN_LIMITS[slug]}`);
}
// Enterprise was not in the brief. It exists as a plan, so it needs an
// answer — and "unlimited" is not one, because the sidebar argument that
// justifies the cap applies to a contract account exactly as much.
check(
  "enterprise has a real number too, not unlimited",
  Number.isInteger(DEFAULT_PIN_LIMITS.enterprise) && DEFAULT_PIN_LIMITS.enterprise > 0
);
// A cap that does not rise with the plan is a cap nobody notices being
// generous. Checked as an ordering rather than as six more literals.
const ORDER = ["free", "starter", "growth", "professional", "ultimate"];
checkList(
  "each plan keeps at least as many as the one below it",
  ORDER.slice(1).filter((slug, i) => DEFAULT_PIN_LIMITS[slug] < DEFAULT_PIN_LIMITS[ORDER[i]])
);

console.log("\n== 2. env-overridable, and a bad value is visible ==");
checkList(
  "every plan has an env var",
  Object.keys(DEFAULT_PIN_LIMITS).filter((slug) => !PIN_LIMIT_ENV_VARS[slug])
);
check("an override is honoured", parsePinLimits({ PIN_LIMIT_FREE: "7" }).limits.free === 7);
check("zero is allowed — a tier may have pinning off", parsePinLimits({ PIN_LIMIT_FREE: "0" }).limits.free === 0);
check("an unset var leaves the default", parsePinLimits({}).limits.growth === DEFAULT_PIN_LIMITS.growth);
check("an empty var leaves the default", parsePinLimits({ PIN_LIMIT_GROWTH: "  " }).limits.growth === DEFAULT_PIN_LIMITS.growth);
for (const [value, why] of [
  ["nine", "not a number"],
  ["2.5", "not whole"],
  ["-1", "negative"],
  ["100000", "absurd"],
]) {
  const { limits, warnings } = parsePinLimits({ PIN_LIMIT_FREE: value });
  check(
    `"${value}" (${why}) falls back AND warns`,
    limits.free === DEFAULT_PIN_LIMITS.free && warnings.some((w) => w.value === value),
    JSON.stringify({ limit: limits.free, warnings })
  );
}
// The point of warning rather than clamping: a clamped value looks
// deliberate forever, a warned one is a line in the log.
check("a bad value is never silently clamped into range", parsePinLimits({ PIN_LIMIT_FREE: "100000" }).limits.free !== 1000);
const envExample = readFileSync(".env.local.example", "utf8");
checkList(
  "every var is documented in .env.local.example",
  Object.values(PIN_LIMIT_ENV_VARS).filter((v) => !envExample.includes(`${v}=`))
);

console.log("\n== 3. the cap is enforced by the server, not the sidebar ==");
check("the route resolves the plan", /resolveEffectivePlanSlug/.test(routeCode));
check("and asks pin-limits for the number", /pinLimitFor\(/.test(routeCode));
check("it counts what is already pinned", /is_pinned["'`]?,\s*true\)|eq\("is_pinned", true\)/.test(routeCode));
// Counted excluding the row being changed: an account sitting exactly on
// the limit must still be able to re-pin something already pinned.
check("counted excluding the conversation being changed", /\.neq\("id", params\.id\)/.test(routeCode));
// The one that matters most. Unpinning is never checked against the cap,
// or lowering a limit locks the account above it forever.
check("the cap is checked only when pinning", /if \(pinned\) \{/.test(routeCode));
check("the client no longer writes is_pinned straight to the table", !/from\("chat_conversations"\)[\s\S]{0,200}is_pinned/.test(workspaceCode));
check("it PATCHes the route instead", /fetch\(`\/api\/conversations\/\$\{id\}`/.test(workspaceCode));
// RLS is still the ownership control, and the route says so rather than
// pretending its own .eq is what keeps accounts apart.
check("ownership is still checked server-side", /\.eq\("user_id", user\.id\)/.test(routeCode));
check("and unauthenticated callers are refused", /fail\("not_authenticated", 401\)/.test(routeCode));

console.log("\n== 4. running out of pins is not a billing event ==");
check("the route returns the cap and the count", /fail\("pin_limit", 409, \{ limit, pinned/.test(routeCode));
check("as 409, not 402", /"pin_limit", 409/.test(routeCode) && !/402/.test(routeCode));
check("the client shows the numbers", /code === "pin_limit"/.test(workspaceCode) && /limit: data\.limit/.test(workspaceCode));
// Every locale has to say "unpin one", and none of them may reach for
// the upgrade vocabulary — that is the difference between a tidiness
// limit and a paywall, and it is invisible in code review.
const UPGRADE_WORDS =
  /\b(upgrade|upgrading|plan up|subir de plan|mejora tu plan|passez à|améliorez votre|upgraden|aggiorna il piano|fazer upgrade)\b|αναβάθμισ|升级|アップグレード|ترقية/i;
const missing = [];
const sellsAnUpgrade = [];
for (const locale of LOCALES) {
  const chat = messages[locale].dashboard.chat;
  for (const key of ["pinLimitReached", "pinError", "renameError", "renameLabel"]) {
    if (typeof chat[key] !== "string" || chat[key].length === 0) missing.push(`${locale}.${key}`);
  }
  if (typeof chat.pinLimitReached === "string" && UPGRADE_WORDS.test(chat.pinLimitReached)) {
    sellsAnUpgrade.push(locale);
  }
}
checkList("all four strings exist in all ten locales", missing);
checkList("no locale turns the pin cap into an upgrade prompt", sellsAnUpgrade);
checkList(
  "every locale puts the actual number in the sentence",
  LOCALES.filter((l) => !messages[l].dashboard.chat.pinLimitReached.includes("{limit}"))
);
// A user who is told the limit but not the way out is told nothing they
// can act on. Checked in English against the verb; elsewhere against the
// string simply not being the English one.
check("en says what to do about it", /unpin/i.test(messages.en.dashboard.chat.pinLimitReached));
checkList(
  "and no other locale is left in English",
  LOCALES.filter((l) => l !== "en").filter(
    (l) => messages[l].dashboard.chat.pinLimitReached === messages.en.dashboard.chat.pinLimitReached
  )
);

console.log("\n== 5. one hundred characters, in one place ==");
check("the limit is 100", MAX_CONVERSATION_TITLE_LENGTH === 100);
check("the input caps at the shared constant", /maxLength=\{MAX_CONVERSATION_TITLE_LENGTH\}/.test(sidebarCode));
check("and the route normalises through the same module", /normaliseConversationTitle\(raw\)/.test(routeCode));
// The failure this prevents: two literal 100s that drift apart, so the
// box accepts text the server then throws away without saying so.
checkList(
  "neither side carries its own copy of the number",
  [
    ["route", /slice\(0,\s*100\)|length > 100/.test(routeCode)],
    ["sidebar", /maxLength=\{100\}|maxLength="100"/.test(sidebarCode)],
  ]
    .filter(([, bad]) => bad)
    .map(([where]) => where)
);
check("a long title is trimmed, not refused", normaliseConversationTitle("x".repeat(400)).length === 100);
check("whitespace is collapsed, so a pasted newline cannot stretch the row", normaliseConversationTitle("a\n\n  b") === "a b");
check("a blank title normalises to empty", normaliseConversationTitle("   \n ") === "");
check("and the route refuses that rather than storing it", /if \(!title\) \{\s*return fail\("title_empty", 400\)/.test(routeCode));
check("a title survives unchanged when it is already fine", normaliseConversationTitle("  Quarterly plan ") === "Quarterly plan");

console.log("\n== 6. inline edit: two ways in, autosave, Escape out ==");
check("double-click starts a rename", /onDoubleClick=\{\(\) => startRename\(conversation\)\}/.test(sidebarCode));
check('the "..." menu still does too', /onClick=\{\(\) => startRename\(conversation\)\}/.test(sidebarCode));
check("leaving the field saves", /onBlur=\{commitRename\}/.test(sidebarCode));
check("Enter saves", /e\.key === "Enter"/.test(sidebarCode));
// Anchored to the KEY HANDLER, not to the mere presence of the function
// somewhere in the file — the first version of this assertion passed
// against a build where the handler had been changed back to a bare
// setRenamingId(null) and cancelRename was left behind unused.
check("Escape cancels", /e\.key === "Escape"\)\s*\{[\s\S]{0,120}?cancelRename\(\);/.test(sidebarCode));
// THE SUBTLE ONE. Cancelling unmounts the input, and leaving the input
// is what triggers autosave — so without a flag, Escape would save the
// text it was meant to discard.
check("and cancelling cannot be undone by the blur it causes", /cancelledRef/.test(sidebarCode) && /if \(cancelledRef\.current\)/.test(sidebarCode));
check("the field is labelled for screen readers", /aria-label=\{t\("renameLabel"/.test(sidebarCode));
check("the rename goes through the route", /fetch\(`\/api\/conversations\/\$\{id\}`[\s\S]{0,200}JSON\.stringify\(\{ title \}\)/.test(workspaceCode));
// The server trims; if the client kept its own optimistic string the
// sidebar would show 120 characters of a title the database stored as
// 100 until the next reload.
check("and the saved row is echoed back over the optimistic title", /data\.conversation\.title/.test(workspaceCode));
check("a failed rename puts the old name back", /previousTitle/.test(workspaceCode));
check("a failed pin puts the old state back", /revert\(\)/.test(workspaceCode));

console.log("\n== 7. no English error reaches a Greek sidebar ==");
// Every other route in this app answers with an English sentence that the
// client prints verbatim; i18n-coverage.test.mjs counts them because that
// is a known gap, and the fix it names is stable error CODES with the
// wording owned by the client. This route is small enough to have been
// written that way from the start, and these two checks are what stop it
// drifting back — the failure they prevent is a Greek user reading "Could
// not update the conversation."
checkList(
  "the route returns no English prose at all",
  [...routeCode.matchAll(/error: "[A-Z][^"]{8,}"/g)].map((m) => m[0])
);
check("every failure is an identifier", /type ConversationErrorCode/.test(routeSrc) && /return fail\(/.test(routeCode));
// Scoped to the two functions that talk to this route. The rest of the
// component still surfaces other routes' English prose, which is the
// app-wide gap i18n-coverage.test.mjs already counts — asserting it here
// would be asserting someone else's work.
const pinAndRename = workspaceCode.slice(
  workspaceCode.indexOf("async function togglePin"),
  workspaceCode.indexOf("async function deleteConversation")
);
check("the slice really covers both functions", pinAndRename.includes("renameConversation") && pinAndRename.length > 400);
check(
  "and the client never renders the server's own words",
  !/getErrorMessage\(|data\?\.error|data\.error/.test(pinAndRename)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
