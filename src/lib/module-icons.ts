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
  BarChart3,
  Zap,
  Home,
  Sparkles,
  Settings,
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
};

export const OVERVIEW_ICON: LucideIcon = Home;
export const CREATE_ICON: LucideIcon = Sparkles;
export const SETTINGS_ICON: LucideIcon = Settings;
