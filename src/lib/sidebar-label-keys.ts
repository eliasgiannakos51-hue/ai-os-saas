// Shared translation-key lookup for lib/sidebar-nav.ts's English `heading`/
// `label` strings, used by both Sidebar and CommandPalette so their
// translated display never drifts apart.
//
// THE UNDERLYING STRINGS ARE STATE KEYS, AND THAT IS ALL THEY ARE. They
// identify an item across renders; they are not what anything matches a
// user's typing against.
//
// This comment used to end "(state keys, search matching)" — and that was
// an accurate description of a bug, written as a design note, which is the
// worst shape in docs/shapes.md because the comment PROTECTS the defect: a
// reviewer who reads it concludes somebody already thought about this and
// stops asking. The command palette really did match the English label
// while rendering the translated one, and 168 of 490 (item x locale) pairs
// were reachable by the name on screen — Arabic 0 of 49.
//
// The palette now matches every name an item answers to; see
// lib/command-palette-match.ts. If anything here ever goes back to
// matching on these strings, scripts/tests/command-palette-language.test.mjs
// goes red across nine languages before it reaches a user.
// EVERY HEADING sidebar-nav.ts ACTUALLY RENDERS, and that is the whole
// point of the list.
//
// It used to map Create / My Business / Track / Insights while
// lib/sidebar-nav.ts rendered Workspace / Build / Business / Strategy —
// four headings with no entry here, so translatedHeading() fell through
// and printed raw English in all ten locales, with correct translations
// sitting unreachable in messages/*.json beside them. The comment that
// stood here described a rename ("Renamed from Build/Business/Strategy")
// that was never made in the file it claimed to describe, which is why
// nobody looking at this map could see anything wrong with it.
//
// A key here that no heading uses is dead, and a heading with no key
// here is untranslated. Both are checked by
// scripts/tests/sidebar-naming.test.mjs rather than by reading.
export const GROUP_HEADING_KEYS: Record<string, string> = {
  // SIX, since 2026-09-05, and every one of them is a verb. The eight
  // that were here once — Workspace, Build, Tracking, Business, Strategy,
  // Operations, Marketplace, Settings — were filing categories; the four
  // that replaced them (Work, Build, See, Settings) mixed a verb with a
  // posture. These six are the order of a working session: Make what you
  // came to make, Ask what you do not know, Run what should go on without
  // you, See what came back, Organise around it, and change how it
  // behaves.
  //
  // A KEY HERE THAT NO HEADING USES IS DEAD, AND A HEADING WITH NO KEY
  // HERE IS UNTRANSLATED — the second is the fault this map exists for: a
  // heading that falls through prints raw English in all ten locales with
  // a correct translation sitting unreachable beside it.
  // scripts/tests/sidebar-naming.test.mjs checks both directions.
  Make: "make",
  Ask: "ask",
  Run: "run",
  See: "see",
  Organise: "organise",
  // FIVE HEADINGS NOBODY HAS SEEN, and they are here for the reason the
  // paragraph above gives: a heading with no key here prints raw English
  // in all ten locales, and the day one of these groups gains its first
  // live row is the worst day to discover that. `visibleGroups` drops a
  // group whose rows are all `notBuilt`, so none of the five reaches the
  // screen today; scripts/tests/sidebar-structure.test.mjs is what holds
  // that, and sidebar-naming.test.mjs is what holds these five to ten
  // translations each.
  Connect: "connect",
  Business: "business",
  Engineering: "engineering",
  Verify: "verify",
  Personal: "personal",
  Settings: "settings",
};

// FOUR MODULES USED TO HAVE TWO NAMES EACH. The sidebar said CRM,
// Knowledge, Marketing and Website Plans; the page heading said Sales,
// Research, Content and Websites — the same module, under a different
// word, depending on which one you were looking at. Unified on the name a
// stranger can guess: Sales over the jargon, Research over the vague one,
// Content over the broader one, Websites over the page that is not about
// plans. lib/modules.ts now points at these keys instead of holding its
// own copy, so the two cannot drift apart again.
// FIVE ENTRIES WERE MISSING HERE, and the way that showed up is worth
// recording: renaming "Published Sites" in messages/*.json changed
// nothing on screen, because this map had no entry for it and
// translatedLabel() fell through to the English state key. The
// translations existed. Nothing could reach them.
//
// Files, Deep Research, Published Sites, Websites and Integrations were
// all in that state — raw English in all ten locales, in the sidebar, on
// every page. scripts/tests/sidebar-naming.test.mjs now fails on any
// label sidebar-nav.ts renders without a key here.
export const ITEM_LABEL_KEYS: Record<string, string> = {
  Home: "home",
  // The four routes that were in no nav config at all until round 5, and
  // the timeline row, which the owner's structure renames from "Mine".
  // The row the owner's structure calls Timeline; the product has always
  // displayed it as "Mine", and scripts/tests/sidebar-naming.test.mjs
  // pairs this label with sidebar.items.mine and dashboard.timeline.title.
  Timeline: "mine",
  Costs: "costs",
  Routing: "routing",
  "System Health": "systemHealth",
  "Trading Journal": "tradingJournal",
  Files: "files",
  "Deep Research": "deepResearch",
  "Published Sites": "published",
  "Form Submissions": "formSubmissions",
  Websites: "websites",
  Integrations: "integrations",
  "Ionexa Chat": "chat",
  // Was "Timeline". One row now answers "where is the thing I made?" —
  // the page it opens carries the everything view and the starred view
  // as tabs, and /dashboard/favorites redirects into the starred one.
  Mine: "mine",
  Favorites: "favorites",
  // The three that became one: starred, everything-in-order and search.
  "My stuff": "library",
  // The one row the nineteen log screens became.
  "My records": "records",
  // The pinned action above the groups.
  "New entry": "newEntry",
  "Mission Control": "missionControl",
  "Weekly Reflection": "reflection",
  // "AI Memory" WAS ONE NAME FOR TWO PAGES. The key stays `memory` for
  // the record search so its ten translations are not orphaned — only the
  // English label and the strings themselves changed — and the page that
  // shows what the chat remembered gets a key of its own.
  "Search my records": "memory",
  "What it remembers": "aiMemory",
  // V6 #1. Added the day the row stopped being `notBuilt`, because a
  // row without a key is a row the command palette cannot find in any of
  // the ten languages — which is how a built feature stays unreachable.
  Meetings: "meetings",
  Team: "team",
  Affiliate: "affiliate",
  Settings: "settings",
  "Help Centre": "help",
  "AI Agents": "agents",
  "Website Builder": "websiteBuilder",
  Apps: "apps",
  Images: "images",
  Videos: "videos",
  "Business health": "businessHealth",
  "AI Coding": "coding",
  "Data Analysis": "dataAnalysis",
  Documents: "documents",
  // V5 #21: "Presentation notes" became "Presentations" the day the page
  // started making them. The key is unchanged, so every locale's string
  // moved with it.
  Presentations: "presentations",
  // V5 #22: the post generator under Make.
  Posts: "posts",
  Projects: "projects",
  Campaigns: "campaigns",
  Analytics: "analytics",
  Finance: "finance",
  Content: "content",
  Sales: "sales",
  Products: "products",
  Research: "research",
  Learning: "learning",
  Ideas: "ideas",
  Competitors: "competitors",
  Decisions: "decisions",
  Feedback: "feedback",
  Trading: "trading",
  "Trading Workflow": "tradingWorkflow",
  "Product Workflow": "productWorkflow",
  Automation: "automation",
  Marketplace: "marketplace",
  // The two rows the 2026-09-05 structure added. Both name a capability
  // that already worked and had nowhere to stand — see each page's
  // header for what was already there.
  Voice: "voice",
  Predictions: "predictions",
  // ---------------------------------------------------------------------
  // THE HELD POSITIONS, TRANSLATED BEFORE THEY ARE DRAWN (2026-09-26)
  //
  // Until this round a `notBuilt` label was EXEMPT from needing a key
  // here — scripts/tests/sidebar-naming.test.mjs skipped it, on the
  // argument that ten translations of a name that may still change is
  // stock rather than coverage. That argument was right about hints and
  // wrong about names: a hint is a sentence about how a feature behaves
  // and cannot be written before it behaves, while a name is the word
  // the owner already chose, and the day the flag comes off is the day
  // the row must be findable in the command palette in all ten
  // languages. Meetings is the worked example: its key was added in the
  // same commit that removed its flag, and the comment there says why —
  // "a row without a key is a row the command palette cannot find in any
  // of the ten languages".
  //
  // So names are demanded now and hints are still refused.
  // sidebar-hints-coverage.test.mjs holds the second half, both ways: a
  // notBuilt row may not carry hints EITHER.
  Music: "music",
  "Browser agent": "browserAgent",
  "Computer agent": "computerAgent",
  Design: "design",
  Workflows: "workflows",
  "Scheduled Jobs": "scheduledJobs",
  Operations: "operations",
  Monitoring: "monitoring",
  "Knowledge Graph": "knowledgeGraph",
  Calendar: "calendar",
  Tasks: "tasks",
  Knowledge: "knowledge",
  // Connect
  Email: "connectEmail",
  "Calendar Sync": "connectCalendar",
  GitHub: "connectGithub",
  "Google Drive": "connectDrive",
  Slack: "connectSlack",
  "CRM Connector": "connectCrm",
  Banking: "connectBanking",
  APIs: "connectApis",
  "Data Sources": "connectDataSources",
  MCP: "connectMcp",
  "IoT Devices": "connectIot",
  // Business
  CRM: "businessCrm",
  Marketing: "businessMarketing",
  Accounting: "businessAccounting",
  "Company Finance": "businessFinance",
  HR: "businessHr",
  Legal: "businessLegal",
  Procurement: "businessProcurement",
  Inventory: "businessInventory",
  "Customer Support": "businessSupport",
  // Engineering
  Code: "engCode",
  Testing: "engTesting",
  Deployment: "engDeployment",
  Cloud: "engCloud",
  "Database Ops": "engDatabases",
  DevOps: "engDevops",
  Security: "engSecurity",
  "Service Monitoring": "engMonitoring",
  Infrastructure: "engInfrastructure",
  // Verify
  "Fact Checking": "verifyFacts",
  "Data Validation": "verifyData",
  "Code Verification": "verifyCode",
  "Security Testing": "verifySecurity",
  "Output Evaluation": "verifyOutput",
  "Source Verification": "verifySources",
  "Red Teaming": "verifyRedTeam",
  // Personal
  Habits: "personalHabits",
  Health: "personalHealth",
  Travel: "personalTravel",
  Shopping: "personalShopping",
  "Personal Finance": "personalFinance",
  Journaling: "personalJournal",
  "Life OS": "personalLifeOs",
};
