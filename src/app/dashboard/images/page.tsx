import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ImageShell } from "@/components/images/image-shell";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { createClient } from "@/lib/supabase/server";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { getPlan, planMeetsMinimum } from "@/lib/billing/plans";
import { imageApiKey } from "@/lib/images/gemini-image";
import { imagePrices } from "@/lib/images/image-pricing";
import { IMAGE_MIN_PLAN, IMAGE_ROW_COLUMNS, showImages, type ImageRow } from "@/lib/images/image-access";
import { readRequestedId } from "@/lib/library/requested";
import { TOOL_NAMES } from "@/lib/nav/tool-names";

export const dynamic = "force-dynamic";

/** The Image tool's name: the key the ⌘K menu and the records hub read too (lib/nav/tool-names.ts). */
const TOOL = TOOL_NAMES.find((s) => s.href === "/dashboard/images")!;
const TOOL_TITLE_KEY = `sidebar.items.${TOOL.labelKey}`;

export function generateMetadata(): Promise<Metadata> {
  return pageTitle(TOOL_TITLE_KEY);
}

/** How many earlier images the page brings with it. */
const RECENT_IMAGES = 24;

export default async function ImagesPage(props: { searchParams: Promise<{ record?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // THE IMAGE TOOL (MASTER 16, package 19), for everybody since 2026-10-23:
  // four pictures from a description, one changed with words, the largest
  // size downloaded. Below the plan's tier the wall below; without the
  // provider's key the shell says so (`configured`) and the All tools tile
  // is not drawn (lib/nav/all-tools.ts, availableTools).
  const plan = await resolveEffectivePlan(user);
  const included = isAdminEmail(user.email) || planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN);
  if (included) {
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
  // A PLAN BELOW THE TOOL'S: the wall names the tool and the plan it
  // comes with, under the same name as the tab.
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
