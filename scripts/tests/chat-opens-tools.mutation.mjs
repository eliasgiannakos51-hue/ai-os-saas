#!/usr/bin/env node
/*
 * CAN chat-opens-tools.test.mjs SEE CHAT OPEN THE WRONG THING, OR NOTHING?
 *
 * A remark that opens a tool, an unaccented request that does not, a
 * question that opens one, a second worker for one site, questions taken
 * for a site, a failed read that ends the watch, a watch that outlives its
 * screen, a part sent with every change, a request that still reaches the
 * model, the next message answered in words, the switch ignored, the
 * answers to the questions sent back for more questions, a preview given
 * scripts, and a language losing its button.
 *
 * Run: node scripts/tests/chat-opens-tools.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/chat-opens-tools.test.mjs";
const RUN = "scripts/tests/chat-opens-tools.itest.mjs";
const OPEN = "src/lib/chat/open-tool.ts";
const INTENT = "src/lib/create-studio/intent-signals.ts";
const REQ = "src/lib/website-builder/site-requests.ts";
const CHAT = "src/components/chat/chat-workspace.tsx";
const PAGE = "src/app/dashboard/chat/page.tsx";
const PANE = "src/components/chat/site-pane.tsx";
const EL = "messages/el.json";
const GENERATE = "src/app/api/websites/generate/route.ts";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const WORDS = "src/components/chat/use-chat-failure-words.ts";
const RAIL = "src/lib/nav/rail.ts";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";

const MUTANTS = [
  {
    name: "a remark about a site opens it",
    file: OPEN,
    from: 'return match.kind === "one" && match.producer === "website" && opensWithInstruction(text, locale);',
    to: 'return match.kind === "one" && match.producer === "website";',
    expect: "stays in the conversation: «μου αρέσει το site της Apple»",
  },
  {
    name: "an instruction typed without accents is not one",
    file: INTENT,
    from: "  const opens = (map: Record<string, string[]>) => allPhrases(map, locale).some((p) => startsWithWord(text, foldForMatch(p)));",
    to: "  const opens = (map: Record<string, string[]>) => allPhrases(map, locale).some((p) => startsWithWord(text, p));",
    expect: "opens: «φτιαξε μου site για το camping»",
  },
  {
    name: "a want that is a question opens it",
    file: INTENT,
    from: "  return !allPhrases(INTERROGATIVES, locale).some((p) => containsWord(text, foldForMatch(p))) && !QUESTION_MARKS.test(raw.trim());",
    to: "  return true;",
    expect: "stays in the conversation: «θέλω να μάθω πώς φτιάχνεται ένα site»",
  },
  {
    name: "a second worker for a suppressed duplicate",
    gate: RUN,
    file: REQ,
    from: "  if (!data.duplicateSuppressed) {",
    to: "  if (true) {",
    expect: "a duplicate the server suppressed starts no second worker",
  },
  {
    name: "questions are taken for a site",
    gate: RUN,
    file: REQ,
    from: '  if (data.needsClarification) return { kind: "questions", questions: (data.questions as string[]) ?? [] };\n',
    to: "",
    expect: "questions come back as questions",
  },
  {
    name: "a failed read ends the watch",
    gate: RUN,
    file: REQ,
    from: "      if (!res.ok || !data.ok) {\n        if (handlers.alive()) setTimeout(tick, SITE_POLL_INTERVAL_MS);\n        return;\n      }",
    to: "      if (!res.ok || !data.ok) {\n        return;\n      }",
    expect: "a failed read is retried",
  },
  {
    name: "the watch outlives its screen",
    gate: RUN,
    file: REQ,
    from: "    if (!handlers.alive()) return;\n    let record",
    to: "    let record",
    expect: "a screen that is gone stops the watch before it asks",
  },
  {
    name: "every change is sent with a part",
    gate: RUN,
    file: REQ,
    from: "      ...(input.section === null || input.section === undefined ? {} : { section: input.section }),",
    to: "      section: input.section ?? 0,",
    expect: "goes without a part unless one was chosen",
  },
  {
    name: "a request for a site still reaches the model",
    file: CHAT,
    from: "      setSiteHidden(false);\n      setSiteBrief(text);\n      return;\n    }",
    to: "      setSiteHidden(false);\n      setSiteBrief(text);\n    }",
    expect: "a request for a site opens it and returns",
  },
  {
    name: "the next message is answered in words, not by the open site",
    file: CHAT,
    from: "    if (siteBrief !== null && sitePaneRef.current?.take(text)) {",
    to: "    if (false) {",
    expect: "what is said next goes to the open site first",
  },
  {
    name: "the switch is ignored",
    file: PAGE,
    from: '    isFeatureOn("chat-opens-tools", user),\n  ]);',
    to: "    Promise.resolve(true),\n  ]);",
    expect: "the Chat page reads it",
  },
  {
    name: "the answers are sent back for more questions",
    file: PANE,
    from: "        void make(enriched, true);",
    to: "        void make(enriched, false);",
    expect: "the questions: answered in the Chat field, or skipped",
  },
  {
    name: "the preview runs scripts",
    file: PANE,
    from: 'srcDoc={html} sandbox="" ',
    to: 'srcDoc={html} sandbox="allow-scripts" ',
    expect: "the preview is sandboxed",
  },
  {
    name: "Greek loses the button",
    file: EL,
    from: '"make": "Φτιάξ’ το",',
    to: '"make": "",',
    expect: "el.json: the pane's words",
  },
  // THE «Νέα συνομιλία» MUTANT WAS HERE, AND ITS TARGET IS GONE.
  //
  // It re-introduced package 7's defect: startNewChat() cleared the site
  // pane by hand, because a Site opened in a conversation that never
  // reached /api/chat has no id, so setActiveId(null) changed nothing
  // the pane was watching and the next sentence went to the site as a
  // CHARGED change. Deleting the two setters brought that back and this
  // suite caught it.
  //
  // On 2026-10-16 the owner had the conversation list taken out of the
  // sidebar, and the drawer inside Chat — which held the only «Νέα
  // συνομιλία» button — went with it. startNewChat() had no caller left
  // and was removed. Starting a new conversation is a NAVIGATION now,
  // so the workspace remounts and no state can survive it: there is no
  // line left to break, which is why this mutant is deleted rather than
  // re-pointed. chat-opens-tools.prodtest.mjs still proves the money
  // half — it opens a Site, navigates the way the rail's «New» does,
  // and requires the next sentence to start a conversation rather than
  // edit the site.
  // AND THE THREE THAT REPLACED IT. The money half is now carried by a
  // navigation rather than by two setters, so what has to be broken is
  // the navigation: a conversation started in place, a «New» that does
  // not leave the page, or a pane kept where an unmount cannot reach.
  {
    name: "a new conversation is started in place again, without closing the pane",
    file: CHAT,
    from: "  // THE «NEW CHAT» BUTTON THAT USED TO LIVE HERE IS GONE WITH ITS",
    to: "  function startNewChat() { setActiveId(null); setMessages([]); }\n  // THE «NEW CHAT» BUTTON THAT USED TO LIVE HERE IS GONE WITH ITS",
    expect: "nothing starts a conversation in place any more",
  },
  {
    name: "«New» stops being a link and the workspace never unmounts",
    file: SIDEBAR,
    from: "      <Link\n        href={href}",
    to: "      <button\n        data-href={href}",
    expect: "«New» is a link to another page, so the workspace unmounts",
  },
  {
    name: "the open Site is kept where a remount cannot clear it",
    file: CHAT,
    from: "  const [siteBrief, setSiteBrief] = useState<string | null>(null);",
    to: "  const siteBriefRef = useRef<string | null>(null);\n  const [siteBrief, setSiteBrief] = useState<string | null>(siteBriefRef.current);",
    expect: "the pane's state cannot survive that unmount",
  },

  // ---- 2026-10-08, the edges (scripts/tests/chat-opens-tools-edges.prodtest.mjs)
  {
    name: "a Free account is offered «Φτιάξ' το» and refused in English",
    file: PAGE,
    from: "        siteWall={siteWall}",
    to: "        siteWall={null}",
    expect: "a plan without the Site gets the plan's wall in the pane",
  },
  {
    name: "the pane ignores the wall it is given",
    file: PANE,
    from: 'useState<Stage>(wall ? "locked" : "confirm")',
    to: 'useState<Stage>("confirm")',
    expect: "the plan's wall, before anything is offered",
  },
  {
    name: "a failed site shows the worker's English sentence again",
    file: PANE,
    from: "          failWith(whyNotMade(done));",
    to: "          failWith(done.error_message ?? whyNotMade(done));",
    expect: "a site that failed is said in the pane's own words",
  },
  {
    name: "a refused change shows the server's sentence again",
    file: PANE,
    from: "                  : describe(outcome.error).text\n",
    to: "                  : outcome.error.message\n",
    expect: "a server sentence is never shown as it came, on any screen",
  },
  {
    name: "no credits is said in the route's English",
    file: PANE,
    from: '      if (outcome.kind === "refused" && outcome.code === "insufficientCredits") {\n        void refreshCredits();',
    to: '      if (outcome.kind === "refused" && outcome.code === "never") {\n        void refreshCredits();',
    expect: "no credits is said by the credits notice",
  },
  {
    name: "the Site's main credit refusal stops sending its code",
    file: GENERATE,
    from: '          available: check.remaining,\n          needed: estimatedCost,',
    to: "",
    expect: "no credits is said by the credits notice",
  },
  {
    name: "Chat sets the route's English sentence as its error again",
    file: WORDS,
    from: "if (data?.rateLimited) return data.outOfCredits === true ? outOfCredits(data.available, data.needed) : said(429, data);",
    to: "if (data?.rateLimited) return data.outOfCredits === \"never\" ? outOfCredits(data.available, data.needed) : said(429, data);",
    expect: "Chat says no credits in its own words",
  },
  {
    name: "a hold refused inside the answer reads as our own failure again",
    file: WORDS,
    from: "        if (event.outOfCredits === true) return outOfCredits(event.available, event.needed);",
    to: "        if (event.outOfCredits === true) return said(500, {});",
    expect: "Chat says no credits in its own words",
  },
  {
    name: "the chat route stops sending the numbers",
    file: CHAT_ROUTE,
    from: '          available: check.remaining,\n          needed: estimate.reserveCredits,',
    to: "",
    expect: "Chat says no credits in its own words",
  },
  // ---- 2026-10-09, a change with no credits (chat-opens-tools-edges part 5)
  {
    name: "a change with no credits reads as «could not create the website» again",
    file: PANE,
    from: '      if (outcome.kind === "refused" && outcome.code === "insufficientCredits") {\n        // NO CREDITS FOR A CHANGE',
    to: '      if (outcome.kind === "refused" && outcome.code === "never") {\n        // NO CREDITS FOR A CHANGE',
    expect: "no credits for a change is said by the credits notice too",
  },
  {
    name: "the edit route stops sending its code",
    file: EDIT,
    from: '          code: "insufficientCredits",\n          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),\n          available: check.remaining,\n          needed: estimate.reserveCredits,',
    to: "          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),",
    expect: "no credits for a change is said by the credits notice too",
  },
  {
    // The field was removed on 2026-10-14 because nobody read it and a
    // dead field invites the English back. This is the check that the
    // shape really stops carrying it.
    name: "the classifier's own sentence is carried to the screen again",
    file: REQ,
    gate: RUN,
    from: '    return { kind: "notMade", offTopic: data.offTopic === true };',
    to: '    return { kind: "notMade", offTopic: data.offTopic === true, message: typeof data.message === "string" ? data.message : null };',
    expect: "the server's own sentence is not carried to the screen",
  },
];

runMutations({
  name: "chat-opens-tools",
  gate: GATE,
  targets: [OPEN, INTENT, REQ, CHAT, PAGE, PANE, EL, GENERATE, CHAT_ROUTE, EDIT, WORDS, RAIL, SIDEBAR],
  mutants: MUTANTS,
});
