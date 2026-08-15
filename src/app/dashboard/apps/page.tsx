import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BuildModulePage } from "@/components/modules/build-module-page";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MODULE_ICONS } from "@/lib/module-icons";

const CONFIG = BUILD_MODULES.find((m) => m.slug === "apps")!;

// The module's name is a key on the config, so the browser tab reads the
// same word the sidebar and the page heading do, in the request's locale.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t(CONFIG.titleKey) };
}

export default function AppsPage() {
  return <BuildModulePage config={CONFIG} icon={MODULE_ICONS.apps} />;
}
