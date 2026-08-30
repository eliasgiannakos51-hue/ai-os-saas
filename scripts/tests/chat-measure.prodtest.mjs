// THE CHAT MEASURE AND THE CONTRAST OVER THE GLOBE — read off real pixels.
//
// V4.6 #12. Three claims are made by the chat layout and none of them is
// checkable by reading source:
//
//   1. the assistant's reply has NO card behind it, so the backdrop
//      globe is what is behind the text;
//   2. a line holds 60-75 characters at every breakpoint;
//   3. every one of nine sampled points clears 4.5:1 over whatever the
//      globe, the network field and the ambient corners painted there.
//
// WHY CHARACTERS ARE COUNTED AND NOT COMPUTED. `max-width: 68ch` is a
// promise about the width of "0", and a line of real text is made of
// other letters — Greek is wider than Latin, Arabic is narrower and
// joins, and a Han character is about two "0"s. Dividing a pixel width
// by an assumed advance would produce a number that looks measured and
// is not. So each line's characters are counted with Range rects: every
// character in the paragraph gets its own rect, rects are grouped by
// their top edge, and a group is a line. That counts what is on the
// screen.
//
// FIFTEEN COMBINATIONS, NOT A SAMPLE. Five widths x three languages —
// Greek, Arabic and Chinese — because these are the three that break
// different things: Greek is the longest Latin-adjacent script, Arabic
// is right-to-left and joins, and Chinese has no spaces to break at and
// twice the advance per character. Testing el and ja instead would miss
// the CJK case entirely: kana give break opportunities that Han does not.
//
// SCREENSHOTS of all fifteen go to /tmp/chat-measure-<locale>-<width>.png.
//
// Run: node scripts/tests/chat-measure.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";

let pass = 0;
const failures = [];
let ctx = "";
function check(name, cond, detail) {
  const tagged = ctx ? `[${ctx}] ${name}` : name;
  if (cond) {
    pass++;
    console.log(`  PASS  ${tagged}`);
  } else {
    failures.push(tagged);
    console.log(`  FAIL  ${tagged}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONVO_ID = "cccccccc-1111-4111-8111-111111111111";
const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// Enough history that the thread genuinely overflows its container —
// a scroll contract cannot be tested in a view with no scrollbar.
// THE MESSAGES ARE IN THE LANGUAGE BEING MEASURED, and the first run of
// this file's fixture was not.
//
// It seeded one English body — "Message 1. Some longer content so each
// bubble takes real vertical space." — and set NEXT_LOCALE to el, ar and
// zh in turn. The cookie changes the CHROME. It does not change a row in
// chat_messages. So all three columns of the report came back at 66
// characters per line, identically, and the per-script bands underneath
// them were comparing English to English while claiming to compare Greek
// to Arabic to Chinese. Three passes of the same measurement is not a
// cross-product; it is one measurement printed three times.
//
// A Han character is roughly twice the advance of a Latin one, so if the
// Chinese column ever reads the same as the Greek one again, the text is
// not Chinese.
const BODIES = {
  el: "Η ανάλυση των εσόδων του τριμήνου δείχνει σταθερή άνοδο στις συνδρομές, με τη μεγαλύτερη συνεισφορά να προέρχεται από τους νέους λογαριασμούς του Μαρτίου και δευτερευόντως από τις ανανεώσεις. ",
  ar: "يُظهر تحليل إيرادات هذا الربع ارتفاعًا ثابتًا في الاشتراكات، وتأتي المساهمة الأكبر من الحسابات الجديدة في مارس، ثم من التجديدات في المرتبة الثانية. ",
  zh: "本季度的收入分析显示订阅收入稳步增长，其中贡献最大的是三月份新开通的账户，其次是续订带来的部分收入，整体趋势保持向上。",
};
const messagesFor = (locale) =>
  Array.from({ length: 40 }, (_, i) => ({
    id: `dddddddd-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
    conversation_id: CONVO_ID,
    role: i % 2 === 0 ? "user" : "assistant",
    // THE INDEX GOES AT THE END. As a prefix, `40. ` is an ORDERED LIST
    // in markdown, and message-content.tsx renders through react-markdown
    // — so the body became <ol start="40"><li>, the number turned into a
    // list marker rather than text, and the test's own
    // `waitForSelector("text=40.")` timed out against a page that had
    // rendered perfectly. A fixture that is valid markdown is not the
    // same thing as a fixture that says what it looks like.
    content: `${BODIES[locale].repeat(3)} #${i + 1}`,
    created_at: new Date(Date.UTC(2026, 1, 1, 10, i)).toISOString(),
  }));
// The stand-in serves whichever locale the current combination asked
// for; the loop sets this before each page load.
let activeLocale = "el";

const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  chat_conversations: [
    {
      id: CONVO_ID,
      title: "Long conversation",
      is_pinned: false,
      created_at: "2026-02-01T09:00:00Z",
      updated_at: "2026-02-01T11:00:00Z",
    },
  ],
};
// chat_messages is resolved per request rather than fixed, so the rows
// follow activeLocale.
Object.defineProperty(TABLE_ROWS, "chat_messages", {
  enumerable: true,
  get: () => messagesFor(activeLocale),
});

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    };
    const json = (code, data, extra = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...cors, ...extra });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (req.method === "POST") return json(201, []);
      const rows = TABLE_ROWS[table] ?? [];
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`,
          ...cors,
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

const SUPA_PORT = 54346;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
};
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

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

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function cleanup() {
  try {
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  supa.close();
}
if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}

// ---------------------------------------------------------------------
// THE CROSS-PRODUCT.
const WIDTHS = [1920, 1440, 768, 390, 375];
const LOCALES = [
  { code: "el", label: "Greek", dir: "ltr" },
  { code: "ar", label: "Arabic", dir: "rtl" },
  { code: "zh", label: "Chinese", dir: "ltr" },
];

// WHAT "60-75 CHARACTERS" MEANS PER SCRIPT, and why one number will not do.
//
// The rule is a typographic one about how far the eye travels before it
// has to find the next line, and it is stated in Latin characters. A Han
// character is roughly twice the advance of a Latin one, so the same
// physical line holds about half as many — and 30-40 is exactly the
// range Chinese typography asks for, so the SAME ch cap is right for
// both and the COUNT it produces is different on purpose. Arabic sits
// between the two.
//
// These bands are what was measured on this build, recorded so a change
// in the cap or in the font shows up as a number moving rather than as
// nothing at all. Greek carries the actual 60-75 requirement; the other
// two are reported and floored so they cannot silently collapse.
const BANDS = {
  el: { min: 60, max: 75, why: "the brief's number, unmodified" },
  ar: { min: 45, max: 95, why: "Arabic joins and its glyphs are narrower, so the same cap holds more characters" },
  zh: { min: 22, max: 48, why: "a Han character is about two '0's, so the same cap holds about half as many" },
};

// ONE COMBINATION AT A TIME, WHEN ITERATING. `CHAT_MEASURE_ONLY=el@768`
// runs a single cell of the cross-product instead of all fifteen — a
// full pass is one `next build` plus fifteen page loads, and iterating
// on a layout at that granularity is how a measurement session turns
// into a guessing session. It PRINTS that it is filtered, and the
// cross-product completeness check below fails when it is, so a filtered
// run can never be mistaken for a full one.
const ONLY = process.env.CHAT_MEASURE_ONLY ?? "";
if (ONLY) console.log(`FILTERED RUN: only ${ONLY} — this is not a full measurement\n`);

const { chromium } = await import("playwright");
const sharp = (await import("sharp")).default;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});

// --- contrast maths, on real pixels ----------------------------------
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = lum(...a), lb = lum(...b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
};

const perCombination = [];

try {
  for (const locale of LOCALES) {
    for (const width of WIDTHS) {
      ctx = `${locale.code} @${width}`;
      if (ONLY && ONLY !== ctx.replace(" ", "")) continue;
      activeLocale = locale.code;
      const context = await browser.newContext({
        viewport: { width, height: width <= 430 ? 844 : 900 },
        hasTouch: width <= 430,
        isMobile: width <= 430,
        storageState: {
          cookies: [
            { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" },
            { name: "NEXT_LOCALE", value: locale.code, domain: "127.0.0.1", path: "/" },
          ],
          origins: [],
        },
      });
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat?c=${CONVO_ID}`, {
          waitUntil: "networkidle",
          timeout: 60000,
        });
        // ASSERT THE SCREEN, because a redirect renders a different page
        // perfectly well and every number below would then describe it.
        const where = await page.evaluate(() => location.pathname);
        check("the chat opened", where === "/dashboard/chat", where);
        await page.waitForSelector('[data-testid="chat-thread"]', { timeout: 20000 });
        await page.waitForSelector("text=#40", { timeout: 20000 });
        await page.waitForTimeout(500);

        // 1. THE LOCALE ACTUALLY APPLIED, and the direction with it.
        const html = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
        }));
        // THE LANGUAGE IS ASSERTED; THE DIRECTION IS REPORTED.
        //
        // This file's first run failed Arabic on `dir === "rtl"` at all
        // five widths, and that was MY test asserting something the
        // product deliberately does not do. src/i18n/constants.ts says
        // so in as many words: "ar ships text-only Arabic translations
        // with no RTL layout support yet (no dir=\"rtl\", no
        // logical-property/mirrored-layout pass) ... Known limitation,
        // tracked rather than silently shipped."
        //
        // So the chrome stays left-to-right and the Arabic TEXT still
        // runs right-to-left inside it, by Unicode's bidi algorithm.
        // What matters for a measure test is that the Arabic is real
        // Arabic and that it wraps — both of which the character count
        // below actually measures. Failing on `dir` would be reporting a
        // decision as a defect, five times per run, and a gate that
        // cries about a known gap is a gate people stop reading.
        check(
          `the page is in ${locale.label} (lang="${html.lang}")`,
          html.lang.startsWith(locale.code),
          `expected lang ${locale.code}`
        );
        if (html.dir !== locale.dir) {
          console.log(
            `        note: dir="${html.dir}", not "${locale.dir}" — RTL layout is the ` +
              "documented gap in src/i18n/constants.ts, not a regression"
          );
        }

        // 2. NO CARD BEHIND THE ANSWER. Measured as a computed style on
        //    the element that holds the reply text, not as an absence of
        //    a class name: a card can be reinstated by any rule anywhere.
        const answerGround = await page.evaluate(() => {
          const thread = document.querySelector('[data-testid="chat-thread"]');
          if (!thread) return null;
          // The assistant's text block is the flex-1 sibling of the avatar.
          const blocks = [...thread.querySelectorAll("div.min-w-0.flex-1")];
          const el = blocks[blocks.length - 1];
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            background: cs.backgroundColor,
            border: cs.borderTopWidth,
            found: true,
          };
        });
        check(
          `the answer has no card (${answerGround ? answerGround.background : "no block found"})`,
          Boolean(answerGround) &&
            /rgba\(0, 0, 0, 0\)|transparent/.test(answerGround.background) &&
            answerGround.border === "0px",
          JSON.stringify(answerGround)
        );

        // 3. CHARACTERS PER LINE, counted from Range rects — and the
        //    geometry that produced them, because a count with no width
        //    beside it cannot be argued with. The first run of this file
        //    reported 24 characters at 768px and 41 at 390px, which is
        //    the narrower viewport holding the LONGER line: a number
        //    that makes no sense until the column width is printed next
        //    to it.
        const geometry = await page.evaluate(() => {
          const measure = document.querySelector(".chat-measure");
          const thread = document.querySelector('[data-testid="chat-thread"]');
          const block = [...document.querySelectorAll("div.min-w-0.flex-1")].pop();
          const box = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
          return {
            viewport: window.innerWidth,
            measure: box(measure),
            // THE WIDTH THE MEASURE WAS OFFERED, which is the only thing
            // that says whether the cap is doing any work. Subtracting
            // chrome from the viewport does not: the conversation sidebar
            // is `absolute` below xl, so it is 256px wide and occupies no
            // layout width at all, and subtracting it produced a NEGATIVE
            // "available" figure at 375px.
            offered: measure && measure.parentElement
              ? Math.round(measure.parentElement.getBoundingClientRect().width) -
                (parseFloat(getComputedStyle(measure.parentElement).paddingLeft) || 0) -
                (parseFloat(getComputedStyle(measure.parentElement).paddingRight) || 0)
              : null,
            thread: box(thread),
            textColumn: box(block),
            fontSize: measure ? getComputedStyle(measure).fontSize : null,
            // Every element wider than 200px between the viewport and the
            // text, so a squeeze can be attributed rather than guessed at.
            chrome: [...document.querySelectorAll("aside, nav")]
              .map((el) => ({ tag: el.tagName.toLowerCase(), w: box(el), cls: (el.className || "").slice(0, 40) }))
              .filter((c) => c.w > 100),
          };
        });
        console.log(
          `        column ${geometry.textColumn}px of ${geometry.measure}px measure ` +
            `at ${geometry.fontSize} (viewport ${geometry.viewport}) ` +
            `chrome: ${geometry.chrome.map((c) => `${c.tag}:${c.w}`).join(" ") || "none"}`
        );
        const lines = await page.evaluate(() => {
          const thread = document.querySelector('[data-testid="chat-thread"]');
          if (!thread) return [];
          const out = [];
          // Assistant paragraphs only: the user's turns are short and
          // would drag the average down without saying anything about
          // the measure.
          const blocks = [...thread.querySelectorAll("div.min-w-0.flex-1 p")];
          for (const p of blocks.slice(-6)) {
            const node = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length > 40);
            if (!node) continue;
            const text = node.textContent;
            const byTop = new Map();
            const range = document.createRange();
            for (let i = 0; i < text.length; i++) {
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const r = range.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              const key = Math.round(r.top);
              byTop.set(key, (byTop.get(key) ?? 0) + 1);
            }
            for (const [, count] of byTop) out.push(count);
          }
          return out;
        });
        // FULL LINES ONLY. The last line of a paragraph stops where the
        // sentence stops, so counting it would report a measure nobody
        // set. A line is "full" if it is within 20% of the longest one
        // in the sample.
        const longest = Math.max(0, ...lines);
        const full = lines.filter((n) => n >= longest * 0.8);
        const band = BANDS[locale.code];
        const avg = full.length ? Math.round(full.reduce((a, b) => a + b, 0) / full.length) : 0;
        check(
          `full lines were found to measure (${full.length} of ${lines.length})`,
          full.length >= 3,
          `${full.length} — a per-line assertion over fewer than three lines is not a measure`
        );

        // WHICH CONSTRAINT IS ACTUALLY BINDING, because the brief has two
        // rules and only one of them can apply at a time.
        //
        //   "60-75 characters"      — when the max-width cap is what stops
        //                             the line.
        //   "on mobile, full width" — when the VIEWPORT is what stops it,
        //                             and 60 characters at a readable size
        //                             simply do not fit.
        //
        // Asserting 60-75 at 375px would be asserting that a phone is not
        // a phone: measured, a 375px screen holds 38 Greek characters at
        // 15px, and the only ways to reach 60 are a 9px font or a
        // horizontal scrollbar. So the test asks which rule is in force —
        // the measure is "capped" when it is narrower than the space
        // available to it — and applies that one.
        // THE CAP BINDS when the measure is narrower than the space its
        // parent actually offered it. Anything else — chrome arithmetic,
        // viewport thresholds — is a guess about the layout rather than a
        // reading of it, and the first version of this line was exactly
        // that guess: `measure < viewport - 96`, which called 768px
        // cap-bound when what was really limiting it was a 240px nav.
        const capBinds = geometry.offered !== null && geometry.measure < geometry.offered - 8;
        if (capBinds) {
          check(
            `${avg} characters per line, band ${band.min}-${band.max} (${band.why})`,
            avg >= band.min && avg <= band.max,
            `min ${Math.min(...full)}, max ${Math.max(...full)}, all: ${full.join(",")}`
          );
        } else {
          // FULL WIDTH IS A MEASUREMENT TOO. "It uses the whole width" is
          // checkable: the measure must be within 24px of everything the
          // page has left after its own padding, or something is capping
          // it that should not be.
          check(
            `viewport-bound at ${avg} characters — the measure fills what it was offered ` +
              `(${geometry.measure}px of ${geometry.offered}px)`,
            geometry.offered !== null && geometry.measure >= geometry.offered - 8,
            `${geometry.measure}px of ${geometry.offered}px — something below the cap is narrowing it`
          );
        }

        // 4. NINE POINTS OF CONTRAST OVER WHATEVER IS BEHIND THE TEXT.
        //    On real text leaves, not on a grid: an empty patch reads
        //    1:1 and 1:1 means "no text here", not "a failure".
        // NINE POINTS NEEDS NINE LEAVES ON SCREEN, and one screenful of a
        // chat thread does not have them: the view opens at the bottom,
        // which at 1920 showed five text leaves and at 375 showed three.
        // The first run reported "all nine points clear 4.5:1 ... of 5
        // measured" — a sentence that names nine and counts five.
        //
        // So the thread is sampled at several scroll positions and the
        // leaves are pooled. Each is still read from a screenshot taken
        // at the position where that leaf was actually visible, because a
        // pixel from one scroll offset says nothing about a layer drawn
        // at another.
        const gather = async (fraction) => {
          await page.evaluate((f) => {
            const el = document.querySelector('[data-testid="chat-thread"]');
            if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
          }, fraction);
          await page.waitForTimeout(250);
          const boxes = await page.evaluate(() => {
          const thread = document.querySelector('[data-testid="chat-thread"]');
          const out = [];
          const walker = document.createTreeWalker(thread, NodeFilter.SHOW_ELEMENT);
          while (walker.nextNode()) {
            const el = walker.currentNode;
            if (el.children.length > 0) continue;
            const t = (el.textContent ?? "").trim();
            if (t.length < 3) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 24 || r.height < 8) continue;
            // FULLY ON SCREEN. A box that starts above the fold has no
            // pixels to read at its own top edge, and clamping it would
            // sample a different rectangle than the one being named.
            if (r.top < 0 || r.bottom > window.innerHeight) continue;
            out.push({
              x: Math.round(r.left), y: Math.round(r.top),
              w: Math.round(r.width), h: Math.round(r.height),
              text: t.slice(0, 24),
            });
          }
          return out;
          });
          const png = await page.screenshot();
          return { boxes, png };
        };

        const pools = [];
        // WALK UNTIL NINE DISTINCT LEAVES EXIST, rather than a fixed
        // number of stops. Five stops gave four leaves in Greek at 375px
        // and nine at 1920; nine stops gave seven. The shortfall was
        // never in how the nine were chosen — it was that a long Greek
        // paragraph fills a phone screen, so consecutive stops keep
        // landing on the same one. A fixed stop count is a guess about
        // how tall a message is in a language nobody has read yet.
        //
        // Capped at 30 so a page with genuinely too little text fails
        // rather than spinning.
        const STOPS = [];
        const distinct = new Set();
        for (let i = 0; i <= 30 && distinct.size < 9; i++) {
          const fraction = i / 30;
          STOPS.push(fraction);
          const pool = await gather(fraction);
          pools.push(pool);
          for (const b of pool.boxes) distinct.add(`${b.x}:${b.y}:${b.text}`);
        }
        const totalLeaves = pools.reduce((a, p) => a + p.boxes.length, 0);
        check(
          `there is text to sample across the thread (${totalLeaves} leaves over ${STOPS.length} scroll positions)`,
          totalLeaves >= 9,
          `${totalLeaves} — nine points cannot be taken from fewer than nine`
        );

        // ONE SCREENSHOT PER SCROLL POSITION, and each leaf read from
        // the one it was visible in. Reading a leaf's coordinates from
        // scroll position A against the pixels of position B measures a
        // rectangle of the page that leaf was never in — which is how a
        // contrast figure comes out reassuring and meaningless.
        const rasters = [];
        for (const pool of pools) {
          rasters.push(await sharp(pool.png).raw().toBuffer({ resolveWithObject: true }));
        }
        const cssHeight = width <= 430 ? 844 : 900;

        // NINE DISTINCT POINTS, spread over the whole thread. An earlier
        // draft took `sorted[floor(i*(len-1)/8)]` over five boxes, which
        // returns the same box more than once: the run then reported
        // "all nine points clear 4.5:1 ... of 9 measured" from five
        // measurements, one line under a FAILING "there is text on screen
        // to sample (5 leaves)". Two lines of one report disagreeing is
        // what a lying gate looks like.
        const candidates = [];
        pools.forEach((pool, pi) => {
          for (const b of pool.boxes) candidates.push({ ...b, pool: pi });
        });
        const seen = new Set();
        const picks = [];
        for (let i = 0; i < candidates.length && picks.length < 9; i++) {
          // Walk the pools in turn so the nine are spread down the
          // thread rather than taken from whichever screenful had most.
          const step = Math.max(1, Math.floor(candidates.length / 9));
          const c = candidates[(i * step) % candidates.length];
          const key = `${c.pool}:${c.x}:${c.y}:${c.text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          picks.push(c);
        }

        const measured = [];
        for (const b of picks) {
          const { data, info } = rasters[b.pool];
          const at = (x, y) => {
            const i = (y * info.width + x) * info.channels;
            return [data[i], data[i + 1], data[i + 2]];
          };
          // GROUND IS WHAT THE BOX IS MOSTLY MADE OF; INK IS WHAT IS
          // FURTHEST FROM IT. Taking the darkest pixel as the ink is a
          // light-theme assumption, and this theme is dark — every
          // reading came back 1.01:1 the first time that was tried.
          const counts = new Map();
          const pixels = [];
          const sx = Math.max(0, Math.round((b.x * info.width) / width));
          const sw = Math.round((b.w * info.width) / width);
          const sy = Math.max(0, Math.round((b.y * info.height) / cssHeight));
          const sh = Math.round((b.h * info.height) / cssHeight);
          for (let y = sy; y < Math.min(info.height, sy + sh); y++) {
            for (let x = sx; x < Math.min(info.width, sx + sw); x++) {
              const px = at(x, y);
              counts.set(px.join(","), (counts.get(px.join(",")) ?? 0) + 1);
              pixels.push(px);
            }
          }
          if (pixels.length === 0) continue;
          let ground = [0, 0, 0], best = 0;
          for (const [k, n] of counts) if (n > best) { best = n; ground = k.split(",").map(Number); }
          const gl = lum(...ground);
          let ink = ground;
          for (const px of pixels) if (Math.abs(lum(...px) - gl) > Math.abs(lum(...ink) - gl)) ink = px;
          measured.push({ ...b, r: ratio(ink, ground), ink, ground });
        }
        for (const m of measured) {
          console.log(
            `        ${String(m.r).padStart(6)}:1  ink rgb(${m.ink})  ground rgb(${m.ground})  "${m.text}"`
          );
        }
        const below = measured.filter((m) => m.r < 4.5);
        check(
          `all nine DISTINCT points clear 4.5:1 (${below.length} below, of ${measured.length} measured)`,
          measured.length >= 9 && below.length === 0,
          below.map((m) => `"${m.text}" ${m.r}:1`).join("; ") ||
            `only ${measured.length} distinct points could be sampled — nine were asked for`
        );

        await page.screenshot({ path: `/tmp/chat-measure-${locale.code}-${width}.png`, fullPage: false });
        perCombination.push({
          locale: locale.code,
          width,
          chars: avg,
          worstContrast: measured.length ? Math.min(...measured.map((m) => m.r)) : null,
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  cleanup();
}

ctx = "";
console.log("\n== the fifteen, side by side ==");
console.log("  locale  width   chars/line   worst contrast");
for (const r of perCombination) {
  console.log(
    `  ${r.locale.padEnd(7)} ${String(r.width).padStart(5)}   ${String(r.chars).padStart(10)}   ` +
      `${r.worstContrast === null ? "—" : r.worstContrast + ":1"}`
  );
}
check(
  `all fifteen combinations were measured (${perCombination.length})`,
  perCombination.length === 15 && !ONLY,
  ONLY
    ? `FILTERED to ${ONLY} — ${perCombination.length} of 15. This run proves nothing about the rest.`
    : `${perCombination.length} — a cross-product with holes in it is a sample`
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
