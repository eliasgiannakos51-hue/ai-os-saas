import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { AppBackground } from "@/components/ui/app-background";
import { KNOWLEDGE_BASE, articlesByCategory, type KnowledgeArticle } from "@/lib/support/knowledge-base";

export const metadata: Metadata = {
  title: "Help Centre",
  description: "Answers to the questions people ask most about Ionexa AI — pricing, credits, websites, agents, privacy.",
};

// The Help Centre.
//
// Same 27 articles the chat answers from (lib/support/knowledge-base.ts),
// rendered as a page. That shared source is the point: a help page and a
// support bot that answer the same question differently is worse than
// having only one of them, and it is what happens the moment the two are
// maintained separately.
//
// PUBLIC, and deliberately not behind /dashboard. Half of these questions
// — what does it cost, what are credits, is my data safe, what is this —
// are asked BEFORE anyone signs up, and an answer you have to create an
// account to read is not an answer.
//
// STATIC. Nothing here is per-user (that is enforced upstream: a question
// containing any first-person marker never reaches a canned answer at
// all), so this renders once at build time rather than per request.
//
// NO NUMBERS. Not one article states a price, a credit cost or an
// allowance — those live in lib/billing/plans.ts and on /pricing, they
// change, and a stale number here is a quote a customer will hold us to.
// Every money question links out instead. The knowledge base's own test
// enforces this with a digit scan.

// Category order — most-asked first, not alphabetical. Someone opening
// this page is far more likely to be here about money than about
// integrations.
const CATEGORY_ORDER = [
  "getting-started",
  "billing",
  "credits",
  "websites",
  "agents",
  "missions",
  "chat",
  "files",
  "integrations",
  "account",
  "privacy",
] as const;

const CATEGORY_TITLES: Record<string, string> = {
  "getting-started": "Ξεκινώντας",
  billing: "Χρεώσεις και πλάνα",
  credits: "Credits",
  websites: "Websites",
  agents: "AI Agents",
  missions: "Missions",
  chat: "Chat",
  files: "Αρχεία",
  integrations: "Συνδέσεις",
  account: "Λογαριασμός",
  privacy: "Δεδομένα και ιδιωτικότητα",
};

function Article({ article }: { article: KnowledgeArticle }) {
  return (
    // id, so every answer has its own link. Support replies point at a
    // specific answer, not at "the help page, scroll down".
    <article id={article.id} className="scroll-mt-24 rounded-2xl border border-border bg-panel/60 p-4">
      <h3 className="text-sm font-semibold text-foreground">{article.title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{article.answer}</p>
      {article.href && (
        <Link
          href={article.href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
        >
          Πήγαινε εκεί
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export default function HelpPage() {
  const byCategory = articlesByCategory();
  // Driven off the real categories rather than the hardcoded list, so an
  // article in a category nobody remembered to order still renders —
  // silently dropping an answer would be the worst failure this page has.
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number])),
  ];

  return (
    <div className="relative min-h-screen">
      <AppBackground />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-8">
          <Link href="/" className="inline-block">
            <Logo />
          </Link>
          <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <LifeBuoy className="h-6 w-6 text-orange-400" aria-hidden="true" />
            Κέντρο βοήθειας
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Οι απαντήσεις στις ερωτήσεις που γίνονται πιο συχνά. Αν ρωτήσεις κάτι από αυτά στο chat,
            θα πάρεις την ίδια απάντηση αμέσως και χωρίς χρέωση credits.
          </p>
        </header>

        {/* A contents list, because 27 answers is more than a page you can
            scan. Anchors match the article ids. */}
        <nav aria-label="Κατηγορίες" className="mb-8 flex flex-wrap gap-2">
          {ordered.map((category) => (
            <a
              key={category}
              href={`#category-${category}`}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors duration-150 hover:border-orange-500/40 hover:text-foreground"
            >
              {CATEGORY_TITLES[category] ?? category}
            </a>
          ))}
        </nav>

        <div className="space-y-10">
          {ordered.map((category) => (
            <section key={category} id={`category-${category}`} className="scroll-mt-24 space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                {CATEGORY_TITLES[category] ?? category}
              </h2>
              {(byCategory.get(category) ?? []).map((article) => (
                <Article key={article.id} article={article} />
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-12 rounded-2xl border border-border bg-panel/60 p-4">
          <h2 className="text-sm font-semibold text-foreground">Δεν βρήκες αυτό που έψαχνες;</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Ρώτησε στο chat — για οτιδήποτε αφορά τον δικό σου λογαριασμό ή τα δικά σου δεδομένα, η
            απάντηση έρχεται από το AI και όχι από αυτή τη σελίδα.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/chat"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              Άνοιξε το chat
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              Τιμές και πλάνα
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-muted/70">
            {KNOWLEDGE_BASE.length} απαντήσεις
          </p>
        </footer>
      </div>
    </div>
  );
}
