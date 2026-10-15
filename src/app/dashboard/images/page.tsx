import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BuildModulePage } from "@/components/modules/build-module-page";
import { ImageShell } from "@/components/images/image-shell";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MODULE_ICONS } from "@/lib/module-icons";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { getPlan, planMeetsMinimum } from "@/lib/billing/plans";
import { imageApiKey } from "@/lib/images/gemini-image";
import { imagePrices } from "@/lib/images/image-pricing";
import { IMAGE_MIN_PLAN, IMAGE_ROW_COLUMNS, showImages, type ImageRow } from "@/lib/images/image-access";
import { readRequestedId } from "@/lib/library/requested";
import { SWITCHED_NAMES, switchedName } from "@/lib/nav/switched-names";
import { switchedOnFor } from "@/lib/nav/switched-on";

export const dynamic = "force-dynamic";

const CONFIG = BUILD_MODULES.find((m) => m.slug === "images")!;

/** The Image tool's name: the key the ⌘K menu and the records hub read too (lib/nav/switched-names.ts). */
const TOOL = SWITCHED_NAMES.find((s) => s.href === "/dashboard/images")!;
const TOOL_TITLE_KEY = `sidebar.items.${TOOL.labelKey}`;

// The tab: the Image tool's name for whom its switch is on; for everybody
// else the ideas list's key from the module CONFIG, so that page's tab,
// sidebar link and heading are one string and cannot drift apart.
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  return switchedName("/dashboard/images", await switchedOnFor(user?.email)) ? pageTitle(TOOL_TITLE_KEY) : pageTitle(CONFIG.titleKey);
}

/** How many earlier images the page brings with it. */
const RECENT_IMAGES = 24;

export default async function ImagesPage(props: { searchParams: Promise<{ record?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // THE IMAGE TOOL, BEHIND ITS SWITCH (MASTER 16, package 19): four
  // pictures from a description, one changed with words, the largest size
  // downloaded. Everybody the switch is off for keeps the list it always
  // had, under its own name.
  const plan = await resolveEffectivePlan(user);
  const included = isAdminEmail(user.email) || planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN);
  if ((await isFeatureOn("image-studio", user)) && included) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("generated_images")
      .select(IMAGE_ROW_COLUMNS)
      .eq("user_id", user.id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(RECENT_IMAGES);
    const images = await showImages((data ?? []) as ImageRow[], user.id);
    const searchParams = await props.searchParams;
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <ImageShell
          initialImages={images}
          initialOpenId={readRequestedId(searchParams.record)}
          prices={imagePrices(plan, await getPurchasedPackCreditPriceEur(user.id))}
          configured={Boolean(imageApiKey())}
        />
      </div>
    );
  }
  // A PLAN BELOW THE TOOL'S, with the switch on: the wall names the tool
  // and the plan it comes with, under the same name as the tab — not the
  // ideas list's wall, whose help says the page makes nothing. The same
  // read of the switch as the tab's (switchedOnFor is once per request).
  if (switchedName("/dashboard/images", await switchedOnFor(user.email))) {
    const t = await getTranslations();
    const name = t(TOOL_TITLE_KEY);
    const required = getPlan(IMAGE_MIN_PLAN);
    return (
      <div className="min-h-full">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {/* The tool's own header, as the shell draws it: the name alone. */}
          <h1 className="mb-4 break-words text-2xl font-medium text-foreground">{name}</h1>
          <UpgradeRequired
            featureName={name}
            planName={required?.name ?? IMAGE_MIN_PLAN}
            planSlug={IMAGE_MIN_PLAN}
            priceEur={typeof required?.price === "number" ? required.price : null}
          />
        </div>
      </div>
    );
  }
  return (
    <BuildModulePage config={CONFIG} icon={MODULE_ICONS.images} />
  );
}
