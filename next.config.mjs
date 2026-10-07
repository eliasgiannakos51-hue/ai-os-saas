import { execFileSync } from "node:child_process";

/**
 * WHEN THE CODE IN THIS BUILD WAS WRITTEN, baked in as a literal.
 *
 * WHY IT HAS TO BE BAKED. A deployed bundle has no git and no repository:
 * asked at runtime, "how old is this deployment" has no answer, so it has
 * to be answered at the only moment anything knows — here.
 *
 * THE FAILURE THIS EXISTS FOR, measured by the owner on 2026-09-25: the
 * production deployment was FORTY DAYS behind main. Every gate was green,
 * every commit was pushed, /api/health said the schema was fine — and the
 * thing serving customers was from another month. A redeploy without the
 * build cache fixed it. Nothing anywhere would have said so.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA but no commit DATE, so git is asked
 * first and the build time is the fallback. The fallback is honest rather
 * than convenient: it says when the BUILD ran, which on a cached build is
 * still newer than the code, so the age it reports is a LOWER bound. An
 * over-estimate of freshness would be the wrong direction to fail in, and
 * /api/health says which of the two it has.
 */
function commitDate() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cI"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const BUILD_COMMIT_DATE = commitDate();

import createNextIntlPlugin from "next-intl/plugin";
import { malformedEnvVars } from "./scripts/lib/env-shape-rules.mjs";
import { envVarsInExample } from "./scripts/lib/env-usage.mjs";

/**
 * A VALUE THAT CANNOT BE WHAT ITS NAME SAYS, REFUSED HERE AND NAMED.
 *
 * THE FAILURE THIS REPLACES, observed on this repository's own first
 * `build:ci` run: NEXT_PUBLIC_SUPABASE_URL held a value that was not a
 * URL, 252 gates passed, and `next build` died with
 *
 *     TypeError: Invalid URL
 *     Error: Failed to collect page data for /_not-found
 *
 * — which names neither the variable nor the file. The shape rules that
 * fixed the sentinel for that run are in scripts/lib/env-shape-rules.mjs
 * and this is their second reader.
 *
 * TWO CLASSES, AND THE SPLIT IS DELIBERATE.
 *
 *   NEXT_PUBLIC_* is BAKED INTO THE BUNDLE. The build reads it by
 *   definition, so a malformed one is a broken deployment with
 *   certainty, and refusing it here can only turn a failure that was
 *   going to happen into one that says which variable it is. Fatal.
 *
 *   Everything else is read by routes at runtime, and the build may
 *   never touch it. Refusing one here would be a NEW way for a deploy
 *   to go red over a variable the build does not use — which, on the
 *   day sixteen red deploys were traced to a missing .git, is the last
 *   thing to add on a guess about values nobody here can see. Reported,
 *   loudly and by name, and not fatal.
 *
 * To make the second class fatal too, move the name into the fatal
 * filter below; scripts/tests/env-shape.test.mjs holds both halves.
 */
function refuseMalformedEnv() {
  // THE PROJECT'S OWN NAMES, NOT THE MACHINE'S. The first version read
  // every variable in process.env and immediately reported
  // CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST — a container variable ending
  // in _HOST that holds a boolean and belongs to nothing here. A rule
  // about what a name in THIS repository promises has to range over the
  // names this repository declares, which lib/env-usage.mjs collects
  // from .env.local.example and from every process.env read in src/.
  const names = [...envVarsInExample()];
  const bad = malformedEnvVars(process.env, names);
  if (bad.length === 0) return;
  const fatal = bad.filter((b) => b.name.startsWith("NEXT_PUBLIC_"));
  const warn = bad.filter((b) => !b.name.startsWith("NEXT_PUBLIC_"));
  for (const b of warn) {
    console.warn(`  env WARNING (not failing): ${b.name} ${b.why}`);
  }
  if (warn.length > 0) {
    console.warn(`  ${warn.length} variable(s) hold a value their name says is impossible. Runtime reads them, this build does not.`);
  }
  if (fatal.length > 0) {
    throw new Error(
      "This build cannot produce a working bundle:\n" +
        fatal.map((b) => `  ${b.name} ${b.why}`).join("\n") +
        "\n  NEXT_PUBLIC_* is baked into the bundle, so this would have failed later without naming the variable." +
        "\n  Set it in the deployment's environment, or unset it — an absent variable is a different, handled condition."
    );
  }
}
refuseMalformedEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * THE APP'S OWN SECURITY HEADERS (BUILD-SPECS 6, Α8; 2026-10-05).
 *
 * Measured on production the same day: the only security header the app
 * sent was the HSTS Vercel adds itself. Every page could be framed by any
 * site, and nothing told a browser not to guess content types.
 *
 * EVERY PATH BUT /s/. Published sites set their own, stricter set —
 * sandboxed CSP, frame-ancestors 'none' — in
 * src/lib/publishing/public-serving.ts, and two sources for one header is
 * how a weaker value wins. The app never frames itself: every iframe in
 * src/ renders `srcDoc`, which `frame-ancestors` does not govern.
 *
 * The microphone stays allowed for the app's own origin: voice input
 * (src/components/voice/) asks for it.
 */
export const APP_SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "x-powered-by: Next.js" tells a stranger which advisories to try.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/((?!s/).*)", headers: APP_SECURITY_HEADERS }];
  },
  // Inlined at build time — see commitDate() above. The DATE is the
  // commit's; BUILD_AT is when the build ran, and the two differ by
  // exactly the staleness this is here to report.
  env: {
    NEXT_PUBLIC_BUILD_COMMIT_DATE: BUILD_COMMIT_DATE,
    NEXT_PUBLIC_BUILD_AT: new Date().toISOString(),
  },
  // THE FONTS ARE DATA, NOT IMPORTS. Nothing in the code `import`s a .ttf —
  // registerPdfFonts() reads them from disk by path — so Next's file
  // tracing sees no reference and ships none of them. Without this entry
  // every PDF route throws on the first request in production and works
  // perfectly in development, which is the worst shape a deployment bug
  // can have.
  //
  // AT THE TOP LEVEL since Next 15 (this was under `experimental` on 14.2).
  // In the wrong place the key is ignored with only a build warning — the
  // same bug as having no entry at all, wearing a green build.
  outputFileTracingIncludes: {
    "/api/**": ["./src/lib/pdf/fonts/*.ttf"],
  },
  // AND WHAT MUST NEVER GO IN. registerPdfFonts reads its files through
  // `path.join(process.cwd(), ...)`, which Next's tracer cannot resolve
  // statically, so it falls back to including far more of the repository
  // than the route needs. Measured on the documents PDF route: 16.4 MB of
  // `.git/objects`, plus 1.4 MB screenshots from agent-shots/ and
  // files-shots/ — none of which any function reads, all of which would be
  // uploaded on every deploy.
  outputFileTracingExcludes: {
    "*": [
      "./.git/**",
      "./agent-shots/**",
      "./files-shots/**",
      "./scripts/**",
      "./supabase/**",
      "./.next/cache/**",
    ],
  },
  // src/instrumentation.ts (the environment report at startup, see
  // lib/env-check.ts) runs by default since Next 15; the 14.2 flag is gone.
  experimental: {
    // The client Router Cache (Next 14.2 onwards) defaults dynamic-route entries to a
    // 30s staleTime (node_modules/next/dist/server/config-shared.js) — this
    // is SEPARATE from the server-side Data/Full Route Cache that
    // `export const dynamic = "force-dynamic"` controls. Every dashboard
    // page reads live, per-user, frequently-mutated rows (missions,
    // timeline, credits, ...), so a soft navigation (sidebar <Link>,
    // browser back/forward) within 30s of the last visit to the same route
    // can serve a cached RSC payload from BEFORE a just-made change,
    // without ever re-hitting the server — this is what "created a
    // mission, refreshed a few times, it disappeared/reappeared" actually
    // was: not the mission vanishing, but the client replaying an old
    // snapshot. force-dynamic alone can't fix this because the client
    // never asks the server during that window. Setting this to 0 makes
    // every dynamic-route soft navigation refetch fresh, every time.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default withNextIntl(nextConfig);
