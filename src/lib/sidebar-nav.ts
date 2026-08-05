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
  MARKETPLACE_ICON,
  TEAM_ICON,
  MEMORY_ICON,
  TIMELINE_ICON,
  FAVORITES_ICON,
  MISSION_ICON,
  REFLECTION_ICON,
  TRADING_WORKFLOW_ICON,
  WEBSITE_BUILDER_ICON,
  PRODUCT_WORKFLOW_ICON,
} from "@/lib/module-icons";

// Single source of truth for every sidebar link — shared by the Sidebar
// (grouped, collapsible) and the command palette (flattened, searchable),
// so the two never drift out of sync.
//
// `hint` is the one-sentence hover explanation. Several of these names
// say nothing about what the page does — "Timeline", "AI Memory",
// "Knowledge", "Decisions" — and a user who cannot guess simply never
// clicks. Every item that isn't self-describing carries one.
export type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** i18n key under sidebar.hints; omitted when the label speaks for itself. */
  hintKey?: string;
  /**
   * Listed, but not yet built. Renders greyed out with a "Coming soon"
   * badge and does not navigate.
   *
   * These were pulled out of the sidebar entirely for one release, and
   * that traded one problem for another: a user could no longer see what
   * the product is going to do. Showing them as visibly unfinished is the
   * honest middle — you learn what is coming without landing on a page
   * that does nothing.
   */
  comingSoon?: boolean;
};

export type SidebarGroupConfig = {
  heading: string;
  items: SidebarItem[];
  /**
   * Every group is collapsible now. The three daily entry points (Home,
   * Ionexa Chat, Create Studio) were lifted OUT of a group entirely — see
   * PINNED_SIDEBAR_ITEMS — because a nine-item always-open "Workspace"
   * next to five collapsed headings made the sidebar read as one long
   * list with some folders appended, rather than as a short menu.
   */
  collapsible: boolean;
  /** i18n key under sidebar.groupHints — one line shown when it opens. */
  hintKey?: string;
};

/**
 * The three things people open every day, pinned above every group.
 *
 * Deliberately not a group: they have no heading, no chevron and no
 * collapsed state, so the first thing in the sidebar is always three
 * one-click destinations rather than a category to expand.
 */
export const PINNED_SIDEBAR_ITEMS: SidebarItem[] = [
  { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON },
  { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON, hintKey: "chat" },
  { href: CREATE_NAV_ITEM.href, label: CREATE_NAV_ITEM.label, icon: CREATE_ICON, hintKey: "create" },
];

export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    heading: "Create",
    collapsible: true,
    hintKey: "create",
    items: [
      {
        href: "/dashboard/website-builder",
        label: "Website Builder",
        icon: WEBSITE_BUILDER_ICON,
        hintKey: "websiteBuilder",
      },
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON, hintKey: "missionControl" },
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents, hintKey: "documents" },
      { href: "/dashboard/websites", label: "Website Plans", icon: MODULE_ICONS.websites, hintKey: "websites" },
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents, hintKey: "agents" },
      // Roadmap items, shown but not clickable — see `comingSoon` above.
      // The routes and tables still exist and still hold any data already
      // in them; only the nav entry is inert until each one actually does
      // what its name promises.
      { href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps, hintKey: "apps", comingSoon: true },
      {
        href: "/dashboard/images",
        label: "Images",
        icon: MODULE_ICONS.images,
        hintKey: "images",
        comingSoon: true,
      },
      {
        href: "/dashboard/videos",
        label: "Videos",
        icon: MODULE_ICONS.videos,
        hintKey: "videos",
        comingSoon: true,
      },
      {
        href: "/dashboard/coding",
        label: "AI Coding",
        icon: MODULE_ICONS.coding,
        hintKey: "coding",
        comingSoon: true,
      },
      {
        href: "/dashboard/presentations",
        label: "Presentations",
        icon: MODULE_ICONS.presentations,
        hintKey: "presentations",
        comingSoon: true,
      },
    ],
  },
  {
    heading: "My Business",
    collapsible: true,
    hintKey: "myBusiness",
    items: [
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance, hintKey: "finance" },
      { href: "/dashboard/sales", label: "CRM", icon: MODULE_ICONS.sales, hintKey: "sales" },
      { href: "/dashboard/content", label: "Marketing", icon: MODULE_ICONS.content, hintKey: "content" },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns, hintKey: "campaigns" },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products, hintKey: "products" },
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics, hintKey: "analytics" },
    ],
  },
  {
    heading: "Track",
    collapsible: true,
    hintKey: "track",
    items: [
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas, hintKey: "ideas" },
      { href: "/dashboard/research", label: "Knowledge", icon: MODULE_ICONS.research, hintKey: "research" },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors, hintKey: "competitors" },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions, hintKey: "decisions" },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning, hintKey: "learning" },
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading, hintKey: "trading" },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback, hintKey: "feedback" },
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"],
        hintKey: "dataAnalysis",
      },
    ],
  },
  {
    heading: "Operations",
    collapsible: true,
    hintKey: "operations",
    items: [
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation, hintKey: "automation" },
      {
        href: "/dashboard/trading-workflow",
        label: "Trading Workflow",
        icon: TRADING_WORKFLOW_ICON,
        hintKey: "tradingWorkflow",
      },
      {
        href: "/dashboard/product-workflow",
        label: "Product Workflow",
        icon: PRODUCT_WORKFLOW_ICON,
        hintKey: "productWorkflow",
      },
    ],
  },
  {
    heading: "Insights",
    collapsible: true,
    hintKey: "insights",
    items: [
      { href: TIMELINE_NAV_ITEM.href, label: TIMELINE_NAV_ITEM.label, icon: TIMELINE_ICON, hintKey: "timeline" },
      {
        href: REFLECTION_NAV_ITEM.href,
        label: REFLECTION_NAV_ITEM.label,
        icon: REFLECTION_ICON,
        hintKey: "reflection",
      },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON, hintKey: "memory" },
      { href: "/dashboard/favorites", label: "Favorites", icon: FAVORITES_ICON, hintKey: "favorites" },
    ],
  },
  {
    heading: "Marketplace",
    collapsible: true,
    hintKey: "marketplace",
    items: [
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace" },
    ],
  },
];

/** Every item that is listed but deliberately not reachable yet. */
export const COMING_SOON_HREFS: ReadonlySet<string> = new Set(
  MAIN_SIDEBAR_GROUPS.flatMap((g) => g.items)
    .filter((i) => i.comingSoon)
    .map((i) => i.href)
);

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON },
    { href: "/dashboard/team", label: "Team", icon: TEAM_ICON, hintKey: "team" },
  ],
};

export const ALL_SIDEBAR_GROUPS: SidebarGroupConfig[] = [...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP];
