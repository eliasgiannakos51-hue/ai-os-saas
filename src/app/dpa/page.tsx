import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description: "How Ionexa AI processes personal data on your behalf.",
};

// V3 Task 15 — the DPA outline. Same convention as the other legal
// pages: hardcoded English with the placeholder banner until counsel
// reviews it. The FACTS in it (sub-processors, data locations, deletion
// mechanics, export) mirror what the product actually does.
export default function DpaPage() {
  return (
    <LegalLayout title="data_processing_agreement" updated="2026-08-08">
      <LegalSection title="1. Roles">
        <p>
          For account data, Ionexa is the controller. For the content you put into your
          workspace — entries, imports, documents, generated artefacts — you are the
          controller and Ionexa is the processor, processing only to provide the service.
        </p>
      </LegalSection>

      <LegalSection title="2. Sub-processors">
        <p>
          Supabase (database, authentication, storage; encrypted at rest), Vercel (hosting
          and serving), Anthropic (AI model API; commercial API traffic is not used for
          model training), Stripe (payments; card data never touches Ionexa), Resend
          (transactional email). Each processes only what its function requires.
        </p>
      </LegalSection>

      <LegalSection title="3. Security measures">
        <p>
          Row-level security on every user table so accounts cannot read each other&apos;s
          rows; encryption in transit (TLS) and at rest (managed database encryption);
          secrets held in environment configuration, never in code; single-use hashed tokens
          for destructive operations; rate limiting on every mutating endpoint; and an
          automated security posture test suite that gates every deployment. Details are
          published in SECURITY.md.
        </p>
      </LegalSection>

      <LegalSection title="4. Data subject rights">
        <p>
          Export: a complete, machine-readable export of every table that holds your data is
          available in Settings (its completeness is enforced by an automated check against
          the live schema). Deletion: account deletion is self-serve, confirmed by emailed
          single-use token, and erases your rows and stored files. Inferences the product
          made about you (learned preferences) are individually viewable and deletable.
        </p>
      </LegalSection>

      <LegalSection title="5. Breach notification">
        <p>
          We maintain a written breach response procedure (assessment, containment,
          notification of affected controllers without undue delay and within 72 hours where
          GDPR requires it). Contact for security reports: via the contact page, marked
          security.
        </p>
      </LegalSection>

      <LegalSection title="6. International transfers">
        <p>
          Sub-processors above may process data in the United States under their respective
          transfer mechanisms (EU-U.S. Data Privacy Framework and/or Standard Contractual
          Clauses, per each sub-processor&apos;s terms).
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
