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
