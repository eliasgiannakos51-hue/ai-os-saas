/**
 * RULE 2: NEVER A PRIVATE KEY, NEVER A SEED PHRASE.
 *
 * ============================================================
 * WHY A VALIDATOR AND NOT JUST A SCHEMA
 * ============================================================
 *
 * The schema is the first line: crypto_wallets has one address column and
 * nowhere to put a key. But a user pasting into an "address" field does
 * not know that. Somebody who has been told to "connect your wallet" by
 * three other products, two of which asked for a seed phrase, will paste
 * one here — and the field would accept it, store it, and it would then
 * exist in a database, in a backup, and in whatever log line printed the
 * request body.
 *
 * So the input is CHECKED, and what it does when it matches is the whole
 * design: it REFUSES, and it does not echo the value back. Not in the
 * error, not in a log, not in a validation message that says "that
 * doesn't look like an address: <the seed phrase>". The refusal names the
 * shape, never the content.
 *
 * ============================================================
 * WHAT IT LOOKS FOR
 * ============================================================
 *
 * BIP-39 mnemonics (12/15/18/21/24 words), raw 32-byte hex, WIF keys,
 * extended private keys (xprv/yprv/zprv/tprv), and PEM private key
 * blocks. Each is checked by SHAPE — this file contains no wordlist and
 * no key material of its own.
 *
 * FALSE POSITIVES ARE THE ACCEPTABLE FAILURE. Refusing a legitimate
 * address that happens to look like a key costs the user one retry with
 * a clear message. Accepting a seed phrase costs them everything they own.
 * The bias is deliberate and it only ever runs on this one field.
 *
 * Pure: no network, no database, no logging. It cannot leak what it is
 * given because it never passes it anywhere.
 */

export type SecretShape =
  | "mnemonic"
  | "hex_private_key"
  | "wif_private_key"
  | "extended_private_key"
  | "pem_private_key";

export type SecretScan =
  | { looksSecret: false }
  | { looksSecret: true; shape: SecretShape };

/** Word counts BIP-39 defines. 12 and 24 are what wallets show; the
 *  others are valid and are what a paranoid user's paper backup says. */
const MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

export function scanForSecret(value: unknown): SecretScan {
  if (typeof value !== "string") return { looksSecret: false };
  const text = value.trim();
  if (!text) return { looksSecret: false };

  // PEM block. Checked first because it is unambiguous.
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    return { looksSecret: true, shape: "pem_private_key" };
  }

  // Extended private key. xprv/yprv/zprv on mainnet, tprv/uprv/vprv on
  // testnet. The public halves (xpub etc.) are deliberately NOT matched:
  // an xpub is a watch-only key and is exactly the kind of read-only
  // credential this product is allowed to hold.
  if (/^(?:x|y|z|t|u|v)prv[1-9A-HJ-NP-Za-km-z]{50,}$/.test(text)) {
    return { looksSecret: true, shape: "extended_private_key" };
  }

  // WIF: 51 characters starting 5, or 52 starting K or L (mainnet), or
  // 51-52 starting 9 or c (testnet). Base58, so no 0, O, I or l.
  if (/^[59KLc][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(text)) {
    return { looksSecret: true, shape: "wif_private_key" };
  }

  // Raw 32-byte hex, with or without 0x. This is what an Ethereum private
  // key looks like — and it is EXACTLY twenty characters longer than an
  // Ethereum address, which is the confusion this catches.
  const hex = text.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return { looksSecret: true, shape: "hex_private_key" };
  }

  // A mnemonic: a run of lowercase alphabetic words at a BIP-39 count.
  // No wordlist is consulted — a 12-word phrase in this field is refused
  // whether or not every word is in the list, because a phrase with one
  // typo is still somebody's wallet.
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (MNEMONIC_WORD_COUNTS.has(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w))) {
    return { looksSecret: true, shape: "mnemonic" };
  }

  return { looksSecret: false };
}

/**
 * The one function the routes call.
 *
 * Throws nothing and returns nothing that contains the input. A caller
 * that wants to log the refusal can log `shape` and stop there.
 */
export function assertNoSecret(value: unknown): { ok: true } | { ok: false; shape: SecretShape } {
  const scan = scanForSecret(value);
  return scan.looksSecret ? { ok: false, shape: scan.shape } : { ok: true };
}

/**
 * A PUBLIC address, validated by shape.
 *
 * Deliberately permissive about chains and strict about length: this is a
 * "does it plausibly identify an account" check, not a checksum
 * validation. A wrong address here shows the user an empty balance, which
 * is recoverable; the unrecoverable failure is the one above.
 */
export const WALLET_CHAINS = ["bitcoin", "ethereum", "solana", "other"] as const;
export type WalletChain = (typeof WALLET_CHAINS)[number];

export function isWalletChain(value: unknown): value is WalletChain {
  return typeof value === "string" && (WALLET_CHAINS as readonly string[]).includes(value);
}

export const MAX_ADDRESS_LENGTH = 128;

export type AddressCheck =
  | { ok: true; address: string }
  | { ok: false; reason: "empty" | "too_long" | "looks_like_a_secret" | "not_an_address"; shape?: SecretShape };

export function checkWalletAddress(raw: unknown, chain: WalletChain): AddressCheck {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const address = raw.trim();
  if (!address) return { ok: false, reason: "empty" };
  if (address.length > MAX_ADDRESS_LENGTH) return { ok: false, reason: "too_long" };

  // THE SECRET CHECK COMES FIRST, before any chain-specific shape test.
  // An Ethereum private key is valid hex and would sail past a lenient
  // "looks like hex" address check.
  const secret = scanForSecret(address);
  if (secret.looksSecret) return { ok: false, reason: "looks_like_a_secret", shape: secret.shape };

  const plausible =
    chain === "ethereum"
      ? /^0x[0-9a-fA-F]{40}$/.test(address)
      : chain === "bitcoin"
        ? /^(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|bc1[0-9ac-hj-np-z]{11,71})$/.test(address)
        : chain === "solana"
          ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
          : /^[0-9A-Za-z:._-]{8,}$/.test(address);

  return plausible ? { ok: true, address } : { ok: false, reason: "not_an_address" };
}
