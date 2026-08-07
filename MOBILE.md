# Mobile: what to build, and what it would cost

**Status: analysis only. Nothing here is implemented, and nothing will be
until this is approved.** V3 Task 7 asked for the comparison before the
work, which is the right order — the three options differ by more than an
order of magnitude in effort and they are not reversible into each other
cheaply.

Written against *this* codebase, not against a generic Next.js app. Some
of what follows would be different advice for a different product.

---

## Where we already are

Two facts do most of the work in this decision:

1. **The app is already installable.** `src/app/manifest.ts` exists, with
   `display: "standalone"`, a real name, an icon and a `start_url`. On
   both Android and iOS, "Add to Home Screen" today produces an icon that
   opens the app full-screen with no browser chrome. That was added to fix
   a different bug (the app was calling itself "Vercel" on phones), but it
   means the expensive half of "be a PWA" is already done.

2. **There is no service worker.** No offline anything, no push
   subscription, no background sync. `grep -rn "serviceWorker\|PushManager"
   src/` returns nothing.

So the gap between where we are and a genuine PWA is *one file and a
subscription flow*, not a project.

The other constraint that matters: **this app cannot be statically
exported.** It is Next.js 14 App Router with server components, cookie-based
Supabase auth resolved server-side, `force-dynamic` on essentially every
dashboard route, NDJSON streaming, and server-only route handlers holding a
service-role key. `next export` is not available to it and would not be
without rebuilding the data layer. That single fact shapes the Capacitor
option below more than anything else.

---

## The three options

### A. PWA — finish what is already started

**What it is.** Add a service worker: an offline shell (the app frame plus
a "you are offline" state rather than the browser's dinosaur), a cache for
static assets, and Web Push for the notifications the app already sends by
email.

**Time.** Roughly 3–5 days. Service worker and caching strategy (1–2 days),
Web Push end to end — VAPID keys, subscription table, permission prompt,
send path wired into the existing notification preferences (2–3 days).

**Maintenance.** Low, and it is the same maintenance as the web app. One
codebase, one deploy, one set of tests. The one genuinely new failure mode
is a stale service worker serving old assets after a deploy, which is a
known problem with a known fix (versioned cache names, `skipWaiting`), and
it is the reason the caching strategy should be network-first for anything
that is not a hashed static asset.

**UX.** Good, and better than it sounds. Full-screen, home-screen icon,
splash screen, no address bar. What it does *not* get: an App Store
listing, native share-sheet integration, background execution, or the
platform's own biometric prompt.

**Cost.** €0. No developer programme, no review queue, no release process.

**What native would buy over this — and how much of it is still true.**
This is where the conventional answer has changed. Web Push works on
Android Chrome (since 2015) and on iOS Safari for **home-screen-installed**
PWAs since iOS 16.4 (March 2023). Push — historically the single strongest
argument for going native — is no longer a reason on its own.

**The real limitations, stated plainly:**

- **iOS push requires installation first.** A user who has not tapped
  "Add to Home Screen" cannot receive a push, and Safari gives no prompt
  suggesting they should. That is a conversion funnel we would have to
  build and it will leak.
- **No App Store presence.** Nobody discovers this by searching an app
  store. For a B2B SaaS that is acquired through the web anyway, that
  matters much less than it would for a consumer app — but it is a real
  loss, and "our competitor is in the App Store" is a sales objection.
- **iOS may evict storage** after ~7 days of non-use for sites without
  meaningful engagement. Irrelevant for cached assets; relevant if we ever
  relied on IndexedDB as a source of truth. We should not.
- **No camera-with-native-permissions**, though `<input capture>` and
  `getUserMedia` cover photo capture adequately.

### B. Capacitor — wrap the existing app

**What it is.** A native shell (Xcode/Android Studio projects) whose main
view is a WebView. Native plugins bridge camera, push, biometrics,
filesystem.

**The blocking problem for us.** Capacitor expects to bundle a static web
build into the app. We cannot produce one (see above). The alternative is
`server.url` in `capacitor.config` — the shell loads the hosted site over
the network. That configuration is what Apple's **Guideline 4.2 (Minimum
Functionality)** exists to reject: an app that is a WebView pointed at a
website, with no meaningful native functionality, is routinely refused.
Reviewers do check. We would need to add genuine native capability — push
handled natively, camera, biometric unlock, offline data — *before* the
first submission, not after.

So the honest estimate is not "wrap it in a week".

**Time.** 3–5 weeks to a submittable app: Capacitor setup and two native
projects (3–4 days), making the auth cookie flow work inside a WebView
(2–3 days — this is the part that bites, since `@supabase/ssr` sets
cookies from a server the WebView is merely pointed at), native push with
APNs and FCM (4–5 days), enough native surface to clear 4.2 (1 week),
store assets, screenshots, privacy manifests and two review cycles (1
week, mostly waiting).

**Maintenance.** Meaningfully higher, and permanently. Two store listings,
two review queues, two signing-certificate expiries, forced SDK upgrades on
Apple's schedule rather than ours, and a release process where a one-line
fix takes a day instead of a minute. Every Capacitor plugin is a third
party in a build that ships to customers.

**UX.** Marginally better than the PWA for most screens (it is the same
HTML), noticeably better for push, camera and biometrics.

**Cost.** Apple Developer Program **$99/year**, Google Play **$25**
one-time. Plus the real cost, which is the maintenance above.

### C. React Native (Expo) — a second app

**What it is.** A native app sharing nothing with the web front-end except
the API. Every screen rewritten.

**Time.** 3–6 months for parity. The dashboard is ~50 routes across
overview, chat, agents, missions, website builder, files, research,
presentations, marketplace, settings and billing. Chat alone is streaming
NDJSON with markdown rendering; the presentation editor is a
container-query-based renderer with drag-and-drop; the website builder
previews generated HTML in a sandboxed iframe. None of that ports — it is
rewritten.

**Maintenance.** Two front-ends forever. Every feature ships twice, every
bug is fixed twice, and they drift. This is the option that quietly doubles
the cost of all twelve remaining V3 tasks and of everything after them.

**UX.** Genuinely native, and better than both alternatives. Real
navigation, real gestures, real performance on cheap Android hardware.

**Cost.** Same store fees. The dominant cost is engineering time and the
permanent duplication.

---

## Side by side

| | A. PWA | B. Capacitor | C. React Native |
|---|---|---|---|
| Time to ship | 3–5 days | 3–5 weeks | 3–6 months |
| Ongoing maintenance | Same as web | Two stores, two queues | Two front-ends, forever |
| Store presence | No | Yes | Yes |
| Push | Yes (iOS needs install) | Yes, native | Yes, native |
| Offline | Shell + assets | Shell + assets | Real offline possible |
| Camera | `getUserMedia` / `capture` | Native | Native |
| Blocked by our stack? | No | **Yes** — no static export, Guideline 4.2 risk | No |
| Money | €0 | $99/yr + $25 | $99/yr + $25 |
| Reversible | Entirely | Mostly | No |

---

## Recommendation

**Do A now. Do not do B or C yet.**

The reasoning, in order of weight:

1. **The thing native used to be for is available on the web now.** Push
   was the argument, and Web Push has worked on installed iOS PWAs since
   2023. Paying three weeks and a permanent release process for a
   capability we can have in three days is a bad trade at this stage.

2. **We do not yet know what mobile users need.** The app has no mobile
   usage data because it has never had a mobile-first surface. Task 14
   ends with "final sidebar consolidation based on real usage data" —
   the same principle applies here, and more strongly, because this
   decision is far more expensive to reverse. A PWA is how we find out
   which screens people actually open on a phone, and that answer should
   inform what a native app would even contain.

3. **B is not the cheap middle option it looks like.** For most Next.js
   apps it would be. For this one — no static export, server-resolved
   auth cookies, and an App Review guideline aimed precisely at
   WebView-wrapped websites — it is a three-week project with a rejection
   risk, and it ends with the same UX as A plus a release process.

4. **C is the right answer eventually, and the wrong answer now.** It
   doubles the delivery cost of every remaining feature. It is worth that
   when there is a mobile-first use case that genuinely cannot be served
   by the web — sustained offline use, background location, deep OS
   integration — or when store distribution is a real acquisition channel
   rather than a hypothetical one. Neither is true today.

**What would change this recommendation.** Any of these, and B or C
becomes correct:

- Customers ask for it in the sales process and it is losing deals.
- A feature genuinely needs background execution or real offline editing.
- Mobile becomes a majority of sessions — at which point the PWA's usage
  data tells us exactly which screens a native app has to nail first.

## If A is approved, the scope is

1. A service worker with a versioned cache: network-first for pages and
   API, cache-first for hashed static assets, and a real offline page
   rather than the browser's error.
2. Web Push: VAPID keys, a `push_subscriptions` table with the same RLS
   shape as everything else, a permission prompt that asks at a moment
   the user would say yes (after a success, never on load), and delivery
   wired into the **existing** per-type notification preferences and the
   20/day per-user send cap rather than a second, parallel system.
3. An iOS install prompt — a dismissible hint shown only to iOS Safari
   users who are not already installed, because on iOS push does not work
   until they are.
4. Build-gate tests: the manifest stays valid and installable, the
   service worker cannot serve a stale build after a deploy, and a push
   subscription is scoped to its owner like every other row here.

Anything beyond that list is a new decision.
