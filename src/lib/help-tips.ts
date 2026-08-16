/**
 * The "?" beside a page title, and what it is allowed to say.
 *
 * THREE PARTS, AND THE THIRD IS THE REASON THIS EXISTS.
 *
 *   is       what this page is, in one sentence
 *   does     what it will actually do for you
 *   doesNot  what it will NOT do
 *
 * A page description tells you what something is for. It never tells you
 * where the edge is, and the edge is where users get hurt: somebody
 * expects Published Sites to give them a domain, expects an agent to send
 * mail on their behalf, expects Integrations to be able to reply to an
 * email, expects AI Memory to hold their chat history. Every one of those
 * is a reasonable thing to assume from the name, and every one of them is
 * wrong. Presentation Notes already proved the pattern in this codebase —
 * a module renamed because its name promised a generator it does not
 * contain — and `doesNot` is that lesson made routine instead of a
 * one-off rescue.
 *
 * SELF-CONTAINED, NO LINK TO THE HELP CENTRE. Deliberate, and worth
 * recording because the opposite looks obvious: lib/support/knowledge-base.ts
 * has 27 articles whose href already points at most of these pages. It is
 * written entirely in Greek — CANNED_ANSWER_LOCALE = "el" — and /help
 * renders those Greek strings to all ten locales. Linking a "?" to it
 * would send nine languages to text they cannot read, so this carries its
 * own translated copy and waits for nothing. Moving the articles into a
 * table with a locale column is its own piece of work; see TODO.md.
 *
 * NOT ON MODULE PAGES. The twenty module pages answer the same question
 * on their empty screen, in three parts, with a worked example
 * (lib/modules.ts's emptyKey). A second answer beside the title would be
 * the same words twice.
 */
export type HelpTip = {
  /** Stable id — the page, and the name the check prints. */
  id: string;
  /** The file that renders it, repo-relative. */
  file: string;
  /** Full dotted prefix; `.is`, `.does` and `.doesNot` all exist. */
  keyPrefix: string;
  /**
   * The specific wrong assumption this tip's `doesNot` is there to
   * correct — in prose, so the next person editing the copy knows what
   * it is load-bearing for and does not soften it into nothing.
   */
  corrects: string;
};

export const HELP_TIPS: HelpTip[] = [
  {
    id: "agents",
    file: "src/app/dashboard/agents/page.tsx",
    keyPrefix: "help.agents",
    corrects: "that an agent runs whenever it likes, without limit or cost",
  },
  {
    id: "websiteBuilder",
    file: "src/app/dashboard/website-builder/page.tsx",
    keyPrefix: "help.websiteBuilder",
    corrects: "that generating a site puts it on the internet",
  },
  {
    id: "published",
    file: "src/app/dashboard/published/page.tsx",
    keyPrefix: "help.published",
    // subdomain.ts: the URL is path-based (/s/name) until a wildcard
    // domain exists. "Publish" reads as "I get an address of my own".
    corrects: "that publishing gives you a domain of your own",
  },
  {
    id: "files",
    file: "src/app/dashboard/files/page.tsx",
    // extract.ts refuses a scanned PDF by name — "it is probably a scan,
    // and it would need OCR" — and truncates at MAX_EXTRACTED_CHARS.
    corrects: "that any PDF can be read, including a scan, in full",
    keyPrefix: "help.files",
  },
  {
    id: "deepResearch",
    file: "src/app/dashboard/deep-research/page.tsx",
    keyPrefix: "help.deepResearch",
    corrects: "that the answer arrives while you wait on the page",
  },
  {
    id: "memory",
    file: "src/app/dashboard/memory/page.tsx",
    keyPrefix: "help.memory",
    // The name is the problem: "AI Memory" reads as "what the AI
    // remembers about me". It is a search across the module tables and
    // holds no conversation at all. This one caught me out while writing
    // its own empty state, which is the best possible argument for it.
    corrects: "that this stores your chat history or anything the AI decided to keep",
  },
  {
    id: "mission",
    file: "src/app/dashboard/mission/page.tsx",
    keyPrefix: "help.mission",
    corrects: "that a plan carries itself out once it exists",
  },
  {
    id: "integrations",
    file: "src/app/dashboard/integrations/page.tsx",
    keyPrefix: "help.integrations",
    // providers.ts: gmail "read", google_drive "read", slack "read_write".
    corrects: "that connecting an account lets the AI write, send or delete in it",
  },
  {
    id: "team",
    file: "src/app/dashboard/team/page.tsx",
    keyPrefix: "help.team",
    corrects: "that adding people is free and that they use your login",
  },
  {
    id: "timeline",
    file: "src/app/dashboard/timeline/page.tsx",
    keyPrefix: "help.timeline",
    corrects: "that this is a diary you write in",
  },
  {
    id: "favorites",
    file: "src/app/dashboard/favorites/page.tsx",
    keyPrefix: "help.favorites",
    corrects: "that starring something copies or moves it",
  },
  {
    id: "marketplace",
    file: "src/app/dashboard/marketplace/page.tsx",
    keyPrefix: "help.marketplace",
    corrects: "that the page is empty because of your plan",
  },
];

export type HelpTipPart = "is" | "does" | "doesNot";

export function helpTipKey(tip: HelpTip, part: HelpTipPart): string {
  return `${tip.keyPrefix}.${part}`;
}
