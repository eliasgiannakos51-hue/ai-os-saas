// "DOES THIS NUMBER REACH THE READER?" — asked by rendering, once, for every
// gate that needs to ask it.
//
// WHY THIS EXISTS. Four gates checked that a message still carried its count
// by looking for the substring `{count}` in the translation. All four went
// red on the same afternoon, and none of them had found a defect: the
// messages had become ICU plurals — `{count, plural, one {# page} other {#
// pages}}` — so that one page stops reading "1 pages". The check was asserting
// a SPELLING and the spelling had improved.
//
// What those gates actually mean to claim is that the number is not dropped:
// a confirmation that silently omits how many scheduled runs are about to go,
// or a price with no price in it, is the defect. That is a question about
// output, so it is asked of output.
//
// FIVE AND SEVEN, and not one and two. The two probe numbers have to fall in
// the SAME plural category in every language, or a difference in the rendered
// string could come from the branch rather than the number — and 2 is worse
// still, because Arabic's dual prints no numeral at all ("صفحتان"), so a
// message that carries its count perfectly would look like one that dropped
// it. In all ten locales here, 5 and 7 are both `other` (Arabic: both `few`).
export const PROBE_A = 5;
export const PROBE_B = 7;

/**
 * True when `variable` genuinely reaches the rendered message.
 *
 * @param createTranslator next-intl's createTranslator, passed in so this file
 *   stays import-light and every caller renders through the app's own
 *   formatter rather than a second implementation.
 * @param locale        e.g. "ar"
 * @param messages      that locale's whole message object
 * @param namespace     e.g. "dashboard.mission"
 * @param key           the leaf key within the namespace
 * @param variable      the placeholder being checked
 * @param others        the message's other variables, held constant
 */
export function carriesNumber(
  createTranslator,
  { locale, messages, namespace, key, variable, others = {} },
) {
  const errors = [];
  const t = createTranslator({
    locale,
    messages,
    namespace,
    onError: (e) => errors.push(String(e)),
  });
  const base = { ...others, [variable]: PROBE_A };
  const moved = { ...others, [variable]: PROBE_B };
  let a;
  let b;
  try {
    a = t(key, base);
    b = t(key, moved);
  } catch (e) {
    errors.push(String(e));
  }
  // A message that fails to format at all has not carried anything, and a
  // message that reads the same at five and at seven has dropped the number.
  return (
    errors.length === 0 && typeof a === "string" && a.trim() !== "" && a !== b
  );
}
