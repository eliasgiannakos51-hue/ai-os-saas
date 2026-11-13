#!/usr/bin/env node
/*
 * CAN site-pick-frame.test.mjs SEE THE PRESSABLE PREVIEW RUN MORE THAN ITS OWN SCRIPT?
 *
 * Each mutant gives the editor layout's site preview one thing it must not
 * have, or blinds the gate's own measurement:
 *
 *   1. the frame gains the app's origin (allow-same-origin)
 *   2. the frame is drawn with a sandbox written inline, not the constant
 *   3. the picker is edited and its hash is not
 *   4. the policy admits inline scripts as well
 *   5. the policy is written AFTER the page's own head, not first
 *   6. the policy is dropped and the picker kept
 *   7. the parts are numbered from 0, so "part 3" is another element
 *   8. the chosen part is outlined in the old blue
 *   9. the app takes a message from any window, not the frame's own
 *  10. a negative index is taken as a part
 *  11. Site takes an index past the parts it has
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/site-pick-frame.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/site-pick-frame.test.mjs";
const PICKER = "src/lib/website-builder/preview-picker.ts";
const FRAME = "src/components/website-builder/site-pick-frame.tsx";
const SITE = "src/components/website-builder/website-shell.tsx";
const BOXES = "src/lib/website-boxes.ts";

const MUTANTS = [
  {
    name: "the frame gains the app's origin",
    file: PICKER,
    from: 'export const PICKER_SANDBOX = "allow-scripts";',
    to: 'export const PICKER_SANDBOX = "allow-scripts allow-same-origin";',
    expect: "the sandbox is exactly allow-scripts",
  },
  {
    name: "the frame's sandbox is written inline instead of the constant",
    file: FRAME,
    from: "sandbox={PICKER_SANDBOX}",
    to: 'sandbox="allow-scripts allow-forms"',
    expect: "...drawn from that constant",
  },
  {
    name: "the picker is edited and its hash is not",
    file: PICKER,
    from: "'window.addEventListener(\"resize\",place);",
    to: "'window.addEventListener(\"resize\",place);window.addEventListener(\"scroll\",place);",
    expect: "the hash is the picker's own",
  },
  {
    name: "the policy admits inline scripts as well",
    file: PICKER,
    from: "export const PICKER_CSP = `script-src 'sha256-${PICKER_SCRIPT_SHA256}'`;",
    to: "export const PICKER_CSP = `script-src 'sha256-${PICKER_SCRIPT_SHA256}' 'unsafe-inline'`;",
    expect: "the policy is that hash and nothing else",
  },
  {
    name: "the policy is written after the page's own head",
    file: PICKER,
    from: "return doctype ? `${doctype[0]}${head}${out.slice(doctype[0].length)}` : `${head}${out}`;",
    to: "return out.replace(/<\\/head>/i, `${head}</head>`);",
    expect: "the policy is the first thing after the doctype",
  },
  {
    name: "the policy is dropped and the picker kept",
    file: PICKER,
    from: '    `<meta http-equiv="Content-Security-Policy" content="${PICKER_CSP}">` +\n',
    to: "",
    expect: "...before every script of the page's own",
  },
  {
    name: "the parts are numbered from 0",
    file: BOXES,
    from: 'out = withAttribute(out, boxes[i], `data-ionexa-n="${i + 1}"${i === selected ? " data-ionexa-on" : ""}`);',
    to: 'out = withAttribute(out, boxes[i], `data-ionexa-n="${i}"${i === selected ? " data-ionexa-on" : ""}`);',
    expect: "every part the scanner finds is numbered, in order",
  },
  {
    name: "the chosen part is outlined in the old blue",
    file: PICKER,
    from: 'export const PRODUCT_WHITE = "#F5F7FB";',
    to: 'export const PRODUCT_WHITE = "#2563EB";',
    expect: "the white is --foreground",
  },
  {
    name: "the app takes a message from any window",
    file: FRAME,
    from: "if (!frame.current || event.source !== frame.current.contentWindow) return;",
    to: "if (!frame.current) return;",
    expect: "the message's window is checked against this frame's own",
  },
  {
    name: "a negative index is taken as a part",
    file: PICKER,
    from: 'if (message.type === "pick" && Number.isInteger(message.index) && (message.index as number) >= 0)',
    to: 'if (message.type === "pick" && Number.isInteger(message.index))',
    expect: "...anything else is not",
  },
  {
    name: "Site takes an index past the parts it has",
    file: SITE,
    from: "if (i >= boxes.length) return;\n",
    to: "",
    expect: "...and Site checks the index against the parts it has",
  },
];

runMutations({ name: "site-pick-frame", gate: GATE, targets: [GATE, PICKER, FRAME, SITE, BOXES], mutants: MUTANTS });
