import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";
import { SUB_PROCESSORS } from "@/lib/legal/sub-processors";
import { DELETION_GRACE_DAYS } from "@/lib/account/pending-deletion";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.footer.privacy", "pageTitle.privacyDescription");
}

export default function PrivacyPage() {
  return (
    <LegalLayout titleKey="landing.footer.privacy" updated={LEGAL_VERSIONS.privacy}>
      <LegalSection title="1. Data Collection">
        <p>
          We collect the email address you sign up with, the password you
          choose (stored hashed, never in plain text), and what you put into
          Ionexa AI: what you type into chat and the tools, the entries you
          log, the files you upload, the sites, documents and presentations
          you create, and the accounts you choose to connect. We also keep a
          record of what each AI action cost, so your credits can be counted.
          We don&apos;t collect data beyond what&apos;s needed to run the
          Service.
        </p>
        <p>
          Voice and meeting recordings are not stored: the audio is sent for
          transcription, held only for that one request, and what is kept is
          the text.
        </p>
      </LegalSection>

      <LegalSection title="2. Data Use">
        <p>
          Your data is used to operate Ionexa AI for you: authenticating your
          account, showing and searching what you have saved, and sending to
          an AI model the part of it a feature needs to do what you asked.
          We do not sell your data or use it to train models beyond what a
          given request to a third-party AI provider requires (see below).
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
          These are the companies that process data so that Ionexa AI can
          run. Each one receives only what its part of the Service needs, and
          the ones marked &quot;only if&quot; receive nothing unless you use
          that feature.
        </p>
        <ul className="list-disc space-y-1 ps-5">
          {SUB_PROCESSORS.map((sp) => (
            <li key={sp.name}>
              <span className="text-foreground/90">{sp.name}</span>
              {sp.onlyIf ? (
                <> — only if {sp.onlyIf}: {sp.role}.</>
              ) : (
                <> — {sp.role}.</>
              )}
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="5. User Rights">
        <p>
          You can download a copy of your data at any time from{" "}
          <span className="text-foreground/90">Settings → Export Data</span>,
          as a single file with every record stored for your account. You can
          also permanently delete your account and every record tied to it
          from <span className="text-foreground/90">Settings → Danger Zone</span>:
          we send a confirmation link to your email, and once you open it and
          confirm, the deletion is scheduled for {DELETION_GRACE_DAYS} days
          later. During that period you can cancel the deletion from the same
          Settings page or from the link in your email. After the grace period
          the deletion executes automatically and cannot be undone.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
