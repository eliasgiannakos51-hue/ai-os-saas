/**
 * SIX PRODUCERS, MATCHED WITHOUT SPENDING ANYTHING.
 *
 * route_entry (lib/create-studio/route-entry.ts) routes free text into
 * one of THIRTEEN TRACKERS: it decides which table a sentence becomes a
 * row in. That is the right answer for "coffee 4.50" and the wrong one
 * for "θέλω e-shop", which is not a row anywhere — it is a job for the
 * Website Builder, one page away, with the sentence the person already
 * typed.
 *
 * This file is the layer in front of it, and it is FREE: a deterministic
 * read of the text, in the browser, before any model is called. It never
 * creates anything. It answers one question — "is this obviously a job
 * for a producer, and which one" — and the caller then shows the price
 * and asks before going anywhere.
 *
 * WHY THE OBJECT AND NOT THE VERB. Every one of these requests opens with
 * the same handful of verbs — φτιάξε / make / build / γράψε / write. The
 * verb says that something should be produced; the NOUN says what. So the
 * cues here are objects: website, έρευνα, ανάρτηση, παρουσίαση, κώδικας,
 * agent. lib/create-studio/intent-signals.ts already reads the verb, for
 * a different question, and the two do not overlap.
 *
 * WRITTEN FOR MATCHING, NOT FOR READING, and this project has the scar:
 * a module vocabulary built out of interface nouns answered 12 of 130
 * verb-led questions. Every cue below is folded (lowercase, no accents),
 * matched with a boundary that works for its script through
 * lib/text/unicode-patterns.ts, and NEVER with `\b` — which is defined on
 * [A-Za-z0-9_] and matches nothing in Greek, Arabic or Chinese.
 *
 * GREEKLISH IS A SEVENTH SURFACE. "ftiakse mou istoselida" is what a
 * person on an English keyboard types, and it contains no Greek letter at
 * all, so folding cannot reach it. textHasGreeklishStem does, and it is
 * the same implementation the other six surfaces use.
 *
 * TWO PRODUCERS MATCHING IS NOT A TIE TO BREAK. "φτιάξε παρουσίαση και
 * ανάρτηση" is a real request and this file cannot serve it; it says
 * `ambiguous` and the caller asks. Guessing here would send the brief to
 * one of two pages and lose the other half of it.
 *
 * Pure and client-safe on purpose: no SDK, no database, no "server-only",
 * so scripts/tests/producer-routes.test.mjs can measure it directly and
 * the browser can run it before the request is sent.
 */
import type { ActionProfileKey } from "@/lib/billing/estimate";
import { MAX_EXAMPLE_CHARS, readExampleParam } from "@/lib/overview/first-screen-examples";
import { boundedPattern, foldForMatch, stem, textHasGreeklishStem, word } from "@/lib/text/unicode-patterns";

export const PRODUCERS = ["website", "research", "posts", "presentation", "coding", "agent"] as const;
export type ProducerKey = (typeof PRODUCERS)[number];

export function isProducerKey(value: unknown): value is ProducerKey {
  return typeof value === "string" && (PRODUCERS as readonly string[]).includes(value);
}

/**
 * NOT A SECOND MECHANISM. lib/overview/first-screen-examples.ts already
 * carries text into a destination through a named query parameter, with
 * one clamp shared by every page and a gate that compares the name on
 * both sides. This reuses that reader and that ceiling rather than
 * inventing a parallel pair — two clamps drift, and the one that drifts
 * is the one nobody is looking at.
 *
 * Re-exported as a value rather than with `export ... from`: the loader
 * scripts/tests uses concatenates modules into one scope and a bare
 * re-export arrives undefined there, which would make the gate's ceiling
 * check pass against nothing.
 */
export const MAX_BRIEF_CHARS = MAX_EXAMPLE_CHARS;

export type ProducerSpec = {
  key: ProducerKey;
  /** Where it goes. */
  path: string;
  /**
   * What the destination is CALLED — the sidebar's own message key, not a
   * second name invented for a confirmation. "Goals & Plans" in the nav
   * became "Mission Control" in a receipt exactly once, and this is how
   * that stopped happening.
   */
  destinationKey: string;
  /**
   * The query parameter this destination reads the brief from.
   *
   * A RUNTIME STRING ON BOTH SIDES: nothing in the compiler connects
   * `?brief=` in a link to `searchParams.brief` in a page. Declared here
   * so scripts/tests/producer-routes.test.mjs can read both and compare,
   * the same way first-screen.test.mjs does for the three examples.
   * `agent` rather than `brief` for the agents page because that page
   * already reads `agent` and a second name for the same thing is how a
   * link quietly stops working.
   */
  param: string;
  /**
   * Which billing profile the destination's own action runs on, so the
   * preview can price the thing it is about to open. `null` means the
   * page itself charges nothing until the person presses its own button.
   */
  profile: ActionProfileKey | null;
  /**
   * Folded object-words, by script family rather than by locale: a cue
   * only has to be in the list once, and a person typing Greek nouns
   * inside an English sentence is served either way.
   */
  cues: string[];
  /** Cue STEMS, for the languages that inflect the noun. */
  stems: string[];
  /**
   * The Greek STEMS fed to the greeklish reader. Stems, not whole words:
   * textHasGreeklishStem compares a typed token against the stem plus up
   * to MAX_INFLECTION letters, so a full word is LONGER than the token a
   * person types — "κώδικας" never matches "kodika" and "κωδικ" does.
   */
  greek: string[];
};

export const PRODUCER_SPECS: Record<ProducerKey, ProducerSpec> = {
  website: {
    key: "website",
    path: "/dashboard/website-builder",
    destinationKey: "sidebar.items.websiteBuilder",
    param: "brief",
    profile: "websiteGenerate",
    cues: [
      "website", "web site", "site", "webpage", "web page", "eshop", "e shop",
      "landing page", "sitio web", "pagina web", "site web", "webseite",
      "webshop", "onlineshop", "online shop", "loja", "tienda online",
      "网站", "网店", "ウェブサイト", "サイト", "موقع", "متجر",
    ],
    stems: ["ιστοσελιδ", "ιστοτοπ", "καταστημ"],
    greek: ["ιστοσελιδ", "ιστοτοπ", "καταστημ"],
  },
  research: {
    key: "research",
    path: "/dashboard/deep-research",
    destinationKey: "sidebar.items.deepResearch",
    param: "brief",
    profile: "deepResearch",
    cues: [
      "research", "deep research", "market research", "investigacion",
      "recherche", "recherches", "ricerca", "pesquisa", "recherche de marche",
      "marktforschung", "调研", "研究", "市场调查", "リサーチ", "調査", "بحث", "دراسة",
    ],
    stems: ["ερευν", "μελετ"],
    greek: ["ερευν", "μελετ"],
  },
  posts: {
    key: "posts",
    path: "/dashboard/posts",
    destinationKey: "sidebar.items.posts",
    param: "brief",
    profile: "postsGenerate",
    cues: [
      "post", "posts", "caption", "captions", "publicacion", "publicaciones",
      "publication", "beitrag", "postagem", "帖子", "文案", "投稿", "منشور",
    ],
    stems: ["αναρτησ", "λεζαντ"],
    greek: ["αναρτησ", "λεζαντ"],
  },
  presentation: {
    key: "presentation",
    path: "/dashboard/presentations",
    destinationKey: "sidebar.items.presentations",
    param: "brief",
    profile: "presentationGenerate",
    cues: [
      "presentation", "slides", "slide deck", "deck", "powerpoint", "pptx",
      "presentacion", "diapositivas", "presentazione", "apresentacao",
      "prasentation", "演示", "幻灯片", "プレゼン", "スライド", "عرض تقديمي", "شرائح",
    ],
    stems: ["παρουσιασ", "διαφανει"],
    greek: ["παρουσιασ", "διαφανει"],
  },
  coding: {
    key: "coding",
    path: "/dashboard/coding",
    destinationKey: "sidebar.items.coding",
    param: "brief",
    profile: "codeAssist",
    cues: [
      "code", "script", "function", "snippet", "sql", "regex", "codigo",
      "guion", "fonction", "funzione", "funcao", "代码", "脚本", "函数",
      "コード", "スクリプト", "كود", "برمجة",
    ],
    stems: ["κωδικ", "συναρτησ", "σεναρι"],
    greek: ["κωδικ", "συναρτησ", "σεναρι"],
  },
  agent: {
    key: "agent",
    path: "/dashboard/agents",
    destinationKey: "sidebar.items.agents",
    param: "agent",
    profile: "agentBuild",
    cues: [
      "agent", "agents", "agente", "agenti", "agentes", "代理", "智能体",
      "エージェント", "وكيل",
    ],
    stems: ["πρακτορ", "βοηθ"],
    greek: ["πρακτορ", "βοηθ"],
  },
};

export type ProducerMatch =
  | { kind: "one"; producer: ProducerKey; cue: string }
  | { kind: "ambiguous"; producers: ProducerKey[] }
  | { kind: "none" };

/**
 * Which producers this text names.
 *
 * The folded pass and the greeklish pass are separate on purpose:
 * textHasGreeklishStem refuses text that already contains a Greek letter,
 * so the two never both fire on the same input and a Greek speaker is
 * never matched twice for one word.
 */
/**
 * EVERY DASH IS A SPACE, FOR MATCHING ONLY.
 *
 * foldForMatch lowercases and strips accents and leaves the hyphen alone,
 * so "e-shop" is one token and the cue "e shop" never touches it. Found
 * by the first run of this file's own probe on the most obvious Greek
 * sentence there is — "θέλω ένα e-shop" — which returned nothing. Listing
 * every hyphenated spelling instead would be a combinatorial list that is
 * also wrong for U+2011, the non-breaking hyphen a word processor
 * inserts. \p{Pd} is the whole dash family in one rule.
 */
const DASHES = /\p{Pd}/gu;

/**
 * SCRIPTS WITH NO SPACE BETWEEN WORDS, WHERE A BOUNDARY IS THE WRONG TEST.
 *
 * boundedPattern demands a non-letter on each side of the cue. In
 * "我想要一个网站" the character before 网站 is 个, which IS a letter, so
 * every Chinese and Japanese cue in the table above would match nothing —
 * silently, in two languages, exactly the way `\b` fails in Greek. There
 * is no boundary to test in these scripts, so containment is the whole
 * test, which is the same split lib/create-studio/intent-signals.ts makes
 * for the same reason.
 */
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function producersNamedIn(text: string): { key: ProducerKey; cue: string }[] {
  const folded = foldForMatch(text).replace(DASHES, " ");
  const hits: { key: ProducerKey; cue: string }[] = [];
  for (const key of PRODUCERS) {
    const spec = PRODUCER_SPECS[key];
    let cue: string | null = null;
    const spaced = spec.cues.filter((c) => !NO_SPACE_SCRIPT.test(c));
    const unspaced = spec.cues.filter((c) => NO_SPACE_SCRIPT.test(c));
    if (spaced.length > 0) {
      const pattern = boundedPattern(word(...spaced));
      const m = pattern.exec(folded);
      if (m) cue = m[0].slice(m[1].length);
    }
    if (!cue) cue = unspaced.find((c) => folded.includes(c)) ?? null;
    if (!cue && spec.stems.length > 0) {
      const pattern = boundedPattern(stem(...spec.stems));
      const m = pattern.exec(folded);
      if (m) cue = m[0].slice(m[1].length);
    }
    if (!cue && spec.greek.length > 0 && textHasGreeklishStem(text, spec.greek)) {
      cue = "greeklish";
    }
    if (cue) hits.push({ key, cue });
  }
  return hits;
}

export function matchProducer(text: string): ProducerMatch {
  const raw = String(text ?? "").trim();
  if (!raw) return { kind: "none" };
  const hits = producersNamedIn(raw);
  if (hits.length === 0) return { kind: "none" };
  if (hits.length > 1) return { kind: "ambiguous", producers: hits.map((h) => h.key) };
  return { kind: "one", producer: hits[0].key, cue: hits[0].cue };
}

/**
 * The destination, with the brief carried.
 *
 * A LINK IS AN AGREEMENT BETWEEN TWO FILES. Every path below has a page
 * that reads BRIEF_PARAM out of its own searchParams and puts it in the
 * input — scripts/tests/deep-links.test.mjs walks the import graph from
 * the destination and fails the build if one of them stops.
 */
export function producerHref(key: ProducerKey, brief: string): string {
  const spec = PRODUCER_SPECS[key];
  const trimmed = readExampleParam(String(brief ?? ""));
  if (!trimmed) return spec.path;
  return `${spec.path}?${spec.param}=${encodeURIComponent(trimmed)}`;
}
