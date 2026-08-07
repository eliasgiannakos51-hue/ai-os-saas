"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import {
  UPGRADE_PROMPT_STORAGE_KEY,
  promptAllowedNow,
  resolveUpgradeMoment,
  type UpgradeSignal,
} from "@/lib/upgrade-triggers";

/**
 * The one moment an upgrade prompt is welcome.
 *
 * Most upgrade prompts fire on failure: you hit a wall, and a dialog
 * sells to you while you are annoyed at the product. This renders in
 * exactly one situation — the user JUST SUCCEEDED at something and that
 * success used the last of this month's allowance. They are pleased with
 * the product at this moment, the limit is a fact they are about to
 * discover anyway, and "you just used your fifth deck; Growth includes
 * twenty" is information, not a sales pitch.
 *
 * The discipline is in the render condition, and it lives in
 * lib/upgrade-triggers.ts rather than here so it can be tested
 * exhaustively:
 *
 *   - Success AND ceiling together. Never on a failure, never on page
 *     load, never at four of five.
 *   - Nothing for the top plan, where there is nothing to sell and
 *     suggesting anyway insults the customer who already bought the most.
 *   - A seven-day cooldown on top, because "the right moment" recurs and
 *     somebody who hits their ceiling three days running must not be
 *     pitched three days running.
 *
 * It is a static banner, not a dialog. It interrupts nothing and can be
 * ignored by not reading it, which is the correct amount of power for a
 * sales message to have over somebody who is working.
 */
export function UpgradeMoment(props: UpgradeSignal) {
  const t = useTranslations("upgradeTrigger");
  const [allowed, setAllowed] = useState(false);

  const moment = resolveUpgradeMoment(props);

  // The cooldown is read in an effect rather than during render: it
  // lives in localStorage, which does not exist on the server, and
  // reading it during render is a hydration mismatch waiting to happen.
  useEffect(() => {
    if (moment.kind === "none") return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(UPGRADE_PROMPT_STORAGE_KEY);
    } catch {
      // Storage can throw in private modes. Failing OPEN here shows one
      // extra prompt at worst, where failing closed would silence a
      // genuinely useful message forever.
    }
    if (!promptAllowedNow(last)) return;

    setAllowed(true);
    try {
      window.localStorage.setItem(UPGRADE_PROMPT_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Same reasoning. The cooldown is politeness, not correctness.
    }
  }, [moment.kind]);

  if (moment.kind === "none" || !allowed) return null;

  const message =
    moment.kind === "success_ceiling"
      ? t("successCeiling", { reason: t(`reasons.${moment.reason}`), plan: moment.nextPlan })
      : t("repeatedRefusal", { feature: t(`reasons.${moment.feature}`), plan: moment.nextPlan });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.06] p-3">
      <p className="flex-1 text-xs leading-relaxed text-foreground/90">{message}</p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400 hover:underline"
      >
        {t("seePlans")}
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
