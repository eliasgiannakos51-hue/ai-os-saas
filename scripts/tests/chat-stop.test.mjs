// THE STOP BUTTON CHARGES FOR WHAT WAS WRITTEN, NOT FOR THE WHOLE CALL.
//
// V4.6: "A small ✕ while it writes. It stops at once, keeps what was
// written, the person types the next thing immediately — and charges only
// the tokens that were produced. That last one is the critical one."
//
// Three checks of three different kinds:
//
//   1. THE ARITHMETIC, EXECUTED. lib/chat/partial-usage.ts builds the usage
//      record for a stopped turn from the stream's snapshot and a counted
//      output figure. Run on every shape: a full snapshot, a missing one,
//      NaN, negatives, Infinity — and the script-aware fallback estimate
//      on Greek, Chinese and Arabic text, which must never be zero for
//      text that exists and must scale with the script.
//   2. THE ROUTE, READ: the request's abort signal AND the stream's
//      cancel() both stop the Anthropic stream; the stopped path counts
//      the partial text, records it, saves the partial message, settles it
//      marked `stopped`, and never runs memory extraction; a stop before
//      the first word releases the hold.
//   3. THE CLIENT, READ: one AbortController per send, passed to fetch;
//      a stop button rendered while sending; an abort is not shown as a
//      network error; the box is handed back in `finally`.
//
// Run: node scripts/tests/chat-stop.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => stripComments(readFileSync(p, "utf8"));

const LIB = "src/lib/chat/partial-usage.ts";
const ROUTE = "src/app/api/chat/route.ts";
const WORKSPACE = "src/components/chat/chat-workspace.tsx";
const COMPOSER = "src/components/chat/chat-composer.tsx";

const { partialUsage, estimateOutputTokensFromText } = await loadTs(LIB);

console.log("== 1. the arithmetic of a stopped turn ==");
{
  const snap = { input_tokens: 1200, output_tokens: 1, cache_creation_input_tokens: 300, cache_read_input_tokens: 4000,
    cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 0 }, server_tool_use: { web_search_requests: 2 } };
  const u = partialUsage(snap, 217);
  check("the input side is what message_start reported", u.input_tokens === 1200 && u.cache_read_input_tokens === 4000 && u.cache_creation_input_tokens === 300);
  check("...cache TTLs included", u.cache_creation?.ephemeral_5m_input_tokens === 300 && u.cache_creation?.ephemeral_1h_input_tokens === 0);
  check("the output side is the COUNTED figure, not the snapshot's placeholder", u.output_tokens === 217);
  check("searches already run are kept — Anthropic billed them", u.server_tool_use?.web_search_requests === 2);
  const none = partialUsage(null, 0);
  check("no snapshot at all is zero everywhere, not NaN", none.input_tokens === 0 && none.output_tokens === 0 && none.cache_read_input_tokens === 0 && none.cache_creation === null);
  for (const [label, v] of [["NaN", NaN], ["-1", -1], ["Infinity", Infinity], ["undefined", undefined], ["a string", "9"]]) {
    const x = partialUsage({ input_tokens: v, cache_read_input_tokens: v }, v);
    check(`${label} anywhere becomes 0, never a negative or NaN charge`, x.input_tokens === 0 && x.output_tokens === 0 && x.cache_read_input_tokens === 0);
  }
  check("a fractional count is rounded, not truncated to a discount", partialUsage(null, 12.6).output_tokens === 13);

  console.log("\n   the fallback estimate, by script");
  const el = "Η ανάλυση των εσόδων του τριμήνου δείχνει σταθερή άνοδο στις συνδρομές.";
  const zh = "本季度的收入分析显示订阅收入稳步增长，其中贡献最大的是三月份新开通的账户。";
  const ar = "يُظهر تحليل إيرادات هذا الربع ارتفاعًا ثابتًا في الاشتراكات.";
  const en = "The revenue analysis for the quarter shows a steady rise in subscriptions.";
  const est = { el: estimateOutputTokensFromText(el), zh: estimateOutputTokensFromText(zh), ar: estimateOutputTokensFromText(ar), en: estimateOutputTokensFromText(en) };
  console.log(`        el ${el.length}ch->${est.el}  zh ${zh.length}ch->${est.zh}  ar ${ar.length}ch->${est.ar}  en ${en.length}ch->${est.en}`);
  check("text that exists never estimates to zero", Object.values(est).every((n) => n > 0));
  check("Chinese costs more tokens per character than English", est.zh / zh.length > est.en / en.length);
  check("Greek and Arabic sit between the two", est.el / el.length > est.en / en.length && est.ar / ar.length > est.en / en.length && est.el / el.length < est.zh / zh.length);
  check("empty text is zero", estimateOutputTokensFromText("") === 0 && estimateOutputTokensFromText(undefined) === 0);
}

console.log("\n== 2. the route stops, counts, and settles the part that arrived ==");
{
  const route = read(ROUTE);
  check("the request's abort signal requests a stop", /request\.signal\?\.addEventListener\("abort", requestStop\)/.test(route));
  check("...and so does the stream's cancel()", /cancel\(\) \{\s*requestStop\(\);/.test(route));
  check("a stop aborts the Anthropic stream in flight", /activeStream\?\.abort\(\)/.test(route) && /activeStream = claudeStream;/.test(route));
  check("a stop that arrives between rounds still stops the next one", /if \(stopped\.value\) claudeStream\.abort\(\);/.test(route));
  check("deltas stop being written to a closed response", /safeEnqueue\(controller, ndjsonLine\(\{ type: "delta"/.test(route));
  check("an abort that was NOT a stop is still an error", /if \(!stopped\.value\) throw err;/.test(route));
  const stoppedPath = route.slice(route.indexOf("if (!stopped.value) throw err;"), route.indexOf("safeClose(controller);\n              return;\n            }"));
  check("the stopped path was found", stoppedPath.length > 200);
  check("the output side is COUNTED from the partial text", /messages\.countTokens\(\{[\s\S]*?content: assistantText \|\| "\."/.test(stoppedPath));
  check("...with the script-aware estimate as the fallback", /estimateOutputTokensFromText\(assistantText\)/.test(stoppedPath));
  check("...and the input side from the stream's snapshot", /claudeStream\.currentMessage\?\.usage/.test(stoppedPath));
  check("the partial usage is recorded on the accumulator", /costs\.record\("generation", partialUsage\(snapshot, outputTokens\), claudeStream\.currentMessage\?\.model \|\| MODEL\)/.test(stoppedPath));
  check("a stop before the first word releases the hold", /if \(!assistantText\.trim\(\)\) \{[\s\S]*?releaseReservation\(user\.id, reservationId\)/.test(stoppedPath));
  check("...and gives a free message back", /if \(isFreeMessage\) await releaseFreeChatMessage\(user\.id\);/.test(stoppedPath));
  check("the stopped path hands off to the stopped-turn settlement", /await settleStoppedTurn\(\{/.test(stoppedPath));
  const helper = route.slice(route.indexOf("async function settleStoppedTurn("));
  check("the helper exists, after the handler", helper.length > 200 && route.indexOf("async function settleStoppedTurn(") > route.indexOf("export async function POST"));
  check("what was written is saved", /role: "assistant",\s*content: assistantText,/.test(helper));
  check("...before it is settled", helper.indexOf('from("chat_messages").insert') < helper.indexOf("settleReservation("));
  check("the settlement is marked stopped, with whether the count was real", /stopped: true,\s*outputTokensCounted: params\.counted,/.test(helper));
  check("memory extraction does not run on a stopped turn", !/extractAndStoreMemory/.test(stoppedPath) && !/extractAndStoreMemory/.test(helper));
  check("...so the chat's ordinary settlement still follows memory extraction (billing-coverage §12)",
    route.indexOf("await extractAndStoreMemory({") < route.indexOf("await settleReservation({"));
}

console.log("\n== 3. the client: one press, the box comes back ==");
{
  const ws = read(WORKSPACE);
  check("one AbortController per send", /const controller = new AbortController\(\);\s*abortRef\.current = controller;/.test(ws));
  check("...passed to the fetch", /signal: controller\.signal,/.test(ws));
  check("the stop handler aborts it", /function stopGeneration\(\) \{\s*abortRef\.current\?\.abort\(\);/.test(ws));
  check("...and is handed to the composer", /onStop=\{stopGeneration\}/.test(ws));
  check("an abort is not reported as a dropped connection",
    /if \(controller\.signal\.aborted\) \{\s*setStoppedNote\(true\);[\s\S]{0,200}\} else if \(streamError\) \{/.test(ws),
    "the stream-end branch must test the abort BEFORE the interrupted branch, or a stop reads as a dropped connection");
  check("...nor as a network error", /if \(controller\.signal\.aborted\) \{\s*setStoppedNote\(true\);[\s\S]*?\} else \{\s*setError\(tCommon\("networkError"\)\)/.test(ws));
  check("the balance is re-read after the server has settled", /setTimeout\(\(\) => void refreshCredits\(\), 2500\)/.test(ws));
  check("sending is cleared in finally, so the box is back at once", /finally \{[\s\S]*?setSending\(false\);/.test(ws));
  const composer = read(COMPOSER);
  check("the composer renders a stop button while sending", /sending && onStop \? \(/.test(composer) && /data-testid="chat-stop"/.test(composer));
  check("...that calls onStop", /onClick=\{onStop\}/.test(composer));
  check("...and Enter while sending stops rather than queues", /if \(sending\) \{\s*onStop\?\.\(\);\s*return;/.test(composer));
  const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  for (const l of LOCALES) {
    const chat = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.chat ?? {};
    check(`${l}: stop and stopped strings exist`, typeof chat.stop === "string" && chat.stop.length > 0 && typeof chat.stopped === "string" && chat.stopped.length > 10);
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
