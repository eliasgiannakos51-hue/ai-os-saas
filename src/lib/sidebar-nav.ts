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
} from "@/lib/module-icons";

// Single source of truth for every sidebar link — shared by the Sidebar
// (grouped, collapsible), the command palette (flattened, searchable) and
// the hub page at /dashboard/business, so the three never drift apart.
//
// The SHAPES and both filters live in lib/sidebar-visibility.ts, which
// imports no icons, so the gates can execute `visibleGroups` /
// `sidebarGroups` instead of reading them as text. Re-exported here
// because this is the file every consumer already imports.
export type { SidebarItem, SidebarGroupConfig } from "@/lib/sidebar-visibility";
export { visibleGroups, sidebarGroups } from "@/lib/sidebar-visibility";
import type { SidebarGroupConfig } from "@/lib/sidebar-visibility";

// FOUR GROUPS, SIXTEEN VISIBLE ROWS — V4.6 #3.
//
// It was eight groups and forty-five rows. Counted, not estimated:
// scripts/tests/sidebar-size.test.mjs prints both numbers and fails the
// build if the groups pass four or the drawn rows pass twenty, and
// scripts/tests/sidebar-density.prodtest.mjs counts the <a> elements a
// real Chromium paints at 1920x1080 and 1366x768.
//
// Nothing was deleted. Twenty-nine entries carry `hidden: true`: they
// keep their translation, keep their owner-only flag, stay in the command
// palette (which flattens `visibleGroups`, not `sidebarGroups`) and are
// listed on the hub page at /dashboard/records. Deleting them would have
// tidied the sidebar by making the pages unfindable, which is not the
// same problem solved.
//
// The headings are what a person does, not a filing category. "Workspace"
// named a place; "Daily" names the four things somebody opens the app to
// do. Nineteen of the removed rows are log modules that the [module]
// catch-all already serves with one component — they were nineteen ways
// of saying "a table of your rows", and they are now one row plus a type
// filter.
// FOUR GROUPS, TWENTY-ONE VISIBLE ROWS — the structure the owner chose on
// 2026-09-04, replacing Daily / Build / My business / Settings.
//
// The headings are verbs, and the order is the order of a working day:
// WORK the things you keep, BUILD the things you make, SEE the numbers
// they produce, SETTINGS for the rest. It is not a filing system —
// nothing here is grouped by which table it lives in.
//
// NOTHING WAS DELETED AND NOTHING IS UNREACHABLE. Every entry marked
// `hidden: true` keeps its translation, its owner-only flag, its row in
// the command palette (which flattens `visibleGroups`, not
// `sidebarGroups`) and its place on the hub at /dashboard/records.
// scripts/tests/entry-points.test.mjs now fails the build if ANY route
// under /dashboard has no entry point at all — which is how the four
// below were found.
//
// THE FOUR THAT WERE IN NO CONFIG AT ALL: /dashboard/costs,
// /dashboard/routing, /dashboard/system-health and
// /dashboard/trading-journal each had a page and no entry anywhere, so
// they were reachable only by typing the URL; routing and trading-journal
// had no link in the entire product. They are hidden rows now, which puts
// them in the palette and on the hub. The three operational ones are
// owner-only, because that is who they are for.
//
// TWENTY-ONE, NOT TWENTY. scripts/tests/sidebar-size.test.mjs held the
// drawn rows at twenty; the structure asked for is twenty-one and the
// limit moved by one, deliberately, with this sentence as the reason.
export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    // Never collapsed: the four things somebody opens the app to do have
    // to be on screen the instant it paints, with no click and no scroll.
    heading: "Work",
    collapsible: false,
    items: [
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON, hintKey: "home" },
      { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON, hintKey: "chat" },
      { href: "/dashboard/records", label: "My records", icon: MY_BUSINESS_ICON, hintKey: "records" },
      { href: TIMELINE_NAV_ITEM.href, label: "Timeline", icon: TIMELINE_ICON, hintKey: "mine" },

      // --- in the palette and on the hub, not in the sidebar ---
      { href: REFLECTION_NAV_ITEM.href, label: REFLECTION_NAV_ITEM.label, icon: REFLECTION_ICON, hintKey: "reflection", hidden: true },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON, hintKey: "memory", hidden: true },
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents, hintKey: "documents", hidden: true },
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON, hintKey: "missionControl", hidden: true },
    ],
  },
  {
    // BUILD MEANS SOMETHING IS PRODUCED, and the gate proves it rather
    // than trusting it: every visible href here must have an API route
    // behind it that actually reaches a model, and every module in
    // lib/build-modules.ts must NOT. See section 3b of
    // scripts/tests/sidebar-naming.test.mjs, which walks the imports.
    heading: "Build",
    collapsible: true,
    items: [
      // The href is written out rather than taken from CREATE_NAV_ITEM
      // because scripts/tests/sidebar-naming.test.mjs reads this group as
      // TEXT to check what may sit under "Build" — a constant is invisible
      // to it, and an item the gate cannot see is an item the gate cannot
      // hold to the rule. The label still comes from the constant.
      { href: "/dashboard/create", label: CREATE_NAV_ITEM.label, icon: CREATE_ICON, hintKey: "create" },
      {
        href: "/dashboard/website-builder",
        label: "Website Builder",
        icon: WEBSITE_BUILDER_ICON,
        hintKey: "websiteBuilder",
      },
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents, hintKey: "agents" },
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation, hintKey: "automation" },
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace" },

      // --- in the palette and on the hub, not in the sidebar ---
      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding, hintKey: "coding", hidden: true },
      // What the builder PRODUCED rather than a way to build, and both one
      // click from the builder's own page. They stay in this group so
      // section 3b keeps checking them against its DOWNSTREAM rule.
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
    // WHAT THE WORK PRODUCED. Three of these eight are logs served by the
    // [module] catch-all — Finance, Analytics and Sales are the ones a
    // person actually opens to look at a number, so they are rows here
    // rather than entries on the hub, and the rest of the logs stay
    // hidden below.
    heading: "See",
    collapsible: true,
    items: [
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance, hintKey: "finance" },
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics, hintKey: "analytics" },
      { href: "/dashboard/sales", label: "Sales", icon: MODULE_ICONS.sales, hintKey: "sales" },
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
      // NOT /dashboard/research: that route is the Knowledge log, a place
      // to save links by hand. This is the autonomous job that goes and
      // finds them. Sharing a route would make one of the two unreachable.
      { href: "/dashboard/deep-research", label: "Deep Research", icon: DEEP_RESEARCH_ICON, hintKey: "deepResearch" },
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"],
        hintKey: "dataAnalysis",
      },
      { href: "/dashboard/files", label: "Files", icon: FILES_ICON, hintKey: "files" },
      // Its own page since round 5 — the star in the timeline's tab row
      // lands here now, instead of on a query string whose page then
      // bounced back. See app/dashboard/favorites/page.tsx.
      { href: "/dashboard/favorites", label: "Favorites", icon: FAVORITES_ICON, hintKey: "favorites" },

      // --- the logs: in the palette and on the hub, not in the sidebar ---
      // Nineteen of these were sidebar rows once. Every one is a table of
      // the user's own rows, served by the same GenericList component, and
      // each still has its route, its translation and its palette entry.
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas, hintKey: "ideas", hidden: true },
      { href: "/dashboard/content", label: "Content", icon: MODULE_ICONS.content, hintKey: "content", hidden: true },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products, hintKey: "products", hidden: true },
      { href: "/dashboard/research", label: "Research", icon: MODULE_ICONS.research, hintKey: "research", hidden: true },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning, hintKey: "learning", hidden: true },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors, hintKey: "competitors", hidden: true },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions, hintKey: "decisions", hidden: true },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback, hintKey: "feedback", hidden: true },
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading, hintKey: "trading", hidden: true },
      // The trading log's companion page, and one of the four that had no
      // entry point anywhere in the product before round 5.
      {
        href: "/dashboard/trading-journal",
        label: "Trading Journal",
        icon: TRADING_JOURNAL_ICON,
        hintKey: "tradingJournal",
        hidden: true,
      },
      // The six tracking logs. lib/build-modules.ts says what they are in
      // its own words — "no real AI generation happens yet" — and
      // scripts/tests/sidebar-naming.test.mjs holds them to it: none may
      // appear under Build, and each page must still say on screen what it
      // will not do.
      { href: "/dashboard/websites", label: "Websites", icon: MODULE_ICONS.websites, hintKey: "websites", hidden: true },
      { href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps, hintKey: "apps", hidden: true },
      { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images, hintKey: "images", hidden: true },
      { href: "/dashboard/videos", label: "Videos", icon: MODULE_ICONS.videos, hintKey: "videos", hidden: true },
      {
        href: "/dashboard/presentations",
        label: "Presentation notes",
        icon: MODULE_ICONS.presentations,
        hintKey: "presentations",
        hidden: true,
      },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns, hintKey: "campaigns", hidden: true },
    ],
  },
];

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON, hintKey: "settings" },
    { href: "/dashboard/team", label: "Team", icon: TEAM_ICON, hintKey: "team" },
    // Connecting Gmail changes how the product works for you, which is a
    // setting rather than a daily action — and a visible row since round
    // 5, because a connection nobody can find is a connection nobody makes.
    { href: "/dashboard/integrations", label: "Integrations", icon: INTEGRATIONS_ICON, hintKey: "integrations" },
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
