import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * EU AI Act, Article 50 (V3 Task 15): the person must know they are
 * interacting with an AI system. One quiet, consistent line mounted in
 * every AI interface — the chat composer, the create box, the builder
 * form, the mission form, the research form. Quiet on purpose: the
 * obligation is disclosure, not a warning banner; the product IS the AI
 * and the user chose it, so the line informs without nagging.
 *
 * Works in both server and client components (no hooks beyond i18n).
 */
export function AiInteractionNotice() {
  const t = useTranslations("aiNotice");
  return (
    <p className="mt-1.5 flex items-center gap-1 text-[10px] leading-relaxed text-muted/80">
      <Sparkles className="h-2.5 w-2.5 shrink-0 text-orange-400/70" aria-hidden="true" />
      {t("interacting")}{" "}
      <Link href="/ai-transparency" className="underline decoration-dotted hover:text-foreground">
        {t("learnMore")}
      </Link>
    </p>
  );
}
