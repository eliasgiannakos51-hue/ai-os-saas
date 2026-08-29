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
export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    // Never collapsed: the whole point of this group is that the four
    // things a user does every day are visible the instant the page
    // paints, without a click and without a scroll.
    heading: "Daily",
    collapsible: false,
    items: [
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON, hintKey: "home" },
      { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON, hintKey: "chat" },
      { href: CREATE_NAV_ITEM.href, label: CREATE_NAV_ITEM.label, icon: CREATE_ICON, hintKey: "create" },
      // FAVORITES + HISTORY + "SEARCH MY RECORDS" WERE THREE ROWS FOR ONE
      // QUESTION: "where is the thing I made?" This is that row. The page
      // it opens (dashboard/timeline) now carries both views as tabs —
      // everything, and starred only — and /dashboard/favorites redirects
      // into the starred tab so old links and bookmarks still land.
      //
      // The starred tab reads user_favorites directly rather than
      // filtering the timeline: the timeline scans 60 rows per module and
      // keeps 200, so a post-filter would have silently dropped older
      // favorites, and favorites also cover chats, sites, missions and
      // documents, which the timeline does not scan at all.
      { href: TIMELINE_NAV_ITEM.href, label: "Mine", icon: TIMELINE_ICON, hintKey: "mine" },
      { href: "/dashboard/files", label: "Files", icon: FILES_ICON, hintKey: "files" },

      // --- in the palette and on the hub, not in the sidebar ---
      { href: "/dashboard/favorites", label: "Favorites", icon: FAVORITES_ICON, hintKey: "favorites", hidden: true },
      { href: REFLECTION_NAV_ITEM.href, label: REFLECTION_NAV_ITEM.label, icon: REFLECTION_ICON, hintKey: "reflection", hidden: true },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON, hintKey: "memory", hidden: true },
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents, hintKey: "documents", hidden: true },
    ],
  },
  {
    // BUILD MEANS SOMETHING IS PRODUCED, and the gate proves it rather
    // than trusting it: every href here must have an API route behind it
    // that actually reaches a model, and every module in
    // lib/build-modules.ts must NOT. See section 3b of
    // scripts/tests/sidebar-naming.test.mjs, which walks the imports.
    heading: "Build",
    collapsible: true,
    items: [
      {
        href: "/dashboard/website-builder",
        label: "Website Builder",
        icon: WEBSITE_BUILDER_ICON,
        hintKey: "websiteBuilder",
      },
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents, hintKey: "agents" },
      // NOT /dashboard/research: that route is the Knowledge log, a place
      // to save links by hand. This is the autonomous job that goes and
      // finds them. Sharing a route would have made one of the two
      // unreachable.
      { href: "/dashboard/deep-research", label: "Deep Research", icon: DEEP_RESEARCH_ICON, hintKey: "deepResearch" },
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"],
        hintKey: "dataAnalysis",
      },
      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding, hintKey: "coding" },

      // --- in the palette and on the hub, not in the sidebar ---
      // Both are what the builder PRODUCED rather than a way to build,
      // and both are one click from the builder's own page. They stay in
      // this group so section 3b keeps checking them against its
      // DOWNSTREAM rule.
      { href: "/dashboard/published", label: "Published Sites", icon: PUBLISHED_SITES_ICON, hintKey: "published", hidden: true },
      {
        href: "/dashboard/form-submissions",
        label: "Form Submissions",
        icon: FORM_SUBMISSIONS_ICON,
        hintKey: "formSubmissions",
        hidden: true,
      },
    ],
  },
  {
    heading: "My business",
    collapsible: true,
    items: [
      // NINETEEN ROWS BECAME ONE. Every entry marked hidden below is a
      // log served by the same GenericList component — twelve through the
      // [module] catch-all, six through their own pages, plus Ideas — so
      // the sidebar was listing nineteen spellings of "a table of your
      // rows". This opens the hub that lists all of them with a type
      // filter, and every one of those pages still has its own route,
      // its own translation and its own place in the palette.
      { href: "/dashboard/records", label: "My records", icon: MY_BUSINESS_ICON, hintKey: "records" },
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON, hintKey: "missionControl" },
      // The OWNER's dashboard. Owners only, so it is the nav item that
      // made the flag necessary — and the one that makes the ordering
      // inside sidebarGroups() load-bearing: role first, hidden second.
      {
        href: "/dashboard/business-health",
        label: "Business health",
        icon: BUSINESS_HEALTH_ICON,
        hintKey: "businessHealth",
        ownerOnly: true,
      },

      // --- the logs: in the palette and on the hub, not in the sidebar ---
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas, hintKey: "ideas", hidden: true },
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics, hintKey: "analytics", hidden: true },
      // The MODULE — a log of the user's own income and expenses, served
      // by the [module] catch-all. It spent two releases pointing at the
      // owner-only dashboard that shadowed it.
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance, hintKey: "finance", hidden: true },
      { href: "/dashboard/content", label: "Content", icon: MODULE_ICONS.content, hintKey: "content", hidden: true },
      { href: "/dashboard/sales", label: "Sales", icon: MODULE_ICONS.sales, hintKey: "sales", hidden: true },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products, hintKey: "products", hidden: true },
      { href: "/dashboard/research", label: "Research", icon: MODULE_ICONS.research, hintKey: "research", hidden: true },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning, hintKey: "learning", hidden: true },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors, hintKey: "competitors", hidden: true },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions, hintKey: "decisions", hidden: true },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback, hintKey: "feedback", hidden: true },
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading, hintKey: "trading", hidden: true },
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation, hintKey: "automation", hidden: true },
      // The six tracking logs. lib/build-modules.ts says what they are in
      // its own words — "no real AI generation happens yet" — and
      // scripts/tests/sidebar-naming.test.mjs holds them to it: none of
      // them may appear under Build, and each page must still say on
      // screen what it will not do.
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
      // The two guided workflows and the template market. Real features,
      // but not daily ones — reachable from the palette, the hub, and the
      // pages they belong to.
      {
        href: "/dashboard/trading-workflow",
        label: "Trading Workflow",
        icon: TRADING_WORKFLOW_ICON,
        hintKey: "tradingWorkflow",
        hidden: true,
      },
      {
        href: "/dashboard/product-workflow",
        label: "Product Workflow",
        icon: PRODUCT_WORKFLOW_ICON,
        hintKey: "productWorkflow",
        hidden: true,
      },
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace", hidden: true },
    ],
  },
];

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON, hintKey: "settings" },
    { href: "/dashboard/team", label: "Team", icon: TEAM_ICON, hintKey: "team" },
    // The Help Centre (app/help/page.tsx) — the same answers the chat
    // replies with, as a page.
    { href: "/help", label: "Help Centre", icon: HELP_ICON, hintKey: "help" },

    // --- in the palette and on the hub, not in the sidebar ---
    { href: "/dashboard/affiliate", label: "Affiliate", icon: AFFILIATE_ICON, hintKey: "affiliate", hidden: true },
    // Connecting Gmail changes how the product works for you, which is a
    // setting, not a daily action.
    { href: "/dashboard/integrations", label: "Integrations", icon: INTEGRATIONS_ICON, hintKey: "integrations", hidden: true },
  ],
};

export const ALL_SIDEBAR_GROUPS: SidebarGroupConfig[] = [...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP];
