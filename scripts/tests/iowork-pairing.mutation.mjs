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
    from: '  const trimmed = value.replace(/\\s+/g, " ").trim().slice(0, MAX_DEVICE_LABEL_CHARS);',
    to: '  const trimmed = value.replace(/\\s+/g, " ").trim();',
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
    from: '    .is("user_id", null);',
    to: "    ;",
    expect: "the claim cannot be won twice",
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
    from: "      void waitForComputer(devices.length);",
    to: "",
    expect: "keeps looking until the computer joins",
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

runMutations({ name: "iowork-pairing", gate: GATE, targets: [LIB, DEVICES, ONE, TOKEN, PAGE, SHELL, SQL, EL], mutants: MUTANTS });
