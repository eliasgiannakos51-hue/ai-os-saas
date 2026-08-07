import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Ionexa AI.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="privacy_policy" updated="2026-07-30">
      <LegalSection title="1. Data Collection">
        <p>
          We collect the email address you sign up with, the password you
          choose (stored hashed, never in plain text), and whatever you
          enter into Ionexa AI&apos;s modules or the &quot;Create Anything&quot;
          box — ideas, notes, metrics, and similar content you choose to
          log. We don&apos;t collect data beyond what&apos;s needed to run
          the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Data Use">
        <p>
          Your data is used to operate Ionexa AI for you: authenticating your
          account, displaying and searching your entries, generating the
          Overview summary, and — when you use &quot;Create Anything&quot; —
          classifying your free-text message into the right module. We do
          not sell your data or use it to train models beyond what a given
          request to a third-party AI provider requires (see below).
        </p>
      </LegalSection>

      <LegalSection title="3. Data Storage">
        <p>
          Your account data and module entries are stored in a managed
          database with row-level security policies that scope every table
          so you can only ever read, write, or delete your own records.
        </p>
      </LegalSection>

      <LegalSection title="4. Sub-processors">
        <p>
          We use trusted third-party service providers to operate Ionexa AI,
          including cloud infrastructure providers, AI model providers, and
          email delivery services. These providers process data solely to
          provide the Service and are contractually bound to protect your
          information.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground/90">Supabase</span> — database
            hosting and authentication infrastructure.
          </li>
          <li>
            <span className="text-foreground/90">Vercel</span> — application
            hosting and content delivery.
          </li>
          <li>
            <span className="text-foreground/90">Anthropic</span> — AI model
            provider used to classify &quot;Create Anything&quot; submissions
            into the right module and extract structured fields.
          </li>
          <li>
            <span className="text-foreground/90">Resend</span> — transactional
            email delivery (e.g. the welcome email sent on signup).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. User Rights">
        <p>
          <span className="text-foreground/90">Portability (Article 20).</span>{" "}
          You can download a copy of your data at any time from{" "}
          <span className="text-foreground/90">Settings → export_all_data()</span>.
          It is a single JSON file covering everything this product holds
          about you — your modules, chats, what the assistant has
          remembered about you, your files&apos; extracted text, agents,
          websites, presentations, credit history, connected accounts and
          login devices. The file lists what it contains and what it
          deliberately leaves out, so you can see the boundary rather than
          having to infer it.
        </p>
        <p>
          Two things are not in it, on purpose. The original bytes of
          files you uploaded stay in private storage — the extracted text
          is included, and the files themselves are downloadable
          individually from the Files page. And the access tokens for
          accounts you have connected (Gmail, Drive, Slack) are excluded:
          they are encrypted credentials to services that are not ours,
          and putting them in a file that lands in your downloads folder
          would put you at risk rather than serve you.
        </p>
        <p>
          <span className="text-foreground/90">Erasure (Article 17).</span>{" "}
          You can permanently delete your account and every record tied to
          it from{" "}
          <span className="text-foreground/90">Settings → danger_zone</span>,
          including the files in private storage. Deletion is confirmed by
          an emailed link, and once confirmed it is immediate and cannot
          be undone.
        </p>
        <p>
          <span className="text-foreground/90">Access, rectification and
          objection.</span>{" "}
          Most of your data is directly viewable and editable in the app.
          For anything else — including asking us to correct or stop
          processing something — write to us via the{" "}
          <a href="/contact" className="text-orange-400 underline underline-offset-2">
            contact page
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies and local storage">
        <p>
          We set <span className="text-foreground/90">one</span> cookie:
          the session cookie that keeps you signed in. It is strictly
          necessary — without it there is no way to know a request is
          yours — so it is set when you log in and does not require
          consent under the ePrivacy Directive.
        </p>
        <p>
          Your language, accessibility preferences and your cookie-consent
          choice are kept in your browser&apos;s local storage rather than
          in a cookie. They never reach our servers, and clearing your
          browser data removes them.
        </p>
        <p>
          There are <span className="text-foreground/90">no</span>{" "}
          advertising cookies, no third-party tracking cookies, and no
          analytics that follow you between sites. Public pages served
          from generated sites you publish set no cookie at all, and the
          view counts behind them record a date and a number — the table
          has no column that could hold an IP address, a user agent, a
          referrer or a visitor id.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
