import type { LucideIcon } from "lucide-react";
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
  HELP_ICON,
} from "@/lib/module-icons";

// Single source of truth for every sidebar link — shared by the Sidebar
// (grouped, collapsible) and the command palette (flattened, searchable),
// so the two never drift out of sync.
//
// The SHAPES and the role filter live in lib/sidebar-visibility.ts, which
// imports no icons, so the gates can execute `visibleGroups` instead of
// reading it as text. Re-exported here because this is the file every
// consumer already imports.
export type { SidebarItem, SidebarGroupConfig } from "@/lib/sidebar-visibility";
export { visibleGroups } from "@/lib/sidebar-visibility";
import type { SidebarGroupConfig, SidebarItem } from "@/lib/sidebar-visibility";

/**
 * FOUR GROUPS, NAMED FOR WHAT A PERSON IS DOING.
 *
 * There were eight, called Workspace, Build, Tracking, Business,
 * Strategy, Operations, Marketplace and Settings. Five of those are
 * nouns a stranger cannot place — nobody arrives wanting to do
 * "Operations" — and the split between Business, Strategy and Tracking
 * described how the code is organised, not how anybody works.
 *
 * Now: what you open every day · what makes something · your business ·
 * settings.
 *
 * AND THE NINETEEN LOG SCREENS LEFT. Twelve business modules, six
 * tracking tables and Ideas were nineteen sidebar rows that all do the
 * same thing — list rows you typed — and every one of them is still
 * served by the same [module] component. They are one row now, pointing
 * at a hub that filters. They are NOT gone: RECORD_DESTINATIONS below is
 * what the hub lists and what the command palette searches, so every one
 * of them is still one keystroke away. A menu that gets shorter by
 * making pages unreachable has not been simplified, it has been damaged,
 * and scripts/tests/sidebar-density.test.mjs fails if a destination
 * stops being reachable.
 */
export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    // Never collapsed: these are the rows somebody opens without
    // thinking, and a daily action behind a disclosure triangle is a
    // daily action somebody stops taking.
    heading: "Daily",
    collapsible: false,
    items: [
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON, hintKey: "home" },
      { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON, hintKey: "chat" },
      { href: CREATE_NAV_ITEM.href, label: CREATE_NAV_ITEM.label, icon: CREATE_ICON, hintKey: "create" },
      // FAVOURITES + HISTORY + SEARCH, WHICH WERE THREE. Starred things
      // were /dashboard/favorites, everything in order was
      // /dashboard/timeline, and searching your own records was a
      // keyboard shortcut nobody on a phone can press. Three doors into
      // "the things I already put in here" is two doors too many.
      { href: "/dashboard/library", label: "My stuff", icon: FAVORITES_ICON, hintKey: "library" },
      // Next to My stuff rather than under Build: a file you uploaded is
      // something you already have, not something the product made.
      { href: "/dashboard/files", label: "Files", icon: FILES_ICON, hintKey: "files" },
      // NOT UNDER BUILD, and the gate is why. Documents was filed there
      // in the first writing of these four groups; sidebar-naming's
      // model-reachability check went red on it, and it was right:
      // /api/documents POST inserts a row with `content: { html: "" }`.
      // It is an editor you type in, next to the files you brought in —
      // not something the product produces for you.
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents, hintKey: "documents" },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON, hintKey: "memory" },
    ],
  },
  {
    // BUILD MEANS SOMETHING IS PRODUCED, and the gate proves it rather
    // than trusting it: every href here must have an API route behind it
    // that actually calls a model, and every module in
    // lib/build-modules.ts must NOT be here.
    heading: "Build",
    collapsible: true,
    items: [
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents, hintKey: "agents" },
      {
        href: "/dashboard/website-builder",
        label: "Website Builder",
        icon: WEBSITE_BUILDER_ICON, hintKey: "websiteBuilder" },
      // Sits directly under the Builder rather than in its own group: a
      // published site IS a website that went live, and separating the two
      // would make "where did my site go" a navigation question.
      { href: "/dashboard/published", label: "Published Sites", icon: PUBLISHED_SITES_ICON, hintKey: "published" },
      // Directly under Published Sites, for the same reason Published
      // Sites sits under the Builder: a form submission is what a
      // published site produced.
      {
        href: "/dashboard/form-submissions",
        label: "Form Submissions",
        icon: FORM_SUBMISSIONS_ICON,
        hintKey: "formSubmissions",
      },
      // MOVED UP FROM TRACKING IN V4 #19 + #20, because they stopped
      // being logs. Data Analysis parses a real uploaded spreadsheet and
      // draws charts from the real rows; Coding runs five operations that
      // return code. Both have an API route that makes a model call,
      // which is what scripts/tests/sidebar-naming.test.mjs REQUIRES of
      // anything filed here.
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"],
        hintKey: "dataAnalysis",
      },
      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding, hintKey: "coding" },
      // NOT /dashboard/research: that route is the Knowledge tracker, a
      // place to save links by hand. This is the autonomous job that goes
      // and finds them, and it produces a report — which is why it is
      // here and the tracker is in the records hub.
      { href: "/dashboard/deep-research", label: "Deep Research", icon: DEEP_RESEARCH_ICON, hintKey: "deepResearch" },
    ],
  },
  {
    heading: "My business",
    collapsible: true,
    items: [
      // THE NINETEEN, AS ONE ROW. Every log-style screen — the twelve
      // business modules, the six tracking tables and Ideas — behind a
      // hub that filters, because they were nineteen rows of the same
      // shape and the difference between them is a word, not a workflow.
      { href: "/dashboard/records", label: "My records", icon: MODULE_ICONS.ideas, hintKey: "records" },
      // The OWNER's dashboard. Owners only, so it is the nav item that
      // made the flag necessary.
      {
        href: "/dashboard/business-health",
        label: "Business health",
        icon: BUSINESS_HEALTH_ICON,
        hintKey: "businessHealth",
        ownerOnly: true,
      },
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON, hintKey: "missionControl" },
      { href: REFLECTION_NAV_ITEM.href, label: REFLECTION_NAV_ITEM.label, icon: REFLECTION_ICON, hintKey: "reflection" },
      {
        href: "/dashboard/trading-workflow",
        label: "Trading Workflow",
        icon: TRADING_WORKFLOW_ICON, hintKey: "tradingWorkflow" },
      {
        href: "/dashboard/product-workflow",
        label: "Product Workflow",
        icon: PRODUCT_WORKFLOW_ICON, hintKey: "productWorkflow" },
      // Here rather than in Settings: connecting Gmail is something a
      // user does to change how the product WORKS for them, not a
      // preference.
      { href: "/dashboard/integrations", label: "Integrations", icon: INTEGRATIONS_ICON, hintKey: "integrations" },
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace" },
    ],
  },
];

/**
 * The nineteen log screens the sidebar no longer lists one by one.
 *
 * STILL REACHABLE, and that is the condition on the whole restructure.
 * These feed two surfaces: /dashboard/records, which lists and filters
 * them, and the command palette, which searches them alongside the
 * sidebar's own rows. Their routes are untouched — every bookmark, every
 * link the classifier hands back and every favourite still resolves.
 */
export const RECORD_DESTINATIONS: SidebarItem[] = [
  { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas, hintKey: "ideas" },
  { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics, hintKey: "analytics" },
  // The MODULE — a log of the user's own income and expenses, served by
  // the [module] catch-all, not the owner-only dashboard that shadowed it.
  { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance, hintKey: "finance" },
  { href: "/dashboard/content", label: "Content", icon: MODULE_ICONS.content, hintKey: "content" },
  { href: "/dashboard/sales", label: "Sales", icon: MODULE_ICONS.sales, hintKey: "sales" },
  { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products, hintKey: "products" },
  { href: "/dashboard/research", label: "Research", icon: MODULE_ICONS.research, hintKey: "research" },
  { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning, hintKey: "learning" },
  { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors, hintKey: "competitors" },
  { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions, hintKey: "decisions" },
  { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback, hintKey: "feedback" },
  { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading, hintKey: "trading" },
  { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation, hintKey: "automation" },
  { href: "/dashboard/websites", label: "Websites", icon: MODULE_ICONS.websites, hintKey: "websites" },
  { href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps, hintKey: "apps" },
  { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images, hintKey: "images" },
  { href: "/dashboard/videos", label: "Videos", icon: MODULE_ICONS.videos, hintKey: "videos" },
  {
    href: "/dashboard/presentations",
    label: "Presentation notes",
    icon: MODULE_ICONS.presentations, hintKey: "presentations" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns, hintKey: "campaigns" },
];

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON, hintKey: "settings" },
    { href: "/dashboard/team", label: "Team", icon: TEAM_ICON , hintKey: "team" },
    { href: "/dashboard/affiliate", label: "Affiliate", icon: AFFILIATE_ICON, hintKey: "affiliate" },
    // The Help Centre (app/help/page.tsx) — the same 27 answers the chat
    // replies with, as a page. Listed here so it is also reachable from
    // the command palette, which is built from these same groups.
    { href: "/help", label: "Help Centre", icon: HELP_ICON, hintKey: "help" },
  ],
};

export const ALL_SIDEBAR_GROUPS: SidebarGroupConfig[] = [...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP];
