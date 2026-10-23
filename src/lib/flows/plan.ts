import { matchProducer } from "@/lib/create-studio/producer-routes";
import { boundedPattern, foldForMatch, stem, word } from "@/lib/text/unicode-patterns";
import { truncate } from "@/lib/text/truncate";

/**
 * ONE SENTENCE, SEVERAL TOOLS, ONE PROJECT (MASTER 6.1 and 6.3; MASTER 16,
 * package 36), for everybody since 2026-10-23.
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

/**
 * What a sentence calls each thing, folded
 * (lib/text/unicode-patterns.ts foldForMatch: lower case, no accents,
 * final sigma as σ). Greek as STEMS, so every ending counts.
 *
 * TEN LANGUAGES, NOT TWO. This table used to hold Greek and English,
 * plus four European words for pictures and nothing else — so
 * «φτιάξε μου εικόνες» planned an images step and "créez-moi des
 * illustrations", "erstelle Diagramme", "翻訳して", "أريد لعبة" planned
 * nothing. The two halves of that are different sizes of wrong: a
 * missed `images` loses a step, and a missed NOT_YET word (video,
 * translation, game, meeting) starts a flow for something no tool here
 * can make — which is the case the file's own comment below says must
 * never happen. lib/create-studio/producer-routes.ts has had all ten
 * since it was written; this is the same table for the words it does
 * not cover. Measured in scripts/tests/flows.test.mjs §7, one sentence
 * per language per cue.
 *
 * `cjk` IS SEPARATE BECAUSE THE MATCH IS. Chinese and Japanese put no
 * spaces between words, so a word-boundary pattern finds nothing in
 * 「画像を作って」 — those cues are matched by containment instead, the
 * same split producer-routes.ts makes.
 *
 * NOT_YET CUES ARE DELIBERATELY NARROW. A false positive there refuses
 * the whole flow, so the words here are the ones that can only mean the
 * thing: "clip" and the German "Termin" were left out for that reason.
 */
type Cue = {
  /** Greek stems, matched by containment — some are phrases. */
  stems: string[];
  /**
   * Latin-script STEMS, matched with a word-end boundary and up to
   * MAX_INFLECTION letters of ending.
   *
   * WHY A SECOND KIND OF STEM EXISTS. Whole words are enough for a
   * noun — "imagen", "Diagramm", "jogo" — and useless for a verb a
   * person conjugates or hangs a pronoun off. The sixty-sentence
   * measurement in scripts/tests/flows.test.mjs §7 failed on exactly
   * five rows and all five were the same verb: "tradúcelo",
   * "traduis-le", "übersetze", "traducilo", "traduza". One stem each
   * for the Romance and German families reads all of them.
   */
  roots: string[];
  words: string[];
  cjk: string[];
};

const CUES: Record<"images" | "analysis" | NotYet, Cue> = {
  images: {
    stems: ["εικον", "φωτογραφ", "εικονογραφ"],
    roots: [],
    words: [
      "image", "images", "picture", "pictures", "photo", "photos", "illustration", "illustrations",
      "imagen", "imagenes", "foto", "fotos", "ilustracion", "ilustraciones",
      "visuel", "visuels",
      "bild", "bilder", "abbildung",
      "immagine", "immagini", "illustrazione", "illustrazioni",
      "imagem", "imagens", "ilustracao", "ilustracoes",
      "صورة", "صور", "رسم",
    ],
    cjk: ["画像", "写真", "イラスト", "图片", "图像", "照片", "配图"],
  },
  analysis: {
    stems: ["γραφημα", "γραφηματ", "αρχειο πωλησ", "αρχειο με τισ πωλησ"],
    roots: [],
    words: [
      "chart", "charts", "graph", "graphs", "spreadsheet", "spreadsheets", "excel",
      "grafico", "graficos", "grafica", "graficas", "hoja de calculo",
      "graphique", "graphiques", "tableur",
      "diagramm", "diagramme", "tabellenkalkulation",
      "grafici", "foglio di calcolo",
      "planilha", "planilhas",
      "رسم بياني", "جدول بيانات",
    ],
    cjk: ["图表", "表格", "数据分析", "グラフ", "表計算", "データ分析"],
  },
  video: {
    stems: ["βιντεο", "ταινι"],
    roots: [],
    words: [
      "video", "videos", "tiktok", "reel", "reels", "film", "films",
      "pelicula", "peliculas", "filmato", "filmati", "filme", "filmes",
      "فيديو",
    ],
    cjk: ["動画", "ビデオ", "映像", "视频", "短视频", "影片"],
  },
  translation: {
    stems: ["μεταφρασ", "μεταφρασε"],
    // "tradu" covers traduire / traduis / traducir / tradúcelo /
    // traduzir / traduza / tradurre / traducilo and every noun built on
    // them; "ubersetz" covers übersetze / übersetzen / Übersetzung;
    // "translat" covers translate / translating / translation.
    roots: ["tradu", "ubersetz", "translat"],
    words: [
      "translate", "translation", "translations",
      "traducir", "traduccion", "traducciones",
      "traduire", "traduction", "traductions",
      "ubersetzen", "ubersetzung",
      "tradurre", "traduzione", "traduzioni",
      "traduzir", "traducao", "traducoes",
      "ترجمة", "ترجم",
    ],
    cjk: ["翻訳", "翻译", "译文"],
  },
  game: {
    stems: ["παιχνιδ"],
    roots: [],
    words: [
      "game", "games", "juego", "juegos", "jeu", "jeux", "spiel", "spiele",
      "gioco", "giochi", "jogo", "jogos", "لعبة", "ألعاب",
    ],
    cjk: ["ゲーム", "游戏", "遊戲"],
  },
  meeting: {
    stems: ["συναντησ"],
    roots: [],
    words: [
      "meeting", "meetings", "reunion", "reuniones", "reunions",
      "besprechung", "riunione", "riunioni", "reuniao", "reunioes",
      "اجتماع",
    ],
    cjk: ["会議", "ミーティング", "会议"],
  },
};

function names(folded: string, cue: Cue): boolean {
  if (cue.stems.some((s) => folded.includes(s))) return true;
  if (cue.cjk.some((c) => folded.includes(c))) return true;
  // Built per call, both of them: boundedPattern returns a /g/ regex,
  // whose lastIndex survives between tests on a shared instance.
  if (cue.roots.length > 0 && boundedPattern(stem(...cue.roots)).test(folded)) return true;
  return cue.words.length > 0 && boundedPattern(word(...cue.words)).test(folded);
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
 * What this person can run (lib/flows/availability.ts): each kind, and a
 * deck made FROM a research (api/presentations/generate, package 11),
 * which lib/flows/availability.ts reports as available to everybody.
 */
export type FlowAvailability = Record<FlowKind, boolean> & { slidesFromResearch: boolean };

/** Whether this step can run for this person: its tool, and for a deck after a research, the deck made from it. */
export function canRun(available: FlowAvailability, step: FlowStep): boolean {
  if (!available[step.kind]) return false;
  return !(step.kind === "slides" && step.after.includes("research") && !available.slidesFromResearch);
}

/**
 * A PLAN WITHOUT WHAT THIS PERSON CANNOT USE YET: a tool behind a switch
 * that is closed for them, or above their plan, or without its provider's
 * key. Taken out BEFORE the price is shown and the project is made — a
 * flow that would fail at one of its steps is not offered as if it would
 * not — and named, so the screen can say why it is not there. A step
 * that waits for one taken out goes with it.
 */
export function withoutUnavailable(plan: FlowPlan, available: (step: FlowStep) => boolean): FlowPlan & { unavailable: FlowKind[] } {
  const out = new Set(plan.steps.filter((s) => !available(s)).map((s) => s.id));
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
