/**
 * A production build, a signed-in browser, and a Supabase that answers.
 *
 * Every *.prodtest.mjs in this repo opens the same way: stand up a fake
 * Supabase, mint a JWT-shaped session cookie, run a real `next build` with
 * the stand-in's URL inlined, `next start` it, and drive it with Playwright.
 * That preamble was copied into each file, which is survivable while it is
 * identical and expensive the moment one copy needs to differ — and one
 * did, because a layout test is worthless against the empty account every
 * copy hardcodes.
 *
 * So the preamble lives here once, with the one thing that actually varies
 * — WHAT THE DATABASE RETURNS — passed in.
 *
 * The existing eight prodtests are deliberately NOT migrated onto this in
 * the same change that introduces it: they pass today, and rewriting eight
 * working harnesses to prove a ninth is how a green suite turns red for
 * reasons that have nothing to do with the product.
 */
import http from "node:http";
import { spawn } from "node:child_process";

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};

export { USER };

/**
 * @param {object} options
 * @param {Record<string, object[]>} options.tableRows  table name -> rows the
 *   stand-in PostgREST returns. Any table not named answers with [].
 * @param {number} [options.supaPort]  must be unique per concurrently-running
 *   harness; the value is inlined into the build, so it cannot be dynamic.
 */
export async function startProdHarness({ tableRows = {}, supaPort = 54331 } = {}) {
  // --- the stand-in Supabase project ----------------------------------
  const supa = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const json = (code, data) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/auth/v1/user") return json(200, USER);
      if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
      if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.slice("/rest/v1/".length);
        const rows = tableRows[table] ?? [];
        // PostgREST returns a bare object (not an array) for .single().
        const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
        return json(200, rows);
      }
      json(200, {});
    });
  });

  // A FIXED port, because NEXT_PUBLIC_* values are inlined into the server
  // and middleware bundles by `next build` — they are not read at start
  // time. The build below has to bake in the same URL this server listens
  // on, which is also why this builds rather than reusing an existing
  // .next: a build made against the real project would send middleware's
  // getUser() to the real Supabase.
  await new Promise((r) => supa.listen(supaPort, "127.0.0.1", r));
  const SUPA_URL = `http://127.0.0.1:${supaPort}`;

  // supabase-js derives the cookie name from the URL's first hostname
  // label (`sb-${hostname.split(".")[0]}-auth-token`), so for 127.0.0.1
  // that is literally "127".
  const PROJECT_REF = "127";
  // Well-formed JWTs. supabase-js parses the access token locally to read
  // its expiry before it will call the server with it, so an opaque string
  // makes it drop the session and report "not logged in" with no network
  // call at all. The signature is never checked here — getUser() always
  // verifies against the auth server, which is the stand-in above.
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const nowSec = Math.floor(Date.now() / 1000);
  const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
  const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
  const SERVICE_KEY = jwt({
    iss: "supabase",
    ref: PROJECT_REF,
    role: "service_role",
    iat: 1,
    exp: 2000000000,
  });
  const session = {
    access_token: jwt({
      sub: USER.id,
      aud: "authenticated",
      role: "authenticated",
      email: USER.email,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: nowSec + 3600,
    refresh_token: "test-refresh-token",
    user: USER,
  };
  const AUTH_COOKIE = {
    name: `sb-${PROJECT_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
  };

  // --- the production server -------------------------------------------
  // Claim a free port by binding one and releasing it, rather than
  // hardcoding: a leftover `next start` from an earlier run silently holds
  // the port and serves its OWN, older build, which looks exactly like the
  // app being broken.
  const PORT = await new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  };

  // Values already present in process.env win over .env.local (@next/env
  // never overrides an inherited variable), so the stand-in URL and keys
  // above are what get inlined.
  console.log("running `next build` (production build, not a dev server) ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  const buildCode = await new Promise((r) => build.on("close", r));
  if (buildCode !== 0) {
    supa.close();
    throw new Error("next build failed\n" + buildLog.slice(-3000));
  }
  console.log("build ok — starting `next start`");

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  const cleanup = () => {
    try {
      server.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    supa.close();
  };

  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      up = r.ok;
    } catch {
      /* not up yet */
    }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up || /EADDRINUSE|Failed to start server/.test(serverLog)) {
    cleanup();
    throw new Error("production server did not start\n" + serverLog.slice(-2000));
  }
  console.log(`production server up on :${PORT} (next start, NODE_ENV=production)`);

  const origin = `http://127.0.0.1:${PORT}`;
  return {
    PORT,
    origin,
    AUTH_COOKIE,
    cleanup,
    /** A Playwright context already carrying the session cookie. */
    async signedIn(browser, viewport = { width: 1280, height: 900 }) {
      const context = await browser.newContext({ viewport });
      await context.addCookies([
        {
          ...AUTH_COOKIE,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      return context;
    },
  };
}
