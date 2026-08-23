// A stand-in Supabase project: GoTrue's /auth/v1/user plus PostgREST reads.
//
// Shared by the PWA audit and the PWA asset generator, which both need a
// signed-in app on a real production build. It lives here rather than
// being copied into each because the two must agree on the cookie shape —
// @supabase/ssr derives the cookie name from the URL's first hostname
// label, so a generator that got that wrong would silently screenshot the
// login page instead of the dashboard.
import http from "node:http";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;

export const MOCK_USER = {
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

/**
 * Starts the stand-in on a FIXED port.
 *
 * Fixed, because `next build` INLINES every NEXT_PUBLIC_* value into the
 * server and middleware bundles — they are not read at start time, so the
 * URL baked into the build has to be the one this listens on.
 */
export async function startMockSupabase({ port = 54341, tableRows = {} } = {}) {
  const rowsFor = {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 500, credits_total: 500 }],
    // Without this row dashboard/overview redirects to /onboarding, and
    // anything asserted (or screenshotted) afterwards is the wrong screen.
    user_onboarding: [{ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
    ...tableRows,
  };

  const hits = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push(`${req.method} ${req.url}`);
      const url = new URL(req.url, "http://x");
      const json = (code, data) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/auth/v1/user") return json(200, MOCK_USER);
      if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: MOCK_USER, session: null });
      if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.slice("/rest/v1/".length).split("?")[0];
        const rows = rowsFor[table] ?? [];
        // Counts come back in a HEADER. supabase-js reports count:null when
        // Content-Range is absent, and pages read that as a degraded
        // session — so omitting it does not answer less, it answers wrong.
        if ((req.headers.prefer ?? "").includes("count=")) {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`,
          });
          return res.end(JSON.stringify(req.method === "HEAD" ? null : rows));
        }
        const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
        return json(200, rows);
      }
      json(200, {});
    });
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));

  // supabase-js derives the cookie name from the URL's first hostname
  // label (`sb-${hostname.split(".")[0]}`), so for 127.0.0.1 that is "127".
  const projectRef = "127";
  const nowSec = Math.floor(Date.now() / 1000);
  // Well-formed JWTs: supabase-js parses the access token locally to read
  // its expiry BEFORE it will call the server, so an opaque string makes it
  // drop the session and report "not logged in" with no network call.
  const anonKey = jwt({ iss: "supabase", ref: projectRef, role: "anon", iat: 1, exp: 2000000000 });
  const serviceKey = jwt({ iss: "supabase", ref: projectRef, role: "service_role", iat: 1, exp: 2000000000 });
  const session = {
    access_token: jwt({
      sub: MOCK_USER.id,
      aud: "authenticated",
      role: "authenticated",
      email: MOCK_USER.email,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: nowSec + 3600,
    refresh_token: "test-refresh-token",
    user: MOCK_USER,
  };

  return {
    url: `http://127.0.0.1:${port}`,
    anonKey,
    serviceKey,
    hits,
    authCookie: {
      name: `sb-${projectRef}-auth-token`,
      value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    },
    close: () => server.close(),
  };
}
