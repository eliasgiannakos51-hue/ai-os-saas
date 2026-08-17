import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.footer.terms", "pageTitle.termsDescription");
}

export default function TermsPage() {
  return (
    <LegalLayout title="terms_of_service" updated="2026-07-29">
      <LegalSection title="1. Acceptance of Terms">
        <p>
          By creating an account or otherwise using Ionexa AI (&quot;the
          Service&quot;), you agree to be bound by these Terms of Service. If
          you do not agree, do not use the Service. We may update these
          terms from time to time; continued use after an update means you
          accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection title="2. Use of Service">
        <p>
          Ionexa AI gives you a set of modules for logging and organizing
          information about your work — ideas, competitors, research,
          finance, and so on — plus an AI-assisted &quot;Create Anything&quot;
          feature that files free-text entries into the right module. You
          agree to use the Service only for lawful purposes, to keep your
          account credentials secure, and not to attempt to disrupt,
          reverse-engineer, or abuse the Service or the third-party APIs it
          relies on.
        </p>
      </LegalSection>

      <LegalSection title="3. User Data">
        <p>
          You own the content you create in Ionexa AI. We store it on your
          behalf so the Service can function, scoped to your account via
          row-level security so other users cannot read or modify it. You
          can export a full copy of your data or permanently delete your
          account and all associated data at any time from Settings.
        </p>
      </LegalSection>

      <LegalSection title="4. Limitation of Liability">
        <p>
          Ionexa AI is provided &quot;as is,&quot; without warranties of any
          kind, express or implied. To the fullest extent permitted by law,
          we are not liable for any indirect, incidental, or consequential
          damages arising from your use of the Service, including data loss
          or inaccuracies in AI-generated classifications or content.
        </p>
      </LegalSection>

      <LegalSection title="5. Changes to Terms">
        <p>
          We may revise these Terms of Service as the Service evolves.
          Material changes will be reflected by updating the &quot;last
          updated&quot; date above. Your continued use of Ionexa AI after a
          change constitutes acceptance of the updated terms.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
