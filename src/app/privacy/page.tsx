import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.footer.privacy", "pageTitle.privacyDescription");
}

export default function PrivacyPage() {
  return (
    <LegalLayout titleKey="landing.footer.privacy" updated="2026-10-07">
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
          <li>
            <span className="text-foreground/90">Supabase</span> — database,
            file storage and authentication.
          </li>
          <li>
            <span className="text-foreground/90">Vercel</span> — application
            hosting and content delivery.
          </li>
          <li>
            <span className="text-foreground/90">Anthropic</span> — the AI
            model behind every text feature: chat, sites, research,
            presentations, posts, coding, analysis, files, meetings and
            agents. It receives what you send to that feature and the context
            the feature uses.
          </li>
          <li>
            <span className="text-foreground/90">OpenAI</span> — only if you
            use voice or upload a meeting recording: turns the audio into
            text.
          </li>
          <li>
            <span className="text-foreground/90">ElevenLabs</span> — only if
            you ask for text to be read aloud: receives that text.
          </li>
          <li>
            <span className="text-foreground/90">Stripe</span> — payments.
            Your card details go to Stripe and never reach Ionexa.
          </li>
          <li>
            <span className="text-foreground/90">Resend</span> — email
            delivery (for example the welcome email, and agent results you
            chose to receive by email).
          </li>
          <li>
            <span className="text-foreground/90">Unsplash</span> — photo
            search for sites and presentations. It receives search words, not
            your account details.
          </li>
          <li>
            <span className="text-foreground/90">Google</span> — only if you
            use the Image tool: Google&apos;s Gemini receives the description
            you write and, when you change a picture or ask for it at full
            size, that picture, and makes the pictures. It does not receive
            your account details.
          </li>
          <li>
            <span className="text-foreground/90">Google</span> and{" "}
            <span className="text-foreground/90">Slack</span> — only if you
            connect them: Ionexa reads from them what you ask it to, and
            sends to Slack what you set an agent to send there.
          </li>
          <li>
            <span className="text-foreground/90">Telegram</span> and{" "}
            <span className="text-foreground/90">Discord</span> — only if you
            choose them as a destination for notifications or agent results:
            they receive that message.
          </li>
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
          confirm, the deletion happens and cannot be undone.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
