import Link from "next/link";
import { Lock } from "lucide-react";

export function UpgradeRequired({ featureName, planName }: { featureName: string; planName: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-panel p-10 text-center">
      <Lock className="h-8 w-8 text-orange-400" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-foreground">Upgrade Required</h2>
      <p className="max-w-sm text-xs text-muted">
        {featureName} requires the {planName} plan or higher.
      </p>
      <Link
        href="/pricing"
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
      >
        View plans
      </Link>
    </div>
  );
}
