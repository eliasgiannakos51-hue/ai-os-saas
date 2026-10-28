import {
  BarChart3,
  Code2,
  DollarSign,
  FileText,
  Globe,
  MessageCircle,
  Megaphone,
  Paperclip,
  Presentation,
  Telescope,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { MyStuffKind } from "@/lib/my-stuff/sources";

/** One icon per kind, shared by the list column, the details pane and the
 *  Q&A field's citation chips — moved out of my-stuff-shell.tsx (gone,
 *  replaced by my-stuff-workspace.tsx) so none of its three readers has
 *  to import a component file just for this map. */
export const KIND_ICON: Record<MyStuffKind, LucideIcon> = {
  site: Globe,
  slides: Presentation,
  posts: Megaphone,
  document: FileText,
  research: Telescope,
  analysis: BarChart3,
  file: Paperclip,
  chat: MessageCircle,
  coding: Code2,
  finance: DollarSign,
  sales: Users,
  trading: TrendingUp,
};
