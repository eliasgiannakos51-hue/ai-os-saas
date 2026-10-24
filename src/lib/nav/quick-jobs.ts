// THE SMALL READY-MADE TILES (the owner's "ALL TOOLS: ΟΛΑ ΤΑ ΤΕΤΡΑΓΩΝΑ"
// message, §2, 2026-10-24): under each big tile's group, a row of smaller
// squares — name and icon only. Each is a registry entry, NO new engine
// code: pressing one opens an EXISTING tool, with its field already
// holding the example text (ToolShell's own `initialText`, the same
// mechanism the empty landing's own examples use) or, for a tool whose
// job starts with an upload rather than words (Meetings), just the tool
// itself, ready.
//
// WHICH PARAMETER A TARGET READS is the target's own, already-established
// name — `?brief=` for research/posts/slides/site (their own first-screen
// examples use it), `?said=` for automations, `?agent=` for agents,
// `?ask=` for chat and for the five shells given this round's wiring
// (analyze, documents, my-stuff, flow/projects, images, games). A job to
// a tool that is not ready (`ALL_TOOLS[...].ready === false`) carries no
// text — pressing it opens the Coming Soon screen the same way the big
// tile does.
//
// Six Learn jobs carry no tool of their own — MASTER 16 names no "Learn"
// tool — every one opens Chat with its question already asked
// (`?ask=`, which Chat auto-sends: components/chat/chat-workspace.tsx).
//
// scripts/tests/all-tools.test.mjs §1 holds every href against a real
// route and every target's param against what that page actually reads.

export type QuickJobGroup = "record" | "ask" | "make" | "runAlone" | "organise" | "learn";

export type QuickJob = {
  /** The key under dashboard.quickJobs.<id>.label / .text in messages/*.json. */
  id: string;
  group: QuickJobGroup;
  /** The tool's own AllToolsNameKey (src/lib/nav/all-tools.ts), for the icon and for finding whether it is ready. */
  tool: string;
  href: string;
  /** The query parameter the target reads for its example text; omit when the job has none to give (Meetings, Translate, Apps). */
  param?: "ask" | "brief" | "said" | "agent";
};

export const QUICK_JOBS: readonly QuickJob[] = [
  // ΚΑΤΑΓΡΑΨΕ
  { id: "meetingNotes", group: "record", tool: "meetings", href: "/dashboard/meetings" },
  { id: "incomeExpenses", group: "record", tool: "myStuff", href: "/dashboard/my-stuff", param: "ask" },
  { id: "customersSales", group: "record", tool: "myStuff", href: "/dashboard/my-stuff", param: "ask" },
  { id: "tradingCalendar", group: "record", tool: "myStuff", href: "/dashboard/my-stuff", param: "ask" },
  // ΡΩΤΑ
  { id: "translateQuick", group: "ask", tool: "translate", href: "/dashboard/translate" },
  { id: "summariseText", group: "ask", tool: "analyze", href: "/dashboard/data-analysis", param: "ask" },
  { id: "chartFromNumbers", group: "ask", tool: "analyze", href: "/dashboard/data-analysis", param: "ask" },
  { id: "receiptsTable", group: "ask", tool: "analyze", href: "/dashboard/data-analysis", param: "ask" },
  { id: "salesForecast", group: "ask", tool: "analyze", href: "/dashboard/data-analysis", param: "ask" },
  { id: "factCheck", group: "ask", tool: "research", href: "/dashboard/deep-research", param: "brief" },
  { id: "compareOptions", group: "ask", tool: "research", href: "/dashboard/deep-research", param: "brief" },
  { id: "competitorAnalysis", group: "ask", tool: "research", href: "/dashboard/deep-research", param: "brief" },
  { id: "editText", group: "ask", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "replyToReview", group: "ask", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "replyToCustomer", group: "ask", tool: "chat", href: "/dashboard/chat", param: "ask" },
  // ΦΤΙΑΞΕ
  { id: "logo", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },
  { id: "productPhoto", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },
  { id: "poster", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },
  { id: "upscaleImage", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },
  { id: "removeBackground", group: "make", tool: "editing", href: "/dashboard/editing" },
  { id: "shortSocialClip", group: "make", tool: "editing", href: "/dashboard/editing" },
  { id: "subtitles", group: "make", tool: "editing", href: "/dashboard/editing" },
  { id: "podcastToVideo", group: "make", tool: "editing", href: "/dashboard/editing" },
  { id: "thirtySecondAd", group: "make", tool: "video", href: "/dashboard/video-studio" },
  { id: "musicForVideo", group: "make", tool: "audio", href: "/dashboard/audio" },
  { id: "voiceOver", group: "make", tool: "audio", href: "/dashboard/audio" },
  { id: "podcastFromText", group: "make", tool: "audio", href: "/dashboard/audio" },
  { id: "presentation", group: "make", tool: "slides", href: "/dashboard/presentations", param: "brief" },
  { id: "socialPost", group: "make", tool: "posts", href: "/dashboard/posts", param: "brief" },
  { id: "campaign", group: "make", tool: "posts", href: "/dashboard/posts", param: "brief" },
  { id: "cv", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "customerOffer", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "letter", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "customerEmail", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "spreadsheet", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "formOrSurvey", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "menuOrPriceList", group: "make", tool: "document", href: "/dashboard/documents", param: "ask" },
  { id: "businessCard", group: "make", tool: "site", href: "/dashboard/website-builder", param: "brief" },
  { id: "siteAssistant", group: "make", tool: "site", href: "/dashboard/website-builder", param: "brief" },
  { id: "bookingApp", group: "make", tool: "apps", href: "/dashboard/app-builder" },
  { id: "game", group: "make", tool: "games", href: "/dashboard/games", param: "ask" },
  // ΤΡΕΞΕ ΜΟΝΟ ΤΟΥ
  { id: "morningSummary", group: "runAlone", tool: "automations", href: "/dashboard/automation", param: "said" },
  { id: "weeklyReport", group: "runAlone", tool: "automations", href: "/dashboard/automation", param: "said" },
  { id: "reminders", group: "runAlone", tool: "automations", href: "/dashboard/automation", param: "said" },
  { id: "tradingAlerts", group: "runAlone", tool: "automations", href: "/dashboard/automation", param: "said" },
  { id: "inboxSummary", group: "runAlone", tool: "agents", href: "/dashboard/agents", param: "agent" },
  { id: "myOwnAssistant", group: "runAlone", tool: "agents", href: "/dashboard/agents", param: "agent" },
  // ΟΡΓΑΝΩΣΕ
  { id: "goalInSteps", group: "organise", tool: "projects", href: "/dashboard/projects", param: "ask" },
  { id: "myWeek", group: "organise", tool: "projects", href: "/dashboard/projects", param: "ask" },
  { id: "notes", group: "organise", tool: "projects", href: "/dashboard/projects", param: "ask" },
  // ΜΑΘΕ — no tool of its own; every one opens Chat, auto-sent.
  { id: "explainTopic", group: "learn", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "practiceExercises", group: "learn", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "quiz", group: "learn", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "flashcards", group: "learn", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "studyPlan", group: "learn", tool: "chat", href: "/dashboard/chat", param: "ask" },
  { id: "languagePractice", group: "learn", tool: "chat", href: "/dashboard/chat", param: "ask" },
];

/** The job's address, with its example text already in the query string
 *  — undefined `text` (a not-ready target, or a job with no `param`)
 *  means a bare navigation. */
export function quickJobHref(job: QuickJob, text: string | undefined): string {
  if (!job.param || !text) return job.href;
  return `${job.href}?${job.param}=${encodeURIComponent(text)}`;
}
