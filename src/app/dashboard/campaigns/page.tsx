import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { BuildModulePage } from "@/components/modules/build-module-page";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MODULE_ICONS } from "@/lib/module-icons";

const CONFIG = BUILD_MODULES.find((m) => m.slug === "campaigns")!;

// The key comes from the module CONFIG rather than being written out
// here, so the browser tab, the sidebar link and the page heading are
// one string and cannot drift apart when a module is renamed.
export function generateMetadata(): Promise<Metadata> {
  return pageTitle(CONFIG.titleKey);
}

export default function CampaignsPage() {
  return <BuildModulePage config={CONFIG} icon={MODULE_ICONS.campaigns} />;
}
