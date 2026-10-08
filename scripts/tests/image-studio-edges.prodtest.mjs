/*
 * PACKAGE 19 AT ITS EDGES, THROUGH THE REAL ROUTES (MASTER 16, Α19):
 * «παίρνω 4 παραλλαγές, αλλάζω μία με λόγια, και την κατεβάζω στην
 * υψηλότερη ανάλυση» — walked as a person would, on a production build,
 * with nothing standing between the screen and the server.
 *
 * scripts/tests/image-studio.prodtest.mjs answers the three routes that
 * reach the provider from the browser, so it holds the screen. This file
 * holds the rest: the real /api/images/generate, /[id]/edit, /[id]/full,
 * /[id]/download and the page ask a local stand-in for Gemini that answers
 * in the provider's own shape (candidates[].content.parts[].inlineData,
 * promptFeedback.blockReason, and its error body). The app's address for
 * the provider is a constant (lib/images/gemini-image.ts), so the server
 * is started with scripts/tests/lib/gemini-stand-in.mjs loaded first,
 * which sends that one host to the stand-in and touches nothing else. The
 * stand-in for Supabase keeps what is written — the row, the pictures in
 * the bucket, the holds on credits — so what the routes did is counted,
 * not assumed. No key is real and nothing leaves this machine (NEEDS 5).
 *
 * Around the walk, in Greek and in English, on a desktop with a mouse and
 * a phone with real touch:
 *   - an account with nothing yet;
 *   - the picture sent back to the provider is the one chosen, and the
 *     largest size is made from the CHANGED picture, saved at the size the
 *     provider made it, once, then free;
 *   - the provider down, declining, making three of four, and the reader
 *     pressing Stop while it is slow;
 *   - out of credits; a Free account; the switch off;
 *   - the tool's name wherever the tool is named: the tab, the ⌘K menu,
 *     the records hub, All tools — and the old ideas page keeping its own
 *     name where the switch is off;
 *   - no word of the other language on the screen.
 *
 * Run: node scripts/tests/image-studio-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/image-studio-edges.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

let pass = 0;
const failures = [];
let where = "";
function check(name, cond, detail) {
  const label = where ? `[${where}] ${name}` : name;
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

const L = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
/** One `{count, plural, one {…} other {…}}`, as next-intl renders it. */
function plural(s, n, locale, vars = {}) {
  const m = /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/.exec(s);
  const shown = new Intl.NumberFormat(locale).format(n);
  const out = m ? s.replace(m[0], (n === 1 ? m[1] : m[2]).replace("#", shown)) : s;
  return fill(out, vars);
}
/** The number a price line ends on: «4 εικόνες: 36 credits» → 36. */
const priceIn = (text) => {
  const all = [...String(text).matchAll(/(\d[\d.,  ]*)\s*credits?\b/g)];
  return all.length ? Number(all.at(-1)[1].replace(/\D/g, "")) : NaN;
};

// ---------------------------------------------------------------------
// THE STAND-IN FOR SUPABASE, KEEPING WHAT IS WRITTEN
// ---------------------------------------------------------------------
const tables = new Map();
const table = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const objects = new Map(); // "bucket/path" -> { bytes, type }
const rpcs = [];
const holds = new Map(); // reservation id -> credits held
const state = { credits: 3000 };
let clock = Date.parse("2026-10-08T09:00:00Z");
const now = () => new Date((clock += 1000)).toISOString();

function reset({ tier = "growth", credits = 3000, flag = "staff" } = {}) {
  tables.clear();
  objects.clear();
  rpcs.length = 0;
  holds.clear();
  state.credits = credits;
  MOCK_USER.user_metadata = { subscription_tier: tier };
  table("user_credits").push({ user_id: MOCK_USER.id, credits_remaining: credits, credits_total: credits, plan_tier: tier, beta_expires_at: null });
  table("user_onboarding").push({ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null });
  setFlag(flag);
}
const setFlag = (audience) => tables.set("feature_flags", [{ key: "image-studio", audience }]);

const PASS_THROUGH = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
function matches(row, params) {
  for (const [key, raw] of params) {
    if (PASS_THROUGH.has(key)) continue;
    const v = String(raw);
    // claimImage's «free, or claimed long ago»: or=(busy_since.is.null,busy_since.lt.<cutoff>)
    if (key === "or") {
      const cut = /busy_since\.lt\.([^,)]+)/.exec(v)?.[1];
      if (row.busy_since != null && !(cut && Date.parse(row.busy_since) < Date.parse(cut))) return false;
      continue;
    }
    let m;
    if ((m = /^eq\.(.*)$/s.exec(v)) && String(row[key]) !== m[1]) return false;
    if ((m = /^neq\.(.*)$/s.exec(v)) && String(row[key]) === m[1]) return false;
    if ((m = /^gte\.(.*)$/s.exec(v)) && !(String(row[key] ?? "") >= m[1])) return false;
    if ((m = /^in\.\((.*)\)$/s.exec(v)) && !m[1].split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(row[key]))) return false;
    if (v === "is.null" && row[key] != null) return false;
    if (v === "not.is.null" && row[key] == null) return false;
  }
  return true;
}
function query(name, params) {
  let out = table(name).filter((row) => matches(row, params));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit") ?? 0);
  return limit > 0 ? out.slice(0, limit) : out;
}

// A stand-in that throws takes the whole run down with it and leaves the
// server behind, so a mistake in it is answered as a 500 and said.
function handle(args) {
  try {
    return answer(args);
  } catch (err) {
    console.log(`  stand-in error: ${err?.stack ?? err}`);
    args.res.writeHead(500, { "Content-Type": "application/json" });
    args.res.end(JSON.stringify({ message: String(err) }));
    return true;
  }
}
function answer({ req, res, url, body, raw }) {
  const p = decodeURIComponent(url.pathname);
  const send = (code, payload, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(payload === undefined ? "" : JSON.stringify(payload));
    return true;
  };

  // ---- storage: what storage-js asks for, signed and served
  if (req.method === "POST" && p === "/storage/v1/object/sign/ai-images") {
    const { paths = [] } = JSON.parse(body || "{}");
    return send(200, paths.map((path) => ({ path, signedURL: `/object/sign/ai-images/${path}?token=t`, error: null })));
  }
  if (p.startsWith("/storage/v1/object/sign/")) {
    const key = p.slice("/storage/v1/object/sign/".length);
    if (req.method === "POST") return send(200, { signedURL: `/object/sign/${key}?token=t` });
    const object = objects.get(key);
    if (!object) return send(404, { statusCode: "404", error: "not_found", message: "Object not found" });
    const name = url.searchParams.get("download");
    res.writeHead(200, { "Content-Type": object.type, ...(name ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } : {}) });
    res.end(object.bytes);
    return true;
  }
  if (p.startsWith("/storage/v1/object/")) {
    const rest = p.slice("/storage/v1/object/".length).replace(/^authenticated\//, "");
    if (req.method === "DELETE") {
      const prefixes = JSON.parse(body || "{}").prefixes ?? [];
      const removed = prefixes.filter((path) => objects.delete(`${rest}/${path}`));
      return send(200, removed.map((name) => ({ name })));
    }
    if (req.method === "POST" || req.method === "PUT") {
      objects.set(rest, { bytes: Buffer.from(raw), type: String(req.headers["content-type"] ?? "application/octet-stream") });
      return send(200, { Key: rest, Id: randomUUID() });
    }
    const object = objects.get(rest);
    if (!object) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "Content-Type": object.type });
    res.end(object.bytes);
    return true;
  }
  if (p.startsWith("/storage/v1/")) return send(200, {});

  // ---- database functions: the holds and the charge, as the real ones keep them
  if (p.startsWith("/rest/v1/rpc/")) {
    const name = p.slice("/rest/v1/rpc/".length);
    const args = JSON.parse(body || "{}");
    rpcs.push({ name, args });
    if (name === "reserve_credits") {
      if (state.credits >= args.p_credits) {
        const id = randomUUID();
        state.credits -= args.p_credits;
        holds.set(id, args.p_credits);
        return send(200, [{ reservation_id: id, available: state.credits }]);
      }
      return send(200, [{ reservation_id: null, available: state.credits }]);
    }
    if (name === "settle_reservation") {
      const held = holds.get(args.p_reservation_id) ?? 0;
      holds.delete(args.p_reservation_id);
      state.credits += held - Number(args.p_credits_to_charge ?? 0);
      table("ai_cost_log").push({ user_id: args.p_user_id, feature: args.p_feature, created_at: now() });
      res.writeHead(204);
      res.end();
      return true;
    }
    if (name === "release_reservation") {
      state.credits += holds.get(args.p_reservation_id) ?? 0;
      holds.delete(args.p_reservation_id);
      res.writeHead(204);
      res.end();
      return true;
    }
    if (name === "consume_rate_limit") return send(200, true);
    res.writeHead(204);
    res.end();
    return true;
  }

  // ---- tables
  if (p.startsWith("/rest/v1/")) {
    const name = p.slice("/rest/v1/".length);
    const prefer = String(req.headers.prefer ?? "");
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const respond = (list, code = 200) => {
      const headers = {};
      if (/count=/.test(prefer)) headers["Content-Range"] = list.length > 0 ? `0-${list.length - 1}/${list.length}` : "*/0";
      if (single) return list[0] ? send(code, list[0], headers) : send(406, { code: "PGRST116", message: "no rows" });
      if (req.method === "HEAD") return send(code, undefined, headers);
      return send(code, list, headers);
    };
    if (req.method === "GET" || req.method === "HEAD") {
      for (const row of name === "user_credits" ? table(name) : []) row.credits_remaining = state.credits;
      return respond(query(name, url.searchParams));
    }
    const payload = JSON.parse(body || "null");
    if (req.method === "POST") {
      const added = (Array.isArray(payload) ? payload : [payload]).filter(Boolean).map((row) => ({ id: randomUUID(), created_at: now(), busy_since: null, ...row }));
      table(name).push(...added);
      return /return=representation/.test(prefer) ? respond(added, 201) : send(201, undefined);
    }
    if (req.method === "PATCH") {
      const hit = table(name).filter((row) => matches(row, url.searchParams));
      hit.forEach((row) => Object.assign(row, payload ?? {}));
      return /return=representation/.test(prefer) ? respond(hit) : send(204, undefined);
    }
    if (req.method === "DELETE") {
      tables.set(name, table(name).filter((row) => !matches(row, url.searchParams)));
      return send(204, undefined);
    }
  }
  return false;
}

reset();
const supa = await startMockSupabase({ port: 54487, handle });

// ---------------------------------------------------------------------
// THE STAND-IN FOR GEMINI, in its own answer shapes
// ---------------------------------------------------------------------
// The sizes are the stand-in's own: a preview, and four times its edges
// when imageSize "4K" is asked for. What is checked is that the file saved
// is the one the provider made at the largest size, not what Google's
// exact pixel counts are.
const PREVIEW = { "1:1": [1024, 1024], "4:5": [896, 1120], "16:9": [1344, 768], "9:16": [768, 1344] };
const gemini = { calls: [], mode: "ok", failVersion: 0, held: [], closedEarly: 0 };
const made = new Map(); // sha -> { version, kind, width, height }
let colour = 0;
async function picture(width, height) {
  colour++;
  const bytes = await sharp({ create: { width, height, channels: 3, background: { r: (colour * 53) % 256, g: (colour * 97) % 256, b: (colour * 151) % 256 } } }).png().toBuffer();
  return bytes;
}
const googleError = (code, status, message) => ({ error: { code, message, status } });
const geminiServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let asked = {};
    try { asked = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    const parts = asked.contents?.[0]?.parts ?? [];
    const text = parts.find((x) => typeof x.text === "string")?.text ?? "";
    const source = parts.find((x) => x.inlineData)?.inlineData;
    const call = {
      model: decodeURIComponent(/\/models\/([^:]+):generateContent/.exec(req.url)?.[1] ?? ""),
      keyInHeader: Boolean(req.headers["x-goog-api-key"]),
      keyInAddress: /[?&]key=/.test(req.url),
      text,
      version: Number(/Version (\d) of 4/.exec(text)?.[1] ?? 0),
      sourceFirst: Boolean(parts[0]?.inlineData),
      source: source ? sha(Buffer.from(source.data, "base64")) : null,
      aspect: asked.generationConfig?.imageConfig?.aspectRatio ?? null,
      size: asked.generationConfig?.imageConfig?.imageSize ?? null,
      modalities: asked.generationConfig?.responseModalities ?? null,
    };
    gemini.calls.push(call);
    const reply = (code, payload) => {
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(code, { "Content-Type": "application/json; charset=UTF-8" });
      res.end(JSON.stringify(payload));
    };
    const pictureAnswer = async () => {
      const [w, h] = PREVIEW[call.aspect] ?? PREVIEW["1:1"];
      const [width, height] = call.size === "4K" ? [w * 4, h * 4] : [w, h];
      const bytes = await picture(width, height);
      made.set(sha(bytes), { version: call.version, kind: call.size === "4K" ? "full" : call.source ? "edit" : "variant", width, height });
      return {
        candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: "image/png", data: bytes.toString("base64") } }] }, finishReason: "STOP", index: 0 }],
        usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 1290, totalTokenCount: 1330, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }] },
        modelVersion: call.model,
        responseId: randomUUID().replace(/-/g, "").slice(0, 22),
      };
    };
    if (gemini.mode === "down") return reply(503, googleError(503, "UNAVAILABLE", "The model is overloaded. Please try again later."));
    if (gemini.mode === "refuse")
      return reply(200, { promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 40, totalTokenCount: 40 }, modelVersion: call.model });
    if (gemini.mode === "partial" && call.version === gemini.failVersion)
      return reply(500, googleError(500, "INTERNAL", "An internal error has occurred. Please retry or report in https://developers.generativeai.google/guide/troubleshooting"));
    if (gemini.mode === "hang") {
      req.socket.on("close", () => { if (!res.writableEnded) gemini.closedEarly++; });
      gemini.held.push(async () => reply(200, await pictureAnswer()));
      return;
    }
    reply(200, await pictureAnswer());
  });
});
await new Promise((r) => geminiServer.listen(0, "127.0.0.1", r));
const GEMINI_URL = `http://127.0.0.1:${geminiServer.address().port}`;

// ---------------------------------------------------------------------
// ONE BUILD, ONE SERVER
// ---------------------------------------------------------------------
const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const STAND_IN = fileURLToPath(new URL("./lib/gemini-stand-in.mjs", import.meta.url));
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: "",
  GEMINI_API_KEY: "",
  GOOGLE_API_KEY: "",
};

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { geminiServer.close(); } catch {}
};

async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await sleep(1000); }
  }
  throw new Error("the production server did not start");
}

const DEVICES = [
  { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
];

async function open(origin, device, locale) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}

const visible = (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
async function backToConversation(page, press) {
  if (await visible(page, '[data-testid="tool-shell-back"]')) await press(page.locator('[data-testid="tool-shell-back"]'));
}
async function say(page, press, text) {
  await page.locator("textarea").first().fill(text);
  await press(page.locator('button[type="submit"]').first());
}
/** A large amount asks once more; this answers it, and returns what it said. */
async function confirmIfAsked(page, press) {
  await sleep(300);
  const dialog = page.locator('[role="dialog"]').last();
  if (!(await dialog.isVisible().catch(() => false))) return null;
  const said = await dialog.innerText();
  await press(dialog.locator("button").last());
  return said;
}
/** Until `n` pictures are in the grid and every one has been drawn. */
const picturesDrawn = (page, n, timeout = 20000) =>
  page
    .waitForFunction((count) => { const imgs = [...document.querySelectorAll('[data-testid="image-grid"] img')]; return imgs.length === count && imgs.every((i) => i.complete && i.naturalWidth > 0); }, n, { timeout })
    .catch(() => null);
const shownPictures = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid="image-grid"] img')].map((img) => ({ src: img.src, drawn: img.complete && img.naturalWidth > 0 })));
async function bytesOf(src) {
  const r = await fetch(src);
  return Buffer.from(await r.arrayBuffer());
}
const threadText = (page) => page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "");
const mainText = (page) => page.locator("main").innerText().catch(() => "");
const titleName = async (page) => (await page.title()).split(" — ")[0].trim();
const rows = () => table("generated_images");

// ---------------------------------------------------------------------
// NO WORD OF THE OTHER LANGUAGE. On a Greek screen: none of this package's
// English sentences (the leaves of these namespaces whose Greek differs),
// cut at their placeholders. On an English screen: no Greek letter.
// ---------------------------------------------------------------------
const NAMESPACES = ["dashboard.images", "dashboard.toolShell", "common.upgradeRequired", "credits.estimate", "aiSteps", "sidebar.items", "sidebar.hints", "dashboard.tools", "dashboard.records"];
const at = (o, path) => path.split(".").reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
function englishFragments() {
  const out = new Set();
  const walk = (en, el) => {
    for (const [k, v] of Object.entries(en ?? {})) {
      if (typeof v === "string") {
        const greek = typeof el?.[k] === "string" ? el[k] : "";
        if (greek === v) continue;
        const plain = v.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "\u0000");
        for (const piece of plain.split("\u0000").map((s) => s.trim())) {
          if (piece.length >= 4 && /[A-Za-z]{3}/.test(piece) && !greek.includes(piece)) out.add(piece);
        }
      } else if (v && typeof v === "object") walk(v, el?.[k]);
    }
  };
  for (const ns of NAMESPACES) walk(at(L.en, ns), at(L.el, ns));
  return [...out];
}
const EN_ONLY = englishFragments();
async function language(page, locale, label) {
  const text = await page.evaluate(() => [document.title, document.querySelector("main")?.innerText ?? "", ...[...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText)].join("\n"));
  if (locale === "el") {
    const found = EN_ONLY.filter((f) => new RegExp(`(^|[^A-Za-z])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z])`).test(text));
    check(`${label}: no English sentence of this package on the Greek screen`, found.length === 0, found.slice(0, 5).join(" | "));
  } else {
    const greek = text.match(/[Ͱ-Ͽἀ-῿][^\n]{0,40}/g) ?? [];
    check(`${label}: no Greek on the English screen`, greek.length === 0, greek.slice(0, 3).join(" | "));
  }
  check(`${label}: no message key or placeholder shows`, !/\b(dashboard|sidebar|common)\.[a-zA-Z]+\.[a-zA-Z.]+\b|\{(n|count|made|asked|feature|plan)\}/.test(text));
}

// ---------------------------------------------------------------------
// THE TOOL'S NAME, WHERE THE TOOL IS NAMED
// ---------------------------------------------------------------------
async function names(page, press, origin, device, locale, on) {
  const T = L[locale];
  const want = on ? T.sidebar.items.imageTool : T.sidebar.items.images;
  const other = on ? T.sidebar.items.images : T.sidebar.items.imageTool;
  const state = on ? "switch on" : "switch off";

  // ⌘K: the search in the top bar, from sm up (below it the bar has no room for it).
  if (!device.touch) {
    await page.goto(`${origin}/dashboard/tools`, { waitUntil: "networkidle" });
    await press(page.locator("header button:has(kbd)").first());
    const box = page.locator('[role="dialog"] input').first();
    await box.waitFor({ timeout: 5000 }).catch(() => null);
    await box.fill(locale === "el" ? "εικ" : "imag");
    await sleep(700);
    const menu = await page.locator('[role="dialog"]').first().innerText().catch(() => "");
    const lines = menu.split("\n").map((s) => s.trim());
    check(`${state}: the ⌘K menu names /dashboard/images «${want}»`, lines.includes(want) && !lines.includes(other), JSON.stringify(lines.slice(0, 12)));
    const row = page.locator('[role="dialog"]').getByText(want, { exact: true }).first();
    if (await row.isVisible().catch(() => false)) {
      await press(row);
      await page.waitForURL(/\/dashboard\/images/, { timeout: 10000 }).catch(() => null);
      check(`${state}: ...and that row opens it`, new URL(page.url()).pathname === "/dashboard/images", page.url());
    } else check(`${state}: ...and that row opens it`, false, "no such row");
  }

  // The hub of every page the sidebar does not draw.
  await page.goto(`${origin}/dashboard/records`, { waitUntil: "networkidle" });
  const entry = page.locator('a[href="/dashboard/images"]').first();
  const said = (await entry.innerText().catch(() => "")).split("\n").map((s) => s.trim()).filter(Boolean);
  check(`${state}: the records hub names it «${want}»`, said[0] === want, JSON.stringify(said));
  if (on) check(`${state}: ...and does not say the tool makes nothing`, !said.includes(T.sidebar.hints.images), JSON.stringify(said));

  // All tools: never the ideas page's name for the tool; any square it draws for it carries the tool's.
  await page.goto(`${origin}/dashboard/tools`, { waitUntil: "networkidle" });
  const squares = await page.locator('a[data-testid="tool-tile"][href="/dashboard/images"]').allInnerTexts();
  const body = await mainText(page);
  if (on) {
    check(`${state}: All tools never calls it «${other}», and its squares (${squares.length}) say «${want}»`,
      !body.includes(other) && squares.every((s) => s.split("\n")[0].trim() === want), JSON.stringify(squares));
  } else {
    check(`${state}: All tools has no square for the ideas page`, squares.length === 0, JSON.stringify(squares));
  }
}

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env: base, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  const ON = await start({
    ...base,
    TEST_ACCOUNT_EMAILS: MOCK_USER.email,
    GEMINI_API_KEY: "placeholder-answered-locally",
    GEMINI_STAND_IN_URL: GEMINI_URL,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${STAND_IN}`.trim(),
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of DEVICES) {
    for (const locale of ["el", "en"]) {
      const T = L[locale];
      const I = T.dashboard.images;
      where = `${device.label} ${locale}`;
      console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}, ${locale} ==`);
      const DESCRIPTION = locale === "el" ? "Βάρκα στο λιμάνι της Νάξου" : "A boat in the harbour at Naxos";
      const CHANGE = locale === "el" ? "πιο ζεστά χρώματα" : "warmer colours";
      // The saved file is named by the description's first six words (lib/images/image-studio.ts, imageFilename).
      const FILE = DESCRIPTION.split(/\s+/).slice(0, 6).join("-");

      // ---------------------------------------------------------------
      // 1. AN ACCOUNT WITH NOTHING YET
      // ---------------------------------------------------------------
      reset({ tier: "growth", credits: 3000 });
      gemini.mode = "ok";
      const { context, page, press } = await open(ON, device, locale);
      await page.goto(`${ON}/dashboard/images`, { waitUntil: "networkidle" });
      check("the tab says the tool's name", (await titleName(page)) === T.sidebar.items.imageTool, await page.title());
      check("the page is the Image tool, with what it does", (await mainText(page)).includes(I.name) && (await mainText(page)).includes(I.help));
      const priceLine = await page.locator('[data-testid="image-price"]').innerText().catch(() => "");
      const price4 = priceIn(priceLine);
      check(`its price is on the screen before anything is spent (${price4})`, Number.isFinite(price4) && price4 > 0 && priceLine === plural(I.priceVariants, price4, locale, { n: 4 }), priceLine);
      await press(page.locator('[data-testid="image-recent-open"]'));
      await sleep(300);
      check("«earlier» says there is nothing yet", (await page.locator('[data-testid="tool-shell-work"]').innerText().catch(() => "")).includes(I.recentEmpty));
      if (device.touch) await backToConversation(page, press);
      else await press(page.locator('[data-testid="image-recent-open"]'));
      await language(page, locale, "empty");

      // ---------------------------------------------------------------
      // 2. FOUR PICTURES FROM ONE DESCRIPTION
      // ---------------------------------------------------------------
      await press(page.locator('[data-testid="image-aspect"]'));
      await press(page.getByText(I.aspects.wide, { exact: true }));
      let before = state.credits;
      let since = gemini.calls.length;
      await say(page, press, DESCRIPTION);
      const askedOnce = await confirmIfAsked(page, press);
      if (askedOnce !== null) check("...a large amount asks once more, with the same number", askedOnce.includes(new Intl.NumberFormat(locale).format(price4)), askedOnce);
      await picturesDrawn(page, 4);
      await sleep(500);
      const asked = gemini.calls.slice(since);
      check("the provider is asked four times, once per version, in the chosen shape",
        asked.length === 4 && JSON.stringify(asked.map((c) => c.version).sort()) === "[1,2,3,4]" && asked.every((c) => c.aspect === "16:9" && c.size === null && c.text.includes(DESCRIPTION) && !c.source),
        JSON.stringify(asked.map(({ version, aspect, size }) => ({ version, aspect, size }))));
      check("...a picture asked for, the key in a header and never in the address",
        asked.every((c) => c.keyInHeader && !c.keyInAddress && JSON.stringify(c.modalities) === '["IMAGE"]' && c.model === "gemini-2.5-flash-image"));
      let shown = await shownPictures(page);
      const firstBytes = await Promise.all(shown.map((s) => bytesOf(s.src)));
      check("four pictures open beside the conversation, each drawn, each the provider's own version in its place",
        shown.length === 4 && shown.every((s) => s.drawn) && firstBytes.every((b, i) => made.get(sha(b))?.version === i + 1),
        JSON.stringify(firstBytes.map((b) => made.get(sha(b)) ?? null)));
      check(`...and exactly the price shown is charged (${before - state.credits} of ${price4})`, before - state.credits === price4 && holds.size === 0, `${before} -> ${state.credits}, holds ${holds.size}`);
      check("...the conversation says four are ready", (await threadText(page)).includes(fill(I.made, { made: 4, asked: 4 })));
      check("...and the image is kept: one row, four pictures in the bucket", rows().length === 1 && rows()[0].variants.length === 4 && rows()[0].variants.every((v) => objects.has(`ai-images/${v.path}`)));
      await language(page, locale, "four");

      // ---------------------------------------------------------------
      // 3. ONE CHOSEN, CHANGED WITH WORDS
      // ---------------------------------------------------------------
      const second = page.locator('[data-testid="image-variant"]').nth(1);
      await press(second);
      check("pressing one chooses it", (await second.getAttribute("aria-pressed")) === "true");
      if (device.touch) await backToConversation(page, press);
      check("the field now changes that picture alone", (await page.locator("textarea").first().getAttribute("placeholder")) === fill(I.placeholderEdit, { n: 2 }));
      const editLine = await page.locator('[data-testid="image-price"]').innerText().catch(() => "");
      const priceEdit = priceIn(editLine);
      check(`...with the price of one change on the screen (${priceEdit})`, Number.isFinite(priceEdit) && priceEdit > 0 && priceEdit < price4, editLine);
      before = state.credits;
      since = gemini.calls.length;
      await say(page, press, CHANGE);
      await confirmIfAsked(page, press);
      await page.waitForFunction((old) => { const i = document.querySelectorAll('[data-testid="image-grid"] img')[1]; return i && i.src !== old && i.complete; }, shown[1].src, { timeout: 20000 }).catch(() => null);
      await sleep(400);
      const change = gemini.calls.slice(since);
      check("the provider gets THAT picture first, then the words, and nothing else is asked",
        change.length === 1 && change[0].sourceFirst && change[0].source === sha(firstBytes[1]) && change[0].text.includes(CHANGE) && change[0].size === null && change[0].aspect === "16:9",
        JSON.stringify(change.map(({ source, size, aspect }) => ({ source, size, aspect }))));
      const afterChange = await shownPictures(page);
      const changedBytes = await bytesOf(afterChange[1].src);
      check("...only picture 2 changed, to what the provider made",
        made.get(sha(changedBytes))?.kind === "edit" && [0, 2, 3].every((i) => afterChange[i].src === shown[i].src) && afterChange[1].src !== shown[1].src);
      check(`...one change is charged (${before - state.credits} of ${priceEdit})`, before - state.credits === priceEdit && holds.size === 0);
      check("...the one it replaced is kept", rows()[0].variants[1].previous.length === 1 && objects.has(`ai-images/${rows()[0].variants[1].previous[0]}`));
      check("...and it says only that one changed", (await threadText(page)).includes(fill(I.changed, { n: 2 })));
      await language(page, locale, "changed");

      // ---------------------------------------------------------------
      // 4. THE LARGEST SIZE, OF THE CHANGED PICTURE, ONCE
      // ---------------------------------------------------------------
      if (device.touch && !(await visible(page, '[data-testid="image-full"]'))) await press(page.locator('[data-testid="tool-shell-card"]').last());
      if ((await page.locator('[data-testid="image-variant"]').nth(1).getAttribute("aria-pressed")) !== "true") await press(page.locator('[data-testid="image-variant"]').nth(1));
      const fullButton = page.locator('[data-testid="image-full"]');
      const priceFull = priceIn(await fullButton.innerText());
      check(`the largest size says its price on the button (${priceFull})`, Number.isFinite(priceFull) && priceFull > 0);
      before = state.credits;
      since = gemini.calls.length;
      let downloadP = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
      await press(fullButton);
      await confirmIfAsked(page, press);
      let download = await downloadP;
      const big = gemini.calls.slice(since);
      check("the largest size is asked for by name, from the CHANGED picture, at the 4K model",
        big.length === 1 && big[0].size === "4K" && big[0].source === sha(changedBytes) && big[0].model === "gemini-3-pro-image-preview",
        JSON.stringify(big.map(({ model, size, source }) => ({ model, size, source }))));
      const saved = download ? readFileSync(await download.path()) : Buffer.alloc(0);
      const meta = saved.length ? await sharp(saved).metadata() : {};
      const preview = await sharp(changedBytes).metadata();
      check(`...and the file saved is the provider's largest picture (${meta.width}x${meta.height}, the preview was ${preview.width}x${preview.height})`,
        made.get(sha(saved))?.kind === "full" && meta.width > preview.width && meta.height > preview.height);
      check("...saved under the description's words",
        Boolean(download) && decodeURIComponent(new URL(download.url()).searchParams.get("download") ?? "") === `${FILE}-2-full.png`, download?.url());
      check(`...charged once (${before - state.credits} of ${priceFull})`, before - state.credits === priceFull && holds.size === 0);
      check("...and the page stayed where it was", new URL(page.url()).pathname === "/dashboard/images");
      await sleep(300);
      const again = page.locator('[data-testid="image-full"]');
      check("pressed again it is the ready file", (await again.innerText()).includes(I.fullDownload) && (await again.evaluate((e) => e.tagName)) === "A");
      before = state.credits;
      since = gemini.calls.length;
      downloadP = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
      await press(again);
      download = await downloadP;
      check("...the same file, not made again, and free",
        Boolean(download) && sha(readFileSync(await download.path())) === sha(saved) && gemini.calls.length === since && state.credits === before);
      downloadP = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
      await press(page.locator('[data-testid="image-download"]'));
      download = await downloadP;
      check("«Λήψη» saves the picture as it is, under its name",
        Boolean(download) && sha(readFileSync(await download.path())) === sha(changedBytes) && decodeURIComponent(new URL(download.url()).searchParams.get("download") ?? "") === `${FILE}-2.png`, download?.url());

      // ---------------------------------------------------------------
      // 5. IT IS THERE TOMORROW
      // ---------------------------------------------------------------
      await page.reload({ waitUntil: "networkidle" });
      await press(page.locator('[data-testid="image-recent-open"]'));
      await page.locator('[data-testid="image-recent"] button').first().waitFor({ timeout: 10000 }).catch(() => null);
      await press(page.locator('[data-testid="image-recent"] button').first());
      await picturesDrawn(page, 4);
      shown = await shownPictures(page);
      const reopened = await Promise.all(shown.map((s) => bytesOf(s.src)));
      check("after a reload: the four, with picture 2 as it was changed",
        shown.length === 4 && shown.every((s) => s.drawn) && sha(reopened[1]) === sha(changedBytes) && [0, 2, 3].every((i) => sha(reopened[i]) === sha(firstBytes[i])),
        JSON.stringify({ drawn: shown.map((s) => s.drawn), made: reopened.map((b) => made.get(sha(b)) ?? null) }));
      await press(page.locator('[data-testid="image-variant"]').nth(1));
      check("...and its largest size still ready", (await page.locator('[data-testid="image-full"]').innerText()).includes(I.fullDownload));
      await press(page.locator('[data-testid="image-variant"]').nth(1));
      if (device.touch) await backToConversation(page, press);
      else await press(page.locator('[data-testid="tool-shell-close"]'));

      // ---------------------------------------------------------------
      // 6. WHEN THE PROVIDER FAILS
      // ---------------------------------------------------------------
      const rowsBefore = rows().length;
      const objectsBefore = objects.size;
      for (const [mode, expect, label] of [
        ["down", I.errors.unavailable, "the provider down (503)"],
        ["refuse", I.errors.refused, "the provider declining"],
      ]) {
        gemini.mode = mode;
        before = state.credits;
        since = gemini.calls.length;
        await say(page, press, DESCRIPTION);
        await confirmIfAsked(page, press);
        await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.innerText.includes(t), expect, { timeout: 20000 }).catch(() => null);
        check(`${label}: said in the reader's words`, (await threadText(page)).includes(expect));
        check(`...nothing charged, nothing held, nothing kept (${gemini.calls.length - since} asked)`,
          state.credits === before && holds.size === 0 && rows().length === rowsBefore && objects.size === objectsBefore && gemini.calls.length - since === 4);
      }
      gemini.mode = "partial";
      gemini.failVersion = 3;
      before = state.credits;
      await say(page, press, DESCRIPTION);
      await confirmIfAsked(page, press);
      await picturesDrawn(page, 3);
      await sleep(400);
      const settled = rpcs.filter((r) => r.name === "settle_reservation").at(-1)?.args?.p_credits_to_charge;
      check("three of four: the three are shown, and it says so", (await shownPictures(page)).length === 3 && (await threadText(page)).includes(fill(I.made, { made: 3, asked: 4 })));
      check(`...and three are charged, less than four (${before - state.credits} < ${price4})`, before - state.credits === settled && settled > 0 && settled < price4 && holds.size === 0);
      // A change that fails, then the same change again.
      gemini.mode = "down";
      await press(page.locator('[data-testid="image-variant"]').first());
      if (device.touch) await backToConversation(page, press);
      const srcBefore = (await shownPictures(page))[0]?.src;
      before = state.credits;
      await say(page, press, CHANGE);
      await confirmIfAsked(page, press);
      await sleep(1500);
      check("a change while the provider is down: said, nothing charged, the picture as it was",
        (await threadText(page)).split(I.errors.unavailable).length >= 3 && state.credits === before && holds.size === 0 && rows().at(-1).busy_since === null);
      gemini.mode = "ok";
      since = gemini.calls.length;
      await say(page, press, CHANGE);
      await confirmIfAsked(page, press);
      await sleep(1500);
      if (device.touch && !(await visible(page, '[data-testid="image-grid"]'))) await press(page.locator('[data-testid="tool-shell-card"]').last());
      const retried = (await shownPictures(page))[0]?.src;
      check("...and the same change again works, the image not left locked", gemini.calls.length - since === 1 && retried && retried !== srcBefore, `${srcBefore} -> ${retried}`);
      if (device.touch) await backToConversation(page, press);
      if (await visible(page, '[data-testid="box-clear"]')) await press(page.locator('[data-testid="box-clear"]'));

      // The reader presses Stop while the provider is slow.
      gemini.mode = "hang";
      gemini.held = [];
      gemini.closedEarly = 0;
      before = state.credits;
      const rowsAtStop = rows().length;
      since = gemini.calls.length;
      await say(page, press, DESCRIPTION);
      await confirmIfAsked(page, press);
      for (let i = 0; i < 40 && gemini.calls.length - since < 4; i++) await sleep(250);
      await press(page.locator('[data-testid="chat-stop"]'));
      await sleep(1500);
      check("Stop while the provider is slow: it says it stopped", (await threadText(page)).includes(T.aiSteps.stopped));
      const late = gemini.held.splice(0);
      gemini.mode = "ok";
      for (const answerLate of late) await answerLate();
      await sleep(2000);
      check(`...the calls to the provider are dropped (${gemini.closedEarly} of ${late.length})`, late.length === 4 && gemini.closedEarly === 4);
      check("...and nothing is charged, held or kept, even when the provider answers after all",
        state.credits === before && holds.size === 0 && rows().length === rowsAtStop, `${before} -> ${state.credits}, holds ${holds.size}, rows ${rowsAtStop} -> ${rows().length}`);

      // Measured here, with a balance that is not low: under 20% the top
      // bar's low-credits notice is a separate matter of the whole
      // dashboard, not of this page.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);

      // ---------------------------------------------------------------
      // 7. OUT OF CREDITS
      // ---------------------------------------------------------------
      state.credits = 0;
      since = gemini.calls.length;
      await say(page, press, DESCRIPTION);
      await confirmIfAsked(page, press);
      await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.innerText.includes(t), I.errors.insufficient, { timeout: 10000 }).catch(() => null);
      check("out of credits: said, and the provider is never asked", (await threadText(page)).includes(I.errors.insufficient) && gemini.calls.length === since && state.credits === 0);
      await language(page, locale, "failures");
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

      // ---------------------------------------------------------------
      // 8. A FREE ACCOUNT WITH THE SWITCH ON
      // ---------------------------------------------------------------
      reset({ tier: "free", credits: 100 });
      since = gemini.calls.length;
      await page.goto(`${ON}/dashboard/images`, { waitUntil: "networkidle" });
      const wall = await mainText(page);
      const starter = "Starter";
      check("Free: the tab says the tool's name", (await titleName(page)) === T.sidebar.items.imageTool, await page.title());
      check("Free: the wall names the tool and the plan it comes with",
        (await page.locator("main h1").first().innerText().catch(() => "")) === I.name && wall.includes(fill(T.common.upgradeRequired.body, { feature: I.name, plan: starter })), wall.slice(0, 300));
      check("...and its button goes to that plan", (await page.locator('main a[href="/pricing#plan-starter"]').count()) === 1);
      const refused = await page.request.post(`${ON}/api/images/generate`, { data: { description: DESCRIPTION, aspect: "1:1" } });
      check("...and the route refuses before it asks anything", refused.status() === 403 && (await refused.json()).code === "not_included" && gemini.calls.length === since);
      await language(page, locale, "free");

      // ---------------------------------------------------------------
      // 9. THE NAME, ON AND OFF
      // ---------------------------------------------------------------
      reset({ tier: "growth", credits: 3000 });
      await names(page, press, ON, device, locale, true);
      setFlag("off");
      await page.goto(`${ON}/dashboard/images`, { waitUntil: "networkidle" });
      check("switch off: the old ideas page, under its own name, in the tab and the heading",
        (await titleName(page)) === T.sidebar.items.images && (await page.locator("main h1").first().innerText().catch(() => "")) === T.sidebar.items.images && (await page.locator('[data-testid="image-price"]').count()) === 0);
      await names(page, press, ON, device, locale, false);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
  }
  where = "";
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
