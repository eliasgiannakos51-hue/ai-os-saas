import "server-only";
import { escapeHtml } from "@/lib/html-escape";
import { getSiteUrl } from "@/lib/site-url";
import { emailTranslator, isRtlLocale } from "@/lib/email/email-locale";
import { digestLineText, type DigestLine } from "@/lib/notify/digest";

// Plain, table-based HTML with inline styles only — no <style> blocks, no
// flexbox/grid, no CSS variables. Email clients (especially Outlook
// desktop) strip or ignore most modern CSS, so everything here is written
// to degrade gracefully rather than rely on it.

const BG = "#090909";
const PANEL = "#141414";
const BORDER = "#2a2a2a";
const ORANGE = "#f97316";
const FOREGROUND = "#f5f5f5";
const MUTED = "#a3a3a3";
const MONO_STACK = "'Courier New', Courier, monospace";

// A committed, static PNG served straight off the CDN — NOT a rendered
// route. It used to point at /email-logo, a Next.js edge route returning
// an ImageResponse, and that is why the logo never appeared in a real
// inbox even though every render test said it did. Three separate
// reasons, all of which this file's URL choice now avoids:
//
//   1. /email-logo has no file extension, so it did NOT match
//      src/middleware.ts's matcher exclusion (which only skips paths
//      ending .svg/.png/.jpg/...). Every image fetch from every inbox
//      therefore ran the auth middleware, including a Supabase
//      getUser() round trip, before the image was produced.
//   2. Gmail and Outlook fetch images through their own caching proxies.
//      Those proxies are far more reliable with a plain static file than
//      with a cold-starting, extensionless, dynamically generated route.
//   3. An ImageResponse route is generated per request. A static file is
//      just bytes on a CDN.
//
// Regenerate with: node scripts/generate-email-logo.mjs
const SITE_URL = getSiteUrl();
const LOGO_URL = `${SITE_URL}/ionexa-email-logo.png`;

// An inbox can only ever load an absolute https URL. Locally SITE_URL is
// http://localhost:3000, which every real client fails to fetch and then
// renders as a broken-image icon — worse than no image. In that case the
// header falls back to the wordmark alone, which is text and always
// renders.
const LOGO_IS_REACHABLE = LOGO_URL.startsWith("https://");

// The wordmark is real styled TEXT, not part of the image, so the brand
// still reads when a client blocks images — which most do by default.
// The alt text carries its own inline styling for the same reason: an
// unstyled alt renders as tiny default-serif black-on-dark and is
// effectively invisible in this template.
const LOGO_HTML = LOGO_IS_REACHABLE
  ? `<img src="${LOGO_URL}" width="56" height="56" alt="Ionexa AI" style="display:block; border:0; outline:none; text-decoration:none; border-radius:12px; margin-bottom:10px; color:${ORANGE}; font-family:${MONO_STACK}; font-size:15px; font-weight:bold; line-height:56px;" />`
  : "";

// `dir` is threaded through because Arabic reads right to left and an
// email client applies no locale of its own — the language is decided
// where the message is built, not where it is opened.
function layout({
  preheader,
  bodyHtml,
  dir = "ltr",
  footer,
}: {
  preheader: string;
  bodyHtml: string;
  dir?: "ltr" | "rtl";
  /** The one line under the panel — email.footer in the catalogue.
   *
   *  Passed in rather than held here because it was the last English
   *  sentence left inside a translated email: four templates had been
   *  converted and all four still closed with the same literal about
   *  having an account. Required, with no default, for the reason that
   *  literal survived four conversions — a default that renders correctly
   *  is exactly the kind nobody notices is still there. */
  footer: string;
}) {
  return `<!doctype html>
<html dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ionexa AI</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BG}; font-family:${MONO_STACK};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding-bottom:24px;">
                ${LOGO_HTML}
                <span style="color:${ORANGE}; font-size:15px; letter-spacing:2px; font-weight:bold;">Ionexa AI</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:${PANEL}; border:1px solid ${BORDER}; border-radius:6px; padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;">
                <span style="color:${MUTED}; font-size:11px;">
                  ${footer}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// THE THIRTEEN MODULES, BY KEY. Their NAMES are not repeated here: the
// sidebar already carries every one of them in all ten languages
// (messages/*.json, sidebar.items.*), and an email that called a module
// something the app does not is worse than an untranslated one. Only the
// one-line description is new, under email.blurbs.
const MODULE_KEYS = [
  "ideas",
  "competitors",
  "research",
  "finance",
  "learning",
  "trading",
  "decisions",
  "products",
  "content",
  "sales",
  "feedback",
  "analytics",
  "automation",
] as const;

export function welcomeEmailHtml({ email, locale = "en" }: { email: string; locale?: string }): string {
  const t = emailTranslator(locale);
  const moduleRows = MODULE_KEYS.map(
    (key) => `
              <tr>
                <td style="padding:6px 0; border-bottom:1px solid ${BORDER};">
                  <span style="color:${ORANGE}; font-size:13px;">${escapeHtml(t(`sidebar.items.${key}`))}</span><br />
                  <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t(`email.blurbs.${key}`))}</span>
                </td>
              </tr>`
  ).join("");

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.welcome.label"))} · ${escapeHtml(email)}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">${escapeHtml(t("email.welcome.title"))}</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.welcome.body"))}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${moduleRows}
    </table>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:20px 0 0;">
      ${escapeHtml(t("email.welcome.tip", { path: "/dashboard/create" })).replace(
        "/dashboard/create",
        `<span style="color:${ORANGE};">/dashboard/create</span>`
      )}
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.welcome.preheader")),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

export function teamInviteEmailHtml({
  inviterEmail,
  planName,
  signupUrl,
}: {
  inviterEmail: string;
  planName: string;
  signupUrl: string;
}): string {
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">team invite</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">you've been invited to Ionexa AI</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      <span style="color:${FOREGROUND};">${inviterEmail}</span> added you to their
      team on the <span style="color:${ORANGE};">${planName}</span> plan. Sign up
      (or log in, if you already have an account with this email) and you'll
      automatically get full access at their plan's tier — no separate
      payment needed.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${signupUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Accept invite
      </a>
    </p>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:0;">
      Use this exact email address when you sign up — that's how we match
      your account to the invite.
    </p>
  `;

  return layout({
    preheader: `${inviterEmail} invited you to their Ionexa AI team.`,
    bodyHtml,
    // ENGLISH, AND THE ONLY ONE. This message goes to an address that may
    // have no account at all, so there is no stored preferred_locale to
    // read — the reason recorded against this file in
    // scripts/tests/i18n-population.test.mjs. The footer still comes out
    // of the catalogue rather than being retyped here, so it moves with
    // the other nine when somebody decides what an invite should do about
    // the inviter's language.
    footer: escapeHtml(emailTranslator("en")("email.footer")),
  });
}

export function deleteAccountConfirmationEmailHtml({
  email,
  confirmUrl,
  locale = "en",
}: {
  email: string;
  confirmUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.deletion.label"))} · ${escapeHtml(email)}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">${escapeHtml(t("email.deletion.title"))}</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.deletion.body"))}
    </p>
    <p style="margin:0 0 20px;">
      <a href="${confirmUrl}" style="display:inline-block; background-color:#dc2626; color:#fff; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.deletion.cta"))}
      </a>
    </p>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:0;">
      ${escapeHtml(t("email.deletion.expiry"))}
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.deletion.preheader")),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

export function subscriptionCancelledEmailHtml({
  email,
  endsOn,
  restoreUrl,
  locale = "en",
}: {
  email: string;
  /** Already formatted for a human, or null when Stripe gave us no date. */
  endsOn: string | null;
  restoreUrl: string;
  locale?: string;
}): string {
  // Confirms what was ASKED FOR, not what was taken away. Everything this
  // says is the state the account is actually in: still paid for, still
  // full of the user's data, still reversible. A cancellation email that
  // reads like a punishment is the same dark pattern as a hidden button.
  const t = emailTranslator(locale);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.cancelled.label"))} · ${escapeHtml(email)}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">${escapeHtml(t("email.cancelled.title"))}</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${
        endsOn
          ? escapeHtml(t("email.cancelled.untilDate", { date: endsOn })).replace(
              escapeHtml(endsOn),
              `<strong style="color:${FOREGROUND};">${escapeHtml(endsOn)}</strong>`
            )
          : escapeHtml(t("email.cancelled.untilPeriodEnd"))
      }
    </p>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.cancelled.afterwards"))}
    </p>
    <p style="margin:0 0 20px;">
      <a href="${restoreUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.cancelled.cta"))}
      </a>
    </p>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:0;">
      ${escapeHtml(t("email.cancelled.noCharge"))}
    </p>
  `;

  return layout({
    preheader: endsOn
      ? escapeHtml(t("email.cancelled.preheaderDate", { date: endsOn }))
      : escapeHtml(t("email.cancelled.preheader")),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

export function newDeviceLoginEmailHtml({
  email,
  deviceLabel,
  ipAddress,
  dateLabel,
  forgotPasswordUrl,
  locale = "en",
}: {
  email: string;
  deviceLabel: string;
  ipAddress: string;
  dateLabel: string;
  forgotPasswordUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.newDevice.label"))} · ${escapeHtml(email)}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">${escapeHtml(t("email.newDevice.title"))}</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.newDevice.body"))}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${MUTED}; font-size:12px;">${escapeHtml(t("email.newDevice.when"))}</td>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:12px; text-align:right;">${dateLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${MUTED}; font-size:12px;">${escapeHtml(t("email.newDevice.device"))}</td>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:12px; text-align:right;">${deviceLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:${MUTED}; font-size:12px;">${escapeHtml(t("email.newDevice.ip"))}</td>
        <td style="padding:6px 0; color:${FOREGROUND}; font-size:12px; text-align:right;">${ipAddress}</td>
      </tr>
    </table>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.newDevice.ifYou"))}
    </p>
    <p style="margin:0;">
      <a href="${forgotPasswordUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.newDevice.cta"))}
      </a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.newDevice.preheader", { device: deviceLabel })),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

// V4 #18 — THE DIGEST, FROM REAL DATA.
//
// It replaced a table of module row counts, which was true and told
// nobody anything: "Ideas 3, Leads 1" is a database report, not a week.
// What goes in now is what a person would actually say about the week —
// how many agents ran and how many of them found something, what the site
// did, what was spent against what this account normally spends — plus a
// short "what I noticed" list of things worth acting on.
//
// Lines and observations arrive from lib/notify/digest.ts as a key, a
// count and its numbers — NOT as sentences. That module used to compose
// the English itself (`n === 1 ? "run" : "runs"`), which made the digest
// the one email whose chrome could be translated and whose contents could
// not. The decision about WHAT IS WORTH SAYING is still made in that one
// pure, testable place; the words are looked up here, where the language
// is known. A digest with no lines is never rendered: the route does not
// call this.
export function weeklyDigestEmailHtml({
  lines,
  observations,
  periodLabel,
  dashboardUrl,
  locale = "en",
}: {
  lines: DigestLine[];
  observations: DigestLine[];
  periodLabel: string;
  dashboardUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const say = (line: DigestLine) => escapeHtml(digestLineText(line, t));

  const rows = lines
    .map(
      (line) => `
              <tr>
                <td style="padding:8px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:14px;">${say(line)}</td>
              </tr>`
    )
    .join("");

  const noticed =
    observations.length > 0
      ? `
    <p style="color:${MUTED}; font-size:12px; margin:24px 0 8px; text-transform:uppercase; letter-spacing:1px;">${escapeHtml(t("email.digest.noticed"))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${observations
        .map(
          (o) => `
              <tr>
                <td style="padding:6px 0; color:${ORANGE}; font-size:13px;">${say(o)}</td>
              </tr>`
        )
        .join("")}
    </table>`
      : "";

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.digest.label"))} · ${escapeHtml(periodLabel)}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">${escapeHtml(t("email.digest.title"))}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows}
    </table>
    ${noticed}
    <p style="margin:24px 0 0;">
      <a href="${dashboardUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.digest.cta"))}
      </a>
    </p>
  `;

  return layout({
    // The preheader is the first line of the digest itself, so the inbox
    // preview says what happened rather than "your weekly digest".
    preheader: lines[0] ? escapeHtml(digestLineText(lines[0], t)) : escapeHtml(periodLabel),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

export function scheduledRunCompleteEmailHtml({
  stepText,
  succeeded,
  detail,
  missionUrl,
  locale = "en",
}: {
  stepText: string;
  succeeded: boolean;
  detail: string;
  missionUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  // THE DESTINATION IS NAMED BY THE NAV, not by this file. The button used
  // to read "View in Mission Control", and that feature was renamed to
  // "Goals & Plans" across 28 strings in ten languages — docs/glossary.md
  // forbids the old word outright now, and scripts/tests/glossary.test.mjs
  // caught this button still using it. Reading sidebar.items.missionControl
  // is the same choice welcomeEmailHtml makes about the thirteen module
  // names: an email that calls a screen something the app does not is
  // worse than an untranslated one.
  const safeStepText = escapeHtml(stepText);
  // `detail` ARRIVES ALREADY IN WHATEVER LANGUAGE IT WILL BE READ IN, and
  // the sender decides which that is — see send-scheduled-run-complete-
  // email.ts's `detailKey`. Of the nine call sites in
  // api/cron/scheduled-runs/route.ts:
  //
  //   two   are sentences this product wrote ("Not enough credits — …"),
  //         and they pass a catalogue key, so they arrive translated.
  //   four  are `result.error` / `result.message` / `result.outputSummary`
  //         — the runner's or the model's own words, an open set with no
  //         key that could hold them.
  //   three are `breakerCheck.reason`, which IS a closed set of three
  //         English sentences, in lib/ai-circuit-breaker.ts. They are not
  //         translated here because the same string is written to
  //         scheduled_runs.result and shown on screen, so the language
  //         belongs to that module rather than to this email — doing it
  //         here would translate one of its two readers.
  //
  // Either way it is escaped and shown as-is.
  const safeDetail = escapeHtml(detail);

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.scheduledRun.label"))}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      ${escapeHtml(t(succeeded ? "email.scheduledRun.titleDone" : "email.scheduledRun.titleFailed"))}
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 12px;">
      "<span style="color:${FOREGROUND};">${safeStepText}</span>"
    </p>
    <p style="color:${succeeded ? MUTED : "#f87171"}; font-size:13px; line-height:1.6; margin:0 0 20px;">
      ${safeDetail}
    </p>
    <p style="margin:0;">
      <a href="${missionUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.scheduledRun.cta", { name: t("sidebar.items.missionControl") }))}
      </a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(
      t(succeeded ? "email.scheduledRun.preheaderDone" : "email.scheduledRun.preheaderFailed", { step: stepText })
    ),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

// Lead-classification badge shown at the top of a website form submission
// email (see api/websites/[id]/submit-form/route.ts + lib/lead-classification.ts)
// — null (classification unavailable/failed) renders no badge at all
// rather than a misleading default.
//
// THE EMOJI AND THE COLOUR STAY HERE; THE WORDS DO NOT. A colour is not a
// language, and the four labels are now email.formSubmission.badges.* in
// all ten catalogues. Keying the map by the same string the classifier
// stores is what lets an unknown classification render nothing rather
// than a wrong badge.
const LEAD_BADGES: Record<string, { emoji: string; color: string }> = {
  genuine_interest: { emoji: "🟢", color: "#4ade80" },
  question: { emoji: "🔵", color: "#60a5fa" },
  spam: { emoji: "🔴", color: "#f87171" },
  unclear: { emoji: "⚪", color: "#a3a3a3" },
};

// "Stuck work" detection (api/cron/scheduled-runs's daily cron) — a
// Website Builder generation/edit that's been sitting in pending/
// processing for over 24h, almost certainly because the serverless
// function that was running it got killed by the platform without ever
// reaching a terminal status (see lib/website-generation-limits.ts's
// stale-job detection, which only fires when someone happens to be
// polling that specific website — this is the proactive version, sent
// even if the user never comes back to check).
export function stuckGenerationEmailHtml({
  websiteName,
  dashboardUrl,
  locale = "en",
}: {
  websiteName: string;
  dashboardUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.stuck.label"))}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      ${escapeHtml(t("email.stuck.title", { name: websiteName }))}
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.stuck.body"))}
    </p>
    <p style="margin:0;">
      <a href="${dashboardUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.stuck.cta"))}
      </a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.stuck.preheader", { name: websiteName })),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

export function websiteFormSubmissionEmailHtml({
  websiteName,
  fields,
  classification,
  dashboardUrl,
  locale = "en",
}: {
  websiteName: string;
  fields: Record<string, string>;
  classification: string | null;
  dashboardUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const badge = classification ? LEAD_BADGES[classification] : null;

  // THE FIELD NAMES ARE THE VISITOR'S FORM, NOT OURS. "name", "email",
  // "how did you hear about us" — whatever the site owner put on their own
  // page, in whatever language they wrote it in. There is no catalogue
  // that could hold them and no reason to want one: translating a label
  // the owner chose would change what their form said.
  const fieldRows = Object.entries(fields)
    .filter(([key]) => key !== "_hp")
    .map(
      ([key, value]) => `
    <tr>
      <td style="padding:8px 0; color:${MUTED}; font-size:12px; vertical-align:top; width:110px;">${escapeHtml(key)}</td>
      <td style="padding:8px 0; color:${FOREGROUND}; font-size:14px; line-height:1.5;">${escapeHtml(value)}</td>
    </tr>`
    )
    .join("");

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.formSubmission.label"))}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 8px;">
      ${escapeHtml(t("email.formSubmission.title", { name: websiteName }))}
    </h1>
    ${
      badge
        ? `<p style="margin:0 0 16px;"><span style="display:inline-block; background-color:#1a1a1a; border:1px solid ${BORDER}; border-radius:999px; padding:4px 12px; font-size:12px; color:${badge.color};">${badge.emoji} ${escapeHtml(t(`email.formSubmission.badges.${classification}`))}</span></p>`
        : ""
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER}; margin:8px 0 20px;">
      ${fieldRows}
    </table>
    <p style="margin:0;">
      <a href="${dashboardUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.formSubmission.cta"))}
      </a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.formSubmission.preheader", { name: websiteName })),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

// ---------------------------------------------------------------------
// V3 — Autonomous Agents.
// ---------------------------------------------------------------------

// The agent's own output, rendered as the body of the email.
//
// Agents produce plain text (see lib/agents/agent-runner.ts — no markdown
// is requested and none is parsed). It is escaped and its line breaks are
// turned into paragraphs, which is the whole conversion: rendering it as
// HTML would take AI output that may quote a third-party web page and
// paste it into an email as live markup. Blank lines separate paragraphs;
// single newlines become <br>, so a bullet list survives.
function agentOutputHtml(output: string): string {
  return output
    .split(/\n{2,}/)
    .map((para) => escapeHtml(para).split("\n").join("<br />"))
    .filter((para) => para.trim().length > 0)
    .map(
      (para) =>
        `<p style="color:${FOREGROUND}; font-size:14px; line-height:1.65; margin:0 0 14px;">${para}</p>`
    )
    .join("");
}

export function agentRunResultEmailHtml({
  agentName,
  output,
  agentsUrl,
  aiGeneratedNotice,
  locale = "en",
}: {
  agentName: string;
  output: string;
  agentsUrl: string;
  /** EU AI Act Article 50 — the recipient has to be able to tell that what
   *  they are reading was produced by an AI system. Passed in rather than
   *  hardcoded so it can be sent in the agent's own language, which is the
   *  agent's `language` setting rather than the account's: the notice has
   *  to be legible next to the output it is about, and that output is
   *  written in whatever language the agent was told to work in. It is
   *  therefore NOT `locale`, and the two can legitimately differ. */
  aiGeneratedNotice: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const safeAgentName = escapeHtml(agentName);

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.agent.label"))}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      ${safeAgentName}
    </h1>
    <div style="border-top:1px solid ${BORDER}; padding-top:16px;">
      ${agentOutputHtml(output)}
    </div>
    <p style="color:${MUTED}; font-size:11px; line-height:1.6; margin:16px 0 20px; border-top:1px solid ${BORDER}; padding-top:12px;">
      ${escapeHtml(aiGeneratedNotice)}
    </p>
    <p style="margin:0;">
      <a href="${agentsUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.agent.resultCta"))}
      </a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.agent.resultPreheader", { name: agentName })),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

// Sent once, when an agent switches itself off after five consecutive
// failed runs. Critical mail: the user built this thing to receive
// something on a schedule, and the single most damaging outcome is that it
// stops silently and they only notice weeks later.
//
// `consecutiveFailures` reaches the catalogue as a plain substitution
// rather than through a plural form, and that is safe rather than lazy:
// lib/agents/agent-failure-limits.ts sets
// AGENT_MAX_CONSECUTIVE_FAILURES = 5 and this email is sent only when the
// counter has reached it, so the number is never 1 in any language. If
// that constant ever drops to 1, this line needs `t.n` and the catalogue
// needs a `one` form.
export function agentDisabledEmailHtml({
  agentName,
  reason,
  consecutiveFailures,
  agentsUrl,
  locale = "en",
}: {
  agentName: string;
  reason: string;
  consecutiveFailures: number;
  agentsUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.agent.label"))}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      ${escapeHtml(t("email.agent.disabledTitle", { name: agentName }))}
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 12px;">
      ${escapeHtml(t("email.agent.disabledBody", { count: consecutiveFailures }))}
    </p>
    <p style="color:#f87171; font-size:13px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.agent.disabledLastError", { error: reason }))}
    </p>
    <p style="color:${MUTED}; font-size:13px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.agent.disabledHint"))}
    </p>
    <p style="margin:0;">
      <a href="${agentsUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.agent.disabledCta"))}
      </a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.agent.disabledPreheader", { name: agentName, count: consecutiveFailures })),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

// Sent when an agent is paused because the account ran out of credits.
// Distinct from the disabled email on purpose: nothing is wrong with the
// agent, and the fix is a top-up rather than an edit.
export function agentPausedNoCreditsEmailHtml({
  agentName,
  agentsUrl,
  billingUrl,
  locale = "en",
}: {
  agentName: string;
  agentsUrl: string;
  billingUrl: string;
  locale?: string;
}): string {
  const t = emailTranslator(locale);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.agent.label"))}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      ${escapeHtml(t("email.agent.pausedTitle", { name: agentName }))}
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${escapeHtml(t("email.agent.pausedBody"))}
    </p>
    <p style="margin:0 0 12px;">
      <a href="${billingUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(t("email.agent.pausedCtaTopUp"))}
      </a>
    </p>
    <p style="margin:0;">
      <a href="${agentsUrl}" style="color:${MUTED}; font-size:12px;">${escapeHtml(t("email.agent.pausedCtaAgents"))}</a>
    </p>
  `;

  return layout({
    preheader: escapeHtml(t("email.agent.pausedPreheader", { name: agentName })),
    bodyHtml,
    dir: isRtlLocale(locale) ? "rtl" : "ltr",
    footer: escapeHtml(t("email.footer")),
  });
}

// V4 #18 — the email face of a notification. One template for all seven
// types rather than seven near-identical ones: the type is already
// carried by the title, and a user who gets two different-looking emails
// for "your agent finished" and "your research is ready" learns nothing
// from the difference.
//
// THE ONLY EMAIL LEFT IN ENGLISH THAT A CUSTOMER READS, and it is left
// there deliberately rather than missed. Everything a person sees in this
// message except the three strings below — `title` and `body` — is
// composed by the caller, in English, in code:
// lib/publishing/badge-renewal.ts writes "Your site's badge returns in 3
// days" and lib/billing/overage-store.ts writes "You are at 80% of your
// EUR20 overage cap". Translating the button and the footer over those
// two sentences would produce a Greek frame around an English notice —
// the shape docs/shapes.md calls "a check that answers the adjacent
// question", and worse for the reader than an honestly English email.
//
// The whole job is one job: dispatchNotification also sends those same
// two strings to Telegram and Discord and stores them on
// notification_events for the in-app bell, so the language has to be
// decided where the notification is BUILT, not where it is mailed. That
// is a larger change than this file, and it is recorded against
// src/lib/notify/dispatch.ts in scripts/tests/i18n-population.test.mjs so
// that it is a listed decision rather than a gap nothing looks at.
//
// The button is the ONLY link, and it points at the click-tracking
// redirect (/api/n/<id>), which is what makes the click rate in
// engagement.ts a measurement rather than a guess.
export function notificationEmailHtml({
  title,
  body,
  actionUrl,
  actionLabel,
  extraCount,
  settingsUrl,
}: {
  title: string;
  body: string;
  actionUrl: string | null;
  actionLabel: string;
  /** "and 4 others" — rule 2's grouping, stated rather than hidden. */
  extraCount: number;
  settingsUrl: string;
}): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 10px;">${line}</p>`)
    .join("");

  const bodyHtml = `
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:0 0 16px;">${safeTitle}</h1>
    ${safeBody}
    ${
      extraCount > 0
        ? `<p style="color:${MUTED}; font-size:12px; margin:0 0 16px;">+ ${extraCount} more like this</p>`
        : ""
    }
    ${
      actionUrl
        ? `<p style="margin:16px 0 0;">
      <a href="${actionUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(actionLabel)}
      </a>
    </p>`
        : ""
    }
    <p style="color:${MUTED}; font-size:11px; margin:24px 0 0; border-top:1px solid ${BORDER}; padding-top:16px;">
      <a href="${settingsUrl}" style="color:${MUTED};">Choose which notifications reach you</a>
    </p>
  `;

  return layout({
    preheader: title,
    bodyHtml,
    // English, with the rest of this message — see the note above the
    // function. Read from the catalogue rather than retyped so that the
    // day dispatch.ts learns a locale, this line moves with one argument.
    footer: escapeHtml(emailTranslator("en")("email.footer")),
  });
}
