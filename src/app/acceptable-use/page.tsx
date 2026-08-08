import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "What you may and may not do with Ionexa AI.",
};

// V3 Task 15 — the missing legal set. Same convention as /terms and
// /privacy: hardcoded English, LegalLayout's placeholder banner states
// plainly that this is not yet reviewed legal copy.
export default function AcceptableUsePage() {
  return (
    <LegalLayout title="acceptable_use_policy" updated="2026-08-08">
      <LegalSection title="1. The short version">
        <p>
          Use Ionexa to run your own work. Don&apos;t use it to harm people, break laws,
          deceive, or abuse the platform. We remove content and suspend accounts that do.
        </p>
      </LegalSection>

      <LegalSection title="2. Prohibited content and conduct">
        <p>
          You may not use Ionexa — including generated websites, presentations, documents,
          agents and emails sent on your behalf — to: publish or distribute illegal content;
          harass, defame or threaten; generate deceptive content that impersonates real
          people or organisations; distribute malware or phishing pages; infringe
          intellectual property; publish content sexualising minors (zero tolerance,
          reported where required by law); send spam or scrape at abusive volume; or attempt
          to bypass usage metering, rate limits or safety reviews.
        </p>
      </LegalSection>

      <LegalSection title="3. Published sites and agents specifically">
        <p>
          Published websites are served from our infrastructure and are subject to an
          automated safety review before going live; a page that fails review is not
          published, with the reasons shown to you. Agents act on schedules you set — you
          are responsible for what they do and send, and their output always discloses that
          it is AI-generated.
        </p>
      </LegalSection>

      <LegalSection title="4. Fair use of AI capacity">
        <p>
          Credits meter normal use. Deliberately structuring requests to exhaust platform
          capacity, evade the daily platform spend cap, or resell raw model access through
          your account is not permitted.
        </p>
      </LegalSection>

      <LegalSection title="5. Enforcement">
        <p>
          We may remove content, pause publishing, disable agents, or suspend accounts that
          violate this policy — proportionate to the violation, with notice where lawful.
          Report abuse via the contact page; reports are read by a person.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
