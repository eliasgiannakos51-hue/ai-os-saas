import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/dashboard/page-header";
import { VOICE_ICON } from "@/lib/module-icons";
import { VoiceWorkbench } from "@/components/voice/voice-workbench";
import { VoiceSettings } from "@/components/settings/voice-settings";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.voice");
}

/**
 * VOICE, AS A PLACE RATHER THAN AS A BUTTON ON SOMETHING ELSE.
 *
 * The capability was complete and unfindable. api/voice/speak and
 * api/voice/transcribe both reach real providers, both reserve and settle
 * credits, both meter minutes against the plan — and the only two ways to
 * reach either were the microphone inside the chat composer and a Listen
 * button beside text the app had already produced. Nothing in the product
 * answered "read this out" or "write down what I am saying".
 *
 * THE SETTINGS PANEL IS ON THIS PAGE, NOT LINKED FROM IT. Minutes used,
 * minutes left, the per-minute price of each half and the sentence
 * explaining what happens to the audio are the things a person wants at
 * the moment they are deciding whether to press the button — not two
 * clicks away under an account screen. It is the same component
 * /dashboard/settings renders (components/settings/voice-settings.tsx),
 * so the two cannot say different numbers.
 */
export default async function VoicePage() {
  const t = await getTranslations("dashboard.voicePage");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader icon={VOICE_ICON} title={t("title")} description={t("description")} helpKey="help.voice" />
      <VoiceWorkbench />
      <section className="rounded-2xl border border-border bg-panel/50 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("usageTitle")}</h2>
        <div className="mt-3">
          <VoiceSettings />
        </div>
      </section>
    </div>
  );
}
