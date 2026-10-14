#!/usr/bin/env node
/*
 * CAN limit-texts.test.mjs SEE A LIMIT LIE ABOUT TIME, OR ENGLISH COME BACK?
 *
 * Each mutant puts back one thing the 2026-10-14 round took out: «wait
 * about a minute» in a language, a limit sentence without its window, the
 * breaker's codes and instants, the time rounded down or ignored, a route
 * that stops passing them on, the Site's limit on new sites unnamed, the
 * Site beside Chat or the old Site page saying the server's English or one
 * sentence for every refusal, the Studio's and the voice conversation's
 * English, «your credits were returned» for «nothing was charged», and a
 * Greek article before a tool's name.
 *
 * Run: node scripts/tests/limit-texts.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/limit-texts.test.mjs";
const EL = "messages/el.json";
const EN = "messages/en.json";
const DE = "messages/de.json";
const BREAKER = "src/lib/ai-circuit-breaker.ts";
const LIMITER = "src/lib/rate-limit.ts";
const CODES = "src/lib/errors/error-codes.ts";
const TEXT = "src/lib/errors/failure-text.ts";
const RESEARCH = "src/app/api/research/route.ts";
const GENERATE = "src/app/api/websites/generate/route.ts";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const REQUESTS = "src/lib/website-builder/site-requests.ts";
const PANE = "src/components/chat/site-pane.tsx";
const PAGE = "src/components/website-builder/website-builder-workspace.tsx";
const STUDIO = "src/components/create/studio-chat.tsx";
const VOICE = "src/components/voice/voice-conversation.tsx";
const WORDS = "src/components/chat/use-chat-failure-words.ts";
const ONBOARDING = "src/components/onboarding/onboarding-flow.tsx";
const MISSION = "src/components/mission/mission-detail.tsx";
const FILES = "src/components/files/failure-words.ts";
const TARGETS = [GATE, EL, EN, DE, BREAKER, LIMITER, CODES, TEXT, RESEARCH, GENERATE, CHAT_ROUTE, REQUESTS, PANE, PAGE, STUDIO, VOICE, WORDS, ONBOARDING, MISSION, FILES];

const MUTANTS = [
  // ---- the words ----
  {
    name: "the Greek generic limit says «about a minute» again",
    file: EL,
    from: '"next": "Το όριο αδειάζει μόνο του με τον χρόνο — δοκίμασε ξανά αργότερα."',
    to: '"next": "Περίμενε περίπου ένα λεπτό και δοκίμασε άλλη μία φορά."',
    expect: "el: no limit sentence says «a minute»",
  },
  {
    name: "a German tool's limit says «a minute» again",
    file: DE,
    from: '"Du hast ein Anfragelimit erreicht. Es leert sich mit der Zeit von selbst – versuch es später noch einmal."',
    to: '"Zu viele Anfragen. Warte eine Minute und versuche es erneut."',
    expect: "de: no limit sentence says «a minute»",
  },
  {
    name: "the hourly limit stops naming its window",
    file: EN,
    from: '"next": "It counts the last 60 minutes, so it opens again within the hour."',
    to: '"next": "It usually opens again within a few minutes."',
    expect: "hourlyLimit: said in every language",
  },
  {
    name: "the Greek time sentence loses its time",
    file: EL,
    from: "today {Μπορείς να δοκιμάσεις ξανά μετά τις {time}.}",
    to: "today {Μπορείς να δοκιμάσεις ξανά σε λίγο.}",
    expect: "el: when a limit opens again renders",
  },
  {
    name: "«nothing was charged» goes back to «your credits were returned»",
    file: EL,
    from: '"refunded": "Δεν χρεώθηκε τίποτα.",',
    to: '"refunded": "Τα credits σου επιστράφηκαν.",',
    expect: "«nothing was charged» says so",
  },
  {
    name: "the plan wall puts the Greek article back before the tool's name",
    file: EL,
    from: '"body": "Η λειτουργία «{feature}» χρειάζεται το πλάνο {plan} ή ανώτερο.",',
    to: '"body": "Το {feature} χρειάζεται το πλάνο {plan} ή ανώτερο.",',
    expect: "never put an article before it",
  },
  {
    name: "the recent tools' remove label puts it back too",
    file: EL,
    from: '"remove": "Αφαίρεση από τα πρόσφατα: {tool}",',
    to: '"remove": "Αφαίρεση του {tool} από τα πρόσφατα",',
    expect: "never put an article before it",
  },
  // ---- the breaker ----
  {
    name: "the platform's day is «the service is not answering» again, with no time",
    file: BREAKER,
    from: '      code: "platformLimit",\n      retryAt: nextUtcMidnight(),\n',
    to: '      code: "upstreamUnavailable",\n',
    expect: "the platform's day",
  },
  {
    name: "the hourly limit stops saying when it opens",
    file: BREAKER,
    from: '    code: "hourlyLimit",\n    ...(retryAt ? { retryAt } : {}),\n',
    to: '    code: "hourlyLimit",\n',
    expect: "the hour's AI requests",
  },
  {
    name: "the limiter reads the newest hit instead of the limit-th newest",
    file: LIMITER,
    from: ".range(maxAttempts - 1, maxAttempts - 1);",
    to: ".range(0, 0);",
    expect: "rateLimitOpensAt",
  },
  // ---- the time on the screen ----
  {
    name: "the time is rounded down, sending people back early",
    file: CODES,
    from: "Math.ceil(instant / 60000) * 60000",
    to: "Math.floor(instant / 60000) * 60000",
    expect: "rounded UP",
  },
  {
    name: "a past instant is kept",
    file: CODES,
    from: "if (!Number.isFinite(at) || at <= now || at - now > 25 * 60 * 60 * 1000) return undefined;",
    to: "if (!Number.isFinite(at) || at - now > 25 * 60 * 60 * 1000) return undefined;",
    expect: "a route's instant is kept",
  },
  {
    name: "the sentence ignores the time the route sent",
    file: TEXT,
    from: '  const next = opens ? t("retryAt", opens) : t(`codes.${code}.next`);',
    to: "  const next = t(`codes.${code}.next`);",
    expect: "says the time it opens",
  },
  // ---- the routes ----
  {
    name: "Research stops passing when the limit opens",
    file: RESEARCH,
    from: "code: breaker.code, retryAt: breaker.retryAt, error: breaker.reason }, { status: 429 });",
    to: "code: breaker.code, error: breaker.reason }, { status: 429 });",
    expect: "every other caller passes",
  },
  {
    name: "the Site's 24-hour limit loses its name",
    file: GENERATE,
    from: '        code: "siteDailyLimit",\n',
    to: "",
    expect: "the Site's 24-hour limit on new sites is named",
  },
  {
    name: "a hold Chat could not take says «we cannot confirm» again",
    file: CHAT_ROUTE,
    from: ': { code: "serverError", creditsRefunded: true }),',
    to: ": {}),",
    expect: "a hold that could not be taken",
  },
  // ---- the screens ----
  {
    name: "the Site's requests call every limit «rateLimited»",
    file: REQUESTS,
    from: 'code: short ? "insufficientCredits" : isTimedLimitCode(data?.code) ? data.code : "rateLimited",',
    to: 'code: short ? "insufficientCredits" : "rateLimited",',
    expect: "the Site's requests keep the limit's own code",
  },
  {
    name: "the Site beside Chat shows the error's own message again",
    file: PANE,
    from: "            : describe(outcome.error).text\n        );\n        return;\n      }\n      if (outcome.kind === \"questions\")",
    to: "            : outcome.error.message\n        );\n        return;\n      }\n      if (outcome.kind === \"questions\")",
    expect: "every refusal from its code, on every screen",
  },
  {
    name: "a held change is said as any other refusal again",
    file: PANE,
    from: '              : outcome.reason === "held"\n                ? `${tShell("site.held")} ${tErrors("credits.notCharged")}`\n',
    to: "",
    expect: "a change the safety review held",
  },
  {
    name: "the old Site page shows the stored English again",
    file: PAGE,
    from: "                    {failedLine(previewWebsite)}",
    to: '                    {previewWebsite.error_message ?? t("generateFailed")}',
    expect: "the old Site page",
  },
  {
    name: "the Studio's conversation shows the route's English again",
    file: STUDIO,
    from: "          streamError = chatFailure.streamError(event);",
    to: '          streamError = typeof event.error === "string" ? event.error : t("chatFailed");',
    expect: "the Studio's conversation",
  },
  {
    name: "the voice conversation reads a refusal as an empty stream again",
    file: VOICE,
    from: '      if (!(chatResponse.headers.get("content-type") ?? "").includes("application/x-ndjson") || !chatResponse.body) {',
    to: "      if (!chatResponse.ok || !chatResponse.body) {",
    expect: "the voice conversation too",
  },
  {
    name: "the shared Chat words stop passing the instant on",
    file: WORDS,
    from: '          retryAt: typeof value?.retryAt === "string" ? value.retryAt : undefined,\n',
    to: "",
    expect: "which pass the route's code",
  },
  {
    name: "onboarding shows the route's English again",
    file: ONBOARDING,
    from: '        addToast(refused(response.status, data, t("analyseError")), "error");',
    to: '        addToast(data.error ?? t("analyseError"), "error");',
    expect: "the first minutes",
  },
  {
    name: "a mission review shows the breaker's English again",
    file: MISSION,
    from: "setError(limitText(data) ?? data.message);",
    to: "setError(data.message);",
    expect: "mission-detail.tsx: a limit is said with its time",
  },
  {
    name: "Files stops saying an AI limit with its time",
    file: FILES,
    from: "          return isTimedLimitCode(outcome.body?.code)\n",
    to: "          return isTimedLimitCode(outcome.body?.reason)\n",
    expect: "Files and Research",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 120_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("limit-texts mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
