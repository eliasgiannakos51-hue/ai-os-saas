#!/usr/bin/env node
/*
 * THE PAGE A USER SIGNS IN FROM CARRIES THE STRINGS THE PAGE THEY LAND
 * ON WILL NEED.
 *
 * That sentence is the whole outage, stated as a test.
 *
 * app/layout.tsx is the ROOT layout. A shared layout is rendered once and
 * REUSED across client-side navigations beneath it, and login-form.tsx
 * signs a user in with router.push("/dashboard/overview") — a client-side
 * navigation. So the message payload serialised into /login is the
 * payload the DASHBOARD gets. When that payload was trimmed to five
 * namespaces, 121 of the dashboard's 188 client components rendered raw
 * key names: sidebar.items.home, sidebar.groups.workspace, and eight
 * more, for every user.
 *
 * Nothing in a unit test can see that: it is a property of two pages and
 * one navigation between them, in a real deployment. So this reads the
 * real HTML of the real sign-in page and checks that every namespace the
 * dashboard's client components ask for is in it.
 *
 * IT IS WRITTEN TO FAIL ON THE BROKEN DEPLOYMENT and pass on the fixed
 * one. Run it before merging the revert and it goes red on exactly the
 * namespaces that were cut.
 *
 * Run: node scripts/tests/message-payload.prodtest.mjs
 *      BASE_URL=... to point it at a preview
 */
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "https://ai-os-saas-five.vercel.app";
// The page a user is on when they press sign in, and the page most land
// on first. Both hand their payload to whatever they navigate to.
const ENTRY_PAGES = ["/login", "/", "/signup"];

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const { ROUTE_GROUPS } = await loadTs("src/lib/i18n/message-slices.ts");
const dashboard = ROUTE_GROUPS.find((g) => g.name === "dashboard");

// curl, not fetch(): Node 22's fetch is undici and undici does not read
// HTTPS_PROXY, so in a proxied environment every request leaves unproxied
// and comes back 403 — nine routes reported as unreachable while curl was
// answering fine.
const fetchHtml = (url) =>
  execFileSync("curl", ["-sS", "--compressed", url], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

console.log(`== the sign-in pages carry the dashboard's namespaces (${BASE}) ==`);
console.log(`   ${dashboard.namespaces.length} namespaces the dashboard's client components ask for\n`);

for (const page of ENTRY_PAGES) {
  let html;
  try {
    html = fetchHtml(`${BASE}${page}`);
  } catch (e) {
    check(`${page} answered`, false, e.message);
    continue;
  }
  check(`${page} answered (${html.length} chars)`, html.length > 1000);
  // The catalogue is serialised into the RSC flight data with escaped
  // quotes, so a namespace appears as \"name\":{ — searching for the bare
  // word would match prose, a class name or a route.
  const missing = dashboard.namespaces.filter(
    (ns) => !html.includes(`\\"${ns}\\":`) && !html.includes(`"${ns}":`),
  );
  check(
    `${page}: all ${dashboard.namespaces.length} dashboard namespaces are in the payload`,
    missing.length === 0,
    missing.length
      ? `MISSING: ${missing.join(", ")}\n        Every one of these renders as a raw key name after signing in.`
      : "",
  );
}

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
