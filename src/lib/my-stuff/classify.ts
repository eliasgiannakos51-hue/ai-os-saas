import { foldForMatch } from "@/lib/text/unicode-patterns";
import { questionWords, scoreTerms } from "@/lib/ai/module-relevance";
import { MODULE_SYNONYMS } from "@/lib/ai/module-synonyms";
import { MY_STUFF_KINDS, type MyStuffKind } from "@/lib/my-stuff/sources";

/**
 * «ΡΩΤΑΣ ΜΕ ΛΟΓΙΑ» — ΡΟΥΓΗΛΑ ΠΟΙΟ(Α) ΚΟΜΜΑΤΙ(Α) ΤΟ ΕΡΩΤΗΜΑ ΑΦΟΡΑ.
 *
 * NOT A CLASSIFIER IN THE ML SENSE — the same whole-word term scoring
 * lib/ai/module-relevance.ts already built and proved for the thirteen
 * classifier modules (scoreTerms, questionWords), reused here rather than
 * re-invented. Finance, Sales and Trading borrow their real vocabulary
 * straight from lib/ai/module-synonyms.ts — the list that already knows a
 * Greek user writes "ξόδεψα" and not "Οικονομικά" — so a question like
 * «Πόσα έξοδα είχα τον Σεπτέμβριο;» finds Finance by the same words that
 * already find it for every classifier module.
 *
 * EVERY RULE HERE FAILS TOWARDS SEARCHING EVERYTHING, the same rule
 * module-relevance.ts states for its own selection: a question that
 * matches no vocabulary at all returns every kind rather than none, so an
 * honest answer never reads as "I found nothing" on data that was there
 * the whole time — only a question that is CLEARLY about something
 * narrows the read.
 *
 * Pure and react-free, like module-relevance.ts, so the gate can load it
 * with no database and no model.
 */

type SimpleKind = Exclude<MyStuffKind, "finance" | "sales" | "trading">;

// ONE FLAT LIST PER KIND rather than module-relevance's primary/associated/
// verb split: that split exists to break TIES between modules whose
// vocabularies overlap (customer -> Sales vs Feedback), and these nine
// tool kinds do not compete with each other the way thirteen record
// trackers do — nobody confuses "φτιάξε ένα site" for a question about
// Slides. A flat list is the simpler honest match for that shape.
const TERMS: Record<SimpleKind, string[]> = {
  site: [
    "site", "sites", "website", "websites", "page", "landing",
    "ιστότοπος", "ιστότοποι", "ιστοσελίδα", "ιστοσελίδες", "σάιτ",
  ],
  slides: [
    "slide", "slides", "presentation", "deck", "slideshow",
    "διαφάνεια", "διαφάνειες", "παρουσίαση", "παρουσιάσεις",
  ],
  posts: [
    "post", "posts", "caption", "hashtag", "tweet", "instagram", "linkedin",
    "ανάρτηση", "αναρτήσεις", "ποστ",
  ],
  document: [
    "document", "documents", "letter", "memo",
    "έγγραφο", "έγγραφα", "επιστολή",
  ],
  research: [
    "research", "report", "reports", "sources", "topic",
    "έρευνα", "έρευνες", "αναφορά", "αναφορές", "πηγές",
  ],
  analysis: [
    "analysis", "dataset", "spreadsheet", "csv", "column", "columns", "chart",
    "ανάλυση", "αναλύσεις", "δεδομένα", "στήλη", "στήλες",
  ],
  file: [
    "file", "files", "pdf", "upload", "uploaded", "attachment",
    "αρχείο", "αρχεία", "ανέβασα",
  ],
  chat: [
    "said", "told", "mentioned", "conversation", "chat", "discussed",
    "είπαμε", "είπα", "μίλησα", "συζήτηση", "συνομιλία", "συνομιλίες", "ρωτήσαμε",
  ],
  coding: [
    "code", "function", "script", "bug", "bugs", "convert", "program",
    "κώδικας", "κώδικα", "συνάρτηση", "σκριπτ", "πρόγραμμα",
  ],
  // THE THREE Κομμάτι 3 ADDS (2026-10-28) — same flat-list shape as the
  // nine above, for the same reason: nobody confuses "an image I made"
  // for a question about a meeting.
  images: [
    "image", "images", "picture", "pictures", "photo", "photos",
    "εικόνα", "εικόνες", "φωτογραφία", "φωτογραφίες",
  ],
  meetings: [
    "meeting", "meetings", "call", "calls", "transcript", "transcripts",
    "συνάντηση", "συναντήσεις", "κλήση", "κλήσεις", "απομαγνητοφώνηση",
  ],
  apps: [
    "app", "apps", "application", "applications",
    "εφαρμογή", "εφαρμογές",
  ],
};

/** Every kind this question scored on, strongest first; every kind at all
 *  when nothing scored (see the file header — this is the fail-open branch). */
export function classifyMyStuffQuestion(question: string): MyStuffKind[] {
  const folded = foldForMatch(question);
  const words = questionWords(folded);

  const scored: { kind: MyStuffKind; score: number }[] = [];
  for (const kind of Object.keys(TERMS) as SimpleKind[]) {
    scored.push({ kind, score: scoreTerms(words, folded, TERMS[kind]) });
  }
  for (const slug of ["finance", "sales", "trading"] as const) {
    const vocabulary = MODULE_SYNONYMS[slug];
    const score = vocabulary
      ? scoreTerms(words, folded, vocabulary.primary) +
        scoreTerms(words, folded, vocabulary.verbs) +
        // Associated terms ("customer", "πελάτες") score half — the same
        // weight module-relevance.ts gives them, and for the same reason:
        // they travel with the module without belonging to it alone.
        scoreTerms(words, folded, vocabulary.associated) * 0.5
      : 0;
    scored.push({ kind: slug, score });
  }

  const hit = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.kind);

  return hit.length > 0 ? hit : [...MY_STUFF_KINDS];
}

/**
 * AT MOST THIS MANY KINDS ARE READ, either way — the bound applies to the
 * fail-open case too, which is the opposite of what the file header above
 * promises taken alone. That is deliberate and stated here rather than
 * left to be noticed: "fails towards searching everything" describes the
 * SELECTION (nothing is excluded by a guess that misses), not an unbounded
 * READ. A question that matches no vocabulary gets the first
 * MAX_KINDS_READ kinds in MY_STUFF_SOURCES's own order rather than all
 * twelve, for the same reason lib/ai/workspace-context.ts bounds its own
 * read before relevance runs: a user with twelve full tools must not pay,
 * on every vague question, for reading all twelve.
 */
export const MAX_KINDS_READ = 5;

export function kindsToRead(question: string): MyStuffKind[] {
  return classifyMyStuffQuestion(question).slice(0, MAX_KINDS_READ);
}
