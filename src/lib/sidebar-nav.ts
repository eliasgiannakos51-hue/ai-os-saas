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
  PUBLISHED_SITES_ICON,
  INTEGRATIONS_ICON,
  FILES_ICON,
  DEEP_RESEARCH_ICON,
  HELP_ICON,
} from "@/lib/module-icons";

// Single source of truth for every sidebar link — shared by the Sidebar
// (grouped, collapsible) and the command palette (flattened, searchable),
// so the two never drift out of sync.
export type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** i18n key under sidebar.hints.<hintKey> — the tooltip on hover. */
  hintKey?: string;
};
export type SidebarGroupConfig = {
  heading: string;
  items: SidebarItem[];
  // Workspace holds the core always-visible nav (Home, Ionexa Chat, AI
  // Memory) and is never collapsed — every other group can be toggled.
  collapsible: boolean;
};

export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    heading: "Workspace",
    collapsible: false,
    items: [
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON, hintKey: "home" },
      { href: CREATE_NAV_ITEM.href, label: CREATE_NAV_ITEM.label, icon: CREATE_ICON, hintKey: "create" },
      { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON, hintKey: "chat" },
      { href: TIMELINE_NAV_ITEM.href, label: TIMELINE_NAV_ITEM.label, icon: TIMELINE_ICON, hintKey: "timeline" },
      { href: "/dashboard/favorites", label: "Favorites", icon: FAVORITES_ICON , hintKey: "favorites" },
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON, hintKey: "missionControl" },
      { href: REFLECTION_NAV_ITEM.href, label: REFLECTION_NAV_ITEM.label, icon: REFLECTION_ICON, hintKey: "reflection" },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON , hintKey: "memory" },
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents , hintKey: "documents" },
      // Next to Documents rather than in Build: both are about writing,
      // and the difference — documents the AI wrote for you vs files you
      // brought in for it to read — is exactly the distinction a user
      // needs the two entries to be adjacent to notice.
      { href: "/dashboard/files", label: "Files", icon: FILES_ICON, hintKey: "files" },
      // NOT /dashboard/research: that route is the Knowledge tracker, a
      // place to save links by hand. This is the autonomous job that goes
      // and finds them. Sharing a route would have made one of the two
      // unreachable.
      { href: "/dashboard/deep-research", label: "Deep Research", icon: DEEP_RESEARCH_ICON, hintKey: "deepResearch" },
    ],
  },
  {
    heading: "Build",
    collapsible: true,
    items: [
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents , hintKey: "agents" },
      { href: "/dashboard/websites", label: "Websites", icon: MODULE_ICONS.websites , hintKey: "websites" },
      {
        href: "/dashboard/website-builder",
        label: "Website Builder",
        icon: WEBSITE_BUILDER_ICON, hintKey: "websiteBuilder" },
      // Sits directly under the Builder rather than in its own group: a
      // published site IS a website that went live, and separating the two
      // would make "where did my site go" a navigation question.
      { href: "/dashboard/published", label: "Published Sites", icon: PUBLISHED_SITES_ICON, hintKey: "published" },
      { href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps , hintKey: "apps" },
      { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images , hintKey: "images" },
      { href: "/dashboard/videos", label: "Videos", icon: MODULE_ICONS.videos , hintKey: "videos" },
      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding , hintKey: "coding" },
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"], hintKey: "dataAnalysis" },
      {
        href: "/dashboard/presentations",
        label: "Presentation Notes",
        icon: MODULE_ICONS.presentations, hintKey: "presentations" },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns , hintKey: "campaigns" },
    ],
  },
  {
    heading: "Business",
    collapsible: true,
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics , hintKey: "analytics" },
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance , hintKey: "finance" },
      { href: "/dashboard/content", label: "Marketing", icon: MODULE_ICONS.content , hintKey: "content" },
      { href: "/dashboard/sales", label: "CRM", icon: MODULE_ICONS.sales , hintKey: "sales" },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products , hintKey: "products" },
      { href: "/dashboard/research", label: "Knowledge", icon: MODULE_ICONS.research , hintKey: "research" },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning , hintKey: "learning" },
    ],
  },
  {
    heading: "Strategy",
    collapsible: true,
    items: [
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas , hintKey: "ideas" },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors , hintKey: "competitors" },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions , hintKey: "decisions" },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback , hintKey: "feedback" },
    ],
  },
  {
    heading: "Operations",
    collapsible: true,
    items: [
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading , hintKey: "trading" },
      {
        href: "/dashboard/trading-workflow",
        label: "Trading Workflow",
        icon: TRADING_WORKFLOW_ICON, hintKey: "tradingWorkflow" },
      {
        href: "/dashboard/product-workflow",
        label: "Product Workflow",
        icon: PRODUCT_WORKFLOW_ICON, hintKey: "productWorkflow" },
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation , hintKey: "automation" },
      // Operations rather than Settings: connecting Gmail is something a
      // user does to change how the product WORKS for them, not a
      // preference. It sits next to Automation because both answer "what
      // does this do on my behalf".
      { href: "/dashboard/integrations", label: "Integrations", icon: INTEGRATIONS_ICON, hintKey: "integrations" },
    ],
  },
  {
    heading: "Marketplace",
    collapsible: true,
    items: [
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON , hintKey: "marketplace" },
    ],
  },
];

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON, hintKey: "settings" },
    { href: "/dashboard/team", label: "Team", icon: TEAM_ICON , hintKey: "team" },
    // The Help Centre (app/help/page.tsx) — the same 27 answers the chat
    // replies with, as a page. Listed here so it is also reachable from
    // the command palette, which is built from these same groups.
    { href: "/help", label: "Help Centre", icon: HELP_ICON, hintKey: "help" },
  ],
};

export const ALL_SIDEBAR_GROUPS: SidebarGroupConfig[] = [...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP];
