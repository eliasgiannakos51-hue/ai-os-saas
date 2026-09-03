import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LegalSection } from "@/components/legal/legal-section";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription(
    "landing.footer.aiTransparency",
    "pageTitle.aiTransparencyDescription"
  );
}

/**
 * EU AI Act, Article 50 — the transparency page.
 *
 * ------------------------------------------------------------------
 * WHY THIS FILE WAS REWRITTEN BEFORE IT WAS EVER PUBLISHED
 * ------------------------------------------------------------------
 *
 * It was written on 2026-08-08 and never merged. Four weeks later the
 * product it described had moved, and five of its statements were no
 * longer true. Each was checked against main on 2026-09-02 before this
 * version was written; the retractions are recorded here because a
 * transparency page that quietly drops a claim has not corrected
 * anything.
 *
 *   1. "Ionexa uses Anthropic's Claude model family via the Anthropic
 *      API." INCOMPLETE. lib/ai/providers/catalog.ts now lists ten models
 *      across four providers and lib/ai/providers/failover.ts can move a
 *      call between them. Anthropic is still the only one in
 *      DEFAULT_PROVIDER_ORDER, and a second provider needs both its key
 *      and to be named in AI_PROVIDER_ORDER — but "we use Anthropic" no
 *      longer describes the layer, and section 2 now says what does.
 *
 *   2. "the exact model that ran … is shown in your usage history in
 *      Settings." FALSE. components/settings/ai-usage-settings.tsx has
 *      credits, module counts and a chart, and no model column anywhere.
 *      The per-call record does exist (ai_provider_log) and the two pages
 *      that read it — /dashboard/routing and /dashboard/costs — both
 *      call notFound() for anyone who is not an admin.
 *
 *   3. "in each research report's 'How this was made' panel." FALSE.
 *      That string does not occur anywhere in this repository. It
 *      described a panel that was never built.
 *
 *   4. "Website Builder … a safety review pass checks the output." TRUE,
 *      AND TOO VAGUE TO BE USEFUL — a single phrase over three layers
 *      that fail in opposite directions, which is the part a reader
 *      needs. lib/website-security-review.ts IS a second model call
 *      (Sonnet, a forced tool call, 500 tokens) looking for phishing,
 *      impersonation and fraud, and it DEFAULTS TO SAFE on any error, by
 *      design, so a network blip never blocks a legitimate site. It is a
 *      second opinion, not a gate. The gate is
 *      lib/website-html-security-scan.ts, deterministic and fail-closed
 *      at publish, which refuses external scripts, inline event
 *      handlers, external form targets, unlisted iframes and dynamic
 *      code execution. Alongside them lib/website-link-safety.ts rewrites
 *      the document's own links and public-serving.ts serves it under a
 *      CSP with base-uri 'none'. Section 3 now says which is which.
 *
 *      An earlier version of THIS FILE said "No second model reviews the
 *      content", which was simply false; it was written before
 *      website-security-review.ts had been read and is corrected here
 *      rather than silently deleted.
 *
 *   5. "Presentations: the model researches and writes slides with cited
 *      sources." FALSE, and it was the worst of the five, because the
 *      codebase already said so in as many words. lib/build-modules.ts
 *      carries the sentence "'Presentations' promised a generator this
 *      module does not contain. It is a CRUD tracker — a table of rows
 *      the user types by hand, with no AI call anywhere in it." The
 *      module was renamed to "Presentation notes" for exactly that
 *      reason. Publishing the old sentence on the page that exists to
 *      tell people the truth about the AI would have been the one place
 *      it did real damage.
 *
 * Two features that did not exist in August are now here (AI Coding and
 * Data Analysis, both calling lib/ai/providers/complete.ts), and section
 * 7 is new: the checks that run on model output, which the August draft
 * had no section for because most of them had not been written yet.
 *
 * ------------------------------------------------------------------
 * HARDCODED ENGLISH, LIKE THE OTHER LEGAL PAGES
 * ------------------------------------------------------------------
 *
 * The body is English; the heading, the chrome and the footer link that
 * reaches it go through next-intl in all ten locales, and the notices
 * inside the product — which is where a person actually meets the AI —
 * are localised, including the agent-email disclosure in
 * lib/agents/ai-disclosure.ts. Section 9 says so on the page rather than
 * leaving a reader to notice it.
 *
 * The banner is `factual`, not `draft`. See legal-layout.tsx: a
 * disclosure that opens by calling itself unreviewed placeholder is not
 * a disclosure.
 */
export default function AiTransparencyPage() {
  return (
    <LegalLayout
      titleKey="landing.footer.aiTransparency"
      updated="2026-09-02"
      notice="factual"
    >
      <LegalSection title="1. You are interacting with an AI system">
        <p>
          Ionexa AI is built around large language models. Every feature that generates,
          classifies, summarises, plans or analyses content does so by calling an AI model.
          Interfaces where you interact with AI carry an inline notice, and this page is the
          full statement behind that notice, as required by Article 50 of the EU AI Act
          (in application since 2 August 2026).
        </p>
      </LegalSection>

      <LegalSection title="2. Which models run">
        <p>
          Ionexa routes each call to a model rather than being wired to one. The models it
          can route to are Anthropic&apos;s Claude family (Haiku 4.5, Sonnet 4.6, Opus 4.6),
          OpenAI&apos;s GPT-5 family, Google&apos;s Gemini 2.5 family, and open models served
          by Groq.
        </p>
        <p>
          <strong>Anthropic is the only one switched on by default.</strong> A second
          provider serves nothing until an operator both supplies its API key and names it
          explicitly in the provider order; a key on its own is not consent — the deployment
          has to say so. Today, on this deployment, Anthropic answers every call.
        </p>
        <p>
          Within that, the work decides the model, not the price: short classifications and
          simple replies go to the smallest model, ordinary generation to the mid model,
          and the hardest requests to the largest. A request can move <em>up</em> that
          ladder when the cheaper model fails. It is never quietly moved down — if a
          fallback provider has nothing of at least the same capability, it is skipped
          rather than substituted, because an answer from a weaker model looks exactly like
          an answer from the right one.
        </p>
        <p>
          <strong>What is recorded, and who can see it.</strong> Every attempt is written to
          an internal log: which provider, which model, for what purpose, how it went, how
          long it took, and whether the prompt cache survived. That log holds no prompt, no
          completion, no system text and no tool arguments — nothing a model was shown or
          said. It is an operational record read by the operator; it is not currently
          surfaced to you per action. Your own Settings page shows your AI usage as credits
          and activity per module, and does not name the model that ran. If you need to know
          which model produced a specific output, ask us through the contact page and we
          will look it up.
        </p>
      </LegalSection>

      <LegalSection title="3. What each feature does with AI">
        <p>
          <strong>Ionexa Chat and Create Anything</strong>: your message, the workspace
          context the feature declares, and conversation history are sent to the model to
          produce the reply or classify the entry.
        </p>
        <p>
          <strong>Build a site</strong>: your description, and any reference images you
          attach, generate one complete HTML document. The model is instructed never to
          invent a number or a contact fact — no price, phone number, opening time, address
          or rating — and to leave a bracketed placeholder instead. Three separate things
          then run on the result, and they are not equivalent:
        </p>
        <p>
          A <em>second model</em> reads the generated page and reports whether it contains
          phishing, impersonation or fraud. It is a second opinion, not a gate: if that
          review errors or times out it records nothing and your site proceeds, because a
          network fault must not block a legitimate page.
        </p>
        <p>
          A <em>static scan</em> runs again at publish and is the actual gate. It is
          deterministic, it fails closed, and a page carrying an external script, an inline
          event handler, a form posting to somebody else&apos;s server, an iframe from a
          host that is not on the list, or dynamic code execution is not published — with
          the reasons shown to you.
        </p>
        <p>
          <em>Link rewriting</em> keeps your site&apos;s own navigation inside your site,
          and the page is served under a policy that forbids external scripts.
        </p>
        <p>
          <strong>Deep Research</strong>: the model runs web searches and writes a sourced
          report. Afterwards, code checks the report&apos;s own citation markers against its
          source list; a marker pointing at a source that does not exist is annotated rather
          than left looking checkable.
        </p>
        <p>
          <strong>AI Coding</strong>: five operations over code you paste in. Nothing clones
          a repository, executes anything, or writes anywhere except your own history.
        </p>
        <p>
          <strong>Data Analysis, import and insights</strong>: the patterns are computed by
          code from your rows, with a sample size attached. The model is then given those
          numbers and only phrases them, and a sentence containing a figure the code never
          computed is rejected and replaced by the plain one.
        </p>
        <p>
          <strong>AI Agents</strong>: run on schedules you set, and every result they send
          states that an agent generated it.
        </p>
        <p>
          <strong>Presentation notes, and the other note modules</strong>, use no AI at all.
          They are tables you fill in yourself. The module was called
          &quot;Presentations&quot; until it was renamed, because the old name promised a
          slide generator that does not exist.
        </p>
      </LegalSection>

      <LegalSection title="4. What data the models see">
        <p>
          Models see what a feature needs: the text you typed, the workspace context that
          feature declares (recent entries, active missions, learned preferences you can
          view and delete in Settings), and — for import and analysis — the data you
          imported. Whichever provider serves a call sees only that call.
        </p>
        <p>
          Your data is not used to train models. Anthropic&apos;s commercial API terms
          exclude API traffic from training, and any additional provider an operator enables
          is enabled on the same basis. Every model call is metered and recorded against
          your account.
        </p>
      </LegalSection>

      <LegalSection title="5. AI-generated content is marked">
        <p>
          Inside the product, interfaces that show model output carry a notice: chat
          replies, research reports and the site builder. Content that leaves the product
          carries one too — every agent email states that an agent generated it, in the
          agent&apos;s own output language rather than the app&apos;s, and research reports
          and file answers carry the same statement.
        </p>
        <p>
          <strong>One gap, stated rather than left to be discovered.</strong> Websites you
          publish do not yet carry a machine-readable marking in their HTML saying the page
          was AI-generated. A human reader of a published page is not told, and an automated
          reader cannot detect it. This is a known omission, not a design decision, and it
          is the next thing on this page&apos;s list.
        </p>
        <p>
          Outputs can be wrong. Check anything important before acting on it.
        </p>
      </LegalSection>

      <LegalSection title="6. Human oversight">
        <p>
          Nothing in Ionexa acts autonomously beyond what you configure: generation runs
          when you ask, agents run on schedules you create and can pause, and no AI decision
          — plan steps, classifications, imports — is applied without being visible and
          editable first. Agents have no tools, send to an address fixed when you created
          them, and their output is validated against a schema before it goes anywhere.
        </p>
        <p>
          There are limits above all of that which you do not control and cannot switch off,
          and every AI request passes all three before it runs: a cap on how many AI
          requests one account may make in an hour, a breaker that stops the same request
          being repeated, and a platform-wide daily cap on AI calls across every account.
          When one trips, the feature says it has stopped and why, rather than quietly
          returning something worse.
        </p>
      </LegalSection>

      <LegalSection title="7. What is checked automatically, and what is not">
        <p>
          Some of what a model returns is checked before you see it. Everything in this
          list except the website content review is code rather than another model, and
          that is deliberate: a check that can hallucinate is not a gate. The one check
          that is a model is correspondingly not allowed to block anything on its own.
        </p>
        <p>
          <strong>Was the answer finished?</strong> A model that runs out of room stops
          mid-sentence and reports it. Output is taken through one function that reads that
          signal, so a truncated report is labelled as cut off instead of being handed over
          as a finished one.
        </p>
        <p>
          <strong>Do the citations point anywhere?</strong> Described in section 3.
        </p>
        <p>
          <strong>Did it invent a figure?</strong> Described in section 3.
        </p>
        <p>
          <strong>Do a generated site&apos;s links stay inside it, and is the HTML safe to
          serve?</strong> Described in section 3. The static scan is the one check in this
          list that stops something from happening.
        </p>
        <p>
          <strong>Instructions hidden in content an agent reads</strong> are filtered by a
          list of override phrasings, covering all ten languages the app ships in. This one
          comes with a warning we would rather state than have you assume otherwise: a
          filter that enumerates attack phrasings will eventually miss one. It is a cheap
          catch for the obvious cases, not the security boundary. The boundary is what an
          agent is able to do at all — no tools, a delivery address it cannot change, and
          output checked against a schema.
        </p>
        <p>
          <strong>What is not checked:</strong> whether a factual claim is true, whether
          generated code is correct or safe to run, whether a research conclusion follows
          from its sources, and whether a generated design is fit for your purpose. Nothing
          in this product verifies any of those.
        </p>
      </LegalSection>

      <LegalSection title="8. If something goes wrong">
        <p>
          If you believe an AI output caused a problem, tell us through the contact page.
          Every action is logged and traceable, and we can tell you which provider and model
          served a specific call. Content and behaviour that break the rules are covered by
          the acceptable use policy.
        </p>
      </LegalSection>

      <LegalSection title="9. About this page">
        <p>
          This page is published in English. The heading, the navigation and the link that
          brings you here are translated into all ten languages Ionexa ships in, and so are
          the AI notices inside the product — including the disclosure on agent emails,
          which is written in the language the agent replies in rather than the language of
          the interface.
        </p>
        <p>
          The date at the top is the date every statement above was last checked against the
          running code, not the date the file was last touched. Five statements in the
          previous draft of this page had stopped being true and were removed; if you want
          to know which, the reasons are written into the source of this page.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
