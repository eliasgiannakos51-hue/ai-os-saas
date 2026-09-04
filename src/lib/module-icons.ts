import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Brain,
  CalendarClock,
  Code2,
  Database,
  DollarSign,
  FileText,
  Flag,
  FolderOpen,
  GitBranch,
  Gauge,
  Globe,
  GraduationCap,
  History,
  Home,
  Image as ImageIcon,
  Inbox,
  Layout,
  LayoutGrid,
  LifeBuoy,
  Lightbulb,
  LineChart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Package,
  PenTool,
  Plug,
  Presentation,
  Radio,
  Rocket,
  Search,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Target,
  Telescope,
  TrendingUp,
  Users,
  Video,
  Zap,
  Coins,
  Split,
  Activity,
  NotebookPen,
} from "lucide-react";

// Single source of truth for module iconography, keyed by module slug (see
// lib/modules.ts MODULES / lib/classifier-modules.ts). Shared by the
// sidebar, module page headers, and the home page's quick-action cards so
// the same module always gets the same icon everywhere.
export const MODULE_ICONS: Record<string, LucideIcon> = {
  ideas: Lightbulb,
  competitors: Target,
  research: Search,
  finance: DollarSign,
  learning: GraduationCap,
  trading: TrendingUp,
  decisions: GitBranch,
  products: Package,
  content: PenTool,
  sales: Users,
  feedback: MessageSquare,
  analytics: BarChart3,
  automation: Zap,
  agents: Bot,
  websites: Globe,
  apps: Smartphone,
  images: ImageIcon,
  videos: Video,
  coding: Code2,
  "data-analysis": Database,
  documents: FileText,
  presentations: Presentation,
  campaigns: Megaphone,
};

export const OVERVIEW_ICON: LucideIcon = Home;
export const CREATE_ICON: LucideIcon = Sparkles;
export const CHAT_ICON: LucideIcon = MessageCircle;
export const SETTINGS_ICON: LucideIcon = Settings;
export const MARKETPLACE_ICON: LucideIcon = Store;
export const TEAM_ICON: LucideIcon = Users;
export const MEMORY_ICON: LucideIcon = Brain;
export const TIMELINE_ICON: LucideIcon = History;
export const FAVORITES_ICON: LucideIcon = Star;
export const MISSION_ICON: LucideIcon = Rocket;
export const REFLECTION_ICON: LucideIcon = CalendarClock;
// Distinct from MODULE_ICONS.trading (TrendingUp) — this is the unified
// Trading Workflow page, not the raw Trading module list.
export const TRADING_WORKFLOW_ICON: LucideIcon = LineChart;
// The owner's own dashboard — MRR, margin, churn, runway. Deliberately
// NOT the module icon: /dashboard/finance is the log a user keeps of
// their own income and expenses, and the two must not read as the same
// thing in a nav that shows both.
export const BUSINESS_HEALTH_ICON: LucideIcon = Gauge;
// Distinct from MODULE_ICONS.websites (Globe) — this is the real AI
// generator (dashboard/website-builder), not the "Websites" Build
// module's plain idea tracker.
export const WEBSITE_BUILDER_ICON: LucideIcon = Layout;
// Distinct from MODULE_ICONS.products (Package) and MISSION_ICON (Rocket,
// already used elsewhere in the same sidebar section) — this is the
// unified Product Workflow page, not the raw Products module list.
export const PRODUCT_WORKFLOW_ICON: LucideIcon = Flag;
// Distinct from MODULE_ICONS.websites (Globe, the idea tracker) and from
// WEBSITE_BUILDER_ICON (Layout, the generator) — this is the list of sites
// that are actually LIVE on the public web, which is a third thing.
export const PUBLISHED_SITES_ICON: LucideIcon = Radio;
// Distinct from MODULE_ICONS.automation (Zap) — an integration is a
// connection to somebody else's product, not a rule that runs inside ours.
export const INTEGRATIONS_ICON: LucideIcon = Plug;
// Distinct from MODULE_ICONS.documents (FileText, documents the AI wrote
// FOR you) — these are files the user brought IN for the AI to read.
export const FILES_ICON: LucideIcon = FolderOpen;
// What visitors sent through a form on a published site. An inbox, not a
// letter: the page is a list of arrivals, and the envelope icon already
// means "email" everywhere else in this product.
export const FORM_SUBMISSIONS_ICON: LucideIcon = Inbox;
// Distinct from MODULE_ICONS.research (the Knowledge tracker at
// /dashboard/research, a place to save links and notes by hand) — this is
// the autonomous multi-search job that writes a report. Two different
// things that both answer to the word "research", so they get two
// different icons and two different routes.
export const DEEP_RESEARCH_ICON: LucideIcon = Telescope;

// Help Centre (app/help/page.tsx) — a life ring, not a question mark:
// a "?" reads as "what is this control" and this is "I need help".
export const HELP_ICON: LucideIcon = LifeBuoy;

// Affiliate programme — a share arrow, not a money symbol: the thing the
// user does here is share a link; the money is a consequence.
export const AFFILIATE_ICON: LucideIcon = Share2;

/**
 * The icon for any slug that can appear on a card, including the
 * starrable-but-not-a-module surfaces (lib/favoritable.ts's
 * EXTRA_FAVORITABLE) whose slugs aren't keys of MODULE_ICONS.
 *
 * Without this, a starred Website Builder project or Mission fell through
 * to a generic fallback on the Favorites page while the same record
 * carried its real icon everywhere else.
 */
const EXTRA_ICONS: Record<string, LucideIcon> = {
  websiteBuilder: WEBSITE_BUILDER_ICON,
  missionControl: MISSION_ICON,
  createStudio: CREATE_ICON,
  tradingWorkflow: TRADING_WORKFLOW_ICON,
  productWorkflow: PRODUCT_WORKFLOW_ICON,
};

export function iconForSlug(slug: string, fallback: LucideIcon = Sparkles): LucideIcon {
  return MODULE_ICONS[slug] ?? EXTRA_ICONS[slug] ?? fallback;
}

// The hub at /dashboard/business — one row in place of the nineteen log
// modules the sidebar used to list, so the icon is the "many things,
// one place" one rather than any single module's.
export const MY_BUSINESS_ICON: LucideIcon = LayoutGrid;

// THE FOUR ROUTES THAT WERE IN NO NAV CONFIG AT ALL — V4.6, round 5.
//
// /dashboard/costs, /dashboard/routing, /dashboard/system-health and
// /dashboard/trading-journal each had a page on disk and no entry in
// lib/sidebar-nav.ts, so they were in no sidebar, no command palette and
// no hub: reachable only by typing the URL. Two of them (routing,
// trading-journal) had no link anywhere in the product at all.
export const COSTS_ICON: LucideIcon = Coins;
export const ROUTING_ICON: LucideIcon = Split;
export const SYSTEM_HEALTH_ICON: LucideIcon = Activity;
export const TRADING_JOURNAL_ICON: LucideIcon = NotebookPen;
