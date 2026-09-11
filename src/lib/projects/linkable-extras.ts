/**
 * FIVE THINGS A PROJECT HOLDS THAT NO TRACKER OWNS.
 *
 * Redesign phase 2. docs/projects.md named the gap: files, conversations
 * and missions are what a project is actually FOR, and none of the three
 * was linkable — LINKABLE_MODULES was the thirteen classifier trackers
 * plus the build trackers, and a project could hold none of the work the
 * person came to do. Presentations and posts joined the list of absentees
 * later: presentations LEFT build-modules.ts in V5 #21 when it stopped
 * being a tracker and started generating, and posts never had a tracker
 * at all.
 *
 * WHY A THIRD REGISTRY AND NOT FIVE MORE BUILD_MODULES ENTRIES. Those two
 * registries mean something: CLASSIFIER_MODULES is "a table of typed
 * fields route_entry can file a sentence into", BUILD_MODULES is "a table
 * of rows the user types by hand", and scripts/tests/sidebar-naming.test.mjs
 * proves the second claim mechanically for every slug in it. A
 * conversation is neither. Putting it in either list would make the
 * "Link to…" picker work and would make three gates start describing
 * chat as a tracker somebody types rows into.
 *
 * So these are LINK-ONLY: enough for entity_links to resolve a headline
 * and draw a row, and nothing that claims they are trackers. `fields` is
 * empty and stays empty — a GenericAddForm over a conversation is not a
 * thing.
 */
import type { LinkableModule } from "@/lib/modules";

export const LINK_ONLY_MODULES: LinkableModule[] = [
  {
    slug: "files",
    titleKey: "sidebar.items.files",
    table: "user_files",
    // As the person named it — user_files.filename, sanitised for display
    // where it is written, never used to build a storage path.
    headlineKey: "filename",
    fields: [],
  },
  {
    slug: "conversations",
    titleKey: "sidebar.items.chat",
    table: "chat_conversations",
    headlineKey: "title",
    fields: [],
  },
  {
    slug: "missions",
    titleKey: "sidebar.items.missionControl",
    table: "ai_missions",
    // A mission has no name, only the goal it was created from, which is
    // what Mission Control shows at the top of it.
    headlineKey: "goal",
    fields: [],
  },
  {
    // A SIXTH, BEYOND THE FIVE THAT WERE ASKED FOR, and named as such.
    // The project page has an Agents section; without this entry that
    // section could only ever be empty, which is the "a row that promises
    // and does not deliver" shape this repository spent two rounds
    // removing from the sidebar. An agent is the same kind of thing as
    // the other five: work a project is FOR, owned by no tracker.
    slug: "agents",
    titleKey: "sidebar.items.agents",
    table: "user_agents",
    headlineKey: "name",
    fields: [],
  },
  {
    slug: "presentations",
    titleKey: "sidebar.items.presentations",
    table: "ai_presentations",
    headlineKey: "title",
    fields: [],
  },
  {
    slug: "posts",
    titleKey: "sidebar.items.posts",
    table: "generated_posts",
    // The brief the set was written from. There is no title on a set of
    // posts and inventing one for the picker would be a second name.
    headlineKey: "description",
    fields: [],
  },
];
