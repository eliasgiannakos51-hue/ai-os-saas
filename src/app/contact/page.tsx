import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { pageTitleAndDescription } from "@/lib/page-title";
import { senderStatus } from "@/lib/email/resend-config";
import { ContactForm } from "@/components/contact/contact-form";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.footer.contact", "pageTitle.contactDescription");
}

export const dynamic = "force-dynamic";

/**
 * The public contact page.
 *
 * Outside the dashboard, and reachable without an account — which is the
 * point. Somebody who cannot sign in, or has not signed up, is exactly
 * who needs a way to reach a person, and a support channel that requires
 * a working login is not a support channel.
 *
 * ------------------------------------------------------------------
 * THE PAGE SAYS WHAT STATE THE MAILER IS IN. IT DOES NOT GUESS.
 * ------------------------------------------------------------------
 *
 * lib/email/resend-config.ts's senderStatus() has three answers and this
 * page renders three different things, because the difference is
 * visible to the person typing:
 *
 *   no_key      NO FORM AT ALL. A form that cannot send is a trap: it
 *               takes a person's time, their words, and their
 *               expectation of an answer, and produces nothing. The
 *               page says the channel is not configured and points at
 *               the help centre, which works without email.
 *
 *   test_sender THE FORM, PLUS AN UNMISSABLE BANNER. This deployment is
 *               in this state today. It is the one path in the app that
 *               plausibly still works on the shared test sender, because
 *               the recipient IS the Resend account owner — the single
 *               address that sender is permitted to reach. "Plausibly"
 *               is the honest word and it is the word the banner uses.
 *               It does not promise delivery and it does not deny it.
 *
 *   ok          The form, no banner.
 *
 * `force-dynamic` because the answer depends on the environment at
 * request time. Statically rendering this page would freeze whichever
 * state happened to hold at build time into the HTML, and the state that
 * gets frozen is the one nobody would notice was wrong.
 *
 * SUPPORT_EMAIL is optional and is only shown when it is set. The
 * alternative was to print the owner's address out of ADMIN_EMAILS,
 * which is a personal mailbox hardcoded in this repository — publishing
 * that to every scraper on a page linked from the footer is not a
 * decision this file gets to make on somebody's behalf.
 */
export default async function ContactPage() {
  const t = await getTranslations("contact");
  const status = senderStatus();
  const supportEmail = (process.env.SUPPORT_EMAIL ?? "").trim();

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm tracking-widest text-orange-500 transition-colors hover:text-orange-400"
        >
          Ionexa AI
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("intro")}</p>

        {status !== "ok" ? (
          <div
            role="status"
            className="mt-6 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-2">
              <p className="font-semibold">
                {status === "no_key" ? t("outage.titleNoKey") : t("outage.titleTestSender")}
              </p>
              <p>
                {status === "no_key" ? t("outage.bodyNoKey") : t("outage.bodyTestSender")}
              </p>
              {supportEmail ? (
                <p>
                  {t("outage.emailInstead")}{" "}
                  <a
                    className="underline underline-offset-2"
                    href={`mailto:${supportEmail}`}
                  >
                    {supportEmail}
                  </a>
                </p>
              ) : null}
              <p>
                <Link className="underline underline-offset-2" href="/help">
                  {t("outage.helpInstead")}
                </Link>
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          {status === "no_key" ? (
            <p className="text-sm text-muted">{t("outage.noFormExplanation")}</p>
          ) : (
            <ContactForm degraded={status === "test_sender"} />
          )}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-muted">{t("privacyNote")}</p>
      </div>
    </main>
  );
}
