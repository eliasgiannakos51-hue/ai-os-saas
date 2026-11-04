/**
 * The eleven list surfaces that are NOT modules, and what their empty
 * screen owes the reader.
 *
 * lib/modules.ts solved this for the twenty module pages by making
 * `emptyKey` a required field: a module that has not introduced itself
 * does not compile. These eleven have no shared config to hang a required
 * field on — Mission Control, the Website Builder, Deep Research and the
 * rest are each their own component with their own props — so the
 * equivalent guarantee has to be a registry plus a check, and this is the
 * registry. scripts/tests/empty-states.test.mjs reads it, resolves every
 * key it names in all ten locales, and greps every file it names to prove
 * the component really renders those keys rather than the registry merely
 * claiming it does.
 *
 * THE PART WORTH READING TWICE: `interactive`.
 *
 * A worked example is only worth pressing if pressing it puts the text
 * somewhere. On a module page it always does — there is a create form on
 * the page with a headline field. Here it depends, and getting it wrong
 * in either direction is a real defect:
 *
 *   - No button where one would work is a page that teaches by telling
 *     instead of by doing.
 *   - A button where nothing can receive the text is worse. It is an
 *     affordance that lies: the user presses "Invite Maria to the team"
 *     and the page does nothing, because inviting somebody is an email
 *     and a role, not a sentence typed into a box that is not there.
 *
 * So each entry declares which it is, and WHY, and the check enforces
 * both directions — a non-interactive surface that starts passing
 * onExample fails, exactly as an interactive one that stops passing it
 * does. The reason is stored next to the flag rather than in a commit
 * message, because the next person to look at Favourites and think "this
 * should have a button too" needs the answer where they are looking.
 */
export type ListEmptyState = {
  /** Stable id — also the name the check prints. */
  id: string;
  /** The component that renders it, repo-relative. */
  file: string;
  /**
   * Full dotted key prefix. `${keyPrefix}.title` and `${keyPrefix}.why`
   * always exist; `${keyPrefix}.example` exists iff `interactive`.
   */
  keyPrefix: string;
  /** Does pressing the example put its text into a field on THIS page? */
  interactive: boolean;
  /** Interactive only: the field the example lands in. */
  fills?: string;
  /** Non-interactive only: why there is no button. */
  whyNot?: string;
  /**
   * A SHELL LANDING RATHER THAN AN `<EmptyState>` — added 2026-10-31
   * (Agents Κομμάτι 1).
   *
   * This surface's empty screen is not an `<EmptyState>` of its own: it is
   * ToolShell's landing (components/shell/tool-shell.tsx) — the small
   * globe, the heading, one sentence under it, and up to three pressable
   * examples that send straight through the shell's one field. Such a
   * component passes `empty={{ heading, why, examples }}` to the shell
   * instead of rendering `<EmptyState onExample>`, so the two greps that
   * look for those two literals cannot see it. scripts/tests/empty-states.test.mjs
   * checks the equivalent pair instead, and the landing's own shape
   * (globe, one heading, at most three examples, never a second field) is
   * held by scripts/tests/tool-shell.test.mjs §1.
   *
   * `.title` and `.why` are still required and still checked. `.example`
   * is NOT: the examples are the shared AI chips from
   * lib/ai/example-prompts.ts, whose existence in all ten locales is held
   * by scripts/tests/example-prompts.test.mjs §3 — one registry per
   * string, rather than two lists of examples for one screen.
   */
  shell?: true;
};

export const LIST_EMPTY_STATES: ListEmptyState[] = [
  // ---------------------------------------------------------------
  // Interactive — there is a field on the page and the example fills it.
  // ---------------------------------------------------------------
  {
    id: "mission",
    file: "src/components/mission/mission-list.tsx",
    keyPrefix: "dashboard.mission.empty",
    interactive: true,
    fills:
      "MissionForm's goal field — the form is already on the page, collapsed",
  },
  {
    id: "websiteBuilder",
    file: "src/components/website-builder/website-builder-workspace.tsx",
    keyPrefix: "dashboard.websiteBuilder.empty",
    interactive: true,
    fills: "the new-project form's description field, opening the form",
  },
  {
    id: "agents",
    file: "src/components/agents/agents-shell.tsx",
    keyPrefix: "dashboard.agents.empty",
    interactive: true,
    shell: true,
    fills: "the tool shell's one field, through ToolShell's own empty landing — sending it puts the request on the table, which starts the free template search before anything is priced",
  },
  {
    id: "deepResearch",
    file: "src/components/research/research-workspace.tsx",
    keyPrefix: "dashboard.deepResearch.empty",
    interactive: true,
    fills: "the topic textarea at the top of the page",
  },
  {
    id: "documents",
    file: "src/components/documents/documents-list.tsx",
    keyPrefix: "dashboard.documents.empty",
    interactive: true,
    // The one that needed a real change rather than a wire: POST
    // /api/documents took no body and always created "Untitled". It
    // accepts a title now, so the example opens the editor on a document
    // that is already named — which is the whole point of the example.
    fills: "the title of the document it creates, then opens the editor on it",
  },

  // ---------------------------------------------------------------
  // Not interactive — and the reason, per surface.
  // ---------------------------------------------------------------
  {
    id: "memory",
    file: "src/components/memory/memory-search.tsx",
    keyPrefix: "dashboard.memory.empty",
    interactive: false,
    // Worth being precise about, because this one LOOKS interactive:
    // there is a text input right above the empty state. It is a SEARCH
    // box over every module's rows, and this state means nothing has been
    // logged anywhere — so a button that typed into it would search an
    // empty set and find nothing, every time, by construction. The next
    // step is logging something on another page.
    //
    // The NAME is the trap here, and it caught me while writing this
    // module's own copy: "AI Memory" reads as "what the AI remembers
    // about me", and the first version of the empty state said memories
    // were written by Chat. They are not — dashboard/memory/page.tsx
    // reads CLASSIFIER_MODULES and BUILD_MODULES and no conversation is
    // involved at any point. help.memory.doesNot now says so out loud.
    whyNot:
      "the only input is a search box, and this state means there is nothing to search",
  },
  {
    id: "team",
    file: "src/components/team/team-members-list.tsx",
    keyPrefix: "dashboard.team.empty",
    interactive: false,
    whyNot: "inviting somebody is an email address and a role, not a sentence",
  },
  {
    id: "favorites",
    file: "src/components/favorites/favorites-list.tsx",
    keyPrefix: "dashboard.favorites.empty",
    interactive: false,
    whyNot:
      "a favourite is made by pressing the star on an item, on another page",
  },
  {
    id: "publishing",
    file: "src/components/publishing/published-sites-list.tsx",
    keyPrefix: "dashboard.publishing.empty",
    interactive: false,
    whyNot:
      "publishing happens in the Website Builder, on a site that already exists",
  },
  {
    id: "timeline",
    file: "src/components/timeline/timeline-list.tsx",
    keyPrefix: "dashboard.timeline.empty",
    interactive: false,
    whyNot: "a log is written by working, never typed into",
  },
  {
    id: "marketplace",
    // The empty state moved with the page: it now lives in the browser
    // component, which is the thing that knows whether the library came
    // back empty. The page itself only fetches.
    file: "src/components/marketplace/template-browser.tsx",
    keyPrefix: "dashboard.marketplace.empty",
    interactive: false,
    // The page is real now — it lists the agent_templates library and runs
    // one — so the old reason ("the feature is not built") is gone. This
    // state appears only when there are genuinely no templates, and the one
    // action that fills it is on ANOTHER screen: sharing takes a working
    // agent you already have. A pressable example here would either build
    // an agent nobody asked for or navigate away pretending to be an
    // example.
    whyNot:
      "the action that fills it lives on the Agents screen — sharing needs an agent that already works",
  },
];

export function listEmptyStateKey(
  entry: ListEmptyState,
  part: "title" | "why" | "example",
): string {
  return `${entry.keyPrefix}.${part}`;
}
