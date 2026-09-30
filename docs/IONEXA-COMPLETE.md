# Ionexa — the complete map

**Written 2026-09-30.** Every number here either carries the command
that re-derives it or the date it was measured by hand. Nothing in this
file is a projection, a target, or a rounded-up version of something
smaller. Where a thing has not been measured, it says so in those words
rather than being left out — an absence is easy to mistake for a zero,
and a zero is easy to mistake for a fact.

---

## TL;DR — ten lines

1. Ionexa is a business OS: you keep your products, prices, customers,
   finances and notes in it, and it MAKES things with them — websites,
   decks, posts, code, research.
2. The claim is not "better than Wix". It is "Wix does not know what you
   sell". Ten of thirty-one paid routes now send the account's own
   records to the model.
3. 142 API routes, 64 pages, 933 source files, 162,260 lines.
4. 298 build gates, 22,350 assertions, green. 196 mutation suites; nine
   are RED on main today.
5. Production is live, answers 200, schema complete (46 objects
   checked, none missing), and can call three model providers.
6. **No end-to-end test has ever signed in to production.** The bot is
   built and wired; its credentials are not where it reads them.
7. **No benchmark against any competitor has ever been run.** There is
   no score, in either direction.
8. Six drawn Make features paint their result; two of six can be
   changed by saying what to change.
9. 111 sidebar positions are declared; 27 are drawn. The other 84 are
   marked, deliberately, as not built.
10. 10 accounts have content in the search index. Nobody has paid.

---

## 1. What it is

Ionexa is a business operating system with a model inside it. A person
records the things a small business is made of — products and prices,
customers, income and costs, ideas, meetings — and then asks for work to
be produced FROM those records: a website with the real menu on it, a
deck with September's real figures, posts that know what is for sale.

**The advantage is structural, not technical.** Wix ADI, Gamma and
Copy.ai are each given a sentence in a box, because a sentence is all
they have. They are better than Ionexa at their one craft and will stay
better. What none of them can do is open the drawer where the prices
are. That is the whole bet, and it is a bet about DATA rather than about
model quality.

**Who it is for:** the owner of a small business who has the information
in their head or in a spreadsheet, needs the same facts to appear in six
different deliverables, and has no marketing department.

> **The honest status of the bet: unmeasured.** The sentence above is a
> hypothesis. No comparison against any competitor has been run — not
> against Wix, Gamma, Copy.ai, Cursor or Perplexity, none of which
> exposes an API that takes a brief and returns a result, and not
> against a raw frontier model either. Any figure of the form "9/15
> generally, 14/15 with data" does not exist and has never existed.

---

## 2. Every feature

**How to read the status column.** 🟢 means a person has used it and it
worked. **No feature is 🟢** — see §4. 🟡 means the code is complete and
the gates are green, but nothing has driven it live. 🔴 is a known
break. ⚪ is declared in the sidebar and not built.

Re-derive the drawn/declared split with `node scripts/sidebar-census.mjs --rows`.

### MAKE — 6 drawn of 14 declared

| Feature | What it does | Status | The specialist |
|---|---|---|---|
| Website Builder | Brief → one complete HTML site, preview in an iframe, edit by saying what to change, publish | 🟡 | Wix ADI, Framer, v0 |
| Presentations | Brief → deck (title, bullets, notes), .pptx and PDF export, edit by saying what to change | 🟡 | Gamma, Tome |
| Posts | Brief → one post per platform, at each platform's length and register | 🟡 | Copy.ai, Jasper |
| AI Coding | Brief → one function, with its assumptions and gaps stated; reads your other modules for context | 🟡 | Cursor, Bolt |
| Documents | A blank page that saves. **No model call anywhere.** | ⚪ | Notion AI |
| Data Analysis | Upload a spreadsheet; every statistic computed from the whole file, then ask questions of it | 🟡 | — |
| Images, Videos | Record-keeping lists. `BuildModulePage`, 18 lines each. **No generator.** A Flux or Runway key would reach nothing. | ⚪ | Midjourney, Runway |

### ASK — 4 drawn of 6 declared

| Feature | What it does | Status |
|---|---|---|
| Ionexa Chat | Answers from the account's own records, with provenance | 🟡 |
| Deep Research | Plans questions, searches the web, synthesises a report | 🟡 |
| Predictions | Narrates what the account's own numbers imply | 🟡 |
| Voice | Transcribe (OpenAI Whisper) and speak (ElevenLabs) | 🟡 |

### RUN — 2 drawn of 10 declared

| Feature | What it does | Status |
|---|---|---|
| AI Agents | Build an agent from a description; runs on a schedule; delivers to Slack or Telegram | 🟡 |
| Automation | Describe a rule, it runs | 🟡 |

### SEE — 7 drawn of 23 declared

Timeline, Files, Finance, Sales, Trading, Search my records, What it
remembers. **Finance, Sales, Trading and Projects make no model call at
all** — they are records and dashboards. Search and "What it remembers"
do.

### ORGANISE — 5 drawn of 8 declared

Projects (CRUD), Goals & Plans (model-planned), Reflection, Meetings
(transcribe → summary → proposed actions), Team.

### CONNECT — 0 drawn of 11 declared, and this row is misleading

The sidebar rows are marked not-built. **The integration layer is
built**: Gmail and Google Drive on read-only scopes, Slack, OAuth with
PKCE, a signed cookie-bound CSRF state, tokens encrypted with a key that
is not in the database, every fetched item wrapped as untrusted before
it reaches the model, and `/dashboard/integrations` drawn. Two
environment variables and a Google Cloud project are the whole of what
is missing. Held by `scripts/tests/connector-safety.test.mjs`.

### The five dark groups

Connect (11), Business (9), Engineering (9), Verify (7), Personal (7).
Every item not built, so `lib/sidebar-visibility.ts` drops the group and
its heading with it. 84 dark positions in total: 55 not built, 27
deliberately hidden, 1 retired, 1 owner-only.

---

## 3. The architecture

**Stack.** Next.js 14.2 (App Router), TypeScript, Supabase (Postgres +
Auth + Storage + RLS), Vercel, Tailwind. Node pinned to 22.x.

**Model providers**, resolved through `lib/ai/providers/registry.ts`
with a per-purpose chain and failover. Production reports, today:
`anthropic, openai, groq`. Google is not configured. Anthropic Sonnet
does the generation; OpenAI does speech-to-text; Unsplash supplies
photographs; Resend sends transactional mail; Stripe bills.

**Size**, measured 2026-09-30: 142 API routes · 64 pages · 933 source
files · 162,260 lines · 77 migrations.

**The test estate**, by family:

| family | files | what it is |
|---|---|---|
| `*.test.mjs` | 298 | the build gate, 22,350 assertions, green |
| `*.mutation.mjs` | 196 | each re-introduces a real defect and requires its gate to go red |
| `*.prodtest.mjs` | 48 | real `next build` + browser |
| `*.dbtest.mjs` | 30 | against a real Postgres |
| `*.itest.mjs` | 19 | integration |

**Security.** Row-level security on every user table — another user's
rows are unreachable by the database, not filtered in code. Untrusted
boundaries (`UNTRUSTED_SOURCE_MATERIAL` markers) around every piece of
text the product did not write: briefs, the account's own records,
fetched email, agent inputs. Schema canaries and a live `/api/health`
sweep that asks the database API for its own function list. Integration
tokens encrypted per-user, per-kind, with a key held outside the
database; encryption refuses rather than falling back to plaintext.
Exactly one write path exists against any connected provider, and it is
gated.

**Billing.** Every paid action estimates before it runs, reserves
credits, calls the model, then settles against real token counts and
releases the difference. The user is shown the cost BEFORE pressing.
Migrations are applied by hand — there is no runner and no ledger table;
`npm run db:pending` reports what has not been pasted.

---

## 4. The numbers

Every figure with the command that produces it.

| What | Value | Source |
|---|---|---|
| Build gates | 298 suites, 22,350 checks, 0 failed | `npm run gates`, 2026-09-30 |
| Mutation suites | 196 declared; **9 RED on main** | CI run 36768339870, 2026-09-30 |
| Routes that send the model your records | **10 of 31** | `node scripts/data-advantage.mjs` |
| Make features that paint their result | 6 of 6 | `node scripts/artifact-census.mjs` |
| …that can be changed by saying so | **2 of 6** | same |
| Sidebar positions drawn / declared | 27 / 111 | `node scripts/sidebar-census.mjs` |
| Production health | ok, db ok, schema ok | `/api/health`, 2026-09-30 |
| Schema objects checked / missing | 46 / 0 | same |
| Search index rows / accounts | 214 / 10 | same |
| Navigation freshness | 0.6 h | same |
| Cost of one website generation | €0.3120 of model time | `node scripts/make-cost.mjs` |
| …one deck, one post set, one snippet | €0.0521 · €0.0259 · €0.0095 | same |

**Margin.** The configured multiplier is **4×** (`pricing-config.ts`,
`marginMultiplier: 4`), which is a 75% target margin on model cost.
**The ACHIEVED margin is not measured here** — it needs settled runs
from real traffic, and there is none. Any specific achieved figure,
including 63%, is not something this repository can currently produce.

**Users.** Nobody has paid. Ten accounts have rows in the search index;
that is ten accounts with content, not ten customers. Navigation events
are 0.6 hours old, so somebody was using it today.

**The benchmark.** Does not exist. Not run, not partially run, no
number. See §1.

**Live verification.** No automated test has ever signed in to
production. The e2e bot is written, wired to fire on every production
deployment, and fenced so it cannot spend on previews; on 2026-09-30 it
reached the step named `the credentials exist` and stopped there,
because `BOT_EMAIL` and `BOT_PASSWORD` are not GitHub Actions secrets.
Everything marked 🟡 above is 🟡 for that one reason.

---

## 5. Tiers and pricing

| Plan | Price/month | Credits/month | € per credit |
|---|---|---|---|
| Free | €0 | 100 | 0.0200 |
| Starter | €20 | 1,000 | 0.0200 |
| Growth | €50 | 3,000 | 0.0167 |
| Professional | €100 | 10,000 | 0.0100 |
| Ultimate | €200 | 25,000 | 0.0080 |
| Enterprise | custom | custom | — |

A credit is cheaper on a larger plan, so the same generation costs MORE
credits there — €0.312 of model time is 87 credits on Free and 180 on
Ultimate. The euro is the figure that compares.

**What that buys.** One website is ~87–180 credits: Starter's 1,000
credits is about 11 sites, or 190 decks, or 380 post sets. Every feature
declares a minimum plan in `lib/billing/feature-catalog.ts`, and a
feature below its minimum renders a wall naming the plan and the price
rather than failing silently.

---

## 6. The strategy

**The moat is the data, and it is the only one.** On every axis a
specialist competes on — layout craft, design systems, repo-wide context
— the specialist has had years and will win. The axis nobody else can
enter is that Ionexa already holds the account's products, prices,
customers and numbers, and can put them into whatever is being made.

**Which is why "a better Wix" is the wrong target.** It is a race
against a company whose entire staff does one thing. "The site that has
your actual menu on it, made from the same records as your deck and your
posts" is a different product, and it is one no specialist can assemble
without first becoming a business OS.

**What that implies about roadmap order:**

1. **Connect** — the moat's feeder. Today the user types their data in
   by hand. Gmail and Drive are built and waiting on one OAuth app;
   Calendar is a scope away. Every feature improves the day data starts
   arriving on its own.
2. **Close the artifact loop** — four of six Make features cannot be
   changed by saying what to change. The pattern works twice already.
3. **Documents** — the only Make feature with no model in it.
4. **Images** — a site without pictures is half a site, and nothing in
   the codebase reads an image provider key today.

Business, Engineering, Verify and Personal — 32 declared positions — are
last. They do not serve the person this is being built for.

---

## 7. What is open

**Needs a key or an account, nothing else:**

| Thing | What it needs | Where it goes |
|---|---|---|
| Gmail + Drive connectors | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Vercel — the deployment reads them |
| The e2e bot, and with it every 🟡 above | `BOT_EMAIL`, `BOT_PASSWORD` | GitHub → Settings → Secrets → **Actions**. Not Vercel: Vercel's variables go to the deployment, which does not run the bot |
| A blind third judge for benchmarks | `GOOGLE_API_KEY` | Vercel |

**Needs building, not a key:** Images and Videos are record lists with
no generator — no provider key would reach anything. Email/Calendar
reading is a scope and a route. Documents needs a generation route.

**Known broken today:** nine mutation suites are red on main —
`ai-memory`, `gate-vacuity`, `pricing-truth`,
`purchased-credits-marker`, `purchased-credits-upgrade`,
`sidebar-groups`, `sidebar-size`, `transition-buttons`, `voice` — plus
`user-isolation`, which printed a skip line and killed nothing. They are
not part of `npm run gates`, which is why the build is green and they
are not.

---

## 8. What this project has learned the hard way

`docs/shapes.md` holds **70** named failure shapes, each with the
incident that produced it. A model or a person arriving here should read
it before writing a gate. The ones that recur:

- **A check that cannot go red.** A gate whose assertion is satisfied by
  an empty collection reports on nothing and looks identical to one that
  reports on everything. Settle it by MUTATING the value, never by
  reading the code.
- **A gate anchored on a comment.** A regex whose only match in its
  target is inside a comment passes forever. Ask: if I deleted every
  comment in the target, would this still pass?
- **"Every X" checked against one X.** If the rule says every table,
  every module, every provider, the check must range over the same set —
  derived, never typed.
- **A number in a document with no date and no source.** "98 of 221
  (44%)" is not a wrong sentence; it is a true measurement of one day,
  read on another. Every number is dated at the point of use or produced
  by the thing that prints it.
- **The build that tested.** Fifteen consecutive red deploys were blamed
  on Node versions, lockfiles, time zones and environment variables. The
  cause was that `npm run build` ran 294 gates before compiling a line.
  A build builds.
- **A skip that says nothing.** A job that declines to run and leaves a
  grey tick teaches nobody why. Every refusal states its reason.
- **The defence that existed, was correct, and was wired in one place.**
  `workspace-context.ts` had been bounded, RLS-scoped and careful since
  V4 — and was connected to exactly one feature out of thirty-one.
  Correct code that nothing calls is the same as absent code.

---

## 9. How to check any of this yourself

```
npm run gates                       # 298 suites, 22,350 assertions
npm run test:mutation               # 196 suites; nine are red
node scripts/sidebar-census.mjs --rows
node scripts/data-advantage.mjs     # which features know the user
node scripts/artifact-census.mjs    # which features paint their result
node scripts/make-cost.mjs          # € and credits per generation
node scripts/show-context.mjs "παρουσίαση πωλήσεων"
node scripts/db/pending-migrations.mjs
curl -s https://ai-os-saas-five.vercel.app/api/health
```

Nothing in this document is asserted anywhere it is not also derivable
from one of those.
