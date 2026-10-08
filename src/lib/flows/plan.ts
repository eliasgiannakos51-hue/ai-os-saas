import { matchProducer } from "@/lib/create-studio/producer-routes";
import { foldForMatch } from "@/lib/text/unicode-patterns";
import { truncate } from "@/lib/text/truncate";

/**
 * ONE SENTENCE, SEVERAL TOOLS, ONE PROJECT (MASTER 6.1 and 6.3; MASTER 16,
 * package 36), behind the switch "flows".
 *
 * «Φτιάξε site για το camping μου, με εικόνες, και posts για να το
 * ανακοινώσω» names three tools. This reads WHICH, puts them in the order
 * they can run — research before the deck made from it, a file before the
 * analysis of it — and says, by name, any part no tool here can do yet
 * (video, translation, a game). No model is asked: the tools a sentence
 * names are words in it, the same words the rest of the product already
 * routes on (lib/create-studio/producer-routes.ts), and a plan that costs
 * nothing to make costs nothing to make again.
 *
 * Each step gets the WHOLE sentence as its brief: every tool already
 * reads a sentence for its own part, and a sentence cut into pieces loses
 * what the pieces say about each other ("για να το ανακοινώσω" is what the
 * posts are for).
 *
 * Client-safe and pure. Held by scripts/tests/flows.test.mjs.
 */
export const FLOW_KINDS = ["research", "site", "images", "posts", "slides", "analysis"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** What a sentence can ask for that no tool here makes yet. */
export const NOT_YET = ["video", "translation", "game", "meeting"] as const;
export type NotYet = (typeof NOT_YET)[number];

export type FlowStep = {
  id: string;
  kind: FlowKind;
  /** The steps whose results this one needs before it can start. */
  after: string[];
};

export type FlowPlan = { steps: FlowStep[]; notYet: NotYet[] };

/** The most of one sentence a flow is made from. */
export const MAX_FLOW_SAID = 1200;

// Words, folded (lib/text/unicode-patterns.ts foldForMatch: lower case, no
// accents, final sigma as σ). Greek as STEMS, so every ending counts.
const CUES: Record<"images" | "analysis" | NotYet, { stems: string[]; words: string[] }> = {
  images: { stems: ["εικον", "φωτογραφ", "εικονογραφ"], words: ["image", "images", "picture", "pictures", "photo", "photos", "imagen", "imagenes", "bild", "bilder", "immagine", "immagini", "imagem", "imagens"] },
  analysis: { stems: ["γραφημα", "γραφηματ", "αρχειο πωλησ", "αρχειο με τισ πωλησ"], words: ["chart", "charts", "graph", "graphs", "spreadsheet", "excel"] },
  video: { stems: ["βιντεο", "ταινι"], words: ["video", "videos", "tiktok", "reel", "reels", "film"] },
  translation: { stems: ["μεταφρασ", "μεταφρασε"], words: ["translate", "translation"] },
  game: { stems: ["παιχνιδ"], words: ["game", "games"] },
  meeting: { stems: ["συναντησ"], words: ["meeting", "meetings"] },
};

function names(folded: string, cue: { stems: string[]; words: string[] }): boolean {
  if (cue.stems.some((s) => folded.includes(s))) return true;
  const tokens = new Set(folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return cue.words.some((w) => tokens.has(w));
}

export function planFlow(said: string): FlowPlan {
  const text = String(said ?? "").slice(0, MAX_FLOW_SAID);
  const folded = foldForMatch(text);
  const match = matchProducer(text);
  const producers = match.kind === "one" ? [match.producer] : match.kind === "ambiguous" ? match.producers : [];

  const kinds = new Set<FlowKind>();
  if (producers.includes("research")) kinds.add("research");
  if (producers.includes("website")) kinds.add("site");
  if (producers.includes("posts")) kinds.add("posts");
  if (producers.includes("presentation")) kinds.add("slides");
  // «με εικόνες» beside a site is still pictures of their own: the site
  // has its own photographs, and these are the ones the posts and the
  // person use elsewhere.
  if (names(folded, CUES.images)) kinds.add("images");
  if (names(folded, CUES.analysis)) kinds.add("analysis");

  // A SENTENCE THAT NEEDS WHAT DOES NOT EXIST IS NOT STARTED AT ALL.
  // «Φτιάξε βίντεο για το site μου» names the site because the video goes
  // ON it, not because a new site is wanted: running the half that exists
  // would make the wrong thing and charge for it.
  const notYet = NOT_YET.filter((k) => names(folded, CUES[k]));
  if (notYet.length > 0) return { steps: [], notYet };

  const steps: FlowStep[] = [];
  for (const kind of FLOW_KINDS) {
    if (!kinds.has(kind)) continue;
    // A deck made in the same sentence as a research is made FROM it.
    const after = kind === "slides" && kinds.has("research") ? ["research"] : [];
    steps.push({ id: kind, kind, after });
  }
  return { steps, notYet };
}

/** The steps that may start now: not started, and everything they wait for done. */
export function readySteps(plan: FlowPlan, done: ReadonlySet<string>, started: ReadonlySet<string>): FlowStep[] {
  return plan.steps.filter((s) => !started.has(s.id) && s.after.every((a) => done.has(a)));
}

/** A stored plan, read defensively: known kinds, known waits, no repeats. */
export function readPlan(raw: unknown): FlowPlan {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const steps: FlowStep[] = [];
  for (const s of Array.isArray(value.steps) ? value.steps : []) {
    if (!s || typeof s !== "object") continue;
    const kind = (s as Record<string, unknown>).kind;
    if (!(FLOW_KINDS as readonly unknown[]).includes(kind) || seen.has(kind as string)) continue;
    seen.add(kind as string);
    const after = Array.isArray((s as Record<string, unknown>).after) ? ((s as Record<string, unknown>).after as unknown[]).filter((a): a is FlowKind => (FLOW_KINDS as readonly unknown[]).includes(a)) : [];
    steps.push({ id: kind as string, kind: kind as FlowKind, after });
  }
  for (const s of steps) s.after = s.after.filter((a) => seen.has(a) && a !== s.id);
  const notYet = (Array.isArray(value.notYet) ? value.notYet : []).filter((n): n is NotYet => (NOT_YET as readonly unknown[]).includes(n));
  return { steps, notYet };
}

/** Where each step's result is a row: what the project links, and what is read back as the person's own. */
export const STEP_TABLE: Record<FlowKind, string> = {
  research: "research_reports",
  site: "user_websites",
  images: "generated_images",
  posts: "generated_posts",
  slides: "ai_presentations",
  analysis: "data_analyses",
};

export const STEP_STATUSES = ["running", "done", "failed"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export type StepState = { status: StepStatus; row?: string; error?: string };

/** The stored state of each step, read defensively. */
export function readStepStates(raw: unknown, plan: FlowPlan): Record<string, StepState> {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, StepState> = {};
  for (const step of plan.steps) {
    const s = value[step.id];
    if (!s || typeof s !== "object") continue;
    const v = s as Record<string, unknown>;
    if (!(STEP_STATUSES as readonly unknown[]).includes(v.status)) continue;
    out[step.id] = {
      status: v.status as StepStatus,
      ...(typeof v.row === "string" ? { row: v.row } : {}),
      ...(typeof v.error === "string" ? { error: v.error.slice(0, 40) } : {}),
    };
  }
  return out;
}

/** How a flow stands, from its steps: running while any is not finished; done only when every one is. */
export function flowStatus(plan: FlowPlan, states: Record<string, StepState>): "running" | "done" | "failed" {
  const finished = plan.steps.every((s) => states[s.id]?.status === "done" || states[s.id]?.status === "failed");
  if (!finished) return "running";
  return plan.steps.every((s) => states[s.id]?.status === "done") ? "done" : "failed";
}

/** The project's name: the sentence, short. */
export function projectNameFor(said: string): string {
  return truncate(said, 60, { collapseWhitespace: true });
}

/**
 * A PLAN WITHOUT WHAT THIS PERSON CANNOT USE YET: a tool behind a switch
 * that is closed for them, or above their plan, or without its provider's
 * key. Taken out BEFORE the price is shown and the project is made — a
 * flow that would fail at one of its steps is not offered as if it would
 * not — and named, so the screen can say why it is not there. A step
 * that waits for one taken out goes with it.
 */
export function withoutUnavailable(plan: FlowPlan, available: (kind: FlowKind) => boolean): FlowPlan & { unavailable: FlowKind[] } {
  const out = new Set(plan.steps.filter((s) => !available(s.kind)).map((s) => s.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of plan.steps) {
      if (!out.has(s.id) && s.after.some((a) => out.has(a))) {
        out.add(s.id);
        grew = true;
      }
    }
  }
  return {
    steps: plan.steps.filter((s) => !out.has(s.id)),
    notYet: plan.notYet,
    unavailable: plan.steps.filter((s) => out.has(s.id)).map((s) => s.kind),
  };
}
