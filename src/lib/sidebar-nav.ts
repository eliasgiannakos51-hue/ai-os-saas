import {
  CHAT_NAV_ITEM,
  CREATE_NAV_ITEM,
  OVERVIEW_NAV_ITEM,
  SETTINGS_NAV_ITEM,
  TIMELINE_NAV_ITEM,
  MISSION_NAV_ITEM,
  REFLECTION_NAV_ITEM,
} from "@/lib/modules";
import {
  MODULE_ICONS,
  OVERVIEW_ICON,
  CHAT_ICON,
  CREATE_ICON,
  SETTINGS_ICON,
  AFFILIATE_ICON,
  MARKETPLACE_ICON,
  TEAM_ICON,
  MEMORY_ICON,
  TIMELINE_ICON,
  FAVORITES_ICON,
  MISSION_ICON,
  REFLECTION_ICON,
  TRADING_WORKFLOW_ICON,
  BUSINESS_HEALTH_ICON,
  WEBSITE_BUILDER_ICON,
  PRODUCT_WORKFLOW_ICON,
  PUBLISHED_SITES_ICON,
  FORM_SUBMISSIONS_ICON,
  INTEGRATIONS_ICON,
  FILES_ICON,
  DEEP_RESEARCH_ICON,
  MY_BUSINESS_ICON,
  HELP_ICON,
  COSTS_ICON,
  ROUTING_ICON,
  SYSTEM_HEALTH_ICON,
  TRADING_JOURNAL_ICON,
  VOICE_ICON,
  PREDICTIONS_ICON,
} from "@/lib/module-icons";

// Single source of truth for every sidebar link — shared by the Sidebar
// (grouped, collapsible), the command palette (flattened, searchable) and
// the hub page at /dashboard/records, so the three never drift apart.
//
// IT SAID /dashboard/business until V5 #13, and that page has never
// existed: the only directory under src/app/dashboard beginning with
// "business" is business-health, and no href anywhere points at
// /dashboard/business. Forty-eight lines below, the same file already
// named the hub correctly — "place on the hub at /dashboard/records" —
// so this was a comment contradicting its own file. Found by the route
// half of scripts/scan-self-claims.mjs, which did not exist until the
// same round: PATH_RE requires a file extension, so no route named in
// any comment in this repository had ever been checked.
//
// The SHAPES and both filters live in lib/sidebar-visibility.ts, which
// imports no icons, so the gates can execute `visibleGroups` /
// `sidebarGroups` instead of reading them as text. Re-exported here
// because this is the file every consumer already imports.
export type { SidebarItem, SidebarGroupConfig } from "@/lib/sidebar-visibility";
export { visibleGroups, sidebarGroups } from "@/lib/sidebar-visibility";
import type { SidebarGroupConfig } from "@/lib/sidebar-visibility";

// SIX GROUPS, TWENTY-FOUR VISIBLE ROWS — the structure of 2026-09-05,
// plus the one row it asked for that could not be drawn until V5 #21.
//
// THE HISTORY, BECAUSE THE NUMBER ONLY MEANS SOMETHING NEXT TO IT: eight
// groups and forty-five rows, then four and sixteen (V4.6 #3), then four
// and twenty-one (2026-09-04), then six and twenty-three (2026-09-05),
// now twenty-four. Not 41 and not 13 at any point —
// scripts/tests/sidebar-size.test.mjs's BEFORE_V46_3 list is forty-five
// entries long and the gate asserts that length.
//
// THE HEADINGS ARE WHAT A PERSON WANTS TO DO, NOT WHERE A THING IS
// FILED. Make · Ask · Run · See · Organise · Settings. "Build" named an
// activity but sat next to "See", which named a posture; the six here
// are all verbs and they are the order of a working session.
//
// THE RULE THAT DECIDED THE CONTENTS, and it is the whole reason this is
// twenty-four rather than thirty-five: A ROW UNDER "MAKE" MUST MAKE
// SOMETHING. The structure originally asked for Images, Videos,
// Presentations and Posts under it. All four existed — as TRACKING LOGS,
// tables of rows a person types by hand, declared as producing nothing
// in lib/build-modules.ts and held to that by section 3b of
// scripts/tests/sidebar-naming.test.mjs, which proves it from the
// imports rather than from a list. A row that promises generation and
// opens a notes form is not an unclear label, it is a broken promise,
// and it reads exactly like a working feature in a green build. They
// stay hidden until they generate — and Presentations generates since
// V5 #21, which is the day its row was drawn and not a day before.
//
// THREE MORE WERE ASKED FOR AND ARE NOT HERE because nothing exists
// behind them: a desktop agent, a public API and Projects have no route,
// no component and no table. A sidebar row is not a placeholder.
//
// TWO ROWS ARE NEW PAGES rather than a rename: /dashboard/voice and
// /dashboard/predictions. Both features were complete and unreachable —
// voice as a microphone inside the chat composer, predictions as cards
// inside the overview and the owner-only business-health screen. See
// each page's header for what was already there.
//
// NOTHING WAS DELETED. Twenty-nine entries carry `hidden: true`: each
// keeps its translation, its owner-only flag, its row in the command
// palette (which flattens `visibleGroups`, not `sidebarGroups`) and its
// place on the hub at /dashboard/records.
//
// SIX ROWS LEFT THE SIDEBAR AND NONE LEFT THE PRODUCT: Home, My records,
// Create Studio, Data Analysis, Favorites and Analytics are hidden now.
// Home is one click from every screen — the logo in this sidebar's own
// header links to it — and the other five are in the palette and on the
// hub. scripts/tests/entry-points.test.mjs fails the build if any route
// under /dashboard has no entry point at all.
export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    // NEVER COLLAPSED. Whatever else is shut, the five things this
    // product makes have to be on screen the instant it paints — a group
    // somebody has to open first is a group somebody does not know is
    // there.
    heading: "Make",
    collapsible: false,
    items: [
      { href: "/dashboard/website-builder", label: "Website Builder", icon: WEBSITE_BUILDER_ICON, hintKey: "websiteBuilder" },
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents, hintKey: "documents" },
      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding, hintKey: "coding" },
      // NEW PAGE, OLD CAPABILITY. api/voice/speak and api/voice/transcribe
      // have reached real providers, reserved credits and metered minutes
      // for as long as they have existed; the only ways in were the
      // microphone in the chat composer and a Listen button beside text
      // the app had already written.
      { href: "/dashboard/voice", label: "Voice", icon: VOICE_ICON, hintKey: "voice" },
      // V5 #21. The row the 2026-09-05 structure asked for and could not
      // have: it opened a notes form then. api/presentations/generate
      // reaches a model now, section 3b of sidebar-naming proves it from
      // the imports, and lib/build-modules.ts no longer lists the slug.
      {
        href: "/dashboard/presentations",
        label: "Presentations",
        icon: MODULE_ICONS.presentations,
        hintKey: "presentations",
      },

      // --- in the palette and on the hub, not in the sidebar ---
      // The generator the product used to open with. It still routes a
      // free-text request to one of six kinds; it is not a row because
      // every kind it produces now has its own, which is what "one thing
      // per capability" means.
      { href: "/dashboard/create", label: CREATE_NAV_ITEM.label, icon: CREATE_ICON, hintKey: "create", hidden: true },
      // What the builder PRODUCED rather than a way to build, and both one
      // click from the builder's own page.
      { href: "/dashboard/published", label: "Published Sites", icon: PUBLISHED_SITES_ICON, hintKey: "published", hidden: true },
      {
        href: "/dashboard/form-submissions",
        label: "Form Submissions",
        icon: FORM_SUBMISSIONS_ICON,
        hintKey: "formSubmissions",
        hidden: true,
      },
      {
        href: "/dashboard/product-workflow",
        label: "Product Workflow",
        icon: PRODUCT_WORKFLOW_ICON,
        hintKey: "productWorkflow",
        hidden: true,
      },
      {
        href: "/dashboard/trading-workflow",
        label: "Trading Workflow",
        icon: TRADING_WORKFLOW_ICON,
        hintKey: "tradingWorkflow",
        hidden: true,
      },
    ],
  },
  {
    // THE THREE WAYS TO PUT A QUESTION TO THIS SYSTEM, and they differ by
    // what they read: chat reads the conversation, Deep Research reads the
    // web, Predictions reads THIS ACCOUNT'S OWN ROWS.
    heading: "Ask",
    collapsible: true,
    items: [
      { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON, hintKey: "chat" },
      // NOT /dashboard/research: that route is the Knowledge log, a place
      // to save links by hand. This is the autonomous job that goes and
      // finds them. Sharing a route would make one of the two unreachable.
      { href: "/dashboard/deep-research", label: "Deep Research", icon: DEEP_RESEARCH_ICON, hintKey: "deepResearch" },
      // NEW PAGE, OLD CAPABILITY. lib/insights/detectors.ts finds the
      // patterns in TypeScript with a sample size each; the cards were
      // rendered inside the overview and inside the OWNER-ONLY
      // business-health page, so an ordinary user who scrolled past one
      // had no route back to it.
      { href: "/dashboard/predictions", label: "Predictions", icon: PREDICTIONS_ICON, hintKey: "predictions" },
    ],
  },
  {
    // THINGS THAT GO ON WITHOUT YOU WATCHING. An agent runs on a
    // schedule, an automation fires on a trigger, and the marketplace is
    // where somebody else's runs and yours are traded.
    heading: "Run",
    collapsible: true,
    items: [
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents, hintKey: "agents" },
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation, hintKey: "automation" },
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace" },
    ],
  },
  {
    // WHAT THE WORK PRODUCED, AND WHERE EVERY LOG LIVES. Seven rows are
    // drawn; twenty more are here and hidden, and that asymmetry is the
    // point — these are all "a table of your rows", and nineteen of them
    // were once nineteen sidebar entries.
    //
    // EVERY TRACKING MODULE MUST BE IN THIS GROUP. lib/build-modules.ts
    // defines them as producing nothing, and section 3 of
    // scripts/tests/sidebar-naming.test.mjs fails the build if one of
    // them appears under Make instead — which is the check that keeps
    // Images and Videos out of the group whose heading is a promise.
    heading: "See",
    collapsible: true,
    items: [
      { href: TIMELINE_NAV_ITEM.href, label: "Timeline", icon: TIMELINE_ICON, hintKey: "mine" },
      { href: "/dashboard/files", label: "Files", icon: FILES_ICON, hintKey: "files" },
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance, hintKey: "finance" },
      { href: "/dashboard/sales", label: "Sales", icon: MODULE_ICONS.sales, hintKey: "sales" },
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading, hintKey: "trading" },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON, hintKey: "memory" },
      // The OWNER's dashboard, which is why the owner-only flag exists at
      // all — and why the ordering inside sidebarGroups() is load-bearing:
      // role first, hidden second.
      {
        href: "/dashboard/business-health",
        label: "Business health",
        icon: BUSINESS_HEALTH_ICON,
        hintKey: "businessHealth",
        ownerOnly: true,
      },

      // --- in the palette and on the hub, not in the sidebar ---
      // HOME IS HIDDEN AND IS NOT UNREACHABLE: the logo at the top of this
      // sidebar links to it from every screen (components/dashboard/
      // sidebar.tsx renders `<Link href={OVERVIEW_NAV_ITEM.href}>` around
      // it), so it is the one destination in the product that never needs
      // a row.
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON, hintKey: "home", hidden: true },
      // The hub that lists every hidden entry. Hidden itself, and that is
      // a real cost written down rather than glossed: the twenty rows
      // below it are now reachable through the command palette and
      // through this page, and this page is reachable through the
      // command palette. Two keystrokes, not one.
      { href: "/dashboard/records", label: "My records", icon: MY_BUSINESS_ICON, hintKey: "records", hidden: true },
      { href: "/dashboard/favorites", label: "Favorites", icon: FAVORITES_ICON, hintKey: "favorites", hidden: true },
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics, hintKey: "analytics", hidden: true },
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"],
        hintKey: "dataAnalysis",
        hidden: true,
      },
      // The logs. Every one is a table of the user's own rows, served by
      // the same GenericList component, and each still has its route, its
      // translation and its palette entry.
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas, hintKey: "ideas", hidden: true },
      { href: "/dashboard/content", label: "Content", icon: MODULE_ICONS.content, hintKey: "content", hidden: true },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products, hintKey: "products", hidden: true },
      { href: "/dashboard/research", label: "Research", icon: MODULE_ICONS.research, hintKey: "research", hidden: true },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning, hintKey: "learning", hidden: true },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors, hintKey: "competitors", hidden: true },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions, hintKey: "decisions", hidden: true },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback, hintKey: "feedback", hidden: true },
      // The trading log's companion page, and one of the four that had no
      // entry point anywhere in the product before round 5.
      {
        href: "/dashboard/trading-journal",
        label: "Trading Journal",
        icon: TRADING_JOURNAL_ICON,
        hintKey: "tradingJournal",
        hidden: true,
      },
      // THE FIVE TRACKING LOGS, AND WHY THEY ARE NOT UNDER "MAKE".
      // lib/build-modules.ts says what they are in its own words — "no
      // real AI generation happens yet" — and the 2026-09-05 structure
      // asked for four of them (Images, Videos, Presentations, Posts) as
      // rows under the heading that promises generation. They open a form
      // for typing notes into. A row that promises and does not deliver
      // is not a labelling problem, it is a broken promise that reads
      // identically to a working feature, and scripts/tests/
      // sidebar-naming.test.mjs proves the difference from the imports.
      // They become rows the day a route behind them reaches a model —
      // which is exactly what happened to Presentations in V5 #21: it is
      // under Make above, and no longer in this list.
      { href: "/dashboard/websites", label: "Websites", icon: MODULE_ICONS.websites, hintKey: "websites", hidden: true },
      { href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps, hintKey: "apps", hidden: true },
      { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images, hintKey: "images", hidden: true },
      { href: "/dashboard/videos", label: "Videos", icon: MODULE_ICONS.videos, hintKey: "videos", hidden: true },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns, hintKey: "campaigns", hidden: true },
    ],
  },
  {
    // THE THINGS THAT ARE ABOUT THE WORK RATHER THAN THE WORK. A goal, a
    // weekly look back at it, and the people it is shared with.
    heading: "Organise",
    collapsible: true,
    items: [
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON, hintKey: "missionControl" },
      { href: REFLECTION_NAV_ITEM.href, label: REFLECTION_NAV_ITEM.label, icon: REFLECTION_ICON, hintKey: "reflection" },
      { href: "/dashboard/team", label: "Team", icon: TEAM_ICON, hintKey: "team" },
    ],
  },
];

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    // Connecting Gmail changes how the product works for you, which is a
    // setting rather than a daily action — and a visible row since round
    // 5, because a connection nobody can find is a connection nobody makes.
    { href: "/dashboard/integrations", label: "Integrations", icon: INTEGRATIONS_ICON, hintKey: "integrations" },
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON, hintKey: "settings" },
    // The Help Centre (app/help/page.tsx) — the same answers the chat
    // replies with, as a page.
    { href: "/help", label: "Help Centre", icon: HELP_ICON, hintKey: "help" },

    // --- in the palette and on the hub, not in the sidebar ---
    { href: "/dashboard/affiliate", label: "Affiliate", icon: AFFILIATE_ICON, hintKey: "affiliate", hidden: true },
    // THE THREE OPERATIONAL PAGES, owner-only and hidden. All three had a
    // page on disk and no entry in any config before round 5: costs was
    // reachable from the billing screens, routing and system-health from
    // nowhere at all.
    { href: "/dashboard/costs", label: "Costs", icon: COSTS_ICON, hintKey: "costs", ownerOnly: true, hidden: true },
    { href: "/dashboard/routing", label: "Routing", icon: ROUTING_ICON, hintKey: "routing", ownerOnly: true, hidden: true },
    {
      href: "/dashboard/system-health",
      label: "System Health",
      icon: SYSTEM_HEALTH_ICON,
      hintKey: "systemHealth",
      ownerOnly: true,
      hidden: true,
    },
  ],
};

export const ALL_SIDEBAR_GROUPS: SidebarGroupConfig[] = [...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP];
