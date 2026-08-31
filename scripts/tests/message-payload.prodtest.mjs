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


/**
 * The namespaces present in messages/en.json AS THE DEPLOYMENT HAS IT —
 * approximated by the merge base with the default branch, which is the
 * newest commit both this branch and the deployed line of development
 * share.
 *
 * Returns null when it cannot be determined (a shallow clone, no remote,
 * git absent). Callers must treat null as "no verdict", not as "fine".
 */
function deployedNamespaces() {
  for (const base of ["origin/main", "origin/master", "main", "master"]) {
    try {
      const mergeBase = execFileSync("git", ["merge-base", "HEAD", base], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const json = execFileSync("git", ["show", `${mergeBase}:messages/en.json`], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return new Set(Object.keys(JSON.parse(json)));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const DEPLOYED = deployedNamespaces();

/** Missing namespaces split into "never shipped yet" and "the outage". */
function splitMissing(missing) {
  if (DEPLOYED === null) {
    // Everything counts as a regression rather than being waved through:
    // an unclassifiable failure is still a failure.
    return { undeployed: [], regressions: missing, verdictIsSound: false };
  }
  return {
    undeployed: missing.filter((ns) => !DEPLOYED.has(ns)),
    regressions: missing.filter((ns) => DEPLOYED.has(ns)),
    verdictIsSound: true,
  };
}

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
  // TWO DIFFERENT THINGS LOOK IDENTICAL HERE, and calling both a failure
  // is what makes a test get ignored.
  //
  // This is one of only two prodtests that read the REAL DEPLOYMENT, and
  // it compares that deployment against the namespace list in the
  // WORKING TREE. So a namespace added on a branch is "missing from the
  // payload" until the branch ships — which is not a regression, it is
  // the ordinary state of every branch that adds a string.
  //
  // Observed: `sampleData` was added on this branch, is present in all
  // ten message files, and is genuinely absent from the deployed payload
  // — because the deployed commit predates it. Reported as an outage, it
  // is noise; reported as undeployed, it is true.
  //
  // The two are distinguishable: ask whether the deployment's own source
  // has the namespace, by reading messages/en.json at the merge base with
  // the default branch. A namespace the deployed code never had is
  // undeployed. One it HAS and does not serialise is the outage.
  const { undeployed, regressions, verdictIsSound } = splitMissing(missing);
  check(
    `${page}: all ${dashboard.namespaces.length} dashboard namespaces are in the payload`,
    regressions.length === 0,
    regressions.length
      ? `MISSING: ${regressions.join(", ")}\n        Every one of these renders as a raw key name after signing in.`
      : "",
  );
  if (undeployed.length > 0) {
    console.log(
      `        (not yet deployed, so not counted: ${undeployed.join(", ")})`,
    );
  }
  if (!verdictIsSound && missing.length > 0) {
    // NO MERGE BASE MEANS NO VERDICT. Saying "all clear" because the
    // question could not be asked is the failure mode this whole audit
    // exists to catch, so it says what it could not determine.
    check(
      `${page}: the undeployed/regression split could be computed`,
      false,
      `the merge base with the default branch is unavailable, so these ${missing.length} cannot be classified: ${missing.join(", ")}`,
    );
  }
}

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
