import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bot, Workflow, FileText, Megaphone, LineChart, Code2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MARKETPLACE_ICON } from "@/lib/module-icons";

export const metadata: Metadata = {
  title: "Marketplace",
};

// Static/demo data — there's no buy/sell functionality yet (that's the
// "Future Vision" marketplace item on the public roadmap), so this page
// just previews what the marketplace will look like. No table, no
// interactive purchase flow — every listing shows a "Coming Soon" badge
// instead of a working button.
const DEMO_LISTINGS = [
  {
    icon: Bot,
    category: "Agent",
    name: "Lead Qualifier Agent",
    description: "Screens inbound leads against your ICP and drafts a follow-up.",
    price: "$29",
  },
  {
    icon: Workflow,
    category: "Automation",
    name: "Weekly Metrics Digest",
    description: "Pulls your analytics module and emails a weekly summary.",
    price: "$19",
  },
  {
    icon: FileText,
    category: "Template",
    name: "Product Launch Plan",
    description: "A pre-filled Products module template for a 30-day launch.",
    price: "$9",
  },
  {
    icon: Megaphone,
    category: "Agent",
    name: "Content Repurposer",
    description: "Turns one long-form post into a week of social captions.",
    price: "$29",
  },
  {
    icon: LineChart,
    category: "Automation",
    name: "Trade Journal Analyzer",
    description: "Flags patterns across your logged trades and suggests fixes.",
    price: "$19",
  },
  {
    icon: Code2,
    category: "Template",
    name: "SaaS Competitor Tracker",
    description: "A Competitors module starter set for common SaaS rivals.",
    price: "$9",
  },
] as const;

export default async function MarketplacePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={MARKETPLACE_ICON}
          title="Marketplace"
          description="Buy and sell agents, automations, and templates — coming soon."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_LISTINGS.map((listing) => (
            <div
              key={listing.name}
              className="flex flex-col rounded-2xl border border-border bg-panel p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                  <listing.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-panel-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                  {listing.category}
                </span>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-foreground">{listing.name}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted">
                {listing.description}
              </p>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
                <span className="text-sm font-semibold text-foreground">{listing.price}</span>
                <span className="inline-flex items-center rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                  Coming Soon
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
