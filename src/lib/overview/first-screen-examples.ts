/**
 * THE FIRST SCREEN'S THREE EXAMPLES.
 *
 * Seven people were shown this product and gave six different answers to
 * "what does it do". Nobody named a capability. The screen they were
 * looking at led with "What do you want to build today?" — a question
 * that tells a newcomer nothing about what the thing can do, and which
 * they have to answer before anything happens.
 *
 * These three sentences answer it instead, and each one names a
 * DIFFERENT capability: build something · understand something ·
 * have something repeat.
 *
 * ONE CLICK RUNS IT. Not "writes the sentence into the box below and
 * waits for you to find the send button" — that is the pattern this
 * replaces. The click navigates into the capability carrying the text,
 * and the work has already started by the time the page is on screen.
 *
 * WHY NOT "upload a file and tell me what it shows", which is the
 * obvious third example and the one that was asked for: a file picker
 * CANNOT be opened on arrival. `input.click()` on <input type="file">
 * needs transient user activation, and the navigation spends it, so
 * every browser would drop it silently — a button that visibly does
 * nothing, which is worse than no button. The capability it stood for is
 * shown instead by a question the AI answers FROM THE USER'S OWN DATA:
 * the same thing five of seven testers gave as their reason for
 * cancelling ChatGPT.
 */

export type FirstScreenCapability = "build" | "understand" | "repeat";

export type FirstScreenExample = {
  /** One per capability. Two examples of the same one teaches nothing. */
  id: FirstScreenCapability;
  /** `dashboard.firstScreen.<id>.verb` — the capability, in one word. */
  verbKey: string;
  /** `dashboard.firstScreen.<id>.example` — the concrete sentence. */
  exampleKey: string;
  /** The route the click lands on. */
  path: string;
  /**
   * The query parameter carrying the example's text.
   *
   * A RUNTIME STRING ON BOTH SIDES, and that is the whole reason this
   * field exists rather than the href being written inline. Nothing in
   * the compiler connects `?ask=` in a link to `searchParams.ask` in a
   * page: rename either one and the click still navigates, the page
   * still renders, and the example silently stops running.
   * scripts/tests/first-screen.test.mjs reads both sides and compares
   * them.
   */
  param: string;
  /** The page file that must read `param` out of its searchParams. */
  page: string;
  /** The client component that must act on it once it arrives. */
  workspace: string;
};

/**
 * How long an example's text may be once it is in a URL.
 *
 * Every one of the three destinations reads this parameter out of a URL
 * anyone can edit, so none of them may trust its length. Kept well under
 * the ~2000-character ceiling browsers and proxies enforce on a whole
 * URL, because these three are not the only thing in it.
 */
export const MAX_EXAMPLE_CHARS = 300;

/**
 * What a page is allowed to believe about the parameter it was handed.
 *
 * Returns undefined — not an empty string — for anything unusable, so a
 * destination can write `if (!text) return;` and never start work on a
 * blank request. Shared by all three pages so the clamping cannot drift
 * between them.
 */
export function readExampleParam(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_EXAMPLE_CHARS);
}

export const FIRST_SCREEN_EXAMPLES: readonly FirstScreenExample[] = [
  {
    // BUILD. Lands in the website builder with the brief already
    // submitted, so the builder's own questions ("what kind of shop?
    // which pages?") are what the user sees — not an empty form. The
    // expensive part still waits for those answers.
    id: "build",
    verbKey: "dashboard.firstScreen.build.verb",
    exampleKey: "dashboard.firstScreen.build.example",
    path: "/dashboard/website-builder",
    param: "brief",
    page: "src/app/dashboard/website-builder/page.tsx",
    workspace: "src/components/website-builder/website-builder-workspace.tsx",
  },
  {
    // UNDERSTAND. Lands in the chat with the question already sent and
    // the answer already streaming. Two of the seven testers never found
    // the chat at all; this is a door into it that does not require
    // knowing it exists.
    id: "understand",
    verbKey: "dashboard.firstScreen.understand.verb",
    exampleKey: "dashboard.firstScreen.understand.example",
    path: "/dashboard/chat",
    param: "ask",
    page: "src/app/dashboard/chat/page.tsx",
    workspace: "src/components/chat/chat-workspace.tsx",
  },
  {
    // REPEAT. Lands in the agent builder with the request already
    // building, so what the user sees is the product drafting a Monday
    // job — the capability nobody in the test knew existed.
    id: "repeat",
    verbKey: "dashboard.firstScreen.repeat.verb",
    exampleKey: "dashboard.firstScreen.repeat.example",
    path: "/dashboard/agents",
    param: "agent",
    page: "src/app/dashboard/agents/page.tsx",
    workspace: "src/components/agents/agents-workspace.tsx",
  },
];

/** The URL one click follows. */
export function exampleHref(example: FirstScreenExample, text: string): string {
  return `${example.path}?${example.param}=${encodeURIComponent(text.slice(0, MAX_EXAMPLE_CHARS))}`;
}

/**
 * Take the example's parameter back out of the address bar.
 *
 * A RELOAD MUST NOT REPEAT IT. The text stays in the URL after the work
 * starts, so refreshing the page — or restoring the tab tomorrow —
 * mounts the destination again with the same parameter and starts the
 * same work a second time. For the chat that is a second message and a
 * second charge for one press.
 *
 * history.replaceState rather than router.replace: this is Next's
 * supported way to change the query without a navigation, and a
 * navigation here would remount the very component doing the work.
 * Wrapped because a browser that refuses it must not take the page down
 * — the worst case is the parameter staying put, which is where it
 * already was.
 */
export function forgetExampleParam(param: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Leaving the parameter in place is the status quo, not a new fault.
  }
}
