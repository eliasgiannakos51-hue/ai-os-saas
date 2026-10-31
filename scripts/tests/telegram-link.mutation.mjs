#!/usr/bin/env node
/*
 * WOULD A DEFECT IN THE THING THAT GRANTS AUTHORITY BE NOTICED?
 *
 * A connected Telegram chat can spend an account's credits, read what it
 * has made and publish as it. Every mutation below is a way that grant
 * could quietly become weaker than the screen says it is: a leaked code
 * becoming sufficient on its own, two confirms both winning, a chat
 * commanding two accounts, or the chat id turning back into a chat id in
 * a leaked backup.
 *
 * THE ONE WORTH READING FIRST is "the chat id is hashed rather than
 * keyed". It is a two-word edit — createHmac to createHash — that leaves
 * every structural check in the gate passing, every type correct and
 * every screen identical. What it destroys is the only property that made
 * the column safe: a Telegram id lives inside about 2^34, so a column of
 * bare digests IS the column of chat ids to anybody holding a copy of the
 * database. §2 of the gate exists for this mutant and runs the function
 * under two keys to catch it.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/telegram-link.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/telegram-link.test.mjs";
const PAIRING = "src/lib/telegram/pairing.ts";
const IDENTITY = "src/lib/telegram/identity.ts";
const ROUTE = "src/app/api/telegram/link/route.ts";
const STATE = "src/lib/telegram/link-state.ts";
const SHELL = "src/components/integrations/telegram-connect.tsx";
const DETAILS = "src/components/integrations/connection-details.tsx";
const SQL = "supabase/migrations/20261031000001_telegram_link.sql";
const PAGE = "src/app/dashboard/integrations/page.tsx";
const EL = "messages/el.json";

const MUTANTS = [
  {
    // THE EXPENSIVE ONE. Still deterministic, still unique, still indexed,
    // still 64 hex characters — and reversible by enumerating 2^34.
    name: "the chat id is keyed with a key everybody knows, so a leaked backup is a list of chats",
    file: IDENTITY,
    // A ZERO KEY, not createHash: swapping the function would leave the
    // module without its import and the gate would CRASH rather than fail,
    // which reports nothing (found 2026-10-31, the suite's first run). A
    // 32-byte block of zeros is a key anybody can guess, so the fingerprint
    // is reversible by enumeration exactly as a plain digest would be, and
    // §2's two-key run is what notices.
    from: 'return createHmac("sha256", subKey()).update(normalised).digest("hex");',
    to: 'return createHmac("sha256", Buffer.alloc(32)).update(normalised).digest("hex");',
    expect: "a different key gives a different fingerprint",
  },
  {
    name: "a pairing with an unreadable date is treated as fresh, so its code never dies",
    file: PAIRING,
    from: "  if (!Number.isFinite(started)) return true; // unreadable date: refuse, never allow",
    to: "  if (!Number.isFinite(started)) return false;",
    expect: "an unreadable date is treated as EXPIRED, never as fresh",
  },
  {
    name: "the ten minutes become ten hours",
    file: PAIRING,
    from: "export const TELEGRAM_PAIRING_TTL_MINUTES = 10;",
    to: "export const TELEGRAM_PAIRING_TTL_MINUTES = 600;",
    expect: "the window is ten minutes, as the owner asked",
  },
  {
    name: "control characters survive into a Telegram name shown on the confirm screen",
    file: PAIRING,
    from: "const CONTROL_CHARS = /[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]/g;",
    to: "const CONTROL_CHARS = /[\\u0000]/g;",
    expect: "a control character never survives into a name",
  },
  {
    name: "a Telegram display name is unbounded",
    file: PAIRING,
    from: "    .slice(0, MAX_TELEGRAM_NAME_CHARS);",
    to: "    .slice(0, 100000);",
    expect: "a name is bounded",
  },
  {
    // The deep link is the one place a bot username becomes a URL the
    // person presses. t.me/null is a page that is not ours.
    name: "a link is built even when Telegram would not say which bot this is",
    file: PAIRING,
    from: "  if (!botUsername || !USERNAME_SHAPE.test(botUsername)) return null;",
    to: "  if (!botUsername) return `https://t.me/unknown?start=${code}`;",
    expect: "a bot username Telegram would not have is refused",
  },
  {
    // THE DEFENCE AGAINST A LEAKED CODE. Without this clause a code that
    // nobody has presented confirms itself, so holding the code is enough.
    name: "a code nobody presented can be confirmed, so the leaked code alone is enough",
    file: ROUTE,
    from: '    .not("presented_at", "is", null)',
    to: '    .order("created_at", { ascending: false })',
    expect: "only a pairing a chat has PRESENTED can be confirmed",
  },
  {
    name: "two confirms on one code can both win",
    file: ROUTE,
    from: '    .is("confirmed_at", null)\n    .select("id");',
    to: '    .select("id");',
    expect: "the confirm is a compare-and-swap on confirmed_at",
  },
  {
    name: "the loser of a confirm race is told its chat is connected",
    file: ROUTE,
    from: '  if (!spent || spent.length === 0) {\n    return NextResponse.json({ ok: false, code: "nothing_to_confirm" }, { status: 404 });\n  }',
    to: '  if (!spent || spent.length === 0) {\n    return NextResponse.json({ ok: true, status: "confirmed" });\n  }',
    expect: "a zero-row update is a refusal, not a fabricated success",
  },
  {
    name: "a second Connect silently replaces the chat that already commands the account",
    file: ROUTE,
    from: '  if ((count ?? 0) > 0) return NextResponse.json({ ok: false, code: "already_linked" }, { status: 409 });',
    to: '  if ((count ?? 0) > 99) return NextResponse.json({ ok: false, code: "already_linked" }, { status: 409 });',
    expect: "starting twice over a live link is refused rather than overwriting it",
  },
  {
    name: "a chat that already commands another account is adopted instead of refused",
    file: ROUTE,
    from: '    return NextResponse.json({ ok: false, code: "chat_in_use" }, { status: 409 });',
    to: '    return NextResponse.json({ ok: true, status: "confirmed" });',
    expect: "a chat already commanding another account is refused",
  },
  {
    name: "the eight characters can be searched, because nothing is rate limited",
    file: ROUTE,
    // POST's limiter specifically (DELETE has its own, identically
    // shaped) — anchored through the `try {` that only follows this one.
    from: '    scope: "telegram_link_act",\n    identifier: user.id,\n    maxAttempts: 20,\n    windowMinutes: 60,\n  });\n  if (!allowed) return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });\n\n  try {',
    to: '    scope: "",\n    identifier: user.id,\n    maxAttempts: 20,\n    windowMinutes: 60,\n  });\n  if (!allowed) return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });\n\n  try {',
    expect: "every acting call is rate limited",
  },
  {
    name: "the route runs for everyone, not only the switch's audience",
    file: ROUTE,
    from: '  if (!(await isFeatureOn("telegram-bot", user))) {',
    to: "  if (false as boolean) {",
    expect: "the switch is read with the user",
  },
  {
    // The whole point of two columns: one searchable, one sendable, and
    // NEITHER of them ever in a response.
    name: "the chat id's ciphertext is handed to the browser",
    file: ROUTE,
    from: '  return NextResponse.json({ ok: true, status: "confirmed", username: pairing.telegram_username, name: pairing.telegram_name });',
    to: '  return NextResponse.json({ ok: true, status: "confirmed", username: pairing.telegram_username, name: pairing.telegram_name, chat_id_encrypted: pairing.chat_id_encrypted });',
    expect: "no chat id, in either shape, is ever inside a response",
  },
  {
    name: "disconnect only forgets the code, leaving the chat still able to command",
    file: ROUTE,
    from: '    const { error } = await supabase.from("telegram_links").delete().eq("user_id", user.id);',
    to: '    const { error } = await supabase.from("telegram_links").select("user_id").eq("user_id", user.id);',
    expect: "disconnect deletes the link row",
  },
  {
    // The constraint, not the route, is what makes this impossible.
    name: "one chat may command two accounts",
    file: SQL,
    from: "  chat_id_fingerprint text not null unique,",
    to: "  chat_id_fingerprint text not null,",
    expect: "the fingerprint is unique",
  },
  {
    name: "a pending code becomes readable from the browser",
    file: SQL,
    from: "revoke all on public.telegram_pairings from anon, authenticated;",
    to: "grant select on public.telegram_pairings to authenticated;",
    expect: "a pending pairing is unreachable from any browser",
  },
  {
    name: "the account may write its own link row, so a forged chat can be planted",
    file: SQL,
    from: "revoke insert, update on public.telegram_links from anon, authenticated;",
    to: "grant insert, update on public.telegram_links to authenticated;",
    expect: "the account may not write a link itself",
  },
  {
    name: "a group chat can be written as a link",
    file: SQL,
    from: "  chat_kind text not null default 'private' check (chat_kind = 'private'),",
    to: "  chat_kind text not null default 'private',",
    expect: "a group can never be written as a link",
  },
  {
    // The GDPR registry's argument for the exemption is this delete.
    name: "the pairings are never swept, so the GDPR exemption's argument is false",
    file: "src/app/api/cron/scheduled-runs/route.ts",
    from: '      .from("telegram_pairings")\n      .delete()\n      .lt("created_at", telegramPairingCutoff);',
    to: '      .from("telegram_pairings")\n      .select("id")\n      .lt("created_at", telegramPairingCutoff);',
    expect: "the cron actually sweeps them",
  },
  {
    name: "the screen stops saying the bot cannot answer a code yet",
    file: SHELL,
    from: '            {t("noWebhookYet")}',
    to: "            {null}",
    expect: "the screen says the bot cannot answer a code yet",
  },
  {
    name: "the confirm button is wired to nothing",
    file: SHELL,
    from: 'onClick={() => act("confirm")}',
    to: "onClick={undefined}",
    expect: "the confirm button is wired to confirm",
  },
  {
    name: "pressing Connect mints a code immediately, with no consent step",
    file: SHELL,
    from: "onClick={() => setShowConsent(true)}",
    to: 'onClick={() => act("start")}',
    expect: "pressing Connect on the card opens it rather than minting",
  },
  {
    name: "disconnecting stops asking first",
    file: SHELL,
    from: '    if (!window.confirm(t("confirmDisconnect"))) return;',
    to: "    if (false) return;",
    expect: "disconnecting asks first",
  },
  {
    name: "the section adds a second white button to the page",
    file: SHELL,
    from: 'data-testid="telegram-consent-approve"\n              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-foreground px-4',
    to: 'data-testid="telegram-consent-approve"\n              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-button px-4',
    expect: "this section adds no second white button",
  },
  {
    // The shared block is what CN1 adopts for Gmail, Drive, Calendar and
    // Slack. A Telegram word in it is the fork this file exists to avoid.
    name: "the shared details block learns about Telegram",
    file: DETAILS,
    from: "  testId = \"connection-details\",",
    to: "  testId = \"telegram-details\",",
    expect: "the shared details block knows nothing about Telegram",
  },
  {
    // Every migration here is pasted by hand. Without the catch, a table
    // nobody has created yet 500s Gmail, Drive, Calendar, Slack and MCP.
    name: "a table the owner has not pasted yet takes the whole Connect page down",
    file: PAGE,
    from: "  try {\n    telegramState = await readTelegramState(user);\n  } catch (err) {",
    to: "  telegramState = await readTelegramState(user);\n  if (false) try {\n    telegramState = null;\n  } catch (err) {",
    expect: "a missing table degrades the section rather than 500ing the Connect page",
  },
  {
    name: "the page reads the switch itself, which is the thing that once hid every connection",
    file: STATE,
    from: '  if (!(await isFeatureOn("telegram-bot", user))) return null;',
    to: "  if (!user) return null;",
    expect: "the state reader is what gates the section on the switch",
  },
  {
    name: "one language loses the words for a refusal it can still meet",
    file: EL,
    from: '        "chat_in_use": "Αυτή η συνομιλία Telegram είναι ήδη συνδεδεμένη με άλλον λογαριασμό. Αποσύνδεσέ την πρώτα από εκεί.",\n',
    to: "",
    expect: "el: every refusal has words",
  },
];

runMutations({
  name: "telegram-link",
  gate: GATE,
  targets: [PAIRING, IDENTITY, ROUTE, STATE, SHELL, DETAILS, SQL, PAGE, EL, "src/app/api/cron/scheduled-runs/route.ts"],
  mutants: MUTANTS,
});
