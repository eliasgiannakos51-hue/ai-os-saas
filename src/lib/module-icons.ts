import type { LucideIcon } from "lucide-react";
import {
  Lightbulb,
  Target,
  Search,
  DollarSign,
  GraduationCap,
  TrendingUp,
  GitBranch,
  Package,
  PenTool,
  Users,
  MessageSquare,
  MessageCircle,
  BarChart3,
  Zap,
  Home,
  Sparkles,
  Settings,
  Bot,
  Globe,
  Smartphone,
  Image as ImageIcon,
  Video,
  Store,
  Code2,
  Database,
  FileText,
  Presentation,
  Megaphone,
  Brain,
  History,
  Plug,
  Radio,
  Rocket,
  CalendarClock,
  LineChart,
  Layout,
  Flag,
  Star,
  FolderOpen,
  Telescope,
  LifeBuoy,
  Share2,
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
