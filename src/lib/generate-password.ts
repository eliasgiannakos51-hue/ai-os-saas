const CHAR_SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digit: "0123456789",
  special: "!@#$%^&*()-_=+[]{}",
};

// crypto.getRandomValues, not Math.random(), so generated passwords aren't
// predictable from a seeded/weak PRNG.
function randomInt(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
}

function randomChar(charset: string): string {
  return charset[randomInt(charset.length)];
}

// Guarantees at least one char from every set (so the result always passes
// PASSWORD_RULES) by seeding one from each, filling the rest from the
// combined pool, then shuffling so the guaranteed chars aren't always at
// the front.
export function generateStrongPassword(length = 16): string {
  const allChars = Object.values(CHAR_SETS).join("");
  const required = Object.values(CHAR_SETS).map((set) => randomChar(set));
  const remaining = Math.max(length - required.length, 0);
  const rest = Array.from({ length: remaining }, () => randomChar(allChars));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
