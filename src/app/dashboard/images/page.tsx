import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BuildModulePage } from "@/components/modules/build-module-page";
import { ImageShell } from "@/components/images/image-shell";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MODULE_ICONS } from "@/lib/module-icons";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { planMeetsMinimum } from "@/lib/billing/plans";
import { imageApiKey } from "@/lib/images/gemini-image";
import { imagePrices } from "@/lib/images/image-pricing";
import { IMAGE_MIN_PLAN, IMAGE_ROW_COLUMNS, showImages, type ImageRow } from "@/lib/images/image-route";
import { readRequestedId } from "@/lib/library/requested";

export const dynamic = "force-dynamic";

const CONFIG = BUILD_MODULES.find((m) => m.slug === "images")!;

// The key comes from the module CONFIG rather than being written out
// here, so the browser tab, the sidebar link and the page heading are
// one string and cannot drift apart when a module is renamed.
export function generateMetadata(): Promise<Metadata> {
  return pageTitle(CONFIG.titleKey);
}

/** How many earlier images the page brings with it. */
const RECENT_IMAGES = 24;

export default async function ImagesPage(props: { searchParams: Promise<{ record?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // THE IMAGE TOOL, BEHIND ITS SWITCH (MASTER 16, package 19): four
  // pictures from a description, one changed with words, the largest size
  // downloaded. Everybody the switch is off for — and a plan below the
  // tool's, which the page below refuses with its own wall — keeps the
  // list it always had.
  const plan = await resolveEffectivePlan(user);
  if (
    (await isFeatureOn("image-studio", user)) &&
    (isAdminEmail(user.email) || planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN))
  ) {
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
  return <BuildModulePage config={CONFIG} icon={MODULE_ICONS.images} />;
}
