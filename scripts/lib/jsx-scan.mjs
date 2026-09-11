// Reading JSX with a regex, twice corrected.
//
// Not a runnable check — the gate that uses it is
// scripts/tests/one-primary-action.test.mjs, and section 0 there is
// where every behaviour below is fed samples it must get right.
//
// `<(button|a|Link)\b[^>]*?>` is the obvious way to find an opening tag
// and it is wrong in a way that hid forty-six buttons from the census
// that was supposed to count every one of them: `[^>]` stops at the
// FIRST `>`, and an arrow function has one. So
//
//     <button onClick={() => setOpen(true)} className="bg-orange-500">
//
// matched as far as `() =` and the className was never read. Every
// filled accent control whose handler came before its class was
// invisible — `+ New` on eight module pages, the whole voice recorder,
// four buttons in Files, four in onboarding. The gate said "4 filled
// accent controls" about a page that drew ten.
//
// openingTags() ends a tag at the first `>` that is outside both brace
// depth and string quotes, which is where JSX actually ends it.
export function openingTags(src, names = ["button", "a", "Link"]) {
  const out = [];
  const re = new RegExp(`<(${names.join("|")})(?=[\\s/>])`, "g");
  for (const m of src.matchAll(re)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        out.push({ tag: m[1], start: m.index, end: i + 1, text: src.slice(m.index, i + 1) });
        break;
      }
      i++;
    }
  }
  return out;
}

// A MODAL IS NOT THE PAGE UNDERNEATH IT.
//
// `fixed inset-0` covers the viewport: while that element is on screen
// the page behind it is behind a scrim, and a button in each is never
// pressed in the same moment. Counting both against one screen is how
// the voice recorder — three full-screen overlays, one filled button
// each, never two at once — was charged as three to every one of the
// eighteen pages that can record.
//
// The subtree is taken by INDENTATION rather than by matching tags,
// deliberately. Matching tags means keeping a stack of element names,
// and a TypeScript generic (`useState<Record<string, string>>`) opens
// one that never closes — the stack corrupts and everything after it is
// attributed to the wrong surface. Indentation has no such failure: the
// file is Prettier-formatted, so the closing tag of a block sits at the
// column its opening tag did, and the subtree is every line indented
// deeper. Section 0 of one-primary-action feeds this both shapes.
export function overlaySpans(src) {
  const lines = src.split("\n");
  const lineStart = [];
  let offset = 0;
  for (const l of lines) {
    lineStart.push(offset);
    offset += l.length + 1;
  }
  const lineOf = (pos) => {
    let lo = 0;
    let hi = lineStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStart[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const spans = [];
  for (const t of openingTags(src, ["[A-Za-z][\\w.]*"])) {
    if (!/\bfixed\b/.test(t.text) || !/\binset-0\b/.test(t.text)) continue;
    if (/\/>\s*$/.test(t.text)) {
      // A self-closing scrim covers nothing but itself.
      spans.push({ start: t.start, end: t.end, line: lineOf(t.start) + 1 });
      continue;
    }
    const open = lineOf(t.start);
    const indent = lines[open].match(/^\s*/)[0].length;
    let close = lines.length - 1;
    for (let j = lineOf(t.end) + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") continue;
      if (lines[j].match(/^\s*/)[0].length <= indent) {
        close = j;
        break;
      }
    }
    spans.push({ start: t.start, end: lineStart[close] + lines[close].length, line: open + 1 });
  }
  return spans;
}

export function inSpans(spans, pos) {
  return spans.find((s) => pos >= s.start && pos < s.end) ?? null;
}
