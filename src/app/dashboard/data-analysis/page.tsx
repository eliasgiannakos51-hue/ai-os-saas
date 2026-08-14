import { moduleTitleMetadata } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { BuildModulePage } from "@/components/modules/build-module-page";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MODULE_ICONS } from "@/lib/module-icons";

const CONFIG = BUILD_MODULES.find((m) => m.slug === "data-analysis")!;

export function generateMetadata() {
  return moduleTitleMetadata(CONFIG);
}

export default function DataAnalysisPage() {
  return <BuildModulePage config={CONFIG} icon={MODULE_ICONS["data-analysis"]} />;
}
