import { redirect } from "next/navigation";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { ToastProvider } from "@/components/toast/toast-context";
import { ToastContainer } from "@/components/toast/toast-container";
import { OfflineBanner } from "@/components/network/offline-banner";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { CommandPaletteProvider } from "@/components/dashboard/command-palette-context";
import { CreditsProvider } from "@/components/credits/credits-context";
import { VoiceAvailabilityProvider } from "@/components/voice/voice-availability";
import { TopNav } from "@/components/dashboard/top-nav";
import { acceptPendingTeamInvite } from "@/lib/team/accept-pending-invite";
import { getOrInitCredits, resolveEffectivePlan, packCreditPriceEurFromRow } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { AmbientDots } from "@/components/ui/ambient-dots";
import { SampleDataBanner } from "@/components/sample-data/sample-data-banner";
import { findSampleImport } from "@/lib/sample-data/apply";
import { DashboardBackground } from "@/components/dashboard/dashboard-background";
import { AchievementUnlockBridge } from "@/components/achievements/achievement-unlock-bridge";
import { NavTracker } from "@/components/dashboard/nav-tracker";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Fire-and-forget: if this email has a pending team invite, join it now.
  // Any effect lands on the user's *next* request (this one already fetched
  // `user` above), which is fine for a low-frequency, best-effort check.
  void acceptPendingTeamInvite(user.id, user.email ?? "");

  const plan = await resolveEffectivePlan(user);
  const isAdmin = isAdminEmail(user.email);

  // getOrInitCredits creates a service-role Supabase client under the hood
  // (see lib/supabase/admin.ts), which throws synchronously if
  // SUPABASE_SERVICE_ROLE_KEY (or the Supabase URL) isn't set in this
  // environment — and since this layout wraps every dashboard route, an
  // unhandled throw here takes down the entire dashboard, not just one
  // page, and does it before dashboard/error.tsx's boundary can catch it
  // (a layout can't be caught by its own segment's error boundary). Degrade
  // to a zero balance instead so the shell still renders; admins are
  // unaffected since CreditsProvider treats isAdmin as unlimited regardless
  // of the numeric balance.
  //
  // ONE READ, NOT TWO. The credit price shown in the header needs the same
  // user_credits row as the balance — min_pack_credit_price_eur lives on
  // it — and it used to be fetched by a second call, awaited inside the
  // JSX below, which put it AFTER the balance in the chain rather than
  // beside it. Every dashboard navigation paid for that round trip.
  let credits: {
    credits_remaining: number;
    credits_total: number;
    min_pack_credit_price_eur?: number | string | null;
  };
  try {
    credits = await getOrInitCredits(user.id, plan);
  } catch (err) {
    logApiError("/dashboard (layout)", err, { stage: "get_or_init_credits", userId: user.id });
    credits = { credits_remaining: 0, credits_total: 0, min_pack_credit_price_eur: null };
  }
  const packCreditPriceEur = packCreditPriceEurFromRow(credits);

  // ON EVERY PAGE, NOT JUST HOME — V4.6 #6 asks for the marker to be
  // visible continuously. The sample shows up in the finance charts, in
  // the leads list and in what the chat answers with, and any of those is
  // somewhere a person can land without passing Home. One indexed read
  // (user_imports has user_created_idx) against a table with at most a
  // handful of rows per account.
  const sampleImport = await findSampleImport(supabase, user.id);


  return (
    <ToastProvider>
      <SidebarProvider>
        <CommandPaletteProvider>
          <CreditsProvider
            initialCredits={credits.credits_remaining}
            initialTotal={credits.credits_total}
            initialCreditPriceEur={effectiveCreditPriceEurForAccount(
              plan,
              packCreditPriceEur,
              resolvePricingConfig()
            )}
            initialPlanSlug={plan.slug}
            isAdmin={isAdmin}
          >
            {/* Same wireframe globe as login/signup/landing, now behind every
                dashboard page for visual continuity with the auth pages —
                fixed to the viewport, z-0. The whole app shell below is
                explicitly `relative z-10` (one wrap here, not per-page) so
                it stacks above the globe as a unit: Sidebar/TopNav's own
                z-index values (z-50/z-30) still order correctly *within*
                that shell, and every page's content, opaque or not, paints
                on top of the globe by default instead of needing its own
                stacking fix. DashboardBackground (not AuthBackground
                directly) picks the opacity per-route, since Chat/Create
                need a higher one — see its own comment for why. */}
            {/* WHETHER VOICE EXISTS HERE AT ALL — one read, shared by
                every microphone button and every "Listen" button below
                it. Two provider keys are optional to a deployment and
                mandatory to the feature, so the controls have to know
                before they render whether pressing them could work; a
                fetch per button would be a fetch per button. Mounted
                inside CreditsProvider because the voice controls show a
                price and refresh the balance after spending it. */}
            <VoiceAvailabilityProvider>
            <DashboardBackground />
            {/* A second, much quieter ambient layer above the globe: ten
                slowly drifting dots and two breathing glows, pure CSS. The
                globe is a canvas with its own render loop and is not
                touched — this sits on top of it at z-0 and costs nothing
                per frame. */}
            <div className="pointer-events-none fixed inset-0 z-0">
              <AmbientDots />
            </div>
            {/* WHAT A PAGE SAYS WHEN IT CANNOT REACH THE SERVER.
                Mounted once, above the whole dashboard, because the
                service worker will happily serve the last version of any
                page from cache — which is right, and is exactly why the
                user has to be told that what they are reading stopped
                updating. Renders nothing while the connection is fine. */}
            <OfflineBanner />
            <div className="relative z-10 flex min-h-screen">
              <Sidebar email={user.email ?? ""} planName={plan.name} isOwner={isAdmin} />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopNav email={user.email ?? ""} />
                {/* Below the top bar and ABOVE the page transition, so it
                    does not fade in and out on every navigation: a
                    warning that flickers reads as a notification rather
                    than as a standing fact about the account. */}
                {sampleImport && <SampleDataBanner />}
                {/* Wraps only the page body, not the Sidebar/TopNav —
                    the chrome must stay visually fixed while the content
                    beneath it fades/slides in on each navigation. */}
                {/* THE <main> LANDMARK, HERE AND ONLY HERE.
                    The dashboard had none. Four components rendered one
                    each — route-skeleton, build-module-page (twice) and
                    document-editor — so a module page had a landmark and
                    a bespoke page did not, and /dashboard/coding was
                    measured with zero. A screen reader's "skip to main"
                    had nothing to land on, and so did the page's own
                    outline.
                    Putting it in the layout is what makes it true for all
                    39 pages instead of 8, and the four components below
                    became plain <div>s in the same change: a <main>
                    inside a <main> is invalid, and two landmarks are
                    worse than one in the wrong place. */}
                <main id="main-content" className="flex-1">
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
            </div>
            <ToastContainer />
            {/* ONE ROW PER SCREEN CHANGE, for every dashboard page.
                Mounted HERE and nowhere else: this layout is what
                survives a client-side navigation, so usePathname()
                inside it reports each change. A tracker inside a page
                would fire on arrival and be destroyed before the
                departure, which records half of every journey. Renders
                nothing; the writing is app/api/nav/track and the
                reading is the two views in the nav_events migration. */}
            <NavTracker />
            <AchievementUnlockBridge />
            <CommandPalette isOwner={isAdmin} />
            </VoiceAvailabilityProvider>
          </CreditsProvider>
          {/* Service worker + add-to-home-screen prompt. Mounted here, not
              in the root layout, so the offline shell and push are
              features of the signed-in app only. */}
          <PwaProvider />
        </CommandPaletteProvider>
      </SidebarProvider>
    </ToastProvider>
  );
}
