#!/usr/bin/env node
/*
 * DOES github-user-isolation.test.mjs SEE ONE IONEXA USER ACTING THROUGH
 * ANOTHER'S GITHUB REACH?
 *
 * The isolation that was missing until 2026-11-05 (SECURITY-AUDIT ΑΣ-1.15)
 * was between GitHub identities, not Ionexa rows: two accounts in one
 * organisation shared its installation. These mutants are the ways that
 * comes back — a user or a token taken from the request, a stored
 * installation, a shared token — plus one route the old hand-picked list
 * never covered.
 *
 * Run: node scripts/tests/github-user-isolation.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/github-user-isolation.test.mjs";
const BRANCHES = "src/app/api/github/branches/route.ts";
const FILES = "src/app/api/github/files/route.ts";
const DISCONNECT = "src/app/api/github/disconnect/route.ts";
const CALLBACK = "src/app/api/github/callback/route.ts";
const STORE = "src/lib/github/store.ts";
const ACCESS = "src/lib/github/access.ts";

const MUTANTS = [
  {
    name: "branches acts for a user named in the query string",
    file: BRANCHES,
    from: "  const access = await authorizeRepoOperation(user.id, url.searchParams.get(\"repo\"), \"branches\");",
    to: "  const access = await authorizeRepoOperation(url.searchParams.get(\"userId\") ?? user.id, url.searchParams.get(\"repo\"), \"branches\");",
    expect: "branches: takes no user or token from the request",
  },
  {
    name: "files acts for a user named in the body",
    file: FILES,
    from: "  const access = await authorizeRepoOperation(user.id, body.repo, \"files\");",
    to: "  const access = await authorizeRepoOperation((body as { as?: string }).as ?? user.id, body.repo, \"files\");",
    expect: "files: authorizes as user.id from the session",
  },
  {
    name: "disconnect trusts an unverified session (a route the old list never named)",
    file: DISCONNECT,
    from: "    } = await supabase.auth.getUser();",
    to: "    } = await supabase.auth.getSession().then((r) => ({ data: { user: r.data.session?.user ?? null } }));",
    expect: "disconnect route checks supabase user",
  },
  {
    name: "the callback stores an installation again",
    file: CALLBACK,
    from: "      accessToken: tokenBody.access_token,\n    });",
    to: "      accessToken: tokenBody.access_token,\n      installationId: null,\n    });",
    expect: "the callback stores no installation",
  },
  {
    name: "the store keeps the installation it is given",
    file: STORE,
    from: "      installation_id: null,",
    to: "      installation_id: (params as { installationId?: number }).installationId ?? null,",
    expect: "the store clears installation_id on every (re)connect",
  },
  {
    name: "the token comes back with the stored installation",
    file: STORE,
    from: "    return { ok: true, token };",
    to: "    return { ok: true, token, installationId: row.installation_id };",
    expect: "getGitHubAccessToken returns the token alone",
  },
  {
    name: "the picker lists with one shared token",
    file: ACCESS,
    from: "  const result = await listVisibleRepos(token.token);",
    to: "  const result = await listVisibleRepos(process.env.GITHUB_SHARED_TOKEN ?? token.token);",
    expect: "...and decides with that token, never an installation stored for anyone",
  },
];

runMutations({
  name: "github-user-isolation",
  gate: GATE,
  targets: [BRANCHES, FILES, DISCONNECT, CALLBACK, STORE, ACCESS],
  mutants: MUTANTS,
});
