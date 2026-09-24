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

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Inlined at build time — see commitDate() above. The DATE is the
  // commit's; BUILD_AT is when the build ran, and the two differ by
  // exactly the staleness this is here to report.
  env: {
    NEXT_PUBLIC_BUILD_COMMIT_DATE: BUILD_COMMIT_DATE,
    NEXT_PUBLIC_BUILD_AT: new Date().toISOString(),
  },
  experimental: {
    // Enables src/instrumentation.ts, which reports the environment once
    // at server startup (see lib/env-check.ts). Next 14 requires the flag;
    // it becomes the default in 15.
    instrumentationHook: true,
    // Next 14.2's client Router Cache defaults dynamic-route entries to a
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
    // THE FONTS ARE DATA, NOT IMPORTS. Nothing in the code `import`s a .ttf —
    // registerPdfFonts() reads them from disk by path — so Next's file
    // tracing sees no reference and ships none of them. Without this entry
    // every PDF route throws on the first request in production and works
    // perfectly in development, which is the worst shape a deployment bug
    // can have.
    //
    // UNDER `experimental`, because this is Next 14.2. At the top level the
    // key is silently ignored with only a build warning — which is the same
    // bug as having no entry at all, wearing a green build.
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
  },
};

export default withNextIntl(nextConfig);
