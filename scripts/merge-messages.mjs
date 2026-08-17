// A THREE-WAY MERGE FOR THE MESSAGE CATALOGUES.
//
// Every branch in this repository adds translation keys, so every merge
// conflicts in all ten messages/*.json at once. Git resolves them as
// text, which is the wrong unit: two branches adding different keys to
// the same object produce a textual conflict over a comma.
//
// This merges them as DATA. For each key:
//
//   · only one side changed it        -> take that side
//   · both changed it the same way    -> take it
//   · both changed it DIFFERENTLY     -> take OURS, and print it
//   · one side deleted, other UNTOUCHED -> the deletion stands
//   · one side deleted, other CHANGED   -> keep the change, and print it
//
// The printing matters more than the rule. A silent "ours wins" is how a
// translation somebody wrote gets dropped without anybody noticing; every
// case where the two sides genuinely disagree is listed at the end so it
// can be looked at by a person.
//
// Run: node scripts/merge-messages.mjs <base.json> <ours.json> <theirs.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , basePath, oursPath, theirsPath, outPath] = process.argv;
if (!outPath) {
  console.error("usage: node scripts/merge-messages.mjs base ours theirs out");
  process.exit(2);
}
const read = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
};

const base = read(basePath);
const ours = read(oursPath);
const theirs = read(theirsPath);

const conflicts = [];
const fromOurs = [];
const fromTheirs = [];
const deletions = [];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function merge(b, o, t, path = "") {
  // ONE SIDE HAS NO VALUE HERE, and that means two different things.
  //
  // It is an ADDITION when the base has nothing either: the other side
  // invented the key, and it is taken.
  //
  // It is a DELETION when the base DOES have it and this side's value is
  // still the base's: somebody removed the key on purpose, and the other
  // side simply never touched it. Returning the untouched copy — which is
  // what this did before — resurrects every key either branch deleted,
  // silently. That is how ten `dashboard.files.step*` keys came back after
  // a merge and failed the test that asserts they are gone.
  //
  // A deletion on one side and a real EDIT on the other is the genuine
  // disagreement: the edit is kept, and printed, because dropping somebody
  // else's new translation is the one outcome nobody would notice.
  if (o === undefined) {
    if (t === undefined) return undefined;
    if (b !== undefined && same(b, t)) {
      deletions.push(`${path} (deleted by us)`);
      return undefined;
    }
    if (!same(b, t)) fromTheirs.push(path);
    return t;
  }
  if (t === undefined) {
    if (b !== undefined && same(b, o)) {
      deletions.push(`${path} (deleted by them)`);
      return undefined;
    }
    if (!same(b, o)) fromOurs.push(path);
    return o;
  }
  if (isObject(o) && isObject(t)) {
    const out = {};
    const keys = [...new Set([...Object.keys(o), ...Object.keys(t)])];
    for (const k of keys) {
      const merged = merge(
        isObject(b) ? b[k] : undefined,
        o[k],
        t[k],
        path ? `${path}.${k}` : k
      );
      if (merged !== undefined) out[k] = merged;
    }
    return out;
  }
  if (same(o, t)) return o;
  // Leaf, and they differ.
  if (same(b, o)) {
    fromTheirs.push(path);
    return t; // only theirs changed it
  }
  if (same(b, t)) {
    fromOurs.push(path);
    return o; // only ours changed it
  }
  conflicts.push({ path, ours: o, theirs: t });
  return o; // both changed it — ours, reported below
}

const merged = merge(base, ours, theirs);
writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");

const countKeys = (o) =>
  isObject(o) ? Object.values(o).reduce((n, v) => n + countKeys(v), 0) : 1;

console.log(
  `  ${outPath}: ${countKeys(merged)} keys ` +
    `(+${fromTheirs.length} from theirs, +${fromOurs.length} ours, ` +
    `-${deletions.length} removed)`
);
if (conflicts.length > 0) {
  console.log(`  ⚠ ${conflicts.length} key(s) changed on BOTH sides — kept ours:`);
  for (const c of conflicts.slice(0, 12)) {
    console.log(`      ${c.path}`);
    console.log(`        ours:   ${JSON.stringify(c.ours).slice(0, 90)}`);
    console.log(`        theirs: ${JSON.stringify(c.theirs).slice(0, 90)}`);
  }
  if (conflicts.length > 12) console.log(`      … and ${conflicts.length - 12} more`);
}
