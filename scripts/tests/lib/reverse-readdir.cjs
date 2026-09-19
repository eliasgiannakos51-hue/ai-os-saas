/*
 * EVERY DIRECTORY LISTING, BACKWARDS.
 *
 * readdirSync does not promise an order. On ext4 it is hash order; on
 * another filesystem, another image, or a fresh clone laid down in a
 * different sequence, it is a different order. A gate that enumerates a
 * directory and then depends on WHICH file came first — the first
 * match, the first offender reported, a list compared position by
 * position — passes on the machine it was written on and can fail on
 * the builder, with a diff that explains nothing.
 *
 * Preloaded with --require, this reverses every listing. A gate whose
 * verdict changes is a gate that depends on an order nobody promised.
 * Reversal rather than a shuffle so a disagreement is reproducible: the
 * same run twice gives the same answer, which a random order would not.
 *
 * Used by scripts/scan-order-dependence.mjs.
 */
const fs = require("node:fs");

const realSync = fs.readdirSync;
fs.readdirSync = function readdirSync(...args) {
  const out = realSync.apply(this, args);
  return Array.isArray(out) ? [...out].reverse() : out;
};

const real = fs.readdir;
fs.readdir = function readdir(...args) {
  const cb = args[args.length - 1];
  if (typeof cb !== "function") return real.apply(this, args);
  args[args.length - 1] = (err, out) => cb(err, Array.isArray(out) ? [...out].reverse() : out);
  return real.apply(this, args);
};

const realPromise = fs.promises.readdir;
fs.promises.readdir = async function readdir(...args) {
  const out = await realPromise.apply(this, args);
  return Array.isArray(out) ? [...out].reverse() : out;
};
