/**
 * THE LANDING FOOTER, AS DATA.
 *
 * It was five hand-written <Link> blocks in app/page.tsx with
 * hand-written middots between them. Adding /acceptable-use,
 * /ai-transparency and /contact would have made eight of each — sixteen
 * blocks in which one wrong href, or one separator missing its
 * `hidden sm:inline`, is invisible in review.
 *
 * ------------------------------------------------------------------
 * WHY IT IS A MODULE AND NOT A CONST IN THE PAGE
 * ------------------------------------------------------------------
 *
 * Two reasons, and the first one is a compiler error rather than an
 * opinion: a file under app/ may export only the names Next reserves —
 * `default`, `metadata`, `generateMetadata`, `dynamic` and the rest — and
 * exporting anything else fails the build with "Property 'FOOTER_LINKS'
 * is incompatible with index signature". So a table the page owns cannot
 * also be a table a test can import.
 *
 * The second is the point of the table. scripts/tests/legal-pages.test.mjs
 * reads THIS list and asserts, for every entry, that the route exists on
 * disk and that its label exists in all ten locales. A gate that greps
 * JSX for href strings can only check the links somebody remembered to
 * write in the regex — and the three pages this list just gained sat
 * finished-but-unmerged on a branch for four weeks precisely because
 * nothing anywhere said they were missing.
 *
 * `labelKey` is relative to the `landing` namespace, which is what the
 * page's getTranslations("landing") is scoped to. The same keys name the
 * legal pages' own headings through LegalLayout's `titleKey`, so the link
 * you click and the heading you land on cannot drift apart.
 */
export type FooterLink = {
  /** App-router path, exactly as the <Link> renders it. */
  href: string;
  /** Dotted key inside the `landing` namespace. */
  labelKey: string;
};

export const FOOTER_LINKS: readonly FooterLink[] = [
  { href: "/pricing", labelKey: "footer.pricing" },
  { href: "/roadmap", labelKey: "footer.roadmap" },
  { href: "/terms", labelKey: "footer.terms" },
  { href: "/privacy", labelKey: "footer.privacy" },
  { href: "/cookies", labelKey: "footer.cookies" },
  { href: "/acceptable-use", labelKey: "footer.acceptableUse" },
  { href: "/ai-transparency", labelKey: "footer.aiTransparency" },
  { href: "/contact", labelKey: "footer.contact" },
];

/**
 * The subset a SIGNED-IN user needs, rendered on the settings page.
 *
 * Pricing and the roadmap are marketing and are dropped; what is left is
 * the set somebody with an account may actually need to find — the terms
 * they agreed to, what happens to their data, what the AI does, what the
 * rules are, and how to reach a person.
 *
 * DERIVED, NOT RETYPED. A second hand-kept list is exactly how the
 * landing footer ended up carrying pages the rest of the app did not
 * link to at all.
 */
const IN_APP_HREFS: readonly string[] = [
  "/terms",
  "/privacy",
  "/cookies",
  "/acceptable-use",
  "/ai-transparency",
  "/contact",
];

export const LEGAL_AND_SUPPORT_LINKS: readonly FooterLink[] = IN_APP_HREFS.map((href) => {
  const link = FOOTER_LINKS.find((l) => l.href === href);
  // Not a silent filter. An href here with no entry in FOOTER_LINKS means
  // the two lists have diverged, and a quietly shorter settings block is
  // precisely the failure this file exists to prevent — so it is a build
  // -time throw rather than a missing link nobody notices.
  if (!link) throw new Error(`LEGAL_AND_SUPPORT_LINKS: ${href} is not in FOOTER_LINKS`);
  return link;
});
