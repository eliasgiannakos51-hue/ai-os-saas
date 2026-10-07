#!/usr/bin/env node
/*
 * CAN brand-memory.test.mjs SEE THE BUSINESS GET LOST ON THE WAY?
 *
 * A colour name not found, the shorter name winning over the longer, the
 * brand lines recorded as one row, the oldest name winning, a name the
 * brief already says added twice, the person's own colours for this site
 * overridden, the switch ignored by the chat or by the site, the brief
 * built and never sent, the note never written, and a language losing
 * the sentence.
 *
 * Run: node scripts/tests/brand-memory.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/brand-memory.test.mjs";
const BRAND = "src/lib/memory/brand.ts";
const EXTRACTOR = "src/lib/chat/memory.ts";
const CHAT = "src/app/api/chat/route.ts";
const SITE = "src/app/api/websites/generate/process/route.ts";
const NOTES = "src/lib/website-generation-notes.ts";
const EL = "messages/el.json";

const MUTANTS = [
  {
    name: "a colour word is matched only as the whole answer",
    file: BRAND,
    from: 'if (folded === word || new RegExp(`(^|[^\\\\p{L}])${word}($|[^\\\\p{L}])`, "u").test(folded)) return hex;',
    to: "if (folded === word) return hex;",
    expect: '"Χρυσαφί χρυσό" -> #c9a227',
  },
  {
    name: "a colour is found inside any word",
    file: BRAND,
    from: 'if (folded === word || new RegExp(`(^|[^\\\\p{L}])${word}($|[^\\\\p{L}])`, "u").test(folded)) return hex;',
    to: "if (folded.includes(word)) return hex;",
    expect: "a word inside another word is not a colour",
  },
  {
    name: "the brand lines stay in one row with the rest",
    file: BRAND,
    from: "    if (line.startsWith(BRAND_NAME_PREFIX) || line.startsWith(BRAND_COLOURS_PREFIX)) {",
    to: "    if (false) {",
    expect: "three rows: the fact, the name, the colours",
  },
  {
    name: "the oldest name wins",
    file: BRAND,
    from: "    if (name === null && t.startsWith(BRAND_NAME_PREFIX)) {",
    to: "    if (t.startsWith(BRAND_NAME_PREFIX)) {",
    expect: "the newest name",
  },
  {
    name: "a name the brief already says is added again",
    file: BRAND,
    from: "if (brand.name && !foldForMatch(description).includes(foldForMatch(brand.name))) {",
    to: "if (brand.name) {",
    expect: "a name the brief already says is not added again",
  },
  {
    name: "the person's own colours for this site are overridden",
    file: BRAND,
    from: "if (brand.colours.length > 0 && !/PRIMARY COLOUR:/.test(description)) {",
    to: "if (brand.colours.length > 0) {",
    expect: "colours chosen in the form for this site win",
  },
  {
    name: "the chat asks for the brand lines whatever the switch says",
    file: EXTRACTOR,
    from: "system: brand ? `${EXTRACTION_SYSTEM_PROMPT}${BRAND_EXTRACTION_RULE}` : EXTRACTION_SYSTEM_PROMPT,",
    to: "system: `${EXTRACTION_SYSTEM_PROMPT}${BRAND_EXTRACTION_RULE}`,",
    expect: "the extractor asks for the brand lines only with the switch on",
  },
  {
    name: "the chat never passes the switch",
    file: CHAT,
    from: '            brand: await isFeatureOn("brand-memory", user),\n',
    to: "",
    expect: "the chat passes the switch",
  },
  {
    name: "the site reads the business without the switch",
    file: SITE,
    from: '        (await isFeatureOn("brand-memory", user))\n',
    to: "        true\n",
    expect: "the site reads the business under the website memory rule AND the switch",
  },
  {
    name: "the brief is built and never sent",
    file: SITE,
    from: '        `${description}${brand?.brief ?? ""}`,',
    to: "        description,",
    expect: "the model is sent the brief with it",
  },
  {
    name: "what was used is never noted",
    file: SITE,
    from: '        notes.push({ kind: "fromMemory", name: brand.used.name, colours: brand.used.colours });\n',
    to: "",
    expect: "what was used is a note on the row",
  },
  {
    name: "the note is read back with whatever it holds",
    file: NOTES,
    from: '? n.colours.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim().slice(0, 30)).slice(0, 4)',
    to: "? (n.colours as string[])",
    expect: "a note is read back with only its strings",
  },
  {
    name: "Greek loses the sentence",
    file: EL,
    from: '"both": "Από τη μνήμη: το όνομα «{name}» και τα χρώματα {colours}. Για να τα αλλάξεις, πες το στο Chat."',
    to: '"both": "Από τη μνήμη."',
    expect: "el.json: the three sentences",
  },
];

runMutations({
  name: "brand-memory",
  gate: GATE,
  targets: [BRAND, EXTRACTOR, CHAT, SITE, NOTES, EL],
  mutants: MUTANTS,
});
