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
 * SELF-CONTAINED FIRST, LINKED SECOND. The three parts are written here
 * and translated into all ten locales, so the tip answers on its own; the
 * link to the full Help Centre article is an extra, not the answer.
 *
 * That order was forced and is worth keeping. When these were written the
 * 27 articles were string literals in knowledge-base.ts, all in Greek, and
 * /help rendered them to every locale — so a "?" that linked there would
 * have sent nine languages to text they could not read, and a tip with
 * nothing of its own would have had nothing to say. The articles are in
 * help_articles now, per locale, with /help falling back to English
 * visibly, so `article` links on to the one about this page. If the link
 * ever breaks again, the tip still answers.
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
  /**
   * The Help Centre article this page's "?" links on to, by slug, or
   * undefined when there is no article about this page.
   *
   * THE INVERSE OF AN EXISTING MAPPING, not a new one: every article
   * already carries an href pointing AT one of these pages, so this says
   * the same thing in the direction the "?" needs to read it. Kept as
   * data rather than derived at render time because three pages have no
   * article and two share one, neither of which an href lookup expresses.
   *
   * Safe to link now, and it was not before: the articles lived in a
   * Greek-only TypeScript literal, so a "?" pointing at /help would have
   * sent nine locales to text they could not read. They are in
   * help_articles with a locale column now and /help falls back to
   * English, visibly.
   */
  article?: string;
};

export const HELP_TIPS: HelpTip[] = [
  {
    id: "agents",
    article: "create-agent",
    file: "src/app/dashboard/agents/page.tsx",
    keyPrefix: "help.agents",
    corrects: "that an agent runs whenever it likes, without limit or cost",
  },
  {
    id: "websiteBuilder",
    article: "create-website",
    file: "src/app/dashboard/website-builder/page.tsx",
    keyPrefix: "help.websiteBuilder",
    corrects: "that generating a site puts it on the internet",
  },
  {
    id: "published",
    article: "publish-website",
    file: "src/app/dashboard/published/page.tsx",
    keyPrefix: "help.published",
    // subdomain.ts: the URL is path-based (/s/name) until a wildcard
    // domain exists. "Publish" reads as "I get an address of my own".
    corrects: "that publishing gives you a domain of your own",
  },
  {
    id: "files",
    article: "upload-files",
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
    article: "chat-memory",
    file: "src/app/dashboard/memory/page.tsx",
    keyPrefix: "help.memory",
    // The name is the problem: "AI Memory" reads as "what the AI
    // remembers about me". It is a search across the module tables and
    // holds no conversation at all. This one caught me out while writing
    // its own empty state, which is the best possible argument for it.
    corrects:
      "that this stores your chat history or anything the AI decided to keep",
  },
  {
    id: "mission",
    article: "create-mission",
    file: "src/app/dashboard/mission/page.tsx",
    keyPrefix: "help.mission",
    corrects: "that a plan carries itself out once it exists",
  },
  {
    id: "integrations",
    article: "connect-gmail",
    file: "src/app/dashboard/integrations/page.tsx",
    keyPrefix: "help.integrations",
    // providers.ts: gmail "read", google_drive "read", slack "read_write".
    corrects:
      "that connecting an account lets the AI write, send or delete in it",
  },
  {
    id: "team",
    article: "team-members",
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
    // ONE ENTRY, SIX PAGES. Apps, Images, Videos, Website plans, Campaigns
    // and Presentations all render through BuildModulePage, so the "?" is
    // attached there rather than six times. Their file is the one that
    // declares them logs: build-modules.ts says every entry in it "is a
    // LOG: a table of rows the user types by hand, with no AI call anywhere
    // in it" — and "Images" reads as a generator to everybody who has not
    // read that file.
    id: "trackingModule",
    file: "src/components/modules/build-module-page.tsx",
    keyPrefix: "help.trackingModule",
    corrects:
      "that a page called Images, Videos or Presentations generates them",
  },
  {
    id: "costs",
    file: "src/app/dashboard/costs/page.tsx",
    keyPrefix: "help.costs",
    corrects:
      "that this is your credit balance rather than the operator's view of real provider cost",
  },
  {
    id: "marketplace",
    file: "src/app/dashboard/marketplace/page.tsx",
    keyPrefix: "help.marketplace",
    corrects: "that the page is empty because of your plan",
  },
  {
    id: "settings",
    article: "export-data",
    file: "src/app/dashboard/settings/page.tsx",
    keyPrefix: "help.settings",
    corrects:
      "that Delete account is a way to clear your data and start again — it ends the account, " +
      "takes every record with it, and there is no undo. Export first is the thing this page has " +
      "to say before somebody presses the red button, which is why its article is export-data.",
  },
];

export type HelpTipPart = "is" | "does" | "doesNot";

export function helpTipKey(tip: HelpTip, part: HelpTipPart): string {
  return `${tip.keyPrefix}.${part}`;
}
