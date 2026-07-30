import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Veron AI.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="privacy_policy" updated="2026-07-30">
      <LegalSection title="1. Data Collection">
        <p>
          We collect the email address you sign up with, the password you
          choose (stored hashed, never in plain text), and whatever you
          enter into Veron AI&apos;s modules or the &quot;Create Anything&quot;
          box — ideas, notes, metrics, and similar content you choose to
          log. We don&apos;t collect data beyond what&apos;s needed to run
          the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Data Use">
        <p>
          Your data is used to operate Veron AI for you: authenticating your
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
          We use trusted third-party service providers to operate Veron AI,
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
          You can download a complete copy of your data at any time — go to{" "}
          <span className="text-foreground/90">Settings → export_all_data()</span>{" "}
          for a single JSON file with everything you&apos;ve logged across
          all 13 modules. You can also permanently delete your account and
          every record tied to it from{" "}
          <span className="text-foreground/90">Settings → danger_zone</span>.
          Account deletion is immediate and cannot be undone.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
