#!/usr/bin/env node
/*
 * CAN regenerate-cost.test.mjs SEE A REGENERATE START WITHOUT THE CREDITS,
 * OR THE BUTTON CALL A CHARGED RUN FREE AGAIN — OR A SITE FLAGGED BEFORE
 * THE FIX SHOW ITS STORED PROMISE (section 3, 2026-10-08)?
 *
 * Run: node scripts/tests/regenerate-cost.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/regenerate-cost.test.mjs";
const ROUTE = "src/app/api/websites/[id]/regenerate/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";
const NOTICE = "src/lib/websites/flagged-notice.ts";
const SHELL = "src/components/website-builder/website-shell.tsx";
const WORKER = "src/app/api/websites/generate/process/route.ts";
const CHAT_PANE = "src/components/chat/site-pane.tsx";
const STUDIO = "src/lib/create-studio/use-create-studio.ts";

const MUTANTS = [
  {
    name: "the regenerate starts without asking the balance",
    file: ROUTE,
    from: "    if (!isAdminEmail(user.email) && !(await hasActiveBetaBypass(user))) {",
    to: "    if (false) {",
    expect: "only admin and beta skip it",
  },
  {
    name: "the balance is asked for nothing",
    file: ROUTE,
    from: "hasEnoughCredits(user.id, estimate.reserveCredits, plan)",
    to: "hasEnoughCredits(user.id, 0, plan)",
    expect: "against the estimate of the same action",
  },
  {
    name: "the refusal goes back to an English sentence",
    file: ROUTE,
    from: '            code: "insufficient_credits",',
    to: '            error: "Not enough credits.",',
    expect: "refuses with a code the screen translates",
  },
  {
    name: "the button says free again",
    file: WORKSPACE,
    from: '                      {t("regeneratePaid", {',
    to: '                      {t("regenerateFree")}{false && t("regeneratePaid", {',
    expect: "...and no longer says free",
  },
  {
    name: "the flagged panel shows the stored sentence again",
    file: WORKSPACE,
    from: 'data-testid="flagged-body">{t("flaggedBody")}</p>',
    to: 'data-testid="flagged-body">{previewWebsite.error_message}</p>',
    expect: "...and never puts the stored sentence on the screen",
  },
  {
    name: "the reader keeps the promise with the findings",
    file: NOTICE,
    from: "  const end = rest.search(/\\. You can regenerate it\\b/);",
    to: "  const end = -1;",
    expect: "...and never its promise",
  },
  {
    name: "the reader shows any stored message",
    file: NOTICE,
    from: '  if (typeof stored !== "string" || !stored.startsWith(FLAGGED_PREFIX)) return null;',
    to: '  if (typeof stored !== "string") return null;\n  if (!stored.startsWith(FLAGGED_PREFIX)) return stored;',
    expect: "a stored message in a shape nobody wrote shows nothing",
  },
  {
    name: "the flagged toast shows the stored sentence again",
    file: WORKSPACE,
    from: 'addToast(`⚠ ${t("flaggedTitle")}`, "error");',
    to: 'addToast(`⚠ ${record.error_message ?? t("flaggedTitle")}`, "error");',
    expect: "the flagged toast is the reader's language too",
  },
  {
    name: "the tool shell says a flagged site with the stored sentence",
    file: SHELL,
    from: 'current.status === "flagged" ? t("flaggedBody") : current.error_message',
    to: 'current.error_message',
    expect: "the tool shell says a flagged site in the reader's language",
  },
  {
    name: "Chat's site pane says a held site with the stored sentence again",
    file: CHAT_PANE,
    from: '        } else if (done.status === "flagged") {\n          // Never the stored sentence: it is English whatever the reader\'s\n          // language, and it speaks of a button this pane does not have\n          // (src/lib/websites/flagged-notice.ts).\n          failWith(`${tSite("flaggedTitle")}. ${tSite("flaggedBody")}`);\n',
    to: "",
    expect: "Chat's site pane says a held site in the reader's language",
  },
  {
    name: "Create Studio lists a held site with the stored sentence again",
    file: STUDIO,
    from: '              : record.status === "flagged"\n                ? `${tSite("flaggedTitle")}. ${tSite("flaggedBody")}`\n                : record.error_message ?? undefined',
    to: "              : record.error_message ?? undefined",
    expect: "Create Studio says a held site in the reader's language",
  },
  {
    name: "the worker writes its own sentence again",
    file: WORKER,
    from: "error_message: isFlagged ? flaggedMessage(flaggedSummary) : null,",
    to: "error_message: isFlagged ? `Flagged: ${flaggedSummary}. You can regenerate it.` : null,",
    expect: "the worker writes the flag sentence from that one definition",
  },
];

runMutations({ name: "regenerate-cost", gate: GATE, targets: [ROUTE, WORKSPACE, NOTICE, SHELL, WORKER, CHAT_PANE, STUDIO], mutants: MUTANTS });
