#!/usr/bin/env node
/*
 * CAN landmarks.test.mjs SEE THE PAGE LOSE ITS ONE LANDMARK?
 *
 * WHO THIS IS FOR. A screen-reader user navigates by landmark: "jump to
 * main" is how you skip the sidebar, the top bar and the credit counter
 * on every single page load. Two <main> elements are not twice as good,
 * they are a menu with two identical entries; zero is a product where the
 * only way to reach the content is to arrow through the navigation every
 * time. Neither shows up in a screenshot, which is why it needs a gate.
 *
 * Eight mutants, each a real way this regresses:
 *
 *   1. the layout's landmark becomes a <div> — the whole product loses it
 *   2. it keeps the element and loses the id, so the skip link's anchor
 *      points at nothing
 *   3. it moves to wrap the chrome, so "main" announces the sidebar
 *   4. a dashboard page reintroduces one, nesting it — invalid, and two
 *      landmarks where there should be one
 *   5. a shared component reintroduces one, which is how it came back the
 *      first time (four components each had one)
 *   6. a public page loses its own, which the fix must not have done
 *   7. the ALLOWED list keeps an entry that no longer holds a landmark —
 *      a stale excuse, which the gate checks in both directions
 *   8. the gate's own detector stops matching, which would make every
 *      check above pass over nothing
 *
 * Run: node scripts/tests/landmarks.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/landmarks.test.mjs";
const LAYOUT = "src/app/dashboard/layout.tsx";
const SKELETON = "src/components/dashboard/route-skeleton.tsx";
const LEGAL = "src/components/legal/legal-layout.tsx";
const CONTACT = "src/app/contact/page.tsx";

// Top-level declaration, under the name the reader looks for — see the
// SHAPE note in scripts/tests/lib/mutation-runner.mjs.
const MUTANTS = [
  {
    name: "the dashboard layout's landmark becomes a plain div",
    file: LAYOUT,
    from: '<main id="main-content" className="flex-1">',
    to: '<div id="main-content" className="flex-1">',
    expect: "the layout renders a <main>",
  },
  {
    name: "the landmark keeps its element and loses the id the skip link targets",
    file: LAYOUT,
    from: '<main id="main-content" className="flex-1">',
    to: '<main className="flex-1">',
    expect: "an id a skip link can target",
  },
  {
    name: "the landmark moves outward and starts announcing the chrome as content",
    file: LAYOUT,
    from: '<main id="main-content" className="flex-1">',
    to: '<main id="main-content" className="flex-1"><nav aria-label="stray" />',
    expect: "wrapping the page body, not the sidebar or the top bar",
  },
  {
    name: "a shared component reintroduces one, nesting inside the layout's",
    file: SKELETON,
    from: "return (",
    to: 'return (\n    <main aria-label="reintroduced" />\n  ) || (',
    expect: "no longer renders its own",
  },
  {
    name: "the legal layout loses the landmark the ALLOWED list says it holds",
    file: LEGAL,
    from: '<main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6">',
    to: '<div className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6">',
    expect: "no entry that no longer holds one",
  },
  {
    name: "the gate's detector stops matching, so every count above becomes zero",
    file: GATE,
    from: 'const mains = (src) => (stripped(src).match(/<main[\\s>]/g) ?? []).length;',
    to: "const mains = () => 0;",
    expect: "some component does render a landmark",
  },
  {
    name: "the dashboard walk finds nothing, making the whole section vacuous",
    file: GATE,
    from: '  const dashFiles = walk("src/app/dashboard");',
    to: "  const dashFiles = [];",
    expect: "the dashboard tree was scanned",
  },
  {
    name: "the component walk finds nothing, so 'no component renders one' is free",
    file: GATE,
    from: '  const allShared = walk("src/components");',
    to: "  const allShared = [];",
    expect: "the component tree was walked",
  },
];

runMutations({
  name: "landmarks",
  gate: GATE,
  targets: [GATE, LAYOUT, SKELETON, LEGAL, CONTACT],
  mutants: MUTANTS,
});
