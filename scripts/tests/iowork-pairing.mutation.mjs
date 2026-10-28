#!/usr/bin/env node
/*
 * CAN iowork-pairing.test.mjs SEE A CODE NOBODY CAN RETYPE, A CLAIM THAT
 * CAN BE WON TWICE, OR A SCREEN THAT STOPS SAYING THE APP IS NOT OUT YET?
 *
 * iowork is the one tool that reaches into the person's own computer, so
 * every mutant here is a defect that would ship something weaker than the
 * approved docs/IOWORK-SECURITY-PLAN.md promises — not a style slip.
 * Three of them (the alphabet, the length check, the race guard) are
 * invisible to TypeScript and to any reader: the code still compiles,
 * still pairs, and is simply easier to guess or to steal.
 *
 * Run: node scripts/tests/iowork-pairing.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/iowork-pairing.test.mjs";
const LIB = "src/lib/iowork/pairing.ts";
const PAIR = "src/app/api/iowork/pair/route.ts";
const DEVICES = "src/app/api/iowork/devices/route.ts";
const ONE = "src/app/api/iowork/devices/[id]/route.ts";
const TOKEN = "src/app/api/iowork/pair/token/route.ts";
const PAGE = "src/app/dashboard/iowork/page.tsx";
const SHELL = "src/components/iowork/iowork-devices.tsx";
const SQL = "supabase/migrations/20261031000000_iowork_devices.sql";
const EL = "messages/el.json";

const MUTANTS = [
  {
    name: "the alphabet keeps the letters people mistype",
    file: LIB,
    from: 'export const PAIRING_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";',
    to: 'export const PAIRING_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUV";',
    expect: "the alphabet leaves out I",
  },
  {
    name: "a code of the wrong length is accepted",
    file: LIB,
    from: "  if (folded.length !== PAIRING_CODE_LENGTH) return null;",
    to: "",
    expect: "seven characters is not a code",
  },
  {
    name: "I and L are no longer folded onto the 1 they were mistaken for",
    file: LIB,
    from: '    .replace(/[IL]/g, "1")',
    to: "",
    expect: "I folds onto 1",
  },
  {
    name: "O is no longer folded onto 0",
    file: LIB,
    from: '    .replace(/O/g, "0");',
    to: "    ;",
    expect: "O folds onto 0",
  },
  {
    name: "a pairing with an unreadable date is treated as fresh",
    file: LIB,
    from: "  if (!Number.isFinite(started)) return true; // unreadable date: refuse, never allow",
    to: "  if (!Number.isFinite(started)) return false;",
    expect: "an unreadable date counts as expired",
  },
  {
    name: "the idle window is hours, not days",
    file: LIB,
    from: "  return now - seen > DEVICE_IDLE_DAYS * 24 * 60 * 60 * 1000;",
    to: "  return now - seen > DEVICE_IDLE_DAYS * 60 * 1000;",
    expect: "a device seen yesterday is not idle",
  },
  {
    name: "a device label is unbounded, so one row can push the rest off the screen",
    file: LIB,
    from: "    .slice(0, MAX_DEVICE_LABEL_CHARS);",
    to: ";",
    expect: "a long label is bounded",
  },
  {
    name: "any string is accepted as an operating system",
    file: LIB,
    from: '  return typeof value === "string" && (IOWORK_PLATFORMS as readonly string[]).includes(value)',
    to: '  return typeof value === "string"',
    expect: '"linux" is not a platform',
  },
  {
    name: "two accounts racing on one code can both claim it",
    file: DEVICES,
    from: '    .is("user_id", null)\n    .select("id");',
    to: "    ;",
    expect: "the bind is still guarded so it cannot be won twice",
  },
  {
    name: "the loser of a claim race is told its claim succeeded",
    file: DEVICES,
    from: '  if (!claimed || claimed.length === 0) {\n    // Lost the race: somebody else\'s confirm landed first. Answered as\n    // "not_found" rather than a fabricated success — the old code\n    // returned ok:true here on a zero-row update, telling the loser of a\n    // race that their claim had gone through when it had not.\n    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });\n  }',
    to: "",
    expect: "a lost race is answered as not_found, not as a fabricated success",
  },
  {
    name: "typing a code binds it immediately, with no confirm step",
    file: DEVICES,
    from: '  if (action === "preview") {\n    return NextResponse.json({\n      ok: true,\n      status: "preview",\n      label: pairing.label,\n      platform: pairing.platform,\n      requestedAt: pairing.created_at,\n      requesterIp: pairing.requester_ip,\n    });\n  }',
    to: "",
    expect: "the bind sits after both the preview and the cancel branches, never before",
  },
  {
    name: "cancel can kill a pairing someone else already claimed",
    file: DEVICES,
    from: '    await admin.from("iowork_pairings").delete().eq("id", pairing.id).is("user_id", null);',
    to: '    await admin.from("iowork_pairings").delete().eq("id", pairing.id);',
    expect: "cancel deletes the row, and only while it is still unclaimed",
  },
  {
    name: "a code somebody else claimed answers differently, so refusals become an oracle",
    file: DEVICES,
    from: '  if (!pairing || pairing.user_id) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });',
    to: '  if (!pairing) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });\n  if (pairing.user_id) return NextResponse.json({ ok: false, code: "failed" }, { status: 409 });',
    expect: "a claimed code answers like a code that never existed",
  },
  {
    name: "the claim is not rate limited, so the eight characters can be searched",
    file: DEVICES,
    from: '    scope: "iowork_pair_claim",',
    to: '    scope: "iowork_other",',
    expect: "the claim is rate limited per account",
  },
  {
    name: "disconnecting only flags the row, so the token keeps working",
    file: ONE,
    from: '      .from("iowork_devices")\n      .delete()',
    to: '      .from("iowork_devices")\n      .update({ revoked_at: new Date().toISOString() })',
    expect: "disconnecting deletes the row",
  },
  {
    name: "the device token is stored in the clear",
    file: TOKEN,
    from: "token_hash: hashSecret(token)",
    to: "token_hash: token",
    expect: "the token is stored only as a hash",
  },
  {
    name: "the pairing is found by the typed code rather than by the secret",
    file: TOKEN,
    from: '    .eq("claim_secret_hash", hashSecret(claimSecret))',
    to: '    .eq("code", claimSecret)',
    expect: "the token route finds a pairing by the hash",
  },
  {
    name: "an expired pairing is left behind, still holding its code",
    file: TOKEN,
    from: '      await admin.from("iowork_pairings").delete().eq("id", pairing.id);',
    to: "",
    expect: "an expired pairing is removed rather than left holding its code",
  },
  {
    name: "two concurrent collects can both mint a device from one claim secret",
    file: TOKEN,
    from: '    .is("collected_at", null)\n    .select("id");',
    to: "    ;",
    expect: "...and the result is read back, not inferred from a missing error",
  },
  {
    name: "a lost collect race is told it succeeded instead of already_used",
    file: TOKEN,
    from: '  if (!claimed || claimed.length === 0) {\n    // Lost the race, or genuinely already used — the caller cannot tell\n    // the difference and does not need to.\n    return NextResponse.json({ ok: false, code: "already_used" }, { status: 409 });\n  }',
    to: "",
    expect: "...a zero-row result is 'already_used', not success",
  },
  {
    name: "the two app-facing routes keep running after the owner flags iowork off",
    file: PAIR,
    from: '    if (audiences["iowork-tool"] === "off") {\n      return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });\n    }',
    to: "",
    expect: "...and \"off\" refuses before anything else runs",
  },
  {
    name: "the token route ignores the kill switch",
    file: TOKEN,
    from: '    const audiences = await readFlagAudiences();\n    if (audiences["iowork-tool"] === "off") {\n      return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });\n    }',
    to: "",
    expect: "the token route reads the flag's raw audience",
  },
  {
    name: "the pairing forgets which address asked for it",
    file: PAIR,
    from: "        requester_ip: requesterIp,",
    to: "",
    expect: "the start route captures who asked",
  },
  {
    name: "the screen opens for everyone, not only the owner",
    file: PAGE,
    from: '  if (!(await isFeatureOn("iowork-tool", user))) {',
    to: "  if (false) {",
    expect: "the real screen is behind the switch",
  },
  {
    name: "the screen stops saying there is no app to install",
    file: SHELL,
    from: '      <p className="notice-warning px-4 py-3 text-sm">{t("noAppYet")}</p>',
    to: "",
    expect: "the screen says the app is not out yet",
  },
  {
    name: "the screen stops looking, so a computer that joined never shows up",
    file: SHELL,
    from: "      void waitForComputer(before);",
    to: "",
    expect: "keeps looking until the computer joins",
  },
  {
    name: "a non-uuid device id reaches the database as a bad literal",
    file: LIB,
    from: "export function looksLikeUuid(value: string): boolean {\n  return UUID_SHAPE.test(value);\n}",
    to: "export function looksLikeUuid(): boolean {\n  return true;\n}",
    expect: "is not a uuid shape",
  },
  {
    name: "control characters survive into a device label an attacker supplied",
    file: LIB,
    from: "const CONTROL_CHARS = /[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]/g;",
    to: "const CONTROL_CHARS = /$^/g;",
    expect: "a NUL byte is stripped from a label",
  },
  {
    name: "the claim-secret lookup has no index, though the route comment claims it does",
    file: SQL,
    from: "create unique index if not exists iowork_pairings_secret_idx on public.iowork_pairings (claim_secret_hash);",
    to: "",
    expect: "the claim-secret lookup is actually indexed, as the route comment claims",
  },
  {
    name: "the address a pairing was requested from is never stored",
    file: SQL,
    from: "  requester_ip text",
    to: "",
    expect: "the pairing keeps the address that asked for it",
  },
  {
    name: "the confirm button is wired to nothing",
    file: SHELL,
    from: "onClick={confirmConnect}",
    to: 'onClick={() => undefined}',
    expect: "only a second, separate press binds anything",
  },
  {
    name: "the cancel button is wired to nothing",
    file: SHELL,
    from: "onClick={cancelConnect}",
    to: 'onClick={() => undefined}',
    expect: "a visible way to kill the code before it is confirmed",
  },
  {
    name: "the safety line goes back to claiming a protection Phase 1 does not have",
    file: "messages/en.json",
    from: '"safetyLine": "Once the app exists: a connected computer will reach only the folders you pick on it, never passwords, keys or system folders, and every change will wait for your approval there.",',
    to: '"safetyLine": "A connected computer reaches only the folders you pick on it, never passwords, keys or system folders, and every change waits for your approval there.",',
    expect: "the safety line is a commitment ('once the app exists'), not a present-tense claim",
  },
  {
    name: "the idle label goes back to implying activity tracking that does not exist",
    file: "messages/en.json",
    from: '"idle": "Paired more than 30 days ago",',
    to: '"idle": "Not used for 30 days",',
    expect: "the idle label says when it paired, not that it went unused",
  },
  {
    name: "disconnecting a computer stops asking first",
    file: SHELL,
    from: '    if (!window.confirm(t("confirmDisconnect", { name: device.label }))) return;',
    to: "",
    expect: "disconnecting asks first",
  },
  {
    name: "a pending pairing becomes readable from the browser",
    file: SQL,
    from: "revoke all on public.iowork_pairings from anon, authenticated;",
    to: 'create policy "select_own_iowork_pairings" on public.iowork_pairings\n  for select using (auth.uid() = user_id);',
    expect: "no policy is created on the pairings",
  },
  {
    name: "the account may write a device row itself, so a forged computer can be planted",
    file: SQL,
    from: "revoke insert, update on public.iowork_devices from anon, authenticated;",
    to: "",
    expect: "the client may not write a device row",
  },
  {
    name: "one language loses the words for a refusal it can still meet",
    file: EL,
    from: '        "not_found": "Κανένας υπολογιστής δεν δείχνει αυτόν τον κωδικό.",\n',
    to: "",
    expect: "el: every refusal has words",
  },
];

runMutations({ name: "iowork-pairing", gate: GATE, targets: [LIB, PAIR, DEVICES, ONE, TOKEN, PAGE, SHELL, SQL, EL, "messages/en.json"], mutants: MUTANTS });
