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
 * wrong. Presentation notes already proved the pattern in this codebase —
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
 * ON MODULE PAGES TOO, AND THAT REVERSES WHAT THIS COMMENT USED TO SAY.
 *
 * It read: "NOT ON MODULE PAGES. The twenty module pages answer the same
 * question on their empty screen, in three parts, with a worked example
 * (lib/modules.ts's emptyKey). A second answer beside the title would be
 * the same words twice." That was wrong for two reasons, and seven
 * testers found both.
 *
 * First, the empty state is gone the moment there is one row in the
 * table — which is to say, it is gone for everybody except a first-time
 * visitor, and it is the returning user who wonders why nothing arrives
 * here on its own. Second, it answers "what do I put in this table",
 * never "what will this page never do for me". A module named Research
 * sits four lines above Deep Research in the same nav; one is a table
 * you type into and the other goes and does the work, and nothing on
 * either screen said so.
 *
 * So there are two shared module tips, both attached where the pages are
 * rendered rather than page by page:
 *
 *   trackingModule   the six BuildModulePage logs — no AI anywhere in them
 *   businessModule   the twelve business modules and Ideas — the AI reads
 *                    these, but it never writes them
 *
 * The line between them is that difference, and it is the one users get
 * wrong in both directions.
 */
export type HelpTip = {
  /** Stable id — the page, and the name the check prints. */
  id: string;
  /** The file that renders it, repo-relative. */
  file: string;
  /**
   * The OTHER files that render this same tip, repo-relative.
   *
   * One entry, several pages, is already how trackingModule covers six —
   * but those six share one component, so `file` alone named every place
   * the "?" appears. businessModule does not: the twelve business modules
   * render through app/dashboard/[module]/page.tsx and Ideas renders
   * through app/dashboard/page.tsx, two files with no shared body.
   *
   * Without this the gate's per-header count (help-tips.test.mjs section
   * 5) would check one of them and pass while the other quietly lost its
   * "?" — the same shape as the bug that check was written for.
   */
  alsoIn?: string[];
  /**
   * The dashboard page this tip serves, when `file` is a COMPONENT rather
   * than a page — repo-relative.
   *
   * Three pages render no <PageHeader> at all, and all three are
   * deliberate: Chat is a full-viewport workspace, Create Studio draws its
   * own centred hero, and Overview opens with a personal greeting above
   * the largest heading in the product. Putting a PageHeader on any of
   * them would be a second title above their own.
   *
   * So their "?" is mounted directly, at a control that already exists,
   * and this names the page it belongs to — which is what lets the gate
   * check that every dashboard page is answered somewhere, not only the
   * ones that happen to use the shared header.
   */
  route?: string;
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
    // V4.6 #3 MERGED FAVORITES INTO "Mine". The starred list is now a tab
    // on the timeline page, rendered by the same FavoritesList off the
    // same loadAllFavorites query — so the tip moved to the file that
    // draws it, and it stayed its own entry rather than being folded into
    // the timeline one: "starring does not copy or move anything" and
    // "you do not write here" correct two different wrong beliefs, and a
    // merge that deleted one would have been a nav change quietly costing
    // a piece of the help.
    id: "favorites",
    // THE STARRED VIEW HAS ITS OWN PAGE AGAIN since 2026-09-04: the star
    // in the timeline's tab row lands on /dashboard/favorites instead of
    // on a query string whose page then bounced back here. That file is
    // the one that draws this header now, so it is the one the tip is
    // attached to. The timeline still renders the same view for
    // ?view=fav, which is why the route below still points at it.
    file: "src/app/dashboard/favorites/page.tsx",
    route: "src/app/dashboard/timeline/page.tsx",
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
  {
    // TWO FILES, ONE TIP. app/dashboard/[module]/page.tsx serves the
    // twelve business modules; app/dashboard/page.tsx serves Ideas at the
    // dashboard root. Same body, same misunderstanding, so `alsoIn`
    // rather than two entries whose copy would drift apart.
    //
    // The misunderstanding is the opposite of trackingModule's. There the
    // fear is "Images must generate images"; here it is "the AI has been
    // reading my email and will fill this in". These tables ARE read by
    // Chat, Search my records, History and the weekly reflection — the
    // one thing nothing does is write to them.
    id: "businessModule",
    file: "src/app/dashboard/[module]/page.tsx",
    alsoIn: ["src/app/dashboard/page.tsx"],
    keyPrefix: "help.businessModule",
    corrects:
      "that rows appear here on their own, from your mail, your bank or your chats, rather than being typed",
  },
  {
    id: "documents",
    file: "src/app/dashboard/documents/page.tsx",
    keyPrefix: "help.documents",
    // Documents and Files sit next to each other in the nav and do
    // opposite things. Nothing in this repo reads user_documents for a
    // chat answer — grep it — so "write it here and the AI will know" is
    // the assumption that costs somebody an afternoon.
    corrects:
      "that this is where you put a document for the AI to read, which is Files",
  },
  {
    id: "affiliate",
    file: "src/app/dashboard/affiliate/page.tsx",
    keyPrefix: "help.affiliate",
    // rules.ts: COMMISSION_MONTHS = 12, DEFAULT_RATE = 0.25,
    // MIN_PAYOUT_CENTS = 2000, and attributionDecision refuses both
    // self-referral and re-referral.
    corrects:
      "that commission is forever, starts at signup, and can be earned on yourself",
  },
  {
    id: "coding",
    file: "src/app/dashboard/coding/page.tsx",
    keyPrefix: "help.coding",
    corrects:
      "that it can see your project, run what it writes, or open a pull request",
  },
  {
    id: "dataAnalysis",
    file: "src/app/dashboard/data-analysis/page.tsx",
    keyPrefix: "help.dataAnalysis",
    // The page's own promise is "every statistic is computed from the
    // whole file — never guessed", and the honest edge of that promise is
    // the 50,000-row read, which the summary states rather than hides.
    corrects:
      "that a number here could be a model's estimate, or that a huge file was read whole",
  },
  {
    // MOVED, AND RENAMED WITH THE PAGE. This was `finance`, at
    // /dashboard/finance, which is the slug of a business module — the
    // static segment shadowed the [module] catch-all and every non-owner
    // pressing "Finances" in the nav got a 404. The owner dashboard is
    // Business health now and the module has its route back.
    id: "businessHealth",
    file: "src/app/dashboard/business-health/page.tsx",
    keyPrefix: "help.businessHealth",
    corrects:
      "that a missing figure would be shown as zero rather than as missing",
  },
  {
    id: "formSubmissions",
    file: "src/app/dashboard/form-submissions/page.tsx",
    keyPrefix: "help.formSubmissions",
    // The page exists because leads were being written to a table nothing
    // could read while the owner's inbox stayed empty. The tip has to say
    // which half failed.
    corrects:
      "that an undelivered notification email means the form itself is broken and the lead was lost",
  },
  {
    id: "productWorkflow",
    file: "src/app/dashboard/product-workflow/page.tsx",
    keyPrefix: "help.productWorkflow",
    corrects:
      "that this holds a second, separate copy of your products, and that its insight predicts anything",
  },
  {
    id: "reflection",
    file: "src/app/dashboard/reflection/page.tsx",
    keyPrefix: "help.reflection",
    corrects:
      "that reflections are kept, so last week's can be reopened and compared",
  },
  {
    id: "routing",
    file: "src/app/dashboard/routing/page.tsx",
    keyPrefix: "help.routing",
    // routing/page.tsx renders `routing.empty` rather than zeros for
    // exactly this reason; the tip says the same thing before the table
    // is read.
    corrects:
      "that an empty table means the router is doing nothing, and that this page is a control panel",
  },
  {
    id: "systemHealth",
    file: "src/app/dashboard/system-health/page.tsx",
    keyPrefix: "help.systemHealth",
    corrects:
      "that this is monitoring, and that silence here means nothing is wrong",
  },
  {
    id: "tradingJournal",
    file: "src/app/dashboard/trading-journal/page.tsx",
    keyPrefix: "help.tradingJournal",
    // TradingDisclaimer is mounted first and is not dismissible; this is
    // the same refusal in the one place somebody looks before reading it.
    corrects:
      "that the statistics are advice, or that trades arrive here from a broker",
  },
  {
    id: "tradingWorkflow",
    file: "src/app/dashboard/trading-workflow/page.tsx",
    keyPrefix: "help.tradingWorkflow",
    corrects:
      "that a detected pattern is a prediction of the next trade rather than a count of past ones",
  },
  {
    // NO PageHeader, AND THAT IS THE POINT. CreateStudio's own hero is a
    // centred icon, title and subtitle in the middle of the viewport; a
    // PageHeader above it would be a title above a title. The "?" goes
    // beside the hero heading instead, which is where it sits on the
    // other twenty-eight pages, so it is in the place people have already
    // learned to look.
    id: "create",
    file: "src/components/create/create-studio.tsx",
    route: "src/app/dashboard/create/page.tsx",
    keyPrefix: "help.create",
    corrects:
      "that it silently guesses when it cannot tell what you meant, instead of saying so",
  },
  {
    // Chat is <main className="h-[calc(100vh-4rem)]"> — full viewport, by
    // design. Its one persistent row is the control bar at the top, which
    // already carries the sidebar toggle and is already 44px tall, so the
    // "?" lands in it without moving anything. It has to be THERE and not
    // beside the conversation title: a brand new chat has no conversation
    // yet, and a first-time visitor is exactly who needs the answer.
    id: "chat",
    file: "src/components/chat/chat-workspace.tsx",
    route: "src/app/dashboard/chat/page.tsx",
    keyPrefix: "help.chat",
    corrects:
      "that the assistant can act on your account — create, edit or delete records — from the conversation",
  },
  {
    // The home screen opens with a greeting and one very large question.
    // The "?" goes beside that question: it is the page's single focal
    // point and its line box is tall enough to hold a 28px control with
    // room to spare, so nothing below it moves.
    id: "overview",
    file: "src/components/overview/greeting-header.tsx",
    route: "src/app/dashboard/overview/page.tsx",
    keyPrefix: "help.overview",
    corrects:
      "that the figures come from your bank, your CRM or your inbox rather than from what you logged",
  },
  {
    // One row in the sidebar now stands for nineteen log screens, so the
    // assumption to correct is that the nineteen went away.
    id: "records",
    file: "src/app/dashboard/records/page.tsx",
    route: "src/app/dashboard/records/page.tsx",
    keyPrefix: "help.records",
    corrects:
      "that these lists were removed or merged when the sidebar stopped listing them one by one",
  },
];

export type HelpTipPart = "is" | "does" | "doesNot";

export function helpTipKey(tip: HelpTip, part: HelpTipPart): string {
  return `${tip.keyPrefix}.${part}`;
}
