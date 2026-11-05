#!/usr/bin/env node
/*
 * CAN pwa.test.mjs SEE A SIGN-OUT THAT LEAVES THE ACCOUNT'S PAGES BEHIND?
 *
 * One mutant per way a session ends (2026-11-05 review, A6): the shared
 * helper without its cleanup, a door that calls Supabase's sign-out
 * directly, a door that does not sign out at all, and the listener for a
 * session that ends on its own.
 *
 * Run: node scripts/tests/pwa.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/pwa.test.mjs";
const LIB = "src/lib/auth/sign-out.ts";
const LOGOUT = "src/components/logout-button.tsx";
const RESET = "src/app/reset-password/reset-password-form.tsx";
const DELETE = "src/app/delete-account/confirm/confirm-delete-account-form.tsx";
const PROVIDER = "src/components/pwa/pwa-provider.tsx";

const MUTANTS = [
  {
    name: "the one sign-out keeps the cached pages",
    file: LIB,
    from: "  } finally {\n    await clearPrivatePwaCaches();\n  }",
    to: "  } finally {\n    void options;\n  }",
    expect: "the one sign-out throws away the cached (personalised) pages",
  },
  {
    name: "the password reset signs out around the helper",
    file: RESET,
    from: "      await signOutAndForget(supabase);",
    to: "      await supabase.auth.signOut();",
    expect: "...and every one of them is the one inside lib/auth/sign-out.ts",
  },
  {
    name: "the logout button signs out around the helper",
    file: LOGOUT,
    from: "    await signOutAndForget(supabase);",
    to: "    await supabase.auth.signOut();",
    expect: "...and every one of them is the one inside lib/auth/sign-out.ts",
  },
  {
    name: "a deleted account's browser keeps its session and its pages",
    file: DELETE,
    from: '      await signOutAndForget(createClient(), { scope: "local" }).catch(() => undefined);',
    to: "      void createClient;",
    expect: "src/app/delete-account/confirm/confirm-delete-account-form.tsx leaves through the one sign-out",
  },
  {
    name: "an expired session leaves the pages behind",
    file: LIB,
    from: '    if (event === "SIGNED_OUT") void clearPrivatePwaCaches();',
    to: '    if (event === "USER_UPDATED") void clearPrivatePwaCaches();',
    expect: "a session that ends on its own clears them too",
  },
  {
    name: "the listener is never mounted",
    file: PROVIDER,
    from: "  useEffect(() => forgetOnSignOut(createClient()), []);",
    to: "  useEffect(() => void forgetOnSignOut, []);",
    expect: "...and it is mounted beside the worker that fills the cache",
  },
];

runMutations({ name: "pwa", gate: GATE, targets: [LIB, LOGOUT, RESET, DELETE, PROVIDER], mutants: MUTANTS });
