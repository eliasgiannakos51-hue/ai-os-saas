import { MAX_PAGES_PER_SITE } from "@/lib/publishing/website-pages";

/**
 * HOW MANY PAGES WERE ASKED FOR (MASTER 16, package 10: «παίρνω site πέντε
 * σελίδων»), behind the switch "site-pages".
 *
 * Until now the model decided, from the description, how many pages a site
 * needs (lib/website-multipage.ts, "Do not pad") — so "five pages" was a
 * hope in the wording. The person now says it with one press, and the
 * request travels the way the design choices already do: as a line of our
 * own in the brief (lib/website-design-brief.ts), which USER_BRIEF_PRECEDENCE
 * in lib/website-builder.ts puts above every default — including "decide how
 * many". The system prompt does not change, so its cache does not either.
 *
 * READ BACK BY THE WORKER (api/websites/generate/process): a site that came
 * back with fewer pages than were asked for says so (the note "pagesShort"),
 * rather than passing three pages off as the five that were wanted.
 *
 * Held by scripts/tests/site-pages.test.mjs.
 */

/** The choices the Site offers: one page, three, or the most a site may have. */
export const PAGE_COUNT_CHOICES = [1, 3, MAX_PAGES_PER_SITE] as const;

const MARK = "PAGES REQUESTED:";

/** The brief's line for `count` pages; nothing for "let the site decide". */
export function pageRequestBrief(count: number | null): string {
  if (count === null || !Number.isInteger(count) || count < 1) return "";
  const n = Math.min(count, MAX_PAGES_PER_SITE);
  if (n === 1) {
    return `\n\n${MARK} 1. Write exactly ONE page — a single document, with no other pages and no page markers. This overrides "decide how many pages" under MULTIPLE PAGES.`;
  }
  return (
    `\n\n${MARK} ${n}. Write exactly ${n} pages including the home page, each its own complete document with its own page marker. ` +
    `This overrides "decide how many pages" and "do not pad" under MULTIPLE PAGES: choose the ${n} pages a visitor of THIS business needs ` +
    "(for example what they offer, who they are, examples of their work, prices or menu if they were given, how to reach them), and give every one real content."
  );
}

/**
 * The count a brief asked for, or null. Anchored to the start of a line and
 * read from the LAST such line, so the words "pages requested: 9" inside
 * somebody's own description cannot set it, and a brief compiled twice says
 * what it said last.
 */
export function readPageRequest(description: string): number | null {
  if (typeof description !== "string") return null;
  const matches = [...description.matchAll(/^PAGES REQUESTED: (\d+)\. Write exactly/gm)];
  const last = matches.at(-1);
  if (!last) return null;
  const n = Number.parseInt(last[1], 10);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGES_PER_SITE ? n : null;
}
