import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Privacy Policy — AI_OS",
  description: "Privacy Policy for AI_OS.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="privacy_policy" updated="2026-07-29">
      <LegalSection title="1. Data Collection">
        <p>
          We collect the email address you sign up with, the password you
          choose (stored hashed, never in plain text), and whatever you
          enter into AI_OS&apos;s modules or the &quot;Create Anything&quot;
          box — ideas, notes, metrics, and similar content you choose to
          log. We don&apos;t collect data beyond what&apos;s needed to run
          the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Data Use">
        <p>
          Your data is used to operate AI_OS for you: authenticating your
          account, displaying and searching your entries, generating the
          Overview summary, and — when you use &quot;Create Anything&quot; —
          classifying your free-text message into the right module. We do
          not sell your data or use it to train models beyond what a given
          request to a third-party AI provider requires (see below).
        </p>
      </LegalSection>

      <LegalSection title="3. Data Storage — Supabase">
        <p>
          All account data and module entries are stored in a Postgres
          database hosted by{" "}
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 underline underline-offset-2"
          >
            Supabase
          </a>
          . Row-level security policies scope every table so a user can only
          ever read, write, or delete their own rows.
        </p>
      </LegalSection>

      <LegalSection title="4. Third-party Services">
        <p>
          AI_OS uses a small number of third-party services to function:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground/90">Anthropic (Claude API)</span>{" "}
            — the free-text message you submit to &quot;Create Anything&quot;
            is sent to Anthropic&apos;s API to classify it into a module and
            extract structured fields.
          </li>
          <li>
            <span className="text-foreground/90">Resend</span> — used to
            send transactional email (currently a welcome email on signup).
            Your email address is shared with Resend only to deliver that
            email.
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
