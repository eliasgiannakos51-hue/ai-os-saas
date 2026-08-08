import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
import { AppBackground } from "@/components/ui/app-background";
import { createClient } from "@/lib/supabase/server";
import { CommunityRoadmap } from "@/components/roadmap/community-roadmap";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What's live in Ionexa AI today, what's coming next, and where we're headed.",
};

type RoadmapStatus = "available" | "soon" | "future";

// `key` looks up roadmap.items.<key>.title/.description in messages/*.json
// — the icon/status/grouping stays here in code, only the display text is
// translated.
type RoadmapItem = {
  icon: LucideIcon;
  key: string;
};

type RoadmapSection = {
  status: RoadmapStatus;
  emoji: string;
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
    items: [
      { icon: LayoutGrid, key: "modules" },
      { icon: Sparkles, key: "createAnything" },
      { icon: MessageCircle, key: "chat" },
      { icon: Download, key: "export" },
      { icon: Users, key: "team" },
    ],
  },
  {
    status: "soon",
    emoji: "🔜",
    items: [
      { icon: Bot, key: "agentBuilder" },
      { icon: Globe, key: "websiteBuilder" },
      { icon: Workflow, key: "automationBuilder" },
      { icon: Brain, key: "aiMemory" },
    ],
  },
  {
    status: "future",
    emoji: "🔮",
    items: [
      { icon: Smartphone, key: "mobileApps" },
      { icon: ImageIcon, key: "imageGeneration" },
      { icon: Video, key: "videoGeneration" },
      { icon: FileText, key: "presentations" },
      { icon: Megaphone, key: "marketingBuilder" },
      { icon: Code2, key: "coding" },
      { icon: LineChart, key: "dataAnalysis" },
      { icon: UsersRound, key: "teamGenerator" },
      { icon: ClipboardList, key: "projectManager" },
      { icon: Briefcase, key: "ceoAdvisor" },
      { icon: Store, key: "marketplace" },
      { icon: Shuffle, key: "router" },
      { icon: RefreshCw, key: "sync" },
    ],
  },
];

export default async function RoadmapPage() {
  const t = await getTranslations("roadmap");
  // Only to decide whether the community section shows vote/submit
  // controls or sign-in links — the list itself is public either way.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative min-h-screen px-4 py-16 text-foreground sm:px-6">
      <AppBackground />
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors duration-150 hover:text-orange-400"
          >
            <Logo iconOnly className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight text-foreground">IONEXA</span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-foreground sm:text-4xl">{t("title")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-14 space-y-14">
          {SECTIONS.map((section) => {
            const styles = STATUS_STYLES[section.status];
            const sectionLabel = t(`sections.${section.status}`);
            return (
              <section key={section.status}>
                <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-foreground">
                  <span aria-hidden="true">{section.emoji}</span>
                  {sectionLabel}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => (
                    <div
                      key={item.key}
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
                          {sectionLabel}
                        </span>
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-foreground">
                        {t(`items.${item.key}.title`)}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">
                        {t(`items.${item.key}.description`)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* What the community asked for — voted, statused, and public
            (V3 Task 13). Below the planned sections on purpose: what we
            COMMITTED to comes before what is being weighed. */}
        <CommunityRoadmap isAuthed={Boolean(user)} />

        <div className="mt-16 text-center">
          <Link href="/" className="text-xs text-orange-400 underline underline-offset-2">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
