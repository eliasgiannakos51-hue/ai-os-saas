// WHAT A SCREEN SAYS IN THE WRONG LANGUAGE.
//
// Used by the browser checks of packages 5, 6 and 7
// (scripts/tests/library-edges.prodtest.mjs,
// scripts/tests/brand-memory.prodtest.mjs,
// scripts/tests/chat-opens-tools-edges.prodtest.mjs): a Greek screen with
// an English sentence on it, or an English screen with a Greek one.
//
// TWO QUESTIONS, because one is not enough.
//
// 1. englishOnGreek: the Latin words on a Greek screen, minus the ones the
//    Greek interface itself uses on purpose (product names, "credits") and
//    the person's own content. A server sentence written in English — "Not
//    enough credits (you have: 0, need: 4)" — is five Latin words in a row
//    and shows up here whatever key it came from.
// 2. greekOnEnglish: any Greek letter on an English screen, minus the
//    person's own content.
//
// The allowed words are passed in by each test, not kept here: what a
// screen may legitimately say in Latin letters depends on the screen.

/** The visible text of the page's own content, not the sidebar around it. */
export async function screenText(page, selector = "main") {
  return page.evaluate((sel) => (document.querySelector(sel) ?? document.body).innerText, selector);
}

const fold = (w) => w.toLowerCase();

/** Latin words of three letters or more on a Greek screen that nobody allowed. */
export function englishOnGreek(text, allowed) {
  const ok = new Set([...allowed].map(fold));
  const found = (text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []).filter((w) => !ok.has(fold(w)));
  return [...new Set(found)];
}

/** Greek words on an English screen that nobody allowed. */
export function greekOnEnglish(text, allowed) {
  const ok = new Set([...allowed].map(fold));
  const found = (text.match(/[Ͱ-Ͽἀ-῿]+/g) ?? []).filter((w) => !ok.has(fold(w)));
  return [...new Set(found)];
}

/** The words of a piece of the person's own content, to allow on any screen. */
export function wordsOf(...texts) {
  return texts.join(" ").match(/[\p{L}'’-]+/gu) ?? [];
}
