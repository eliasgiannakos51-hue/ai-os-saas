import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Ionexa AI team.",
};

/**
 * The public contact page.
 *
 * Outside the dashboard, and reachable without an account — which is the
 * point. Somebody who cannot sign in, or has not signed up, is exactly
 * who needs a way to reach a person, and a support channel that requires
 * a working login is not a support channel.
 */
export default async function ContactPage() {
  const t = await getTranslations("contact");

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Link href="/" className="mb-6 inline-block text-xs text-muted hover:text-fg">
          {t("backHome")}
        </Link>

        <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mb-8 text-sm text-muted">{t("intro")}</p>

        <ContactForm />

        <p className="mt-8 text-[11px] leading-relaxed text-muted">{t("privacyNote")}</p>
      </div>
    </main>
  );
}
