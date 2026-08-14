import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.footer.cookies", "pageTitle.cookiesDescription");
}

// Written from what the app ACTUALLY sets, not from a template.
//
// The honest headline here is that Ionexa sets no advertising or
// cross-site tracking cookies at all — there is no analytics vendor, no
// pixel, no ad network in the codebase. That means no consent banner is
// required under the ePrivacy Directive, since every cookie below is
// either strictly necessary for a service the user asked for, or a
// preference they set themselves. Saying that plainly is more useful
// than a banner that trains people to click "accept" without reading.
//
// If an analytics or marketing vendor is ever added, this page and that
// conclusion both have to change — a consent banner becomes mandatory at
// that point, not optional.
export default function CookiePolicyPage() {
  return (
    <LegalLayout title="cookie_policy" updated="2026-08-08">
      <LegalSection title="1. The short version">
        <p>
          Ionexa AI sets no advertising cookies, no cross-site tracking
          cookies, and no third-party analytics cookies. There is no ad
          network, no tracking pixel, and no analytics vendor embedded in
          this product. Every cookie described below is either required to
          keep you signed in, or stores a preference you set yourself.
        </p>
        <p>
          Because of that, you will not see a cookie consent banner here.
          Under the ePrivacy Directive, consent is required for cookies
          that are not strictly necessary for a service you asked for —
          and we do not set any.
        </p>
      </LegalSection>

      <LegalSection title="2. Cookies we set">
        <p>
          <strong>Authentication (strictly necessary).</strong> When you
          sign in, Supabase Auth sets a session cookie and a refresh
          cookie for this domain. They are what keep you signed in between
          page loads; without them, every navigation would return you to
          the login screen. They are HTTP-only and cannot be read by
          JavaScript. They last until the session expires or you sign out.
        </p>
        <p>
          <strong>Security (strictly necessary).</strong> A short-lived
          cookie carries the anti-CSRF value used during sign-in and
          OAuth redirects, so that a request arriving at those endpoints
          can be shown to have come from a page we served. It is discarded
          once the flow completes.
        </p>
      </LegalSection>

      <LegalSection title="3. Things stored on your device that are not cookies">
        <p>
          Some preferences are kept in your browser&apos;s local storage
          rather than in a cookie. Local storage is never transmitted to
          our servers — it stays on your device and is readable only by
          this site. These include: whether the chat sidebar is open, your
          theme and accessibility preferences, your chosen language, and
          whether you have dismissed the &quot;add to home screen&quot;
          prompt.
        </p>
        <p>
          If you install Ionexa as an app, a service worker also caches
          the interface shell so it can open without a network connection.
          That cache holds interface files, not your content.
        </p>
      </LegalSection>

      <LegalSection title="4. Third parties">
        <p>
          Payments are handled by Stripe. When you open the checkout or
          billing portal, you are on Stripe&apos;s own page and Stripe
          sets its own cookies there under its own policy — including
          cookies used for fraud prevention. We never see your card
          details. Stripe does not set cookies on the pages we serve.
        </p>
        <p>
          If you connect a third-party account (for example Google), that
          provider may set cookies on its own consent screen during the
          connection. Those are governed by that provider&apos;s policy.
        </p>
      </LegalSection>

      <LegalSection title="5. Controlling cookies">
        <p>
          You can clear or block cookies in your browser settings at any
          time. Because the cookies we set are the ones that keep you
          signed in, blocking them for this site will prevent you from
          using your account — there is no version of Ionexa that works
          without a session.
        </p>
        <p>
          To remove everything this site has stored on your device,
          clearing site data for this domain in your browser will remove
          the cookies, the local storage described above, and any offline
          cache.
        </p>
      </LegalSection>

      <LegalSection title="6. Your data, separately">
        <p>
          Cookies are not where your content lives. To download everything
          we hold about you, or to delete your account and all of its
          data, see Settings — both are available to you directly, and are
          described in the Privacy Policy.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
