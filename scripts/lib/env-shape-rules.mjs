/**
 * WHAT SHAPE A VARIABLE'S NAME PROMISES, ANSWERED ONCE.
 *
 * ONE RULE, THREE READERS, which is why this is a module and not a
 * constant inside whichever file needed it first:
 *
 *   scripts/env-sensitivity.mjs builds a sentinel of the right shape for
 *   every variable, because a sentinel of the WRONG shape makes the
 *   instrument cry wolf — its own header records the run where
 *   NEXT_PUBLIC_SUPABASE_URL was set to "sentinel-not-a-real-value" and
 *   `next build` died with an anonymous `TypeError: Invalid URL`.
 *
 *   next.config.mjs refuses a value that its name says cannot work, at
 *   build time, NAMING the variable.
 *
 *   scripts/tests/env-shape.test.mjs holds both against this file.
 *
 * THE GAP THIS CLOSES was named in env-sensitivity.mjs and left open:
 * "the shape is taken from the NAME, which is all this file knows — and
 * a name that says URL and holds something else is a different problem."
 * That is this file.
 *
 * WHAT IT CANNOT DO, said plainly. It knows nothing about whether a
 * well-shaped value is the RIGHT one. `https://wrong-project.supabase.co`
 * is a URL and this will pass it. The claim is only that a value whose
 * name promises a URL is a URL — which is the difference between a
 * build that says which variable is wrong and one that says
 * `TypeError: Invalid URL` and leaves you to guess.
 */

/** The shape a variable's NAME promises. */
export function shapeOf(name) {
  if (/(?:^|_)(?:URL|URI|ENDPOINT|ORIGIN|HOST)(?:_|$)/.test(name)) return "url";
  if (/EMAIL|MAILTO/.test(name)) return "email";
  if (/(?:_EUR|_USD|_RATIO|_MS|_DAYS|_SECONDS|_MINUTES|_LIMIT|_MAX|_MIN|_COUNT|_PORT|_PERCENT)$/.test(name)) return "number";
  if (/ENCRYPTION_KEY|_SECRET_KEY$/.test(name)) return "key32";
  return "opaque";
}

/** A value of the right shape, unusable on purpose. */
export function sentinelFor(name, opaque = "sentinel-not-a-real-value") {
  switch (shapeOf(name)) {
    case "url":
      return "https://sentinel.invalid";
    case "email":
      return "sentinel@sentinel.invalid";
    case "number":
      return "1";
    case "key32":
      // 32 bytes, base64, so a decoder that checks the size gets
      // something the right size rather than a crash that says nothing
      // about the thing under test.
      return Buffer.alloc(32, 7).toString("base64");
    default:
      return opaque;
  }
}

/**
 * Why this value cannot be what its name says, or null.
 *
 * ABSENT IS NOT MALFORMED, and the distinction is the whole safety
 * argument for wiring this into the build. An unset variable, or one set
 * to the empty string, is a DIFFERENT condition with its own handling
 * all over this repository — api/health reports it, the price-without-key
 * gate is about it, and half the product degrades deliberately without
 * one. This function answers only "is the value that IS there
 * impossible", so turning it into a build failure can never fail a build
 * that would otherwise have succeeded: every value it rejects would have
 * failed later, anonymously.
 */
export function malformedReason(name, value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const v = String(value).trim();
  switch (shapeOf(name)) {
    case "url": {
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) return `is a ${u.protocol.replace(":", "")} URL, not http or https`;
        return null;
      } catch {
        return "is not a URL — new URL() refuses it";
      }
    }
    case "email": {
      // A LIST IS ALLOWED, because ADMIN_EMAILS is one. Every entry has
      // to be an address; a trailing comma is not a finding.
      const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return null;
      const bad = parts.filter((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
      if (bad.length === 0) return null;
      return bad.length === 1
        ? `holds something that is not an address: ${bad[0]}`
        : `holds ${bad.length} entries that are not addresses: ${bad.join(", ")}`;
    }
    case "number":
      return Number.isFinite(Number(v)) ? null : "is not a number";
    default:
      // key32 is NOT checked here. Its length rule belongs to the
      // decoder that uses it — lib/integrations/crypto.ts says what it
      // needs and says so at the point of use — and a second opinion
      // here could refuse a key the decoder would have accepted, which
      // is the one thing this file must never do.
      return null;
  }
}

/** Every name in `env` whose value cannot be what its name promises. */
export function malformedEnvVars(env, names) {
  const out = [];
  for (const name of names) {
    const why = malformedReason(name, env[name]);
    if (why) out.push({ name, why, shape: shapeOf(name) });
  }
  return out;
}
