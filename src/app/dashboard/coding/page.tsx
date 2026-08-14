import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { BuildModulePage } from "@/components/modules/build-module-page";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MODULE_ICONS } from "@/lib/module-icons";

const CONFIG = BUILD_MODULES.find((m) => m.slug === "coding")!;

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.coding");
}

export default function CodingPage() {
  return <BuildModulePage config={CONFIG} icon={MODULE_ICONS.coding} />;
}
