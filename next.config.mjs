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
 * EVERY PATH BUT /s/ AND /a/. Published sites (/s/) and published
 * Rebuild apps (/a/, Κομμάτι 4's third piece) each set their own,
 * stricter set — sandboxed CSP, frame-ancestors 'none' — in
 * src/lib/publishing/public-serving.ts, and two sources for one header is
 * how a weaker value wins: this blanket rule's own CSP has no script-src,
 * so applying it on top silently stripped the published-app CSP down to
 * just frame-ancestors, found by rebuild.prodtest.mjs's own live fetch of
 * /a/<subdomain> rather than by inspection. The app never frames itself:
 * every iframe in src/ renders `srcDoc`, which `frame-ancestors` does not
 * govern.
 *
 * The microphone stays allowed for the app's own origin: voice input
 * (src/components/voice/) asks for it.
 */
/**
 * WHERE AN IMAGE ON AN APP PAGE MAY COME FROM (img-src), AND WHY EACH ONE.
 *
 * THE RULE (ΑΣ2-3.1, 2026-10-31). A markdown image the model's own words
 * (or an echoed web-search result, or PDF text) can put in a chat answer
 * had no CSP stop at all — any `https:` origin would load, and the
 * request URL itself can carry data to whoever reads that host's logs.
 * So the list is closed: never a bare `https:`, never a `*`, only origins
 * whose request logs no attacker can read.
 *
 * THE PROJECT'S OWN SUPABASE ORIGIN (FD6, 2026-11-05). Every private
 * picture the app shows is a signed Storage address on it — Image's
 * pictures (lib/images/image-access.ts), a chat attachment's thumbnail
 * (lib/chat/attach-client.ts), a slide's own photo
 * (app/dashboard/presentations/page.tsx) — and a generated site's
 * reference photos are public Storage addresses on it
 * (lib/website-reference-image-server.ts). Without it every one of them
 * was blocked, for everybody. It is derived here, at build time, from the
 * same NEXT_PUBLIC_SUPABASE_URL every Supabase client reads
 * (lib/supabase/admin.ts, server.ts, client.ts), so the address the
 * pictures are signed on and the address the policy allows cannot
 * differ. The exfiltration argument above still holds for it: the only
 * one who can read that project's request logs is us.
 *
 * Built into the headers at BUILD time, like every NEXT_PUBLIC_* value
 * (Next writes headers() into routes-manifest.json), so a deployment
 * built with no Supabase address allows none.
 */
export const IMAGE_HOSTS = [
  // Unsplash's CDN. A slide's stock photo (lib/presentations/deck.ts,
  // parseSlideImage, refuses any other host) and every stock photo a
  // generated site shows (lib/website-image-placeholders.ts,
  // UNSPLASH_CDN_PREFIX) are hotlinked from it, as Unsplash's API terms
  // require (lib/unsplash.ts) — the app never re-hosts them. Nobody but
  // Unsplash reads its request logs.
  "https://images.unsplash.com",
];

// A local Supabase (`supabase start`) and the test stand-in
// (scripts/lib/mock-supabase.mjs) answer on plain http on this machine's
// own loopback. That is the one place http is taken: a request to the
// viewer's own machine reaches no one else, and a production build
// cannot have a loopback Supabase and work.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const DNS_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * The origin of NEXT_PUBLIC_SUPABASE_URL as an img-src source, or null.
 * https only (plus the loopback above); the host must be a plain DNS name
 * — the URL parser accepts `*` in a host, and `https://*.supabase.co`
 * would be a wildcard by another name. Only the origin is ever taken: a
 * path, a query or credentials in the variable never reach the policy.
 */
export function supabaseImageOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  if (url.protocol !== "https:" || !DNS_NAME.test(url.hostname)) return null;
  return url.origin;
}

/** The img-src sources, in order: the app, inline data, local blobs, the project's Supabase, IMAGE_HOSTS. */
export function imageSources(env = process.env) {
  const supabase = supabaseImageOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  return ["'self'", "data:", "blob:", ...(supabase ? [supabase] : []), ...IMAGE_HOSTS];
}

export const APP_SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  // img-src: see IMAGE_HOSTS above. 'self'/data:/blob: are same-origin
  // API images, inline base64, and local previews (client blob URLs,
  // never a network fetch). A chat answer is held tighter still by
  // message-content.tsx's own `img` guard, the matching defense-in-depth
  // layer: it lets through only the first three. An iframe drawn from
  // `srcDoc` (a site's preview) inherits this policy too.
  //
  // object-src and base-uri (hardening, 2026-11-05): no page of the app
  // draws an <object>, an <embed> or a <base> (searched across src/ on
  // that date), so both are closed outright. A generated site's own
  // <base> is already taken out before it is stored
  // (lib/website-link-safety.ts). script-src is not set here: that is a
  // larger change of its own.
  { key: "Content-Security-Policy", value: `frame-ancestors 'none'; img-src ${imageSources().join(" ")}; object-src 'none'; base-uri 'none'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

/**
 * THE PATH EXCLUSION ABOVE IS NOT ENOUGH ONCE SITES HAVE THEIR OWN
 * DOMAIN (SEC-C3b, ΑΣ-10.3; docs/NEEDS-FROM-ELIAS.md «Ασφάλεια
 * 2026-11-05»).
 *
 * `headers()` is matched against the ORIGINAL request path, before
 * src/proxy.ts rewrites it. On the app's own domain that is exactly
 * right: a visitor asks for /s/<name> and the path exclusion above
 * already skips it. On PUBLISHED_SITE_DOMAIN a site's own path is "/"
 * or "/services" — proxy.ts rewrites that to /s/<name>/... AFTER these
 * headers are already chosen — so the matcher above sees a path that
 * does not start with "s/" or "a/" and this blanket, narrow img-src
 * ('self' data: blob:) would apply on top of the published page's own,
 * wider CSP (lib/publishing/public-serving.ts, which allows the stock
 * photo host and the owner's uploads). Two sources for one header is how the
 * weaker one wins — the exact failure this file's own comment above
 * names for /a/ — and here it would be silent: the site stays up, its
 * photos just stop loading, on every one of them, the day the domain
 * goes live.
 *
 * So the content domain is excluded by HOST as well as by path. A
 * `missing` host condition is a regex, anchored full-match
 * (node_modules/next/dist/shared/lib/router/utils/prepare-destination.js,
 * matchHas: `new RegExp('^' + value + '$')`), so this matches the apex
 * AND every subdomain under it, and nothing else. Unset
 * (contentDomainHostPattern() returns null), the `missing` clause is
 * left out entirely and behaviour is byte-identical to before.
 *
 * Mirrors contentDomain() in src/lib/publishing/content-origin.ts,
 * covered there by scripts/tests/published-isolation.test.mjs — not
 * imported here because that is a .ts module and this file runs as
 * plain Node ESM with no transpile step. scripts/tests/published-
 * isolation.test.mjs §6 runs this exact function against the same
 * fixtures the .ts one uses, so the two cannot silently drift apart.
 */
export function contentDomainHostPattern(raw) {
  if (typeof raw !== "string") return null;
  const normalised = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalised) return null;
  if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalised)) return null;
  const escaped = normalised.replace(/[.]/g, "\\.");
  return `([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)*${escaped}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "x-powered-by: Next.js" tells a stranger which advisories to try.
  poweredByHeader: false,
  async headers() {
    const hostPattern = contentDomainHostPattern(process.env.PUBLISHED_SITE_DOMAIN);
    return [
      {
        source: "/((?!s/|a/).*)",
        ...(hostPattern ? { missing: [{ type: "host", value: hostPattern }] } : {}),
        headers: APP_SECURITY_HEADERS,
      },
    ];
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
