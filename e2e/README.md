# The journeys, and the reported-bugs sweep

End-to-end specs that run against a **real deployment** with **real
Anthropic keys** and **spend real credits**. Nothing is mocked.

Besides the three journeys below, `reported-bugs.e2e.ts` carries **one
test per bug reported from real production testing** — the empty-state
example button, a real UI file upload into real storage, the chat scroll
contract, typing latency (measured), the agent build's visible steps +
delivery channels + counter honesty, the logo question, and TTFB/LCP per
route. Each failure message names the deployment-side remedy (which
repair SQL, which env var). Run it against production with:

```sh
E2E_BASE_URL=https://ai-os-saas-five.vercel.app \
E2E_ALLOW_PRODUCTION=1 \
E2E_EMAIL=... E2E_PASSWORD=... \
npm run test:e2e -- reported-bugs
```

It costs one agent build (~5 credits); everything else in it is reads,
one tiny text-file upload (deleted afterwards), and typing.

They exist because the rest of the suite cannot answer one question: *can
a person actually do the thing?* 76 unit files read source code and prove
the code says the right things; two database files prove Postgres does the
right things. None of them proves that a PDF uploaded through the real
route comes back as an answer with citations that point at real pages.

| Spec | Journey | What it proves that nothing else does |
|---|---|---|
| `files-ask.e2e.ts` | upload a PDF → ask → answer with citations | The extractor, the model call and `verifyCitations` agree. Zero citations were stripped, so nothing was invented. |
| `agent-run.e2e.ts` | build an agent → run now → output stored | Two separate AI actions, two separate settlements, and the run is written to the table the UI reads — not just returned. |
| `website-publish.e2e.ts` | generate → publish → open the live URL | A **logged-out** browser gets 200 and sees the generated content. "Published" means public. |

---

## α) Environment variables

| Variable | Required | What it is |
|---|---|---|
| `E2E_BASE_URL` | **yes** | The deployment under test, no trailing slash. `https://staging.ionexa.ai` |
| `E2E_EMAIL` | **yes** | A real account **on that deployment** |
| `E2E_PASSWORD` | **yes** | Its password |
| `E2E_ALLOW_PRODUCTION` | only to override | The run **refuses to start** if `E2E_BASE_URL` does not look like staging. Set to `1` to proceed anyway. |

Nothing else. The specs use no service-role key and mint no tokens — they
sign in through `/api/auth/login`, exactly as a person does. Every
server-side key (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `STRIPE_*`) belongs to the **deployment**, not to the
test runner.

Missing variables stop the run in the first second, by name, before
anything has been uploaded or paid for.

## β) Setting up the target

**Staging is a separate Supabase project and a separate deployment.** Not
a separate database on the same project — publishing writes to storage
and the published-site route reads it back, so they have to move together.

1. **Database.** Create the project, then build the schema from this
   repository — which is now possible in one pass:
   ```sh
   psql "$STAGING_DB_URL" -f scripts/db/bootstrap-supabase.sql   # skip on hosted Supabase: it provides these
   for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 "$STAGING_DB_URL" -f "$f"; done
   ```
2. **Deployment.** Point it at that project. It needs a real
   `ANTHROPIC_API_KEY` — these specs make real model calls and there is no
   way to have the journey without them.
3. **The account.** Sign up through the deployment's own `/signup`, then
   give it credits and a plan that allows agents:
   ```sql
   -- staging only. Growth is the lowest tier with maxAiAgents > 0.
   update public.user_credits
      set credits_remaining = 2000, credits_total = 2000, plan_tier = 'growth'
    where user_id = (select id from auth.users where email = 'e2e@your-domain.test');
   ```
4. **Published sites.** If `PUBLISHED_SITE_DOMAIN` is unset the live URL is
   path-based (`/s/<subdomain>`) and the spec still passes — see
   `lib/publishing/subdomain.ts`. If it *is* set, the wildcard DNS record
   and TLS certificate have to exist, or the last step gets a certificate
   error rather than a 404.

**Can they run against production?** They can, and the runner will make
you say so out loud (`E2E_ALLOW_PRODUCTION=1`). It is a bad idea for one
reason that is not about safety: they create a file, an agent and a
**published website** on that account, and the cleanup is best-effort. A
half-cleaned production account accumulates test websites nobody deletes.

## γ) What one run costs

Priced with the application's own estimator (`estimateForAction`) at the
default credit price of EUR 0.02:

```
  file ask (1-page PDF, short question)    ~   3 credits (reserve 4)
  agent build (one sentence)               ~   4 credits (reserve 5)
  agent run                                ~  19 credits (reserve 21)
  website generate (short brief)           ~  69 credits (reserve 76)
                                           ------
  three journeys, one run                  ~ 95 credits  ≈ EUR 1.90
```

Plus a handful of single-credit pre-checks. **Budget ~110 credits per
run** and keep the account above ~500 so a run never dies half way
through on an insufficient-credit error, which is the one failure that
leaves litter behind.

These are ESTIMATES from the same function the app uses to size a
reservation. The real charge is settled on measured usage and is normally
lower — website generation especially, whose estimate assumes a long
page. Model calls per run: **6–9** (one per journey step, plus the
clarification pre-checks and the agent runner's research pass).

Wall clock: **8–20 minutes**, dominated by website generation.

## δ) The command

```sh
E2E_BASE_URL=https://staging.ionexa.ai \
E2E_EMAIL=e2e@your-domain.test \
E2E_PASSWORD=… \
npm run test:e2e
```

One journey at a time:

```sh
npm run test:e2e -- files-ask
npm run test:e2e -- agent-run
npm run test:e2e -- website-publish
```

A failure report with traces and screenshots lands in `e2e-report/`.

**This is not in the build gate, deliberately.** `npm run build` stays
fast and free. Run this before a merge, on purpose.

---

## How they fail

Every assertion says **where** it broke, and distinguishes a product
failure from an environment one:

```
BROKE AT: citations. 2 citation(s) were STRIPPED as unverifiable — the
model named pages that were never sent to it. That is the failure this
feature exists to prevent.
```

```
BROKE AT: run. POST /api/agents/…/run -> 429
  A 429 here is the per-hour execution cap (AGENT_MAX_RUNS_PER_HOUR) —
  real, and it means a previous run of this spec is still counted.
```

Waiting steps print the live step label as it changes, so a timeout names
the step it died on rather than reporting four silent minutes.

## Cleanup

Each spec removes what it created, in reverse order, at the end.

**Cleanup never fails a spec.** A failed delete would turn a passing
journey red; instead it prints what it could not remove:

```
    cleanup: published site left behind (500 /api/websites/…/publish)
```

If a spec fails **mid-journey**, cleanup still runs for what was created
before the failure — but anything created after the failing step is not
there to clean. After a failed run, check the account for a stray
`e2e-…` file, agent or website.

## Choices worth knowing about

**They drive the API, not the DOM.** The agents and website-builder
surfaces carry no `data-testid`, so a click-through would mean selectors
built from class names and label text — a suite that breaks when a
sentence is reworded is a suite people delete. These call the same HTTP
routes the browser calls, through a real session. The one place a browser
genuinely is the subject — a published page a stranger has to be able to
open — uses a real one, in a context with no cookies.

**One worker, no retries.** All three use the same account: run them in
parallel and the agent spec's rate limit fires inside the website spec,
and "exactly one credit transaction" stops being answerable. A retry
would double the bill and turn a real intermittent backend failure green.

**"Charged once" means one transaction, not one attempt.** The agent
runner records retries onto the same accumulator on purpose — a run that
tried three times is charged for three attempts. What must never happen
is two ledger rows for one action.

**Website generation asserts "charged", not "charged once".** It settles
the clarification pre-check separately from the generation, so one
journey legitimately writes more than one row. Asserting one there would
be asserting something untrue.
