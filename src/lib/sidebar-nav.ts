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
  MISSION_ICON,
  REFLECTION_ICON,
  TRADING_WORKFLOW_ICON,
  WEBSITE_BUILDER_ICON,
  PRODUCT_WORKFLOW_ICON,
} from "@/lib/module-icons";

// Single source of truth for every sidebar link — shared by the Sidebar
// (grouped, collapsible) and the command palette (flattened, searchable),
// so the two never drift out of sync.
export type SidebarItem = { href: string; label: string; icon: LucideIcon };
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
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON },
      { href: CREATE_NAV_ITEM.href, label: CREATE_NAV_ITEM.label, icon: CREATE_ICON },
      { href: CHAT_NAV_ITEM.href, label: "Ionexa Chat", icon: CHAT_ICON },
      { href: TIMELINE_NAV_ITEM.href, label: TIMELINE_NAV_ITEM.label, icon: TIMELINE_ICON },
      { href: MISSION_NAV_ITEM.href, label: MISSION_NAV_ITEM.label, icon: MISSION_ICON },
      { href: REFLECTION_NAV_ITEM.href, label: REFLECTION_NAV_ITEM.label, icon: REFLECTION_ICON },
      { href: "/dashboard/memory", label: "AI Memory", icon: MEMORY_ICON },
    ],
  },
  {
    heading: "Build",
    collapsible: true,
    items: [
      { href: "/dashboard/agents", label: "AI Agents", icon: MODULE_ICONS.agents },
      { href: "/dashboard/websites", label: "Websites", icon: MODULE_ICONS.websites },
      {
        href: "/dashboard/website-builder",
        label: "Website Builder",
        icon: WEBSITE_BUILDER_ICON,
      },
      { href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps },
      { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images },
      { href: "/dashboard/videos", label: "Videos", icon: MODULE_ICONS.videos },
      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding },
      {
        href: "/dashboard/data-analysis",
        label: "Data Analysis",
        icon: MODULE_ICONS["data-analysis"],
      },
      { href: "/dashboard/documents", label: "Documents", icon: MODULE_ICONS.documents },
      {
        href: "/dashboard/presentations",
        label: "Presentations",
        icon: MODULE_ICONS.presentations,
      },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns },
    ],
  },
  {
    heading: "Business",
    collapsible: true,
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics },
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance },
      { href: "/dashboard/content", label: "Marketing", icon: MODULE_ICONS.content },
      { href: "/dashboard/sales", label: "CRM", icon: MODULE_ICONS.sales },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products },
      { href: "/dashboard/research", label: "Knowledge", icon: MODULE_ICONS.research },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning },
    ],
  },
  {
    heading: "Strategy",
    collapsible: true,
    items: [
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback },
    ],
  },
  {
    heading: "Operations",
    collapsible: true,
    items: [
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading },
      {
        href: "/dashboard/trading-workflow",
        label: "Trading Workflow",
        icon: TRADING_WORKFLOW_ICON,
      },
      {
        href: "/dashboard/product-workflow",
        label: "Product Workflow",
        icon: PRODUCT_WORKFLOW_ICON,
      },
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation },
    ],
  },
  {
    heading: "Marketplace",
    collapsible: true,
    items: [
      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON },
    ],
  },
];

export const SETTINGS_GROUP: SidebarGroupConfig = {
  heading: "Settings",
  collapsible: true,
  items: [
    { href: SETTINGS_NAV_ITEM.href, label: "Settings", icon: SETTINGS_ICON },
    { href: "/dashboard/team", label: "Team", icon: TEAM_ICON },
  ],
};

export const ALL_SIDEBAR_GROUPS: SidebarGroupConfig[] = [...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP];
