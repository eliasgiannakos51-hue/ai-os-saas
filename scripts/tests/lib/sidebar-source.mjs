// WHERE ONE SIDEBAR GROUP ENDS AND THE NEXT BEGINS, ANSWERED ONCE.
//
// Four gates parsed lib/sidebar-nav.ts by finding `heading: "X"` followed
// by `collapsible: (true|false)` and slicing between the marks. Three of
// them carried the SAME paragraph about a comment being allowed between
// the two lines, because the same regression had hit each in turn on
// 2026-09-12.
//
// On 2026-09-19 the collapse was removed — every group is open now, and a
// flag that is false for every group is the dead `prominent` parameter
// components/dashboard/sidebar.tsx had already deleted once. That took
// the anchor with it and turned three gates red at the same moment, which
// is the argument for this file: the anchor is a fact about the config's
// SHAPE, and a fact four gates depend on belongs in one place.
//
// THE ANCHOR NOW is `heading: "X",` followed by the group's `items: [`,
// with comment lines allowed between them — the two keys every group has
// and cannot lose without ceasing to be a group. `items:` is the better
// half of the pair: `collapsible` was a rendering preference and this is
// the group's contents.

/** `heading: "X"` ... `items: [`, with comments allowed in between. */
const GROUP_RE = /heading: "([^"]+)",\s*(?:\n\s*(?:\/\/[^\n]*)?)*?\n\s*items: \[/g;

/**
 * Every group in the source, in declaration order, with the text of each.
 *
 * `body` runs from a group's `heading:` to the next group's, or to the end
 * of the file for the last one — the same slice all four callers made for
 * themselves, so `href:`-splitting over it behaves exactly as before.
 */
export function groupBlocks(navSrc) {
  const marks = [];
  for (const m of navSrc.matchAll(new RegExp(GROUP_RE.source, "g"))) {
    marks.push({ heading: m[1], at: m.index });
  }
  return marks.map((mark, i) => ({
    heading: mark.heading,
    at: mark.at,
    body: navSrc.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : navSrc.length),
  }));
}

/**
 * The items inside one group's `body`, as flags and an href fragment.
 *
 * Each item runs from its own `href:` to the next, so multi-line and
 * one-line object literals both fall out without a parser. `head` is the
 * slice before the next `{`, which is what makes a flag belong to THIS
 * item rather than to the one after it.
 */
export function itemChunks(body) {
  return body
    .split(/href:\s*/)
    .slice(1)
    .map((chunk) => {
      const head = chunk.split(/\n\s*\{/)[0];
      return {
        chunk,
        head,
        literalHref: chunk.match(/^["'`]([^"'`]+)["'`]/)?.[1] ?? null,
        constantHref: chunk.match(/^([A-Z_]+)\.href/)?.[1] ?? null,
        hidden: /hidden:\s*true/.test(head),
        notBuilt: /notBuilt:\s*true/.test(head),
        ownerOnly: /ownerOnly:\s*true/.test(head),
      };
    });
}
