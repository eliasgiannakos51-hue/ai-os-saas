#!/usr/bin/env node
/*
 * CAN published-isolation.test.mjs SEE A PUBLISHED PAGE ASK FOR A
 * PASSWORD, LOAD FROM ANYWHERE, OR STAY ON THE APP'S DOMAIN?
 *
 * Each mutant puts back one thing the 2026-11-05 change took away, or
 * blinds one of the ways a password field is found.
 *
 * Run: node scripts/tests/published-isolation.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/published-isolation.test.mjs";
const CRED = "src/lib/publishing/credential-fields.ts";
const SCAN = "src/lib/website-html-security-scan.ts";
const APP = "src/lib/rebuild/rebuild-html.ts";
const SERVING = "src/lib/publishing/public-serving.ts";
const ORIGIN = "src/lib/publishing/content-origin.ts";
const FORM = "src/app/api/websites/[id]/submit-form/route.ts";
const PUBLISH = "src/app/api/websites/[id]/publish/route.ts";
const CONTROL = "src/components/publishing/publish-control.tsx";
const PROXY = "src/proxy.ts";
const PAGE_ROUTE = "src/app/s/[subdomain]/[page]/route.ts";
const SHELL = "src/components/rebuild/rebuild-shell.tsx";

const MUTANTS = [
  {
    name: "an input's type is not read",
    file: CRED,
    from: "    if (type !== null && type.trim().toLowerCase() === \"password\") return excerpt(tag);",
    to: "    void type;",
    expect: "found: bare",
  },
  {
    name: "a type is read without decoding its references",
    file: CRED,
    from: "  return m ? decodeCharacterReferences(m[1] ?? m[2] ?? m[3] ?? \"\") : null;",
    to: "  return m ? (m[1] ?? m[2] ?? m[3] ?? \"\") : null;",
    expect: "found: a reference in a bare value",
  },
  {
    name: "script and CSS are read without decoding",
    file: CRED,
    from: "  const text = decodeCharacterReferences(html);",
    to: "  const text = html;",
    expect: "found: an escaped inline handler",
  },
  {
    name: "a type set by script is not looked for",
    file: CRED,
    from: "  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {",
    to: "  for (const re of [SET_ATTRIBUTE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {",
    expect: "found: made by script",
  },
  {
    name: "setAttribute is not looked for",
    file: CRED,
    from: "  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {",
    to: "  for (const re of [SCRIPT_TYPE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {",
    expect: "found: set by setAttribute",
  },
  {
    name: "the password manager's hint is not looked for",
    file: CRED,
    from: "  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {",
    to: "  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, TEXT_SECURITY_RE]) {",
    expect: "found: the password manager asked to fill it",
  },
  {
    name: "a text box drawn as dots is not looked for",
    file: CRED,
    from: "  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {",
    to: "  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, AUTOCOMPLETE_RE]) {",
    expect: "found: a text box drawn as dots",
  },
  {
    name: "a field name is matched as a substring",
    file: CRED,
    from: "  if (words.some((w) => WORDS.has(w))) return true;",
    to: "  if ([...WORDS].some((w) => joined.includes(w))) return true;",
    expect: "kept: shipping",
  },
  {
    name: "the Greek final sigma is not folded",
    file: CRED,
    from: "    .replace(/ς/g, \"σ\")\n",
    to: "",
    expect: "dropped: κωδικός πρόσβασης",
  },
  {
    name: "the site scan stops looking for passwords",
    file: SCAN,
    from: "  if (credential !== null) issues.push({ type: \"credential_field\", snippet: credential });",
    to: "  void credential;",
    expect: "the site scan flags a password field",
  },
  {
    name: "Rebuild's check stops looking for passwords",
    file: APP,
    from: "  if (findCredentialField(html) !== null) return { ok: false, reason: \"forbidden\", what: \"passwords\" };",
    to: "  void findCredentialField;",
    expect: "Rebuild's check refuses an app that asks for a password",
  },
  {
    name: "the publish refusal stops naming the case",
    file: PUBLISH,
    from: "          ...(issues.some((i) => i.type === \"credential_field\") ? { reason: \"password_field\" } : {}),\n",
    to: "",
    expect: "[id]/publish: names the case for the screen",
  },
  {
    name: "the screen shows the general refusal",
    file: CONTROL,
    from: "    if (data?.securityBlocked === true) return data.reason === \"password_field\" ? t(\"securityBlockedPassword\") : t(\"securityBlocked\");",
    to: "    if (data?.securityBlocked === true) return t(\"securityBlocked\");",
    expect: "publish-control.tsx: shows it",
  },
  {
    name: "the form endpoint keeps a password",
    file: FORM,
    from: "      if (isCredentialFieldName(key)) continue;\n",
    to: "",
    expect: "the endpoint skips a field whose name says password",
  },
  {
    name: "the form endpoint reads any size of body",
    file: FORM,
    from: "    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {",
    to: "    if (Number.isFinite(declared) && declared < 0) {",
    expect: "a declared body past the cap is refused",
  },
  {
    name: "pictures load from any https host again",
    file: SERVING,
    from: "[\"img-src 'self' data: blob:\", ...PUBLISHED_IMAGE_HOSTS, ...uploads]",
    to: "[\"img-src 'self' data: blob: https:\", ...PUBLISHED_IMAGE_HOSTS, ...uploads]",
    expect: "a picture from anywhere else does not",
  },
  {
    name: "media loads from any https host again",
    file: SERVING,
    from: "[\"media-src 'self' data: blob:\", ...uploads]",
    to: "[\"media-src 'self' data: blob: https:\", ...uploads]",
    expect: "media is held to the same hosts",
  },
  {
    name: "connections go to the whole app again",
    file: SERVING,
    from: "formPath.length > 0 ? `connect-src ${formPath.join(\" \")}` : \"connect-src 'none'\",",
    to: "\"connect-src 'self'\",",
    expect: "and nothing else of the app",
  },
  {
    name: "every bucket of the project is an image host",
    file: SERVING,
    from: "const uploads = storage ? [`${storage}/storage/v1/object/public/${REFERENCE_IMAGE_BUCKET}/`] : [];",
    to: "const uploads = storage ? [`${storage}/`] : [];",
    expect: "nor another bucket of the same project",
  },
  {
    name: "the content domain is matched without its dot",
    file: ORIGIN,
    from: "  return host === domain || host.endsWith(`.${domain}`);",
    to: "  return host === domain || host.endsWith(domain);",
    expect: "a look-alike host is not the content domain",
  },
  {
    name: "the app's whole API is reachable on the content domain",
    file: ORIGIN,
    from: "  if (FORM_ENDPOINT.test(pathname)) return { kind: \"pass\" };",
    to: "  if (pathname.startsWith(\"/api/\")) return { kind: \"pass\" };",
    expect: "the app's API is not on the content domain",
  },
  {
    name: "the apex serves anything",
    file: ORIGIN,
    from: "    return m && validateSubdomain(m[1]).ok ? { kind: \"pass\" } : { kind: \"not_found\" };",
    to: "    void m;\n    return { kind: \"pass\" };",
    expect: "and nothing else",
  },
  {
    name: "a reserved name is served",
    file: ORIGIN,
    from: "  return check.ok ? check.subdomain : null;\n}\n\n/** Is `host`",
    to: "  void check;\n  return label;\n}\n\n/** Is `host`",
    expect: "a name nobody may have is not served",
  },
  {
    name: "anything below a page is served",
    file: ORIGIN,
    from: "  if (rest !== \"\" && !/^\\/[^/]+$/.test(rest)) return { kind: \"not_found\" };\n",
    to: "",
    expect: "nothing deeper than a page",
  },
  {
    name: "a request through the content domain is bounced",
    file: ORIGIN,
    from: "  if (isContentHost(requestHost(request.headers), domain)) return null;\n",
    to: "",
    expect: "a request that came through the content domain is served",
  },
  {
    name: "the proxy lets the content domain fall through to the app",
    file: PROXY,
    from: "  if (content) {\n    if (content.kind === \"rewrite\") {",
    to: "  if (content && content.kind === \"rewrite\") {\n    if (content.kind === \"rewrite\") {",
    expect: "and answers it there",
  },
  {
    name: "a site's page stays on the app's domain",
    file: PAGE_ROUTE,
    from: "  if (moved) return Response.redirect(moved, 308);\n",
    to: "  void moved;\n",
    expect: "s/[subdomain]/[page]/route.ts: redirects to the content domain",
  },
  {
    name: "Rebuild shows the app's own domain",
    file: SHELL,
    from: "  const appUrl = publishedAppBase ?? (typeof window !== \"undefined\" ? window.location.origin : \"\");",
    to: "  const appUrl = typeof window !== \"undefined\" ? window.location.origin : \"\";\n  void publishedAppBase;",
    expect: "Rebuild shows an app's address",
  },
];

runMutations({
  name: "published-isolation",
  gate: GATE,
  targets: [CRED, SCAN, APP, SERVING, ORIGIN, FORM, PUBLISH, CONTROL, PROXY, PAGE_ROUTE, SHELL],
  mutants: MUTANTS,
});
