import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Sparkles,
  MessageCircle,
  Download,
  Users,
  Bot,
  Globe,
  Workflow,
  Brain,
  Smartphone,
  Image as ImageIcon,
  Video,
  FileText,
  Megaphone,
  Code2,
  LineChart,
  UsersRound,
  ClipboardList,
  Briefcase,
  Store,
  Shuffle,
  RefreshCw,
} from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What's live in Veron AI today, what's coming next, and where we're headed.",
};

type RoadmapStatus = "available" | "soon" | "future";

type RoadmapItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type RoadmapSection = {
  status: RoadmapStatus;
  emoji: string;
  label: string;
  items: RoadmapItem[];
};

const STATUS_STYLES: Record<RoadmapStatus, { badge: string; icon: string }> = {
  available: {
    badge: "border-emerald-800 bg-emerald-950/30 text-emerald-400",
    icon: "bg-emerald-500/10 text-emerald-400",
  },
  soon: {
    badge: "border-orange-800 bg-orange-950/30 text-orange-400",
    icon: "bg-orange-500/10 text-orange-400",
  },
  future: {
    badge: "border-border bg-panel-hover text-muted",
    icon: "bg-muted/10 text-muted",
  },
};

const SECTIONS: RoadmapSection[] = [
  {
    status: "available",
    emoji: "✅",
    label: "Available Now",
    items: [
      {
        icon: LayoutGrid,
        title: "13 Business Modules",
        description:
          "Ideas, Competitors, Research, Finance, Learning, Trading, Decisions, Products, Content, Sales/CRM, Feedback, Analytics, and Automation notes.",
      },
      {
        icon: Sparkles,
        title: "Create Anything",
        description:
          "Describe anything in plain text and AI files it into the right module automatically.",
      },
      {
        icon: MessageCircle,
        title: "Veron Chat",
        description:
          "A general-purpose AI assistant for any question — not tied to a specific module.",
      },
      {
        icon: Download,
        title: "Data Export",
        description: "CSV export per module, plus a full JSON export of everything you've logged.",
      },
      {
        icon: Users,
        title: "Team Collaboration",
        description: "Invite teammates and give them full access at your plan's tier.",
      },
    ],
  },
  {
    status: "soon",
    emoji: "🔜",
    label: "Coming Soon",
    items: [
      {
        icon: Bot,
        title: "AI Agent Builder",
        description: "Describe a goal and get a working autonomous agent that pursues it.",
      },
      {
        icon: Globe,
        title: "Website Builder",
        description: "AI-generated websites from a single prompt.",
      },
      {
        icon: Workflow,
        title: "Real Automation Builder",
        description: "Actual workflow automation that runs — not just logged ideas.",
      },
      {
        icon: Brain,
        title: "AI Memory",
        description: "Cross-project context and recall, so AI remembers what matters.",
      },
    ],
  },
  {
    status: "future",
    emoji: "🔮",
    label: "Future Vision",
    items: [
      {
        icon: Smartphone,
        title: "Mobile & Desktop Apps",
        description: "Native apps for iOS, Android, macOS, and Windows.",
      },
      {
        icon: ImageIcon,
        title: "AI Image Generation",
        description: "Generate images directly inside your workspace.",
      },
      {
        icon: Video,
        title: "AI Video Generation & Editing",
        description: "Create and edit video with AI.",
      },
      {
        icon: FileText,
        title: "AI Presentations & Documents",
        description: "Generate polished decks and documents from your data.",
      },
      {
        icon: Megaphone,
        title: "AI Marketing Campaign Builder",
        description: "Plan and generate full marketing campaigns.",
      },
      {
        icon: Code2,
        title: "AI Coding Assistant",
        description: "Full app generation, not just snippets.",
      },
      {
        icon: LineChart,
        title: "AI Data Analysis",
        description: "Deep analysis and insight generation across your data.",
      },
      {
        icon: UsersRound,
        title: "AI Team Generator",
        description: "Multiple coordinated agents working together on a single goal.",
      },
      {
        icon: ClipboardList,
        title: "AI Project Manager",
        description: "Automatic task breakdown and tracking for any project.",
      },
      {
        icon: Briefcase,
        title: "AI CEO Advisor",
        description: "A business planning consultant, always available.",
      },
      {
        icon: Store,
        title: "Marketplace",
        description: "Buy and sell agents, automations, and templates.",
      },
      {
        icon: Shuffle,
        title: "Universal AI Router",
        description: "Automatic selection across multiple AI providers for the best result.",
      },
      {
        icon: RefreshCw,
        title: "Cross-Platform Sync",
        description: "A unified experience across web, mobile, and desktop.",
      },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors duration-150 hover:text-orange-400"
          >
            <Logo iconOnly className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight text-foreground">VERON</span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-foreground sm:text-4xl">Roadmap</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Veron AI is being built in phases. Here&apos;s what&apos;s live today, what&apos;s
            coming next, and where we&apos;re headed.
          </p>
        </div>

        <div className="mt-14 space-y-14">
          {SECTIONS.map((section) => {
            const styles = STATUS_STYLES[section.status];
            return (
              <section key={section.label}>
                <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-foreground">
                  <span aria-hidden="true">{section.emoji}</span>
                  {section.label}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => (
                    <div
                      key={item.title}
                      className="flex flex-col rounded-2xl border border-border bg-panel p-5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
                        >
                          <item.icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}
                        >
                          {section.label}
                        </span>
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <Link href="/" className="text-xs text-orange-400 underline underline-offset-2">
            ← Back to Veron AI
          </Link>
        </div>
      </div>
    </main>
  );
}
