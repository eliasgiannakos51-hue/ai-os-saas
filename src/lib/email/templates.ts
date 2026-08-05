import "server-only";
import { getSiteUrl } from "@/lib/site-url";

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

function layout({ preheader, bodyHtml }: { preheader: string; bodyHtml: string }) {
  return `<!doctype html>
<html>
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
                  You're receiving this because you have a Ionexa AI account.
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

const MODULE_BLURBS: { title: string; blurb: string }[] = [
  { title: "Ideas", blurb: "Capture and score new product/business ideas." },
  { title: "Competitors", blurb: "Track rival products, pricing, and positioning." },
  { title: "Research", blurb: "Notes and summaries from anything you're researching." },
  { title: "Finance", blurb: "Log income and expenses." },
  { title: "Learning", blurb: "Topics you're studying, with resources and quizzes." },
  { title: "Trading", blurb: "Trade log — symbol, direction, result, P&L." },
  { title: "Decisions", blurb: "Weigh options and record the recommendation." },
  { title: "Products", blurb: "Product plans — pricing, roadmap, launch plan." },
  { title: "Content", blurb: "Content ideas, captions, and threads." },
  { title: "Sales", blurb: "Leads, outreach emails, and next steps." },
  { title: "Feedback", blurb: "User feedback, triaged by sentiment and priority." },
  { title: "Analytics", blurb: "Any metric worth tracking over time." },
  { title: "Automation", blurb: "Workflows worth automating, and time saved." },
];

export function welcomeEmailHtml({ email }: { email: string }): string {
  const moduleRows = MODULE_BLURBS.map(
    ({ title, blurb }) => `
              <tr>
                <td style="padding:6px 0; border-bottom:1px solid ${BORDER};">
                  <span style="color:${ORANGE}; font-size:13px;">${title}</span><br />
                  <span style="color:${MUTED}; font-size:12px;">${blurb}</span>
                </td>
              </tr>`
  ).join("");

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">signup · ${email}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">welcome to Ionexa AI</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Your account is ready — no email confirmation needed, you can log in right
      away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox
      that files anything you type into the right one.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${moduleRows}
    </table>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:20px 0 0;">
      Tip: on <span style="color:${ORANGE};">/dashboard/create</span> you can just
      describe what happened in plain English and it'll land in the right module
      automatically.
    </p>
  `;

  return layout({ preheader: "Your Ionexa AI account is ready.", bodyHtml });
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
  });
}

export function deleteAccountConfirmationEmailHtml({
  email,
  confirmUrl,
}: {
  email: string;
  confirmUrl: string;
}): string {
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">account deletion · ${email}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">confirm account deletion</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      We received a request to permanently delete your Ionexa AI account and
      every record logged across all modules. This can't be undone.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${confirmUrl}" style="display:inline-block; background-color:#dc2626; color:#fff; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Confirm deletion
      </a>
    </p>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:0;">
      This link expires in 1 hour. If you didn't request this, ignore this
      email and your account will stay exactly as it is.
    </p>
  `;

  return layout({
    preheader: "Confirm permanent deletion of your Ionexa AI account.",
    bodyHtml,
  });
}

export function newDeviceLoginEmailHtml({
  email,
  deviceLabel,
  ipAddress,
  dateLabel,
  forgotPasswordUrl,
}: {
  email: string;
  deviceLabel: string;
  ipAddress: string;
  dateLabel: string;
  forgotPasswordUrl: string;
}): string {
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">security · ${email}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">new sign-in to your account</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      We noticed a sign-in to your Ionexa AI account from a device or
      browser we haven't seen before.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${MUTED}; font-size:12px;">When</td>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:12px; text-align:right;">${dateLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${MUTED}; font-size:12px;">Device</td>
        <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:12px; text-align:right;">${deviceLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:${MUTED}; font-size:12px;">IP address</td>
        <td style="padding:6px 0; color:${FOREGROUND}; font-size:12px; text-align:right;">${ipAddress}</td>
      </tr>
    </table>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      If this was you, no action is needed. If you don't recognize this
      sign-in, please reset your password immediately.
    </p>
    <p style="margin:0;">
      <a href="${forgotPasswordUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Reset password
      </a>
    </p>
  `;

  return layout({
    preheader: `New sign-in to your Ionexa AI account from ${deviceLabel}.`,
    bodyHtml,
  });
}

export function weeklyDigestEmailHtml({
  email,
  moduleCounts,
  periodLabel,
}: {
  email: string;
  moduleCounts: { title: string; count: number }[];
  periodLabel: string;
}): string {
  const total = moduleCounts.reduce((sum, m) => sum + m.count, 0);

  const rows = moduleCounts
    .filter((m) => m.count > 0)
    .map(
      (m) => `
              <tr>
                <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:13px;">${m.title}</td>
                <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${ORANGE}; font-size:13px; text-align:right;">${m.count}</td>
              </tr>`
    )
    .join("");

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">digest · ${periodLabel}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">your week on Ionexa AI</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${total} new ${total === 1 ? "entry" : "entries"} logged for ${email} this week.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows || `<tr><td style="color:${MUTED}; font-size:13px; padding:6px 0;">Nothing logged this week.</td></tr>`}
    </table>
  `;

  return layout({ preheader: `Your Ionexa AI weekly digest — ${total} new entries.`, bodyHtml });
}

// Basic escaping for stepText/detail below — unlike this file's other
// templates (device labels, IP addresses, module titles — all inherently
// bounded/parsed strings), a mission step's text and an AI-generated
// result summary are genuinely freeform user/AI content, so this one
// actually needs it before interpolating into HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function scheduledRunCompleteEmailHtml({
  stepText,
  succeeded,
  detail,
  missionUrl,
}: {
  stepText: string;
  succeeded: boolean;
  detail: string;
  missionUrl: string;
}): string {
  const safeStepText = escapeHtml(stepText);
  const safeDetail = escapeHtml(detail);

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">scheduled agent run</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      ${succeeded ? "your scheduled task is done" : "your scheduled task couldn't run"}
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 12px;">
      "<span style="color:${FOREGROUND};">${safeStepText}</span>"
    </p>
    <p style="color:${succeeded ? MUTED : "#f87171"}; font-size:13px; line-height:1.6; margin:0 0 20px;">
      ${safeDetail}
    </p>
    <p style="margin:0;">
      <a href="${missionUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        View in Mission Control
      </a>
    </p>
  `;

  return layout({
    preheader: succeeded ? `Your scheduled task "${stepText}" is done.` : `Your scheduled task "${stepText}" couldn't run.`,
    bodyHtml,
  });
}

// Lead-classification badge shown at the top of a website form submission
// email (see api/websites/[id]/submit-form/route.ts + lib/lead-classification.ts)
// — null (classification unavailable/failed) renders no badge at all
// rather than a misleading default.
const LEAD_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  genuine_interest: { emoji: "🟢", label: "Likely genuine lead", color: "#4ade80" },
  question: { emoji: "🔵", label: "General question", color: "#60a5fa" },
  spam: { emoji: "🔴", label: "Possible spam", color: "#f87171" },
  unclear: { emoji: "⚪", label: "Unclear", color: "#a3a3a3" },
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
}: {
  websiteName: string;
  dashboardUrl: string;
}): string {
  const safeWebsiteName = escapeHtml(websiteName);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">website builder</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      "${safeWebsiteName}" seems stuck
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.
    </p>
    <p style="margin:0;">
      <a href="${dashboardUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Open Website Builder
      </a>
    </p>
  `;

  return layout({
    preheader: `"${websiteName}" has been stuck generating for over 24 hours.`,
    bodyHtml,
  });
}

export function websiteFormSubmissionEmailHtml({
  websiteName,
  fields,
  classification,
  dashboardUrl,
}: {
  websiteName: string;
  fields: Record<string, string>;
  classification: string | null;
  dashboardUrl: string;
}): string {
  const safeWebsiteName = escapeHtml(websiteName);
  const badge = classification ? LEAD_BADGES[classification] : null;

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
    <span style="color:${MUTED}; font-size:12px;">new form submission</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 8px;">
      Someone contacted you via "${safeWebsiteName}"
    </h1>
    ${
      badge
        ? `<p style="margin:0 0 16px;"><span style="display:inline-block; background-color:#1a1a1a; border:1px solid ${BORDER}; border-radius:999px; padding:4px 12px; font-size:12px; color:${badge.color};">${badge.emoji} ${badge.label}</span></p>`
        : ""
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER}; margin:8px 0 20px;">
      ${fieldRows}
    </table>
    <p style="margin:0;">
      <a href="${dashboardUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        View your websites
      </a>
    </p>
  `;

  return layout({
    preheader: `New form submission on ${websiteName}`,
    bodyHtml,
  });
}
