/*
 * IONEXA IN TELEGRAM, κομμάτι 1 — ONE CHAT, ONE ACCOUNT, AND A SECOND
 * PRESS BEFORE EITHER CAN COMMAND THE OTHER (the owner's "24. IONEXA ΣΤΟ
 * TELEGRAM", 2026-10-31).
 *
 * Run: node scripts/tests/telegram-link.test.mjs
 *
 * Section 1 RUNS src/lib/telegram/pairing.ts and src/lib/pairing-code.ts
 * rather than reading them, for the reason iowork-pairing.test.mjs §1
 * gives about the same code: an alphabet that still contains O, or a
 * normaliser that accepts seven characters, is invisible to any grep and
 * fatal to the rule it is meant to enforce.
 *
 * Section 2 is the one that cost the most thought. chat_id_fingerprint is
 * the only searchable shape a chat id is allowed to take, and a PLAIN
 * sha256 would have looked identical in every structural check while
 * being, for a value with about 34 bits of real range, the chat id itself.
 * So §2 proves the function is KEYED by running it under two different
 * keys and requiring different answers — a property no regex can see.
 *
 * Section 8 ranges rather than lists: it greps the route for every `code:`
 * it can answer with and requires words in all ten languages. A hand list
 * would go stale the first time the route learned a new refusal; the route
 * is the population.
 */
import { readFileSync, existsSync } from "node:fs";
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

const read = (p) => readFileSync(p, "utf8");
/** The source with every comment gone. These files argue for themselves at
 *  length — the route's own doc comment contains the words "service-role",
 *  "confirm" and "webhook" — and a check a comment can satisfy is a check
 *  a comment can also break. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const code = (p) => stripComments(read(p));

const ROUTE = "src/app/api/telegram/link/route.ts";
const STATE = "src/lib/telegram/link-state.ts";
const IDENTITY = "src/lib/telegram/identity.ts";
const PAIRING = "src/lib/telegram/pairing.ts";
const SHARED = "src/lib/pairing-code.ts";
const SHELL = "src/components/integrations/telegram-connect.tsx";
const DETAILS = "src/components/integrations/connection-details.tsx";
const PAGE = "src/app/dashboard/integrations/page.tsx";
const MIGRATION = "supabase/migrations/20261031000001_telegram_link.sql";
const CRON = "src/app/api/cron/scheduled-runs/route.ts";
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

const T = await loadTs(PAIRING);

console.log("\n== 1. the code and the clock, by running them ==");
{
  const codes = Array.from({ length: 200 }, () => T.newPairingCode());
  check("a code is eight characters", codes.every((c) => c.length === 8));
  check("every character is in the alphabet", codes.every((c) => [...c].every((ch) => T.PAIRING_ALPHABET.includes(ch))));
  check("200 codes are not all the same", new Set(codes).size > 190, `${new Set(codes).size} distinct`);
  const c = T.newPairingCode();
  check("the dash the screen shows is accepted back", T.normalisePairingCode(T.formatPairingCode(c)) === c);
  check("lower case is accepted", T.normalisePairingCode(c.toLowerCase()) === c);

  // THE TEN MINUTES, both ways, with the clock passed in.
  const now = Date.UTC(2026, 9, 31, 12, 0, 0);
  const iso = (ms) => new Date(ms).toISOString();
  check("a fresh pairing is not expired", T.isTelegramPairingExpired(iso(now - 60_000), now) === false);
  check("nine minutes is still alive", T.isTelegramPairingExpired(iso(now - 9 * 60_000), now) === false);
  check("eleven minutes is dead", T.isTelegramPairingExpired(iso(now - 11 * 60_000), now) === true);
  check("the window is ten minutes, as the owner asked", T.TELEGRAM_PAIRING_TTL_MINUTES === 10);
  // FAILS CLOSED. The opposite reads better and is worse: a row whose
  // created_at somehow arrived unreadable would be a code that never dies.
  check("an unreadable date is treated as EXPIRED, never as fresh", T.isTelegramPairingExpired("not a date", now) === true);
  check("...and its countdown is zero, not NaN", T.telegramPairingSecondsLeft("not a date", now) === 0);
  check("the countdown never goes below zero", T.telegramPairingSecondsLeft(iso(now - 60 * 60_000), now) === 0);
  check("the countdown agrees with the expiry at nine minutes", T.telegramPairingSecondsLeft(iso(now - 9 * 60_000), now) === 60);

  // WHAT ARRIVES FROM TELEGRAM IS WHOEVER OWNS THAT TELEGRAM ACCOUNT.
  check("a control character never survives into a name", T.parseTelegramName("A\u0000B\u001bC") === "ABC");
  check("a newline becomes one readable space", T.parseTelegramName("A\nB") === "A B");
  check("a name is bounded", (T.parseTelegramName("x".repeat(400)) ?? "").length === T.MAX_TELEGRAM_NAME_CHARS);
  check("an empty name is null, not an empty label", T.parseTelegramName("   ") === null);
  check("a non-string name is null", T.parseTelegramName(42) === null);
  check("a username loses its @", T.parseTelegramUsername("@eliasg") === "eliasg");
  check("a four-character username is not one", T.parseTelegramUsername("abcd") === null);
  check("a username with a dot is refused rather than shown", T.parseTelegramUsername("a.bcdef") === null);

  // THE DEEP LINK, AND THE TWO CASES WHERE IT MUST NOT BE BUILT.
  check("the deep link carries the raw code", T.telegramDeepLink("IonexaBot", "ABCDEF23") === "https://t.me/IonexaBot?start=ABCDEF23");
  check("no bot username means no link, never t.me/null", T.telegramDeepLink(null, "ABCDEF23") === null);
  check("a bot username Telegram would not have is refused", T.telegramDeepLink("no.such.bot", "ABCDEF23") === null);
  check("a code that is not a code builds no link", T.telegramDeepLink("IonexaBot", "oops") === null);
}

console.log("\n== 2. the chat id is KEYED, not merely hashed ==");
{
  // The property that matters cannot be seen in the source: run it.
  const KEY_A = "0123456789abcdef".repeat(4);
  const KEY_B = "fedcba9876543210".repeat(4);
  const I = await loadTs(IDENTITY);

  process.env.INTEGRATION_ENCRYPTION_KEY = KEY_A;
  I.__resetTelegramKeyForTest();
  const underA = I.chatIdFingerprint("424242");
  const underAagain = I.chatIdFingerprint("424242");
  const otherChat = I.chatIdFingerprint("424243");

  process.env.INTEGRATION_ENCRYPTION_KEY = KEY_B;
  I.__resetTelegramKeyForTest();
  const underB = I.chatIdFingerprint("424242");

  check("the same chat id always fingerprints the same", underA === underAagain);
  check("a different chat id fingerprints differently", underA !== otherChat);
  // THE WHOLE POINT. A Telegram id lives inside about 2^34, so a plain
  // digest in a leaked backup IS the chat id. Under a different key the
  // same id must land somewhere else, or the key is not being used.
  check("a different key gives a different fingerprint, so the key is load-bearing", underA !== underB,
    `${underA.slice(0, 16)} vs ${underB.slice(0, 16)}`);
  const crypto = await import("node:crypto");
  const plain = crypto.createHash("sha256").update("424242").digest("hex");
  check("...and it is NOT sha256(chatId), which would be reversible by enumeration", underA !== plain && underB !== plain);
  check("a number and its string fingerprint alike", I.chatIdFingerprint(424242) === I.chatIdFingerprint("424242"));
  check("the fingerprint is hex, 64 characters", /^[0-9a-f]{64}$/.test(underB));
  let threw = false;
  try { I.chatIdFingerprint("   "); } catch { threw = true; }
  check("an empty chat id throws rather than fingerprinting nothing", threw);
  process.env.INTEGRATION_ENCRYPTION_KEY = KEY_A;
  I.__resetTelegramKeyForTest();
}

console.log("\n== 3. the migration says what it does and how to undo it ==");
{
  const sql = read(MIGRATION);
  check("it creates the link table", /create table if not exists public\.telegram_links/.test(sql));
  check("it creates the pairings table", /create table if not exists public\.telegram_pairings/.test(sql));
  check("it says how to undo", /-- How to undo:/.test(sql));
  // ONE ACCOUNT, ONE CHAT — in the schema, not in a route.
  check("one account has at most one chat: user_id is the primary key", /user_id uuid primary key references auth\.users\(id\) on delete cascade/.test(sql));
  // ONE CHAT, ONE ACCOUNT — the constraint that stops a linked chat
  // adopting a second account, which no route check could guarantee.
  check("one chat commands at most one account: the fingerprint is unique", /chat_id_fingerprint text not null unique/.test(sql));
  check("the chat id is also kept encrypted, so a message can still be sent", /chat_id_encrypted text not null/.test(sql));
  check("a group can never be written as a link", /check \(chat_kind = 'private'\)/.test(sql));
  check("both tables have row level security", (sql.match(/alter table public\.telegram_\w+ enable row level security/g) ?? []).length === 2);
  check("the account may read its own link", /create policy "select_own_telegram_link"/.test(sql));
  check("...and delete it, which is what Disconnect does", /create policy "delete_own_telegram_link"/.test(sql));
  // A browser that could INSERT could point this at a chat it does not hold.
  check("the account may not write a link itself", /revoke insert, update on public\.telegram_links from anon, authenticated;/.test(sql));
  // A pending code readable from a browser is a code that can be harvested.
  check("a pending pairing is unreachable from any browser", /revoke all on public\.telegram_pairings from anon, authenticated;/.test(sql));
  check("no policy is created on the pairings table at all", !/create policy[^;]*telegram_pairings/.test(sql));
  check("a pairing knows its account from the moment it exists", /user_id uuid not null references auth\.users\(id\) on delete cascade/.test(sql));
  check("the confirm has a column to spend", /confirmed_at timestamptz/.test(sql));
  check("the chat that presented a code is recorded before anything is linked", /presented_at timestamptz/.test(sql));
  check("both names arriving from Telegram are length-bounded", (sql.match(/length\((?:telegram_username|telegram_name)\) <= \d+/g) ?? []).length === 4);
}

console.log("\n== 4. the route: signed in, switched on, bounded — in that order ==");
{
  const src = code(ROUTE);
  check("a session is established before anything else", /supabase\.auth\.getUser\(\)/.test(src));
  check("no session is a 401", /code: "not_signed_in" \}, \{ status: 401 \}/.test(src));
  check("the switch is read with the user", /isFeatureOn\("telegram-bot", user\)/.test(src));
  check("...and refuses with a 403", /code: "not_enabled" \}, \{ status: 403 \}/.test(src));
  // BOTH of them. Checking that the scope appears at all passed while
  // POST's had been emptied and only DELETE's remained — found by
  // telegram-link.mutation.mjs on 2026-10-31.
  check("every acting call is rate limited, POST and DELETE alike",
    (src.match(/scope: "telegram_link_act"/g) ?? []).length === 2,
    `${(src.match(/scope: "telegram_link_act"/g) ?? []).length} of 2`);
  check("...and the limiter's answer is branched on", /if \(!allowed\) return NextResponse\.json\(\{ ok: false, code: "rateLimited" \}/.test(src));
  check("it logs through logApiError", /logApiError\("\/api\/telegram\/link"/.test(src));
  check("it declares itself dynamic", /export const dynamic = "force-dynamic"/.test(src));
  // THE EXEMPTION IT DOES NOT TAKE. All eight service-role exemptions are
  // spoken for (owner-only-access.test.mjs §4b, cap 8); this route earns
  // its admin client by establishing the session itself.
  check("it takes no service-role exemption", !/^[ \t]*(?:\/\/|\*)[ \t]*@service-role-justified/m.test(read(ROUTE)));
  check("...and every admin query it makes is filtered on the caller", (src.match(/\.eq\("user_id", userId\)/g) ?? []).length >= 3);
  check("the route answers with codes, never English prose", !/\berror: "/.test(src));
}

console.log("\n== 5. presenting a code links nothing; a signed-in confirm does ==");
{
  const src = code(ROUTE);
  // THE SINGLE DEFENCE AGAINST A LEAKED CODE. The code travels through a
  // human into a chat and can be forwarded or asked for; what an attacker
  // cannot reach is this call.
  check("confirm is its own action, separate from start", /action === "confirm"|return await confirmPairing/.test(src));
  check("only a pairing a chat has PRESENTED can be confirmed", /\.not\("presented_at", "is", null\)/.test(src));
  // Single use by compare-and-swap, read back — Postgres does not error on
  // an update that matched zero rows, so "no error" is not "it was mine".
  check("the confirm is a compare-and-swap on confirmed_at", /\.is\("confirmed_at", null\)\s*\n\s*\.select\("id"\)/.test(src));
  check("...and a zero-row update is a refusal, not a fabricated success",
    /if \(!spent \|\| spent\.length === 0\) \{\s*\n\s*return NextResponse\.json\(\{ ok: false, code: "nothing_to_confirm" \}, \{ status: 404 \}\);/.test(src));
  check("an expired pairing cannot be confirmed", /isTelegramPairingExpired\(pairing\.created_at\)/.test(src));
  // THE CONDITION, not the message. `(count ?? 0) > 99` left the refusal
  // string in place and the check green — found by the mutation suite.
  check("starting twice over a live link is refused rather than overwriting it",
    /if \(\(count \?\? 0\) > 0\) return NextResponse\.json\(\{ ok: false, code: "already_linked" \}, \{ status: 409 \}\);/.test(src));
  check("no code is minted when there is no bot to open", /code: "bot_unavailable" \}, \{ status: 503 \}/.test(src));
  check("...nor when the key that stores a chat safely is missing", /code: "encryption_unavailable" \}, \{ status: 503 \}/.test(src));
  check("cancel kills every live code of that account, not just the one on screen",
    /\.from\("telegram_pairings"\)\s*\n\s*\.delete\(\)\s*\n\s*\.eq\("user_id", userId\)\s*\n\s*\.is\("confirmed_at", null\)/.test(src));
  // Disconnect must be a delete: a flag is a second check that can be
  // forgotten, and the fingerprint has to stop matching.
  check("disconnect deletes the link row", /\.from\("telegram_links"\)\.delete\(\)\.eq\("user_id", user\.id\)/.test(src));
  check("...and takes any half-finished code with it", /DELETE\(\)[\s\S]{0,900}telegram_pairings[\s\S]{0,200}\.delete\(\)/.test(src));
}

console.log("\n== 6. no chat id, in any shape, ever reaches a browser ==");
{
  const state = code(STATE);
  const route = code(ROUTE);
  const shell = code(SHELL);
  // The two unreadable shapes are the two that must not be selected into
  // anything a browser receives.
  check("the state reader never selects the fingerprint", !/select\([^)]*chat_id_fingerprint/.test(state));
  check("...nor the ciphertext", !/select\([^)]*chat_id_encrypted/.test(state));
  // THE ROUTE DOES touch both — the confirm copies them from the pairing
  // row into the link row, server side. The claim that matters is
  // narrower and is the one checked here: neither ever appears inside a
  // RESPONSE. Every NextResponse.json payload in the file is extracted by
  // balancing parentheses, rather than grepped for, because a value added
  // to a multi-line payload would be invisible to a line-wise regex.
  const payloads = [];
  for (let i = route.indexOf("NextResponse.json("); i !== -1; i = route.indexOf("NextResponse.json(", i + 1)) {
    let depth = 0;
    const from = i + "NextResponse.json(".length;
    let j = from;
    for (; j < route.length; j++) {
      if (route[j] === "(") depth++;
      else if (route[j] === ")") { if (depth === 0) break; depth--; }
    }
    payloads.push(route.slice(from, j));
  }
  check(`every response payload was read (${payloads.length})`, payloads.length >= 14,
    "an empty list would make the next check pass on nothing");
  const leaks = payloads.filter((b) => /chat_id_fingerprint|chat_id_encrypted/.test(b));
  check("no chat id, in either shape, is ever inside a response", leaks.length === 0, leaks.join(" | "));
  check("...and the two it does read are read only to copy them into the link",
    /\.from\("telegram_links"\)\.insert\(\{[\s\S]*?chat_id_fingerprint: pairing\.chat_id_fingerprint,[\s\S]*?chat_id_encrypted: pairing\.chat_id_encrypted,/.test(route));
  // THE GRANT IS MINTED BY THE SIGNED-IN PRESS, NOT BY THE WEBHOOK. A
  // webhook is reachable by anybody who can make Telegram deliver; this
  // call needs the account's own session.
  check("the link row is created inside the confirm, not anywhere else",
    (route.match(/\.from\("telegram_links"\)\.insert\(/g) ?? []).length === 1 &&
    /async function confirmPairing[\s\S]*?\.from\("telegram_links"\)\.insert\(/.test(route));
  check("a chat already commanding another account is refused, not silently re-pointed",
    /code: "chat_in_use" \}, \{ status: 409 \}/.test(route));
  check("the screen has no name for either", !/chat_id_fingerprint|chat_id_encrypted|chatId/.test(shell));
  check("what the screen shows is the Telegram name", /telegram_username, telegram_name/.test(state));
  // ONE READER, so the first paint and the poll cannot disagree about
  // whether a code is still alive.
  check("the page and the poll read the same function", /readTelegramState/.test(route) && /readTelegramState/.test(code(PAGE)));
  // GET is a single delegation and nothing else — it re-implements no
  // part of the read, which is what keeps the two answers identical.
  check("...and GET delegates to it in one line rather than re-deriving the state",
    /export async function GET\(\) \{[\s\S]*?return NextResponse\.json\(\{ ok: true, \.\.\.\(await readTelegramState\(user\)\) \}\);/.test(route));
}

console.log("\n== 7. the screen: the two lists, the honest gap, and one quiet button ==");
{
  const shell = read(SHELL);
  const shellCode = code(SHELL);
  const details = read(DETAILS);
  // The owner's «Ionexa can» / «Ionexa can't» / Recent activity /
  // Disconnect, all four, both before agreeing and after connecting.
  for (const part of ["canTitle", "cannotTitle", "activityTitle", "disconnect"]) {
    check(`the four-part block has its ${part}`, new RegExp(`${part}`).test(shellCode));
  }
  check("the can list has four promises", (shellCode.match(/t\("can\.\w+"\)/g) ?? []).length === 4);
  check("the cannot list has four refusals", (shellCode.match(/t\("cannot\.\w+"\)/g) ?? []).length === 4);
  check("nothing runs before approval is one of them", /t\("cannot\.approve"\)/.test(shellCode));
  check("...and never a key or a code in a message is another", /t\("cannot\.secrets"\)/.test(shellCode));
  check("...and private chats only is a third", /t\("cannot\.groups"\)/.test(shellCode));
  // THE HALF THAT IS NOT BUILT, LABELLED. κομμάτι 2 is the webhook; until
  // it lands, a code sent to the bot does nothing, and saying so is the
  // difference between unfinished and broken.
  check("the screen says the bot cannot answer a code yet", /t\("noWebhookYet"\)/.test(shellCode));
  check("...and that line is rendered, not merely defined", /data-testid="telegram-no-webhook-yet"/.test(shell));
  // The page spends its one filled accent control on the OAuth consent
  // panel's «Έγκριση» (one-primary-action.test.mjs holds it at 1).
  check("this section adds no second white button", !/bg-button/.test(shellCode));
  check("...and neither does the shared block", !/bg-button/.test(code(DETAILS)));
  check("the consent step exists before a code is minted", /data-testid="telegram-consent"/.test(shell));
  // The shared block's Disconnect is OPTIONAL, and the consent panel is
  // the reason: before a connection exists there is nothing to
  // disconnect, and the way out of a consent step is a plain refusal.
  check("the shared block's disconnect can be left out", /disconnectLabel\?: string;/.test(code(DETAILS)));
  check("...and the consent panel leaves it out", !/telegram-consent-details[\s\S]{0,600}onDisconnect=/.test(shellCode));
  check("...offering its own plain refusal instead", /data-testid="telegram-consent-cancel"/.test(shell));
  check("...and pressing Connect on the card opens it rather than minting", /setShowConsent\(true\)/.test(shellCode));
  check("every control is a 44px target", (shell.match(/min-h-\[44px\]/g) ?? []).length >= 6);
  check("every button says its type", (shell.match(/<button/g) ?? []).length === (shell.match(/type="button"/g) ?? []).length);
  check("disconnecting asks first", /window\.confirm\(t\("confirmDisconnect"\)\)/.test(shellCode));
  // The three presses that change something, each wired to the action it
  // names. A button that opens the right panel and calls nothing is the
  // commonest way a flow like this ships half-working.
  check("the consent button is wired to start", /onClick=\{\(\) => act\("start"\)\}/.test(shellCode));
  check("the confirm button is wired to confirm", /onClick=\{\(\) => act\("confirm"\)\}/.test(shellCode));
  check("the disconnect button is wired to disconnect", /onDisconnect=\{disconnect\}/.test(shellCode));
  // The two grants are different and the screen says so, whatever state
  // it is in — a person who ticked "notify me" has not agreed to this.
  check("the screen says this is not the notification channel", /data-testid="telegram-two-grants"/.test(shell));
  // THE SHARED BLOCK IS SHARED: CN1 adopts it for Gmail, Drive, Calendar
  // and Slack, so it must not have learned anything about Telegram.
  check("the shared details block knows nothing about Telegram", !/telegram|Telegram/i.test(details.replace(/\/\*[\s\S]*?\*\//g, "")));
  check("...and takes its strings already translated", !/useTranslations/.test(details));
}

console.log("\n== 8. every refusal the route can answer with has words, in ten languages ==");
{
  const codes = new Set();
  for (const m of read(ROUTE).matchAll(/\bcode: "([a-zA-Z_]+)"/g)) codes.add(m[1]);
  check(`the route's own refusals are the population (${codes.size})`, codes.size >= 10);
  for (const loc of LOCALES) {
    const words = JSON.parse(read(`messages/${loc}.json`)).dashboard?.integrations?.telegram ?? {};
    const missing = [...codes].filter((c) => typeof words.errors?.[c] !== "string" || words.errors[c].length === 0);
    check(`${loc}: every refusal has words (${codes.size})`, missing.length === 0, missing.join(", "));
    check(`${loc}: the two lists are translated`, [1, 2, 3, 4].every(() => true) && Object.keys(words.can ?? {}).length === 4 && Object.keys(words.cannot ?? {}).length === 4);
  }
  // A key with no reader is as silent as a key that is missing.
  const shellCode = code(SHELL);
  const declared = Object.keys(JSON.parse(read("messages/en.json")).dashboard.integrations.telegram.errors);
  const unread = declared.filter((c) => !new RegExp(`${c}: t\\("errors\\.${c}"\\)`).test(shellCode));
  check(`every refusal the words exist for is read on the screen (${declared.length})`, unread.length === 0, unread.join(", "));
}

console.log("\n== 9. the table is known to the things that sweep and watch ==");
{
  const gdpr = read("src/lib/gdpr/user-data-registry.ts");
  check("the link is in the export", /\{ table: "telegram_links", label: "telegram_links", scope: "user_content" \}/.test(gdpr));
  check("the pairings are classified as non-personal, on purpose", /"telegram_pairings",/.test(gdpr));
  // THE EXEMPTION'S OWN ARGUMENT, MADE TRUE. The registry says nothing in
  // telegram_pairings survives to be exported or erased; that is only a
  // fact while this delete exists.
  check("...and the cron actually sweeps them, which is what makes that honest",
    /\.from\("telegram_pairings"\)\s*\n\s*\.delete\(\)\s*\n\s*\.lt\("created_at", telegramPairingCutoff\)/.test(code(CRON)));
  const canaries = read("src/lib/health/schema-canaries.ts");
  for (const table of ["telegram_links", "telegram_pairings"]) {
    check(`${table} has a canary`, new RegExp(`table: "${table}",[\\s\\S]{0,160}20261031000001_telegram_link\\.sql`).test(canaries));
  }
  check("the deny-all pairings table is justified to rls-coverage", /telegram_pairings: "the ten-minute handshake/.test(read("scripts/tests/rls-coverage.test.mjs")));
  check("the switch is declared", /"telegram-bot":/.test(read("src/lib/flags/flags.ts")));
  // ...and READ where the page cannot read it (google-calendar.test.mjs
  // forbids any isFeatureOn on dashboard/integrations/page.tsx), so the
  // section is gated without weakening that rule.
  check("the state reader is what gates the section on the switch",
    /if \(!\(await isFeatureOn\("telegram-bot", user\)\)\) return null;/.test(code(STATE)));
  check("...and the Connect page still reads no switch of its own", !/isFeatureOn/.test(code(PAGE)));
  // The page must not go down when the migration has not been pasted:
  // every migration here is applied by hand (CLAUDE.md), and the whole
  // Connect page sits behind this read.
  check("a missing table degrades the section rather than 500ing the Connect page",
    /try \{\s*\n\s*telegramState = await readTelegramState\(user\);\s*\n\s*\} catch/.test(code(PAGE)));
  check("...and that fallback says 'not ready' rather than inventing a state",
    /telegramState = \{ status: "none", botUsername: null, ready: false \}/.test(code(PAGE)));
  check("the correction about Gmail's pane is written down for the owner",
    existsSync("docs/NEEDS-FROM-ELIAS.md") && /Ionexa can/.test(read("docs/NEEDS-FROM-ELIAS.md")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
