/**
 * Did the user ASK, in so many words, for real photographs of a real place?
 *
 * THE REPORT THIS EXISTS FOR.
 *
 * "Ο χρήστης ζήτησε ΡΗΤΑ 'κάνε έρευνα στο διαδίκτυο και πάρε εικόνες από
 * αυτήν την περιοχή' — δεν έγινε." The generated site came back with photos
 * that had nothing to do with the area, and nothing anywhere said so. The
 * user found out by looking.
 *
 * There are two separate failures in that and they need separate fixes.
 * Getting the photos wrong is one, and it is fixed upstream in the
 * generation prompt (which used to forbid place names in image queries
 * outright) and in the resolver's budget. Not SAYING SO is the other, and
 * it is the worse of the two: a page that quietly substitutes a stock photo
 * of somebody else's café for the photo of your café is a page you will
 * publish without noticing.
 *
 * So the resolver now reports what it actually did, and this module decides
 * how loudly that report should be delivered. A site that never asked for
 * real photography gets a quiet note; a site whose brief explicitly said
 * "photos from Santorini" and got placeholders gets told plainly, because
 * for that user it is a broken promise rather than a detail.
 *
 * WHY PATTERN MATCHING AND NOT A MODEL CALL. This runs on every generation,
 * after the expensive part, to decide the wording of a notice. A second AI
 * call to classify a sentence would cost real money and could itself fail,
 * and the cost of being wrong here is small in both directions: a false
 * positive shows a truthful notice slightly more prominently than needed,
 * and the counts in it are measured either way, never guessed.
 *
 * Pure and dependency-free — no "server-only" — so the client can render the
 * same judgement the server made, and so it is testable without a network.
 */

/** What the photo step actually did, measured rather than assumed. */
export type WebsiteImageReport = {
  /** PLACEHOLDER:<slug> tags the model emitted, i.e. photos it wanted. */
  total: number;
  /** Resolved to a real photo from the stock library. */
  fromLibrary: number;
  /** Fell back to a seeded placeholder with no relationship to the subject. */
  fromPlaceholder: number;
  /** Why the library stopped answering, when it did. */
  halted: "rate-limited" | "budget-exhausted" | "unauthorised" | null;
  /** Whether a library key was configured at all for this generation. */
  configured: boolean;
  /** Whether the brief explicitly demanded real photographs of a place. */
  requestedRealPhotos: boolean;
};

export const EMPTY_IMAGE_REPORT: WebsiteImageReport = {
  total: 0,
  fromLibrary: 0,
  fromPlaceholder: 0,
  halted: null,
  configured: false,
  requestedRealPhotos: false,
};

/**
 * Phrases that mean "put real photographs of a real place on my site",
 * across the ten locales this app ships.
 *
 * Two shapes are matched and they are deliberately different:
 *
 *   A DIRECTIONAL one — "photos FROM x", "φωτογραφίες ΑΠΟ x". The
 *   preposition is what makes it a request about provenance rather than a
 *   passing mention of a photo.
 *
 *   A QUALIFIED one — "real photos", "πραγματικές φωτογραφίες", "echte
 *   Fotos". The adjective is doing the same work: it is only worth saying
 *   "real" if you are worried about getting something else.
 *
 * A bare "photos of our menu" matches neither, which is correct: that is a
 * request for photographs, not a request for photographs OF A PLACE, and
 * treating it as one would put a warning on sites that never asked.
 */
const EXPLICIT_PHOTO_REQUEST_PATTERNS: RegExp[] = [
  // --- English
  /\b(photo|photos|photograph|photographs|picture|pictures|image|images)\s+(from|of)\s+(the\s+)?(area|region|neighbourhood|neighborhood|city|town|island|village|surroundings?|there|here)\b/i,
  /\b(real|actual|genuine|authentic)\s+(photo|photos|photograph|photographs|picture|pictures|image|images)\b/i,
  /\b(photo|photos|photograph|photographs|picture|pictures|image|images)\s+from\s+[A-ZΑ-Ω]/,
  // --- Greek. Accents are optional throughout: users type without them.
  //
  // NO \b HERE, AND THAT IS THE WHOLE POINT.
  //
  // JavaScript's \b is defined against \w, which is [A-Za-z0-9_] — ASCII
  // only. There is no word boundary before "φ", so `/\bφωτογραφίες/` can
  // never match anything: the pattern is not merely unreliable on Greek, it
  // is dead. Every Greek pattern here was written with \b first and every
  // one of them silently matched nothing, including the exact sentence from
  // the report. Found by running the cases, not by reading them.
  //
  // \p{L} boundaries would also work; plain patterns are used because these
  // phrases are long enough that a mid-word match is not a real risk.
  /(φωτογραφ[ιί]ες|εικ[οό]νες|φωτ[οό])\s+(απ[οό]|της|του)/i,
  /(πραγματικ[εέ]ς|αληθιν[εέ]ς|αυθεντικ[εέ]ς)\s+(φωτογραφ[ιί]ες|εικ[οό]νες)/i,
  /φωτογραφ[ιί]ες\s+(της\s+)?περιοχ[ηή]ς/i,
  // --- Spanish
  /\b(fotos?|im[aá]genes|fotograf[ií]as?)\s+(de|del|de la)\s+(la\s+)?(zona|regi[oó]n|ciudad|isla|pueblo|barrio|alrededores)\b/i,
  /\b(fotos?|im[aá]genes|fotograf[ií]as?)\s+reales\b/i,
  // --- French
  /\b(photos?|images?|photographies?)\s+(de|du|de la|des)\s+(la\s+)?(r[eé]gion|ville|[îi]le|village|quartier|environs)\b/i,
  /\b(vraies|v[eé]ritables|r[eé]elles)\s+(photos?|images?)\b/i,
  // --- German
  /\b(fotos?|bilder|aufnahmen)\s+(aus|von)\s+(der\s+|dem\s+)?(gegend|region|stadt|insel|dorf|umgebung)\b/i,
  /\b(echte|richtige|authentische)\s+(fotos?|bilder|aufnahmen)\b/i,
  // --- Italian
  /\b(foto|immagini|fotografie)\s+(di|della|del|dei)\s+(la\s+)?(zona|regione|citt[aà]|isola|paese|quartiere|dintorni)\b/i,
  /\b(foto|immagini|fotografie)\s+(reali|vere|autentiche)\b/i,
  // --- Portuguese
  /\b(fotos?|imagens|fotografias?)\s+(de|da|do|dos)\s+(a\s+)?(zona|regi[aã]o|cidade|ilha|aldeia|bairro|arredores)\b/i,
  /\b(fotos?|imagens|fotografias?)\s+(reais|verdadeiras|aut[eê]nticas)\b/i,
  // --- Chinese / Japanese / Arabic. No word boundaries: \b is meaningless
  //     against CJK and unreliable against Arabic script.
  /(真实|實際|实际|当地|當地)(的)?(照片|图片|圖片)/,
  /(照片|图片|圖片)(来自|來自)/,
  /(実際|本物|地元)の?(写真|画像)/,
  /(写真|画像)(を|は)?(現地|実際)/,
  // Arabic script has the same problem as Greek: \b is meaningless against
  // it, so these are written without one.
  /صور\s+(حقيقية|فعلية|من\s+المنطقة)/,
  /صور\s+من\s+/,
];

/**
 * True when the brief explicitly asks for real photographs of a real place.
 *
 * Matched against the user's own words. The design brief this app appends
 * (lib/website-design-brief.ts) is machine-written and cannot itself contain
 * a request, so passing the combined description is harmless.
 */
export function requestsRealPhotos(description: string): boolean {
  if (!description) return false;
  return EXPLICIT_PHOTO_REQUEST_PATTERNS.some((pattern) => pattern.test(description));
}

/**
 * A machine-readable verdict on a finished generation's photos.
 *
 * Returned as a code rather than a sentence so the interface can render it
 * in the user's own language. An English string stored in the database
 * would be an English string shown to a Greek user forever — the exact
 * defect reported elsewhere in this app.
 */
export type ImageOutcome =
  | "all-real" // every photo came from the library
  | "none-requested" // the page has no stock photos at all
  | "some-placeholder" // a few fell back
  | "all-placeholder" // none resolved
  | "not-configured" // no library key, so none could resolve
  | "quota" // the library stopped answering mid-generation
  | "credentials"; // the library rejected the key

export function classifyImageOutcome(report: WebsiteImageReport): ImageOutcome {
  if (report.total === 0) return "none-requested";
  if (report.halted === "unauthorised") return "credentials";
  if (!report.configured) return "not-configured";
  if (report.halted === "rate-limited" || report.halted === "budget-exhausted") return "quota";
  if (report.fromPlaceholder === 0) return "all-real";
  if (report.fromLibrary === 0) return "all-placeholder";
  return "some-placeholder";
}

/**
 * Is this worth interrupting the user for?
 *
 * A site with every photo resolved says nothing. A site with placeholders
 * always says something — quietly, because it is a fact the owner needs
 * before publishing. A site whose brief ASKED for real photographs of a
 * place and did not get them says it loudly, because for that user it is
 * not a detail, it is the thing they asked for not happening.
 */
export function imageReportSeverity(report: WebsiteImageReport): "none" | "info" | "warning" {
  const outcome = classifyImageOutcome(report);
  if (outcome === "all-real" || outcome === "none-requested") return "none";
  return report.requestedRealPhotos ? "warning" : "info";
}
