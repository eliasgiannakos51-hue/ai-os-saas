# Every key this product can hold

V4.6 #13. Two tables: what the code reads today, and what the brief named
that the code does not read at all. Then the four questions, then an
ordered list with the exact steps.

---

## How to read the cost column, before anything else

**I have not measured any provider's price.** The one exception is
Anthropic, whose per-token prices this app has been billing against for
months in `src/lib/billing/model-pricing.ts` — and the repository says so
about the others itself:

```ts
// src/lib/ai/providers/catalog.ts
export const UNVERIFIED_PRICE_PROVIDERS: readonly AiProvider[] = ["openai", "google", "groq"];
```

So the cost column gives the **shape** of the charge — per token, per
minute, per image, per transaction, a percentage — because that is
structural and does not move, and the **URL** for the number, because the
number does move. Where a figure would have been a guess there is a dash.
A dash is not "free"; it is "I did not measure this, and the page in the
last column is the authority."

The same rule applies to free tiers: the *existence* of a free tier is
noted where the provider's model is well established, and the size of it
is not, because that is the part providers change quietly.

---

## Table A — in the code today

Every variable here is read by `src/lib/env-check.ts`, which is what the
boot check and `/dashboard/system-health` are both built from, so
"what goes silent" is not my summary of the code: it is the sentence the
code itself carries.

### Models

| Provider | Env var | What it enables | What goes silent without it | Cost shape | Free tier | URL | Priority |
|---|---|---|---|---|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | Every AI feature: chat, Create Anything, agents, Deep Research, website generation | Nothing at boot. Each AI request fails **individually**, per user, at the moment they press the button | per input/output token, per model. The **only** prices verified against a live account | no | console.anthropic.com/settings/keys | **NOW — the product is an AI product** |
| **OpenAI** | `OPENAI_API_KEY` | Speech-to-text (Whisper). Voice **input** in chat, module forms, the agent builder | The microphone button is **not rendered**. Every text path unaffected | per audio minute (Whisper) | no | platform.openai.com/api-keys | V5 |
| **Google (Gemini)** | `GOOGLE_API_KEY` | Gemini as a **failover** provider | The provider is skipped. If Anthropic is unreachable the call fails instead of failing over | per token | yes, a free tier exists | aistudio.google.com/apikey | **NOW — it is the outage plan** |
| **Groq** | `GROQ_API_KEY` | Groq as a **failover** provider | Same: the chain is one provider shorter | per token | yes | console.groq.com/keys | V5 |

`AI_PROVIDER_ORDER` and `AI_FAILOVER_ENABLED` decide the chain and whether
it is used at all. A failover key with failover disabled is a key that
does nothing.

### Voice, image

| Provider | Env var | What it enables | What goes silent without it | Cost shape | Free tier | URL | Priority |
|---|---|---|---|---|---|---|---|
| **ElevenLabs** | `ELEVENLABS_API_KEY` | Text-to-speech. Reading an agent run or a chat reply aloud; the hands-free loop | The speaker button is **not rendered** and hands-free cannot start | per character | yes | elevenlabs.io/app/settings/api-keys | V5 |
| **Unsplash** | `UNSPLASH_ACCESS_KEY` | Real photographs in generated websites | Photo placeholders are **removed** — a site with fewer but relevant images rather than random ones | free with attribution; rate-limited per hour | yes | unsplash.com/oauth/applications | V5 |

`UNSPLASH_REQUESTS_PER_GENERATION` caps how many photos one generation may
pull, so a rate limit cannot be hit by a single site build.

### Infrastructure

| Provider | Env var | What it enables | What goes silent without it | Cost shape | Free tier | URL | Priority |
|---|---|---|---|---|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` | Auth and database | Nothing works | per project, per month, by usage | yes | supabase.com/dashboard → Project Settings → API | **NOW** |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The browser's and middleware's client | Nothing works | — | — | same page | **NOW** |
| **Supabase** | `SUPABASE_SERVICE_ROLE_KEY` | Credits, settlement, admin reads | Credits and settlement break; the dashboard shell degrades to a zero balance rather than crashing | — | — | same page (**never** ships to the browser) | **NOW** |
| **Vercel** | *(none)* | Hosting, cron, function limits | — | per seat and per usage | yes | vercel.com | **NOW** — but no key: the platform provides `VERCEL_*` itself |
| **Vercel Cron** | `CRON_SECRET` | Authenticates all ten scheduled routes (nine under `/api/cron` plus `/api/weekly-digest`) | **Every cron route returns 503.** Credits are never reset, scheduled agents never fire, the weekly digest never goes out, and nav_events is never pruned. It fails **closed** on purpose | free with Vercel | — | any random 32+ chars you generate yourself | **NOW** |
| **Resend** | `RESEND_API_KEY` | All outbound email | Thirteen senders fail. Since this session they each **say which variable is missing**; before it they logged `stage: "unhandled"` | per email, per month | yes | resend.com/api-keys | **NOW** |
| **Resend** | `RESEND_FROM_EMAIL` | The sender address | Falls back to `onboarding@resend.dev`, which is **testing mode: real users receive nothing** and no error is raised | — | — | resend.com/domains (verify a domain first) | **NOW — the fallback silently delivers to nobody** |
| **Web Push** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The browser creating a push subscription at all | Settings says "not configured" and no notification is ever sent | free — it is a key pair you generate | — | `npx web-push generate-vapid-keys` | V5 |
| **Web Push** | `VAPID_PRIVATE_KEY` | Signing the JWT every push service demands | Sends are skipped as "unconfigured" | free | — | same command, the other half | V5 |
| **Web Push** | `VAPID_SUBJECT` | The `mailto:` identifying the sender | Falls back to a mailto built from `RESEND_FROM_EMAIL`, then `support@ionexa.ai` | free | — | your own address | later |
| **Telegram** | `TELEGRAM_BOT_TOKEN` | Telegram as a notification channel | Telegram is offered **nowhere** in Settings. Every other channel unaffected | free | yes | t.me/BotFather → `/newbot` | later |
| **Discord** | *(none)* | Discord as a notification channel | — | free | — | **no env var**: each user pastes their own webhook URL, stored encrypted under `INTEGRATION_ENCRYPTION_KEY` | — |
| **Slack** | `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET` | Slack integration and Slack agent delivery | Slack is **hidden** from the integrations list | free to build | yes | api.slack.com/apps → your app → Basic Information | later |
| **Google OAuth** | `GOOGLE_OAUTH_CLIENT_ID` + `..._SECRET` | Gmail and Google Drive integrations | Both providers are **hidden** | free | yes | console.cloud.google.com/apis/credentials | later |
| **(self)** | `INTEGRATION_ENCRYPTION_KEY` | Encrypts every stored third-party token, and the Telegram/Discord delivery credentials | Integrations and those two channels **refuse to connect** and say so | free — you generate it | — | `openssl rand -hex 32` | V5, **before any integration** |

### Money

| Provider | Env var | What it enables | What goes silent without it | Cost shape | Free tier | URL | Priority |
|---|---|---|---|---|---|---|---|
| **Stripe** | `STRIPE_SECRET_KEY` | Checkout and the billing portal | No Checkout session, no portal. The product runs as a free tier and **nobody can pay**. Refused outright rather than half-completed | % of each transaction | no monthly fee | dashboard.stripe.com/apikeys | **NOW, to charge anybody** |
| **Stripe** | `STRIPE_WEBHOOK_SECRET` | Verifying webhooks | **Every webhook is rejected, so a customer PAYS and is never upgraded.** The worst failure shape in the product, because Stripe reports success to the customer | — | — | dashboard.stripe.com/webhooks → your endpoint → Signing secret | **NOW, with the key above — never one without the other** |
| **Stripe** | `STRIPE_PRICE_STARTER` / `_GROWTH` / `_PROFESSIONAL` / `_ULTIMATE` / `_TEAM_SEAT` | The monthly plans | A plan with no price id cannot be bought | — | — | dashboard.stripe.com/products | **NOW** |
| **Stripe** | `STRIPE_PRICE_*_ANNUAL` (×4) | Yearly billing at ten months' price | **Annual billing is not offered at all** — silently: the toggle is simply absent | — | — | same, one price per plan | V5 |
| **Stripe** | `STRIPE_PRICE_CREDITS_10/25/50/100` | Credit packs | That pack cannot be bought | — | — | same | **NOW** |
| **Stripe** | `STRIPE_PRICE_ADDON_*` (×4) | Add-ons: agents, credits, storage, priority | That add-on is not offered | — | — | same | V5 |
| **Stripe Connect** | *(none)* | Affiliate payouts | — | % per payout | — | **no separate key**: Connect uses `STRIPE_SECRET_KEY`; each affiliate connects their own account | V5 |

### The money settings that are not keys, and lose money quietly

`USD_TO_EUR_RATE` (default `0.92`), `CREDIT_MARGIN_MULTIPLIER` (default
`4`), `CREDIT_PRICE_EUR` (default `0.02`). These are the reason
`env-check.ts` exists at all: set `USD_TO_EUR_RATE` to `0.80` and the
product charges 45 credits where 52 was correct, **and every settled row
still reports a healthy margin**, because the margin is measured against
the same understated euros. `env-check` flags a value outside a sane
range; it cannot flag a plausible wrong one.

`MAX_FUNCTION_DURATION` (default `800`, a Vercel Pro/Fluid figure): on a
smaller plan, long generations are killed mid-work and force-failed as
stale. This one is not a key and it will cost you a Deep Research run.

---

## Table B — named in the brief, **not in the code**

I checked every name in the brief against `src/`. These have **no
environment variable, no client, and no call site**. There is nothing to
put a key into: each one needs a feature built first, and the variable
names below are proposals, not things the code reads.

Saying this plainly is the point. A table that invented an env var for
each of these would read exactly like Table A, and somebody would set
twenty keys and wonder why nothing changed.

### Models — none of these is wired

`xAI (Grok)` · `Perplexity` · `Manus` · `DeepSeek` · `Together` ·
`Mistral` · `Cohere`

The provider registry is a closed set of four:

```ts
// src/lib/ai/providers/registry.ts
export const PROVIDER_KEY_ENV_VARS: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai:    "OPENAI_API_KEY",
  google:    "GOOGLE_API_KEY",
  groq:      "GROQ_API_KEY",
};
```

Adding a fifth is a real piece of work — the registry, the catalogue with
its per-token prices, the failover order, the cost accounting that
settlement derives credits from — not a variable. **Perplexity in
particular is not a model you would add here**: Deep Research already does
what it does, over the user's own data as of this session, and the
comment at the top of `src/lib/research/entry-sources.ts` says so.

### Image / video / audio — none of these is wired

`Runway` · `Luma` · `Kling` · `Pika` · `HeyGen` · `Synthesia` ·
`Midjourney` · `Ideogram` · `Flux` · `Recraft` · `Deepgram` ·
`AssemblyAI` · `OpenAI TTS`

Two notes worth having:

* **Deepgram and AssemblyAI are alternatives to a key you already use.**
  Speech-to-text is Whisper via `OPENAI_API_KEY`. A second STT provider
  buys failover, not a feature.
* **OpenAI TTS is an alternative to ElevenLabs**, same reasoning.
* Video (Runway, Luma, Kling, Pika, HeyGen, Synthesia) is a **product
  decision, not a key**: there is no video pipeline, no storage plan for
  the output, no credit price for a minute of generated video, and no
  screen to show it on. `/dashboard/videos` exists as a **records module**
  (`BUILD_MODULES` in `src/lib/build-modules.ts`, table `ai_videos`,
  whose first field is a `prompt`) — it records the videos you made
  elsewhere. Nothing in it generates one.

### Data — none of these is wired, and two have tables

`Plaid / Tink / GoCardless` · `Alchemy / Moralis` · `Exa / Tavily / Brave`
· `Firecrawl / Apify`

**`bank_connections` and `crypto_wallets` exist as tables and nothing
writes them.** That is recorded in the code, not discovered by me:

```ts
// src/lib/gdpr/user-data-registry.ts
statusNote: "V4 #15, same as bank_connections — schema present, nothing writes it yet."
```

This is the exact shape the brief is about — a feature that does not work
— with one saving grace: it does not *claim* to work either, because
there is no screen offering to connect a bank. The schema is a promise to
a future version, not a broken feature. It becomes a broken feature the
day a "Connect your bank" button is added without a provider key behind
it.

Web search (`Exa`, `Tavily`, `Brave`) and scraping (`Firecrawl`, `Apify`)
are the same story: **Deep Research already searches the web**, through
Anthropic's own server-side tool, which is why there is no search key in
the environment and why adding one would be replacing something that
works rather than filling a gap.

---

## The four questions

### α) Which are already in the code and missing?

That question has a live answer rather than a written one:
**`/dashboard/system-health`** lists all 44 variables grouped by level,
with the sentence for each, computed on the server and reduced to a
boolean before it reaches the browser — no value ever crosses.
`scripts/tests/capability-visibility.test.mjs` holds it to being built
from `ENV_REQUIREMENTS` rather than from a second list that can drift.

Read it on the deployment rather than trusting this document: a doc says
what should be set, and that screen says what **is**.

### β) Which will be needed in V5?

Ordered by what they unblock:

1. `INTEGRATION_ENCRYPTION_KEY` — nothing else in the integrations column
   can be set without it, and it costs a single `openssl` command.
2. `STRIPE_PRICE_*_ANNUAL` ×4 — annual billing is built and currently
   invisible. This is revenue already coded.
3. `STRIPE_PRICE_ADDON_*` ×4 — same.
4. VAPID pair — push notifications are built; a phone never rings.
5. `OPENAI_API_KEY` — voice input, built, and the microphone is simply
   absent.
6. `ELEVENLABS_API_KEY` — voice output, same.
7. `UNSPLASH_ACCESS_KEY` — generated sites get real photographs.
8. `GROQ_API_KEY` — a third link in the failover chain.

Every one of these is a **feature that already exists and is dark**. Not
one of them requires code.

### γ) Which in V6–V7?

None of them is a key. Everything in Table B is a feature to build, and
the order I would build them in is:

1. **Bank connections** (`bank_connections` already exists) — the finance
   module is the most-used one in most business tools, and an automatic
   feed beats a form.
2. **A fifth AI provider**, chosen by what the routing data says, not by
   the name — `routing_decisions` records which model served what and at
   what cost.
3. **Image generation** (Flux / Ideogram / Recraft) — the website builder
   is the surface that would use it, and it already places images.
4. **Video** — last, and only with a credit price for it worked out
   first.

### δ) The minimum set so that nothing already built goes silent

This is the answer to take away. **Fourteen variables, plus one that
depends on your Vercel plan:**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
ANTHROPIC_API_KEY
CRON_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER  STRIPE_PRICE_GROWTH  STRIPE_PRICE_PROFESSIONAL  STRIPE_PRICE_ULTIMATE
MAX_FUNCTION_DURATION   (only if this is not a Vercel Pro/Fluid deployment)
```

Everything else on `env-check`'s **optional** list turns a feature off in
a way the product states — a control that is not rendered, a provider
hidden from a list, a panel that says "not configured". Those are
features that do not exist yet **and say so**, which is the acceptable
half of the brief's rule.

Two on that list are the exceptions, and they are why `RESEND_FROM_EMAIL`
is in the twelve:

* **`RESEND_FROM_EMAIL` unset is the worst remaining default in the
  product.** It falls back to `onboarding@resend.dev`, Resend's shared
  test sender, which **delivers only to the Resend account owner**. Every
  welcome email, every agent result, every team invite is accepted, is
  reported as sent, and reaches nobody. Nothing errors, because nothing
  failed.
* **`STRIPE_WEBHOOK_SECRET` without `STRIPE_SECRET_KEY`, or the reverse.**
  Either alone gives you a checkout that takes money and never grants
  anything.

---

## In order: now · V5 · later

### NOW — without these, something that exists is broken or lying

| # | Variable | Where you get it | The exact step |
|---|---|---|---|
| 1 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | supabase.com | Project → Settings → API. Copy all three. The service-role key goes in Vercel **only** — never in a `NEXT_PUBLIC_` name |
| 2 | `NEXT_PUBLIC_SITE_URL` | you | The production URL with no trailing slash, e.g. `https://ai-os-saas-five.vercel.app` |
| 3 | `ANTHROPIC_API_KEY` | console.anthropic.com | Settings → API keys → Create key. **Set a monthly spend limit on the same page** — this is the one key that can be spent without a ceiling |
| 4 | `CRON_SECRET` | you | `openssl rand -hex 32`. Paste into Vercel. Vercel Cron sends it as `Authorization: Bearer …` automatically; you never send it by hand |
| 5 | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | resend.com | **Domains → Add domain first**, add the DNS records, wait for verified. *Then* API Keys → Create. `RESEND_FROM_EMAIL` must be on that verified domain, e.g. `Ionexa <hello@ionexa.ai>`. Setting the key without the domain is the silent-delivery trap above |
| 6 | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com | Developers → API keys for the first. Then Developers → Webhooks → Add endpoint `https://<your-domain>/api/webhooks/stripe`, and the signing secret it shows you is the second. **Both or neither** |
| 7 | `STRIPE_PRICE_STARTER` … `_ULTIMATE`, `STRIPE_PRICE_CREDITS_*` | dashboard.stripe.com | Products → one product per plan → copy each `price_…` id (not the `prod_…` one) |
| 8 | `GOOGLE_API_KEY` | aistudio.google.com/apikey | One click. This is the outage plan: with it, an Anthropic incident degrades the product; without it, an Anthropic incident stops it |
| 9 | `MAX_FUNCTION_DURATION` | you | Only if this is **not** Vercel Pro/Fluid. Set it to your plan's real ceiling (Hobby: `60`). The default of 800 means long generations are killed mid-work |

### V5 — features that exist and are dark

| # | Variable | The exact step |
|---|---|---|
| 10 | `INTEGRATION_ENCRYPTION_KEY` | `openssl rand -hex 32`. Exactly 32 bytes as 64 hex characters — the code rejects anything else with that sentence. **Do this before any integration key below** |
| 11 | `STRIPE_PRICE_*_ANNUAL` ×4 | Stripe → each plan product → add a yearly price at ten months' value → copy the id |
| 12 | `STRIPE_PRICE_ADDON_*` ×4 | Same, four new products: agents, credits, storage, priority |
| 13 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` — one command, both halves. The public one **must** carry the `NEXT_PUBLIC_` prefix or the browser cannot subscribe |
| 14 | `OPENAI_API_KEY` | platform.openai.com/api-keys. Turns the microphone on everywhere |
| 15 | `ELEVENLABS_API_KEY` | elevenlabs.io → Settings → API keys. Turns "Listen" on |
| 16 | `UNSPLASH_ACCESS_KEY` | unsplash.com/oauth/applications → New Application → Access Key |
| 17 | `GROQ_API_KEY` | console.groq.com/keys |

### Later — one line each, when somebody asks for them

| # | Variable | The exact step |
|---|---|---|
| 18 | `TELEGRAM_BOT_TOKEN` | Message `@BotFather` on Telegram → `/newbot` → it gives you the token |
| 19 | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | api.slack.com/apps → Create New App → Basic Information → App Credentials. Redirect URL: `<site>/api/integrations/slack/callback` |
| 20 | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID → Web application. Enable the Gmail and Drive APIs on the same project first |
| 21 | `VAPID_SUBJECT` | Your own `mailto:` |
| 22 | `ADMIN_EMAILS` | Comma-separated. Who receives the cost, margin and error alerts |

### Never

`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`,
`INTEGRATION_ENCRYPTION_KEY` and `CRON_SECRET` must **never** be given a
`NEXT_PUBLIC_` prefix. That prefix is not a naming convention — it inlines
the value into the JavaScript bundle every visitor downloads.
`scripts/tests/security-posture.test.mjs` fails the build if a secret-
shaped name acquires it.
