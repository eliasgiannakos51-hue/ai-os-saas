/*
 * A BASELINE THAT SAYS, IN ONE MACHINE-READABLE LINE, HOW MUCH ROOM IT
 * HAS LEFT.
 *
 * A baseline is a number set at the size of a problem so the problem
 * cannot grow. It is only worth having while it stays AT the size of the
 * problem: the day the count drops and the number does not, the gate has
 * silently started permitting a regression back to the old bad state, and
 * it goes on reporting PASS the whole time.
 *
 * That is not hypothetical here. i18n-coverage's own header records
 * exactly this failure — "it knew about three and stayed at three long
 * after they were paid off" — and V5 #13 found a live one:
 * CLIENT_FALLBACK_BASELINE stood at 31 against a measured 28, so three
 * new English fallbacks could have shipped without a single check going
 * red.
 *
 * The line below is what makes the gap a number somebody else can read:
 *
 *     BASELINE CLIENT_FALLBACK_BASELINE declared=28 measured=28
 *
 * scripts/tests/baselines.test.mjs runs every gate that emits one,
 * compares the two, and reddens when the gap exceeds what the register
 * allows — which for most of them is nothing at all.
 */

/**
 * Prints one baseline's declared and measured values.
 *
 * NOT AN ASSERTION. The gate that owns the baseline still makes its own
 * check, in its own words, with its own failure message; this only
 * publishes the two numbers so a second gate can compare them. Making it
 * assert would move the decision away from the file that understands it.
 */
export function reportBaseline(name, declared, measured) {
  console.log(`BASELINE ${name} declared=${declared} measured=${measured}`);
}

/** The shape baselines.test.mjs parses back out of a gate's stdout. */
export const BASELINE_LINE = /^BASELINE ([A-Z][A-Z0-9_]*) declared=(-?\d+(?:\.\d+)?) measured=(-?\d+(?:\.\d+)?)$/gm;
