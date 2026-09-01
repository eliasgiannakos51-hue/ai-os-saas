/**
 * ONE formatBytes, because there were two and they disagreed.
 *
 * lib/files/file-types.ts had one and lib/websites/storage-quota.ts had
 * another, and the difference was not cosmetic:
 *
 *   input        files/          websites/
 *   NaN          "—"             "0 MB"
 *   -524288000   "-524288000 B"  "0 MB"
 *
 * The second column is the rule this product wrote down and then broke in
 * its own storage meter: a dash beats a number nobody measured, and
 * "0 MB" for an unknown size is a number nobody measured.
 *
 * AND THE FIRST COLUMN WAS WRONG TOO, in a way I introduced earlier in
 * this same session. I fixed the NaN case in file-types.ts and wrote:
 *
 *     "NEGATIVES ARE LEFT ALONE deliberately: website-builder passes a
 *      remaining-quota figure that is meaningfully negative when an
 *      account is over cap, and '-500 MB' is the honest rendering."
 *
 * Two things wrong with that sentence. website-builder-workspace.tsx
 * imports formatBytes from websites/storage-quota.ts, not from the
 * function the comment was attached to — so it never saw that behaviour
 * at all, it saw "0 MB". And the function itself did not render
 * "-500 MB": every negative is below 1024, so it fell into the bytes
 * branch and rendered "-524288000 B". A comment describing a behaviour
 * that neither the function nor its caller had.
 *
 * So: the magnitude is formatted and the sign is put back, which is what
 * the sentence claimed all along, and there is one implementation for
 * both callers to disagree with.
 *
 * NOT LOCALE-AWARE, and that is a known gap rather than a decision:
 * toFixed always writes a full stop, so a Greek user reads "1.5 MB" where
 * every other number in the product is formatted through
 * lib/format-number.ts and reads "1,5". Changing it means a locale
 * argument at ~15 call sites and is not part of this fix.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1024) return `${sign}${Math.round(v)} B`;
  if (v < 1024 * 1024) return `${sign}${(v / 1024).toFixed(0)} KB`;
  if (v < 1024 * 1024 * 1024) return `${sign}${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${sign}${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
