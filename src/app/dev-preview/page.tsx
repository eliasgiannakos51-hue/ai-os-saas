// TEMPORARY UI preview harness — deleted before commit. Renders the shared
// card/list/detail primitives with mock data so they can be screenshotted
// without a Supabase session.
import { ToastProvider } from "@/components/toast/toast-context";
import { ToastContainer } from "@/components/toast/toast-container";
import { CreditsProvider } from "@/components/credits/credits-context";
import { GenericList } from "@/components/modules/generic-list";
import { getModule } from "@/lib/modules";
import { getBuildModule } from "@/lib/build-modules";
import type { ModuleRecord } from "@/types/module-record";
import { WebsiteBuilderWorkspace } from "@/components/website-builder/website-builder-workspace";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { DocumentsList } from "@/components/documents/documents-list";
import type { UserWebsite } from "@/types/user-website";
import { MissionList } from "@/components/mission/mission-list";
import type { Mission } from "@/types/mission";

export const dynamic = "force-dynamic";

const now = new Date("2026-08-01T10:00:00Z").toISOString();

const competitorRows: ModuleRecord[] = [
  {
    id: "c1",
    user_id: "u",
    created_at: now,
    company: "Acme Analytics",
    product: "Dashboards",
    pricing: "€49/mo",
    customers: "SMB SaaS",
    marketing: "Heavy on paid search and comparison landing pages; almost no organic presence, which is where the gap is.",
    strengths: "Fast onboarding",
    weaknesses: "No API",
  },
  {
    id: "c2",
    user_id: "u",
    created_at: now,
    company: "Northwind Data",
    product: "Warehouse sync",
    pricing: "Enterprise",
    customers: "Mid-market",
    marketing: "Conference-led, sponsors three industry events a year.",
    strengths: "Deep integrations",
    weaknesses: "Slow support",
  },
];

const agentRows: ModuleRecord[] = [
  { id: "a1", user_id: "u", created_at: now, name: "Inbox triage agent", description: "Sorts support email into billing, bugs and everything else, then drafts a first reply for the human to approve.", status: "active" },
  { id: "a2", user_id: "u", created_at: now, name: "Weekly digest writer", description: "Summarises the week's entries across every module into one short brief.", status: "planned" },
  { id: "a3", user_id: "u", created_at: now, name: "Churn watcher", description: "Flags accounts whose usage dropped more than 40% week over week.", status: "paused" },
  { id: "a4", user_id: "u", created_at: now, name: "Onboarding coach", description: "Walks a new signup through their first three modules.", status: "archived" },
];

const tradeRows: ModuleRecord[] = [
  { id: "t1", user_id: "u", created_at: now, symbol: "EURUSD", direction: "long", result: "win", pnl: 320, notes: "Broke the London high on the retest, held the 15m order block the whole way up." },
  { id: "t2", user_id: "u", created_at: now, symbol: "BTCUSD", direction: "short", result: "loss", pnl: -140, notes: "Entered early, no confirmation candle." },
];

function site(over: Partial<UserWebsite>): UserWebsite {
  return {
    id: "w",
    user_id: "u",
    name: "Site",
    html_content: "",
    status: "completed",
    error_message: null,
    reference_image_url: null,
    has_reference_images: false,
    is_large_request: false,
    free_retry_used: false,
    description: null,
    created_at: now,
    ...over,
  };
}

const websiteRows: UserWebsite[] = [
  site({
    id: "w1",
    name: "Coaching Landing Page",
    description: "A warm, professional landing page for a one-to-one coaching business, with testimonials and a contact form.",
    html_content:
      "<!doctype html><html><head><style>body{font-family:sans-serif;margin:0}header{background:#111;color:#fff;padding:60px 40px}h1{font-size:44px;margin:0}</style></head><body><header><h1>Grow with clarity</h1><p>One-to-one coaching for founders.</p></header><main style='padding:40px'><h2>Testimonials</h2><p>“Changed how I run my week.”</p></main></body></html>",
  }),
  site({ id: "w2", name: "Bakery Menu", description: "A single-page menu for a neighbourhood bakery.", status: "processing" }),
  site({ id: "w3", name: "Portfolio v2", description: "Dark, minimal portfolio for a product designer.", status: "failed", error_message: "The model returned an incomplete document." }),
  site({ id: "w4", name: "Crypto Promo", description: "Landing page for a token launch.", status: "flagged", error_message: "Contains unverifiable financial claims." }),
];

const favoriteGroups = [
  {
    moduleSlug: "trading",
    moduleTitle: "Trading",
    entries: [
      { id: "f1", table: "trades", recordId: "t1", moduleSlug: "trading", moduleTitle: "Trading", headline: "EURUSD", href: "/dashboard/trading", createdAt: now },
    ],
  },
  {
    moduleSlug: "websiteBuilder",
    moduleTitle: "Website Builder",
    entries: [
      { id: "f2", table: "user_websites", recordId: "w1", moduleSlug: "websiteBuilder", moduleTitle: "Website Builder", headline: "Coaching Landing Page", href: "/dashboard/website-builder?project=w1", createdAt: now },
    ],
  },
];

const documentRows = [
  { id: "d1", title: "Q3 positioning notes", updated_at: now, preview: "The wedge is teams who already track this in spreadsheets and hate it. Lead with the migration, not the features." },
  { id: "d2", title: "", updated_at: now, preview: "Untitled scratch — call notes from Tuesday." },
];

const missionRows: Mission[] = [
  {
    id: "m1",
    user_id: "u",
    goal: "Launch a paid newsletter for indie founders",
    status: "in_progress",
    plan_steps: {
      steps: [
        { text: "Log the newsletter as a product with pricing", status: "completed", module: "products", moduleTitle: "Products", href: "/dashboard/products", output: "Added \"Founder Letter\" at €9/mo." },
        { text: "Research three competing newsletters", status: "pending" },
        { text: "Create a landing page for signups", status: "pending" },
      ],
    },
    created_at: now,
    updated_at: now,
  },
  {
    id: "m2",
    user_id: "u",
    goal: "Cut hosting spend by 30%",
    status: "completed",
    plan_steps: {
      steps: [{ text: "Log current monthly hosting cost", status: "completed" }],
      review: "You cut the bill from €410 to €270 by moving static assets off the app server. The remaining spend is dominated by the database tier.",
    },
    created_at: now,
    updated_at: now,
  },
];

export default function DevPreviewPage() {
  const competitors = getModule("competitors")!;
  const agents = getBuildModule("agents")!;
  const trading = getModule("trading")!;

  return (
    <ToastProvider>
      <CreditsProvider initialCredits={500} initialTotal={1000} initialCreditPriceEur={0.01} isAdmin={false}>
        <main className="min-h-full bg-dot-grid">
          <div className="mx-auto max-w-3xl space-y-12 px-4 py-8 sm:px-6">
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">Competitors (classifier module)</h1>
              <GenericList module={competitors} records={competitorRows} />
            </section>
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">AI Agents (build module, has status)</h1>
              <GenericList module={agents} records={agentRows} />
            </section>
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">Trading (tags + status)</h1>
              <GenericList module={trading} records={tradeRows} />
            </section>
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">Website Builder</h1>
              <WebsiteBuilderWorkspace initialWebsites={websiteRows} favoritedWebsiteIds={["w1"]} />
            </section>
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">Documents</h1>
              <DocumentsList documents={documentRows} favoritedIds={["d1"]} />
            </section>
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">Mission Control</h1>
              <MissionList missions={missionRows} favoritedIds={["m1"]} />
            </section>
            <section>
              <h1 className="mb-4 text-xl font-bold text-foreground">Favorites</h1>
              <FavoritesList groups={favoriteGroups} />
            </section>
          </div>
        </main>
        <ToastContainer />
      </CreditsProvider>
    </ToastProvider>
  );
}
