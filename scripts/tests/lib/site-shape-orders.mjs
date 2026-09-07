/*
 * THE SEVEN SHAPES AND THEIR SIX ORDERS, READ OUT OF THE SHIPPED PROMPT.
 *
 * lib/website-builder.ts writes each archetype's sections ONCE, numbered,
 * and then its six orders as sequences of those numbers:
 *
 *   SECTIONS: 1 photo · 2 menu or price list or timetable · 3 hours ...
 *   ORDERS: A 1>2>3>4>5 · B 1>3>2>5>4 · C 2>1>4>3>5 · ...
 *
 * WHY THE PROMPT IS WRITTEN THAT WAY, since it reads as an optimisation
 * and is not one. Six orders spelled out in prose cost 2,206 characters
 * and the cached system prompt had EIGHTEEN characters of headroom under
 * its 30,000 ceiling — measured, not estimated. Numbering the sections
 * once and referring to them by number made room for twice as many orders
 * AND left the prompt 330 characters smaller than it was with three. It
 * also removed a real duplication: each section name used to be typed
 * three times per shape, once per order, which is three places for one
 * name to drift.
 *
 * TWO GATES READ THIS, so it is parsed in one place. A second copy of the
 * parser would agree with this one until the format changed.
 */

/** Every {shape, letter, sections} the prompt can order, expanded. */
export function parseShapeOrders(promptSrc) {
  const out = [];
  let shape = null;
  let sections = null;
  for (const line of promptSrc.split("\n")) {
    const shapeMatch = line.match(/^- ([a-z][a-z-]+):/);
    if (shapeMatch) {
      shape = shapeMatch[1];
      sections = null;
      continue;
    }
    if (!shape) continue;
    const sectionsMatch = line.trim().match(/^SECTIONS:\s*(.+?)\.?$/);
    if (sectionsMatch) {
      sections = new Map();
      for (const part of sectionsMatch[1].split("·")) {
        const m = part.trim().match(/^(\d+)\s+(.+)$/);
        if (m) sections.set(m[1], m[2].trim());
      }
      continue;
    }
    const ordersMatch = line.trim().match(/^ORDERS:\s*(.+?)\.?$/);
    if (ordersMatch && sections) {
      for (const part of ordersMatch[1].split("·")) {
        const m = part.trim().match(/^([A-F])\s+([\d>]+)$/);
        if (!m) continue;
        // AN UNKNOWN NUMBER IS DROPPED, NOT RENDERED AS "undefined". A
        // typo'd order ("1>2>9") would otherwise become a section list
        // with a hole in it that every similarity score would happily
        // measure. It is left short so the shape's own check — that all
        // six orders name every section — is what reports it.
        const list = m[2].split(">").map((n) => sections.get(n.trim())).filter(Boolean);
        out.push({ shape, letter: m[1], sections: list, digits: m[2].trim() });
      }
    }
  }
  return out;
}

/** The section names one shape declares, in their numbered order. */
export function sectionsOfShape(promptSrc, shape) {
  const block = promptSrc.slice(promptSrc.indexOf(`- ${shape}:`));
  const line = block.slice(0, block.indexOf("\n\n")).split("\n").find((l) => l.trim().startsWith("SECTIONS:"));
  if (!line) return [];
  return line.trim().replace(/^SECTIONS:\s*/, "").replace(/\.$/, "").split("·").map((p) => p.trim().replace(/^\d+\s+/, ""));
}
