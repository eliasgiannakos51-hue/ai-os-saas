/**
 * A POST PER PLATFORM — the contract the generator, the page and the
 * gate all read.
 *
 * The Content tracker (lib/modules.ts, `content`) is where a person types
 * a caption, a thread and some hashtags by hand. V5 #22 is the thing
 * that writes them: one brief in, one post per platform out, each cut to
 * that platform's length and written in that platform's register — and
 * NOT published anywhere. The roadmap's "Social posting" is the step
 * after this one and is still in "soon"; this page says so on screen
 * (posts.limits.* in the catalogue) rather than leaving the name to
 * promise it.
 *
 * EVERY LIMIT IS APPLIED TWICE. The model is told each platform's ceiling
 * in the prompt (prompt.ts), and parsePostsToolInput CUTS whatever comes
 * back to it, hashtags included — a 400-character "tweet" is not a post
 * anyone can paste. A prompt rule is a request; the parser is the
 * guarantee.
 *
 * Pure on purpose: no SDK, no database, no "server-only", so
 * scripts/tests/posts.test.mjs can load it and check every number here
 * against the real values.
 */

export const POST_PLATFORMS = ["linkedin", "x", "instagram", "facebook", "threads"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

export function isPostPlatform(value: unknown): value is PostPlatform {
  return typeof value === "string" && (POST_PLATFORMS as readonly string[]).includes(value);
}

export type PlatformSpec = {
  platform: PostPlatform;
  /** A brand name — shown as is in every language, never translated. */
  label: string;
  /** The hard ceiling the parser cuts to, text AND hashtag line together.
   *  X's is the network's own; the others are set well under the
   *  network's so a post reads as a post and not as an article. */
  maxChars: number;
  /** What the model is asked to aim for. */
  targetChars: [number, number];
  maxHashtags: number;
  /** The register, in English, for the prompt. */
  style: string;
  /** Characters the estimator holds for this platform — the ceiling plus
   *  the room a hashtag line and the JSON around it take. */
  outputAllowanceChars: number;
};

export const PLATFORMS: Record<PostPlatform, PlatformSpec> = {
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn",
    maxChars: 1500,
    targetChars: [700, 1300],
    maxHashtags: 3,
    style:
      "professional and specific. The first line is a hook that stands alone — it is all a reader sees before 'see more'. Short paragraphs separated by blank lines, no bullet walls, one concrete number or example, and it ends on a point or a question. Hashtags, if any, on the last line.",
    outputAllowanceChars: 1700,
  },
  x: {
    platform: "x",
    label: "X",
    maxChars: 280,
    targetChars: [120, 270],
    maxHashtags: 2,
    style: "one idea, said plainly, with no run-up and no sign-off. Short sentences. Hashtags only if they are the words people search for.",
    outputAllowanceChars: 340,
  },
  instagram: {
    platform: "instagram",
    label: "Instagram",
    maxChars: 900,
    targetChars: [250, 700],
    maxHashtags: 10,
    style:
      "warm and visual — it accompanies a picture, so it describes the moment or the feeling and then says what the reader can do. Line breaks between thoughts. Emoji are allowed but rare. Hashtags on their own line at the end, five to ten of them.",
    outputAllowanceChars: 1050,
  },
  facebook: {
    platform: "facebook",
    label: "Facebook",
    maxChars: 800,
    targetChars: [200, 600],
    maxHashtags: 2,
    style: "conversational, as if telling a neighbour. One question or one clear call to action near the end. No corporate phrasing.",
    outputAllowanceChars: 900,
  },
  threads: {
    platform: "threads",
    label: "Threads",
    maxChars: 500,
    targetChars: [150, 480],
    maxHashtags: 1,
    style: "casual and direct — one thought, the way a person types it, with a little personality. At most one hashtag, usually none.",
    outputAllowanceChars: 560,
  },
};

export const MAX_DESCRIPTION_CHARS = 3_000;
export const MIN_DESCRIPTION_CHARS = 10;

export type DescriptionVerdict =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_long"; limit: number };

export function checkDescription(description: string): DescriptionVerdict {
  const length = description.trim().length;
  if (length < MIN_DESCRIPTION_CHARS) return { ok: false, reason: "too_short", limit: MIN_DESCRIPTION_CHARS };
  if (length > MAX_DESCRIPTION_CHARS) return { ok: false, reason: "too_long", limit: MAX_DESCRIPTION_CHARS };
  return { ok: true };
}

/** The platforms asked for, in the contract's order, deduplicated, or
 *  every platform when the list is empty or unreadable. */
export function normalisePlatforms(value: unknown): PostPlatform[] {
  const wanted = new Set(Array.isArray(value) ? value.filter(isPostPlatform) : []);
  const ordered = POST_PLATFORMS.filter((p) => wanted.has(p));
  return ordered.length > 0 ? ordered : [...POST_PLATFORMS];
}

export type Post = {
  platform: PostPlatform;
  /** The post body, without the hashtag line. */
  text: string;
  /** Normalised: each starts with "#", no spaces, no duplicates, at most
   *  the platform's maxHashtags. */
  hashtags: string[];
};

export type PostSet = {
  version: 1;
  /** The language the posts are WRITTEN in. */
  locale: string;
  posts: Post[];
};

/**
 * What a person pastes: the body, then a blank line and the hashtags.
 * One function, so the copy button and the parser's length rule agree
 * about what "the post" is.
 */
export function postClipboardText(post: Post): string {
  return post.hashtags.length > 0 ? `${post.text}\n\n${post.hashtags.join(" ")}` : post.text;
}

function normaliseHashtag(raw: unknown): string | null {
  const word = String(raw ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "");
  if (!word || !/\p{L}|\p{N}/u.test(word)) return null;
  return `#${word.slice(0, 40)}`;
}

/**
 * Cuts text to `max` characters at a word boundary where one exists in
 * the last fifth, so a cut post ends on a word rather than mid-syllable.
 * Chinese and Japanese have no spaces and are cut at the limit, which is
 * a whole character there.
 */
export function cutToLength(text: string, max: number): string {
  if (text.length <= max) return text;
  const hard = text.slice(0, max);
  const lastSpace = hard.search(/\s\S*$/);
  return (lastSpace > max * 0.8 ? hard.slice(0, lastSpace) : hard).trimEnd();
}

export type PostsVerdict = { ok: true; set: PostSet } | { ok: false; reason: "no_posts" };

/**
 * The model's tool input, made safe.
 *
 * Only the platforms that were asked for are kept, in the contract's
 * order; a platform the model answered twice keeps its first answer;
 * hashtags are normalised and capped; and the BODY is cut so that body +
 * hashtag line together fit the platform's ceiling — the thing a person
 * pastes is what has to fit, not one half of it.
 */
export function parsePostsToolInput(
  raw: unknown,
  context: { platforms: PostPlatform[]; locale: string }
): PostsVerdict {
  const input = (raw ?? {}) as Record<string, unknown>;
  const entries = Array.isArray(input.posts) ? input.posts : [];
  const byPlatform = new Map<PostPlatform, Post>();
  for (const entry of entries) {
    const p = (entry ?? {}) as Record<string, unknown>;
    if (!isPostPlatform(p.platform) || !context.platforms.includes(p.platform) || byPlatform.has(p.platform)) continue;
    const spec = PLATFORMS[p.platform];
    const seen = new Set<string>();
    const hashtags: string[] = [];
    for (const h of Array.isArray(p.hashtags) ? p.hashtags : []) {
      const tag = normaliseHashtag(h);
      if (!tag || seen.has(tag.toLowerCase())) continue;
      seen.add(tag.toLowerCase());
      hashtags.push(tag);
      if (hashtags.length >= spec.maxHashtags) break;
    }
    const body = String(p.text ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!body) continue;
    const hashtagLine = hashtags.length > 0 ? hashtags.join(" ").length + 2 : 0;
    const text = cutToLength(body, Math.max(1, spec.maxChars - hashtagLine));
    byPlatform.set(p.platform, { platform: p.platform, text, hashtags });
  }
  const posts = context.platforms.map((p) => byPlatform.get(p)).filter((p): p is Post => Boolean(p));
  if (posts.length === 0) return { ok: false, reason: "no_posts" };
  return { ok: true, set: { version: 1, locale: context.locale, posts } };
}

/**
 * A stored set, read back from the database, through the same clamps.
 */
export function parseStoredPostSet(raw: unknown): PostSet | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const locale = typeof input.locale === "string" && input.locale ? input.locale : "en";
  const platforms = normalisePlatforms(
    Array.isArray(input.posts) ? input.posts.map((p) => (p as { platform?: unknown })?.platform) : []
  );
  const verdict = parsePostsToolInput(input, { platforms, locale });
  return verdict.ok ? verdict.set : null;
}

/**
 * The character count the estimator is handed — see the postsGenerate
 * profile in lib/billing/estimate.ts. The brief is real input and is
 * counted once; each platform asked for adds its own output allowance,
 * because five posts cost five posts however short the brief is.
 */
export function postsEstimateInputChars(descriptionChars: number, platforms: PostPlatform[]): number {
  const allowance = normalisePlatforms(platforms).reduce((sum, p) => sum + PLATFORMS[p].outputAllowanceChars, 0);
  return Math.max(0, descriptionChars) + allowance;
}
