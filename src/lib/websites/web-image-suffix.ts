/**
 * The suffix an optimised web derivative is stored under.
 *
 * In its own module because both a SERVER-ONLY file
 * (lib/website-reference-image-server.ts, which imports sharp) and a pure
 * one (lib/websites/orphan-images.ts, which must be unit-testable) need
 * it — and importing the former from the latter would drag sharp into
 * the build gate.
 */
export const WEB_IMAGE_SUFFIX = ".web.webp";
