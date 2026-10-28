/*
 * IOWORK, Φάση 1 κομμάτι 2 — ONE COMPUTER, ONE ACCOUNT, AND NOTHING ELSE
 * (the owner's "IOWORK: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-25).
 *
 * Run: node scripts/tests/iowork-pairing.test.mjs
 *
 * Section 1 RUNS src/lib/iowork/pairing.ts rather than reading it. The
 * code a person retypes off a screen is the one low-entropy value in this
 * whole design, so what matters is what the functions actually return —
 * an alphabet that still contains the letter O, or a normaliser that
 * accepts seven characters, is invisible to any grep and fatal to the
 * rule it is supposed to enforce.
 *
 * Section 7 is the one that ranges rather than lists: it greps the two
 * routes the BROWSER calls for every `code:` they can answer with, and
 * requires each to have words in all ten languages. A hand-written list
 * of codes would go stale the first time a route learned a new refusal;
 * the routes are the population. api/iowork/pair/* is deliberately not in
 * it — those answer the desktop app, which has words of its own.
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
/**
 * THE SOURCE WITH EVERY COMMENT GONE, which is what the structural checks
 * below read. Three of them passed on their first run by matching prose
 * instead of code — the page's own doc comment contains the word `ready`,
 * and the gap between isPairingExpired and its delete is mostly a comment
 * explaining the delete. A check a comment can satisfy is a check a
 * comment can also break, and neither says anything about the code.
 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const code = (p) => stripComments(read(p));
const P = await loadTs("src/lib/iowork/pairing.ts");

const PAIR_ROUTE = "src/app/api/iowork/pair/route.ts";
const TOKEN_ROUTE = "src/app/api/iowork/pair/token/route.ts";
const DEVICES_ROUTE = "src/app/api/iowork/devices/route.ts";
const DEVICE_ROUTE = "src/app/api/iowork/devices/[id]/route.ts";
const PAGE = "src/app/dashboard/iowork/page.tsx";
const SHELL = "src/components/iowork/iowork-devices.tsx";
const MIGRATION = "supabase/migrations/20261031000000_iowork_devices.sql";
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

console.log("== 1. the code: eight characters a person can actually retype ==");
{
  const codes = Array.from({ length: 200 }, () => P.newPairingCode());
  check("every generated code is exactly PAIRING_CODE_LENGTH", codes.every((c) => c.length === P.PAIRING_CODE_LENGTH));
  const stray = codes.flatMap((c) => [...c].filter((ch) => !P.PAIRING_ALPHABET.includes(ch)));
  check(`no generated character is outside the alphabet (${stray.length} stray)`, stray.length === 0, stray.join(" "));
  // Not a randomness test — a generator stuck on one symbol, which is what
  // a broken modulo or an off-by-one slice actually produces.
  check(`200 codes are not the same code (${new Set(codes).size} distinct)`, new Set(codes).size >= 190);

  // THE RULE IS "no lookalikes", so the check ranges over the lookalikes
  // rather than spot-checking one. I/L/O/U are out of the alphabet; the
  // symbols they are mistaken for are in it, which is what makes folding
  // them in normalisePairingCode a repair and not a corruption.
  for (const ch of ["I", "L", "O", "U"]) {
    check(`the alphabet leaves out ${ch}`, !P.PAIRING_ALPHABET.includes(ch));
  }
  for (const ch of ["1", "0"]) {
    check(`...and keeps ${ch}, which is what they fold onto`, P.PAIRING_ALPHABET.includes(ch));
  }
  check("the alphabet is 32 symbols, so a byte maps on with no bias", P.PAIRING_ALPHABET.length === 32);
}

console.log("\n== 2. what a person types, turned back into what was generated ==");
{
  const code = P.newPairingCode();
  check("a generated code normalises to itself", P.normalisePairingCode(code) === code);
  check("lower case is accepted", P.normalisePairingCode(code.toLowerCase()) === code);
  check("the dash the screen shows is accepted", P.normalisePairingCode(P.formatPairingCode(code)) === code);
  check("spaces are accepted", P.normalisePairingCode(` ${code.slice(0, 4)} ${code.slice(4)} `) === code);
  check("I folds onto 1", P.normalisePairingCode("IIIIIIII") === "11111111");
  check("L folds onto 1", P.normalisePairingCode("LLLLLLLL") === "11111111");
  check("O folds onto 0", P.normalisePairingCode("OOOOOOOO") === "00000000");
  check("seven characters is not a code", P.normalisePairingCode("ABCDEFG") === null);
  check("nine characters is not a code", P.normalisePairingCode("ABCDEFGHJ") === null);
  check("a symbol outside the alphabet is refused", P.normalisePairingCode("ABCDEFG!") === null);
  check("U, left out on purpose, is refused rather than folded", P.normalisePairingCode("UUUUUUUU") === null);
  check("the empty string is not a code", P.normalisePairingCode("") === null);
  check("the formatted shape carries one dash in the middle", P.formatPairingCode("ABCD2345") === "ABCD-2345");
}

console.log("\n== 3. the two clocks, asked with an explicit now ==");
{
  const now = Date.parse("2026-10-25T12:00:00.000Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  check("a fresh pairing is not expired", P.isPairingExpired(ago(MIN), now) === false);
  check("a pairing one minute inside the window is not expired", P.isPairingExpired(ago((P.PAIRING_TTL_MINUTES - 1) * MIN), now) === false);
  check("a pairing past the window is expired", P.isPairingExpired(ago((P.PAIRING_TTL_MINUTES + 1) * MIN), now) === true);
  // An unreadable date must refuse, never allow: a row whose timestamp
  // cannot be parsed is a broken row, and the safe reading of a broken
  // row is "do not hand out a token".
  check("an unreadable date counts as expired", P.isPairingExpired("not a date", now) === true);
  check("a device seen yesterday is not idle", P.isDeviceIdle(ago(DAY), now) === false);
  check("a device seen inside the 30 days is not idle", P.isDeviceIdle(ago((P.DEVICE_IDLE_DAYS - 1) * DAY), now) === false);
  check("a device unseen past the 30 days is idle", P.isDeviceIdle(ago((P.DEVICE_IDLE_DAYS + 1) * DAY), now) === true);
  check("an unreadable last-seen counts as idle", P.isDeviceIdle("", now) === true);
  check("the window is the plan's ten minutes", P.PAIRING_TTL_MINUTES === 10);
  check("the idle window is the plan's thirty days", P.DEVICE_IDLE_DAYS === 30);
}

console.log("\n== 4. what the app may say about itself, and what is made of it ==");
{
  for (const platform of P.IOWORK_PLATFORMS) {
    check(`${platform} is accepted as a platform`, P.parsePlatform(platform) === platform);
  }
  check("the plan names two platforms and no others", P.IOWORK_PLATFORMS.length === 2);
  for (const bad of ["linux", "MAC", "", null, 7, {}]) {
    check(`${JSON.stringify(bad)} is not a platform`, P.parsePlatform(bad) === null);
  }
  check("a label is kept", P.parseDeviceLabel("Το MacBook", "Mac") === "Το MacBook");
  check("a label is trimmed and its runs of space collapsed", P.parseDeviceLabel("  a   b  ", "Mac") === "a b");
  check("an empty label falls back", P.parseDeviceLabel("   ", "Mac") === "Mac");
  check("a non-string label falls back", P.parseDeviceLabel(null, "Windows") === "Windows");
  const long = P.parseDeviceLabel("x".repeat(500), "Mac");
  check(`a long label is bounded (${long.length})`, long.length === P.MAX_DEVICE_LABEL_CHARS);
}

console.log("\n== 5. nothing is kept that could be replayed, and nothing about files ==");
{
  const sql = read(MIGRATION);
  const secret = P.newSecret();
  check("a secret is long enough to be unguessable", secret.length >= 40);
  check("two secrets differ", P.newSecret() !== P.newSecret());
  const hash = P.hashSecret(secret);
  check("a hash is a 64-character hex digest", /^[0-9a-f]{64}$/.test(hash));
  check("the same input hashes the same", P.hashSecret(secret) === hash);
  check("the hash does not contain the secret", !hash.includes(secret));

  check("the devices table stores a hash, not a token", /token_hash text not null/.test(sql) && !/\btoken text\b/.test(sql));
  check("the pairings table stores a hash, not a claim secret", /claim_secret_hash text not null/.test(sql) && !/\bclaim_secret text\b/.test(sql));
  // §4 of the approved plan: no path, no file name, nowhere.
  for (const word of ["path", "folder", "file_name", "filename", "directory"]) {
    check(`no column named for a ${word}`, !new RegExp(`^\\s+\\w*${word}\\w*\\s+(text|jsonb|uuid)`, "mi").test(sql));
  }

  // A device id that is not shaped like a uuid must never reach a query
  // (found by an independent review, 2026-10-28 — see §9 below for what
  // it protects against).
  check("a uuid shape is accepted", P.looksLikeUuid("550e8400-e29b-41d4-a716-446655440000"));
  check("a uuid shape is accepted case-insensitively", P.looksLikeUuid("550E8400-E29B-41D4-A716-446655440000"));
  for (const bad of ["not-a-uuid", "550e8400", "'; drop table iowork_devices; --", "", "550e8400-e29b-41d4-a716-44665544000"]) {
    check(`${JSON.stringify(bad.slice(0, 24))} is not a uuid shape`, !P.looksLikeUuid(bad));
  }

  // Control characters an unauthenticated caller supplies (api/iowork/pair
  // has no session) must not survive into a label the owner later reads —
  // on screen, and in logApiError's metadata on a failure.
  check("a NUL byte is stripped from a label", !P.parseDeviceLabel("a\u0000b", "Mac").includes("\u0000"));
  check("an escape character is stripped", !P.parseDeviceLabel("a\u001Bb", "Mac").includes("\u001B"));
  check("a tab becomes a space, not a deletion", P.parseDeviceLabel("a\tb", "Mac") === "a b");
  check("a newline becomes a space, not a deletion", P.parseDeviceLabel("a\nb", "Mac") === "a b");
}

console.log("\n== 6. the migration says how to undo itself and locks both tables ==");
{
  const sql = read(MIGRATION);
  check("it says how to undo", /-- How to undo:/.test(sql));
  check("the undo names both tables", /drop table if exists public\.iowork_pairings;/.test(sql) && /drop table if exists public\.iowork_devices;/.test(sql));
  check("RLS is on for the devices", /alter table public\.iowork_devices enable row level security;/.test(sql));
  check("RLS is on for the pairings", /alter table public\.iowork_pairings enable row level security;/.test(sql));
  check("the account can read its own computers", /create policy "select_own_iowork_devices"[\s\S]{0,120}auth\.uid\(\) = user_id/.test(sql));
  check("the account can disconnect its own", /create policy "delete_own_iowork_devices"[\s\S]{0,120}auth\.uid\(\) = user_id/.test(sql));
  check("the client may not write a device row", /revoke insert, update on public\.iowork_devices from anon, authenticated;/.test(sql));
  // THE POINT OF THE SECOND TABLE: no policy at all, so a pending code is
  // unreadable from any browser. A policy appearing here is the defect.
  check("no policy is created on the pairings", !/create policy "[^"]*iowork_pairings"/.test(sql));
  check("the client is revoked from the pairings entirely", /revoke all on public\.iowork_pairings from anon, authenticated;/.test(sql));
  check("the cron sweeps old pairings", /from\("iowork_pairings"\)[\s\S]{0,80}\.delete\(\)[\s\S]{0,80}\.lt\("created_at"/.test(read("src/app/api/cron/scheduled-runs/route.ts")));
  // The address a pairing was requested from, surfaced only to the signed-
  // in person previewing it (found worth adding by an independent review,
  // 2026-10-28 — the whole point of the preview step is to give the human
  // something to recognise or not).
  check("the pairing keeps the address that asked for it", /requester_ip text/.test(sql));
  check("the claim-secret lookup is actually indexed, as the route comment claims", /create unique index[^;]*on public\.iowork_pairings \(claim_secret_hash\)/.test(sql));
}

console.log("\n== 7. every refusal the browser can meet has words, in all ten languages ==");
{
  // The population is the routes, not a list written here.
  const browserRoutes = [DEVICES_ROUTE, DEVICE_ROUTE];
  const codes = new Set();
  for (const file of browserRoutes) {
    for (const m of read(file).matchAll(/\bcode: "([a-zA-Z_]+)"/g)) codes.add(m[1]);
  }
  check(`the scan found the refusals (${codes.size})`, codes.size >= 8, [...codes].join(", "));
  for (const locale of LOCALES) {
    const errors = JSON.parse(read(`messages/${locale}.json`)).dashboard?.iowork?.errors ?? {};
    const missing = [...codes].filter((c) => typeof errors[c] !== "string" || errors[c].length === 0);
    check(`${locale}: every refusal has words (${codes.size})`, missing.length === 0, missing.join(", "));
  }
  // And the screen must actually be able to say them: a key with no
  // reader is as silent as a key that is missing.
  const shell = code(SHELL);
  const unsaid = [...codes].filter((c) => !shell.includes(`t("errors.${c}")`) && !new RegExp(`t\\("errors\\.${c}"`).test(shell));
  check(`the screen reads every one of them (${codes.size})`, unsaid.length === 0, unsaid.join(", "));
}

console.log("\n== 8. the two routes the desktop app calls, and why they may skip a session ==");
{
  // The two markers ARE comments, so they are read from the raw file; the
  // behaviour below is read with the comments gone.
  check("the start route declares its reason", /@service-role-justified pre-auth/.test(read(PAIR_ROUTE)));
  check("the token route declares its reason", /@service-role-justified token-auth/.test(read(TOKEN_ROUTE)));
  const pair = code(PAIR_ROUTE);
  const token = code(TOKEN_ROUTE);
  check("the start route is rate limited", /checkRateLimit\(\{[\s\S]{0,120}scope: "iowork_pair_start"/.test(pair));
  check("the token route is rate limited", /checkRateLimit\(\{[\s\S]{0,120}scope: "iowork_pair_token"/.test(token));
  check("the start route limits by address, not by account", /identifier: getClientIp\(request\)/.test(pair));
  check(
    "the start route refuses an unknown platform",
    /\bparsePlatform\(/.test(pair) && /if \(!platform\)[\s\S]{0,120}status: 400/.test(pair)
  );
  check("the token route finds a pairing by the hash, never by the typed code", /\.eq\("claim_secret_hash", hashSecret\(claimSecret\)\)/.test(token));
  check("an expired pairing is removed rather than left holding its code", /isPairingExpired[\s\S]{0,200}\.delete\(\)/.test(token));
  check("a pairing nobody has claimed answers 'waiting', not a token", /status: "waiting"/.test(token));
  check("a pairing already collected cannot be collected twice", /collected_at[\s\S]{0,120}status: 409/.test(token));
  check("the answer names the account, so a wrong one is visible", /account: account\?\.user\?\.email/.test(token));
  check("the token is stored only as a hash", /token_hash: hashSecret\(token\)/.test(token));

  // THE RACE FIX (found by an independent review, 2026-10-28). The old
  // order — insert the device, THEN mark collected_at — let two
  // concurrent polls both pass the earlier `if (pairing.collected_at)`
  // check (read before either wrote) and both reach the insert, minting
  // two tokens from one approval. The lock now has to be the FIRST
  // database write mintDevice makes, and it has to be checked by its
  // returned rows, not by the absence of an error — Postgres does not
  // error on an UPDATE that matched nothing.
  const mint = token.slice(token.indexOf("async function mintDevice"));
  check("mintDevice's first write is the atomic collect lock", /\.from\("iowork_pairings"\)\s*\.update\(\{ collected_at:/.test(mint));
  check("...guarded so only an unclaimed row matches", /\.is\("collected_at", null\)/.test(mint));
  check("...and the result is read back, not inferred from a missing error", /\.select\("id"\)/.test(mint.slice(0, mint.indexOf("iowork_devices"))));
  check("...a zero-row result is 'already_used', not success", /if \(!claimed \|\| claimed\.length === 0\)[\s\S]{0,120}"already_used"/.test(mint));
  check(
    "the lock is acquired BEFORE the device is ever inserted",
    mint.indexOf('.update({ collected_at:') < mint.indexOf('.from("iowork_devices")\n    .insert(')
  );

  // THE KILL SWITCH (same review). Neither route has a session to put
  // through isFeatureOn, so "staff only" meant nothing to either of them
  // until they read the flag's raw audience themselves.
  for (const [name, src] of [["start", pair], ["token", token]]) {
    check(`the ${name} route reads the flag's raw audience`, /readFlagAudiences\(\)/.test(src));
    check(`...and "off" refuses before anything else runs`, /audiences\["iowork-tool"\] === "off"/.test(src));
  }
  check("the start route captures who asked", /requester_ip: requesterIp/.test(pair));

  // THE APP IS NOT A BROWSER, and these two answer it rather than a
  // person: an English sentence here would be a string the desktop app
  // had to match on, and a sentence nobody could translate. Both answer
  // with a `code`, the same way the browser's routes do.
  for (const [name, src] of [["start", pair], ["token", token]]) {
    check(`the ${name} route answers the app with codes, never English prose`, !/\berror: "/.test(src));
  }
}

console.log("\n== 9. the two routes the browser calls ==");
{
  const devices = code(DEVICES_ROUTE);
  const one = code(DEVICE_ROUTE);
  for (const [name, src] of [["list/claim", devices], ["disconnect", one]]) {
    check(`${name}: the session is established here`, /supabase\.auth\.getUser\(\)/.test(src));
    check(`${name}: no session is a 401`, /not_signed_in"[\s\S]{0,40}status: 401/.test(src));
    check(`${name}: the switch is checked`, /isFeatureOn\("iowork-tool", user\)/.test(src));
  }
  check("the claim is rate limited per account", /scope: "iowork_pair_claim"[\s\S]{0,120}identifier: user\.id/.test(devices));
  // A code somebody else already claimed must answer exactly as a code
  // that never existed, or the refusal becomes an oracle for guessing.
  check("a claimed code answers like a code that never existed", /!pairing \|\| pairing\.user_id\) return[\s\S]{0,80}"not_found"/.test(devices));
  check("the account's limit of computers is enforced at the claim", /MAX_DEVICES_PER_USER[\s\S]{0,120}"tooMany"/.test(devices));

  // THREE ACTIONS, ONE CODE (found by an independent review, 2026-10-28:
  // see docs/PROGRESS.md for the full attack). A single "type it and it's
  // connected" was a device-code-phishing hole — nothing stopped anyone
  // from starting a pairing, sending the eight characters to a real
  // account holder, and collecting a token bound to THEIR account the
  // moment they typed it. Now typing the code only PREVIEWS what it
  // claims to be; only a second, separate "confirm" binds anything, and
  // "cancel" can kill it before the ten minutes are up.
  check("there is a named action, not a bare claim", /action === "preview"/.test(devices) && /action === "cancel"/.test(devices));
  check("...and an unrecognised one is refused before any lookup", /CLAIM_ACTIONS\.includes\(action/.test(devices));
  check(
    "preview answers with what the code claims",
    /if \(action === "preview"\)[\s\S]{0,400}status: "preview"[\s\S]{0,200}requesterIp: pairing\.requester_ip/.test(devices)
  );
  check("...and that block contains no .update( or .insert( of its own", (() => {
    const start = devices.indexOf('if (action === "preview")');
    const end = devices.indexOf("if (action ===", start + 1);
    const block = devices.slice(start, end === -1 ? start + 600 : end);
    return !/\.update\(|\.insert\(/.test(block);
  })());
  check("cancel deletes the row, and only while it is still unclaimed", /action === "cancel"[\s\S]{0,200}\.delete\(\)[\s\S]{0,120}\.is\("user_id", null\)/.test(devices));
  // The bind lives in the code reached only after BOTH the preview and
  // the cancel branches have already returned — CLAIM_ACTIONS allows only
  // three values, so whatever falls through past both is confirm, named
  // or not. Checked structurally: the bind comes after both branches.
  const previewAt = devices.indexOf('if (action === "preview")');
  const cancelAt = devices.indexOf('if (action === "cancel")');
  const bindAt = devices.indexOf(".is(\"user_id\", null)");
  check("the bind sits after both the preview and the cancel branches, never before", previewAt >= 0 && cancelAt >= 0 && bindAt > previewAt && bindAt > cancelAt);
  check("the bind is still guarded so it cannot be won twice", /\.is\("user_id", null\)[\s\S]{0,40}\.select\("id"\)/.test(devices));
  // THE RACE FIX (same review): the old code trusted "no error" as
  // success, but Postgres does not error on an update that matched zero
  // rows — the loser of a race was told ok:true. Now the affected rows
  // are read back, and zero of them is a refusal.
  check(
    "a lost race is answered as not_found, not as a fabricated success",
    /if \(!claimed \|\| claimed\.length === 0\)[\s\S]{0,160}"not_found"/.test(devices)
  );

  // DISCONNECTING IS A DELETE. A flag would be a second condition some
  // later query could forget; a missing row cannot be forgotten.
  check("disconnecting deletes the row", /\.delete\(\)[\s\S]{0,120}\.eq\("user_id", user\.id\)/.test(one));
  check("...and no revoked_at flag was invented instead", !/revoked_at/.test(one) && !/revoked_at/.test(stripComments(read(MIGRATION))));
  check("another account's id deletes nothing and gets a 404", /data\.length === 0[\s\S]{0,120}status: 404/.test(one));
  // A malformed id (found by the same review) used to reach Postgres as a
  // bad uuid literal — a 500, and the caller's own string written into
  // the owner's error log through logApiError's metadata.
  check("a malformed id is refused before it ever reaches the database", /looksLikeUuid\(id\)[\s\S]{0,80}status: 404/.test(one));
}

console.log("\n== 10. the screen: behind the switch, and honest about what is missing ==");
{
  const page = code(PAGE);
  const shell = code(SHELL);
  check("the page exists", existsSync(PAGE) && existsSync(SHELL));
  check("the real screen is behind the switch", /isFeatureOn\("iowork-tool", user\)/.test(page));
  check("anyone it is not open to still sees Coming Soon", /<ComingSoonShell[\s\S]{0,120}toolKey="iowork"/.test(page));
  check("the tile stays «Σύντομα»: this page does not read `ready`", !/\bready\b/.test(page));
  check("the tile is in fact still not ready", /name: "iowork"[\s\S]{0,200}ready: false/.test(read("src/lib/nav/all-tools.ts")));
  check("the page carries its help tip", /<PageHeader[\s\S]{0,80}helpKey="help\.iowork"/.test(page));
  check("the tip is registered", /keyPrefix: "help\.iowork"/.test(read("src/lib/help-tips.ts")));

  // THE HONESTY LINE. A screen with a code field and a device list reads
  // as "install it and type this", and there is nothing to install.
  check("the screen says the app is not out yet", /t\("noAppYet"\)/.test(shell));
  for (const locale of LOCALES) {
    const m = JSON.parse(read(`messages/${locale}.json`)).dashboard?.iowork ?? {};
    check(`${locale}: that line is translated and not empty`, typeof m.noAppYet === "string" && m.noAppYet.length > 20);
    check(`${locale}: the safety line names what it never reaches`, typeof m.safetyLine === "string" && m.safetyLine.length > 40);
  }
  // THE SAFETY LINE MUST NOT CLAIM A PRESENT TENSE THE CODE DOES NOT HOLD
  // (found by an independent review, 2026-10-28): nothing in Phase 1
  // enforces folder access, because there is no desktop app yet — so the
  // sentence must read as a commitment, not a fact already true. Checked
  // on English only; a wording rule, not a translation rule.
  check(
    "the safety line is a commitment ('once the app exists'), not a present-tense claim",
    /^Once the app exists/.test(JSON.parse(read("messages/en.json")).dashboard.iowork.safetyLine)
  );
  // THE IDLE LABEL MUST NOT CLAIM ACTIVITY TRACKING THAT DOES NOT EXIST:
  // nothing writes last_seen_at yet (no device agent exists to call home),
  // so "idle" can honestly mean only "paired a while ago", not "unused".
  const idleEn = JSON.parse(read("messages/en.json")).dashboard.iowork.idle;
  check("the idle label says when it paired, not that it went unused", /paired/i.test(idleEn) && !/not used|unused/i.test(idleEn));
  check("disconnecting asks first", /window\.confirm\(t\("confirmDisconnect"/.test(shell));

  // THE PREVIEW/CONFIRM/CANCEL SCREEN (found by an independent review,
  // 2026-10-28): typing a code shows what it claims to be BEFORE binding
  // it, with a second, separate press required to actually connect, and
  // a way to kill the code on the spot if it is not recognised.
  check("the code field posts a preview, not a bind", /action: "preview"/.test(shell));
  check("the preview card exists and shows what the code claims", /data-testid="iowork-preview"/.test(shell) && /t\("previewHeading"\)/.test(shell));
  check("...the address that asked, honestly falling back when it is unknown", /preview\.requesterIp \|\| t\("previewIpUnknown"\)/.test(shell));
  check("only a second, separate press binds anything", /data-testid="iowork-preview-confirm"/.test(shell) && /onClick=\{confirmConnect\}/.test(shell));
  check("...and that press sends action: \"confirm\"", /action: "confirm"/.test(shell));
  check("a visible way to kill the code before it is confirmed", /data-testid="iowork-preview-cancel"/.test(shell) && /onClick=\{cancelConnect\}/.test(shell));
  check("...and that press sends action: \"cancel\"", /action: "cancel"/.test(shell));
  check("cancelling clears the preview locally even if the request fails", /finally \{\s*setPreview\(null\);\s*setDeciding\(null\);\s*\}/.test(shell));
  // THE LIST IS SEEDED FROM A PROP, so a server re-render cannot update
  // it: useState keeps its first value. The screen must therefore ask the
  // server again itself, and keep asking until the computer joins —
  // otherwise a person who typed the code correctly watches an empty list.
  check("the screen asks the server again rather than trusting its first props", /fetch\("\/api\/iowork\/devices"\)/.test(shell));
  check("...and never leans on router.refresh(), which cannot re-seed useState", !/router\.refresh\(\)/.test(shell));
  // COUNTED, NOT MATCHED. The first version of this check was
  // /waitForComputer\(/ and it passed with the CALL deleted, because the
  // declaration one screen above still matched it — the same defect this
  // file's own §8 was written to avoid. Two occurrences means the
  // function is both written and used.
  const waits = [...shell.matchAll(/waitForComputer\(/g)].length;
  check(`...and keeps looking until the computer joins (${waits} occurrences: declared and called)`, waits >= 2);
  // A FLOOR FIRST, then the emptiness. An empty offender list is the
  // answer both to "every control is big enough" and to "the scraper
  // matched nothing", and only one of those is good news — gate-vacuity
  // caught this very check without the floor.
  const targets = [...shell.matchAll(/(?<![\w:\-[])min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  check(`the scan found the phone's declared heights (${targets.length})`, targets.length >= 1, "the screen declares none at all, so the next check means nothing");
  const small = targets.filter((px) => px < 44);
  check(`no control is under 44px for the phone (${small.length})`, small.length === 0, small.join(", "));
  check("the disconnect button is a 44px target", /h-11 w-11/.test(shell));
  check("every button says its type", !/<button(?![^>]*type=)/.test(shell));
}

console.log("\n== 11. the table is known to the things that sweep and watch ==");
{
  const gdpr = read("src/lib/gdpr/user-data-registry.ts");
  check("the computers are in the export", /table: "iowork_devices"/.test(gdpr));
  check("the pairings are classified as non-personal, on purpose", /"iowork_pairings"/.test(gdpr));
  const canaries = read("src/lib/health/schema-canaries.ts");
  for (const table of ["iowork_devices", "iowork_pairings"]) {
    check(`${table} has a canary`, new RegExp(`table: "${table}",[\\s\\S]{0,120}20261031000000_iowork_devices\\.sql`).test(canaries));
  }
  check("the switch is declared", /"iowork-tool":/.test(read("src/lib/flags/flags.ts")));
  check("the technology decision is written down", existsSync("docs/IOWORK-TECH.md"));
  check("the approved security plan is still there", existsSync("docs/IOWORK-SECURITY-PLAN.md"));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
