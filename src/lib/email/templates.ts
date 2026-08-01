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

// /apple-icon is a real, hosted PNG (see src/app/apple-icon.tsx — the
// icon-only brand mark on a dark background, already generated for Apple
// touch icons) — email clients need a fully-qualified, actually-hosted
// image URL, so this reuses that route instead of inlining the SVG (most
// clients, Outlook especially, don't render inline/embedded SVG).
const SITE_URL = getSiteUrl();
const LOGO_URL = `${SITE_URL}/apple-icon`;

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
                <img src="${LOGO_URL}" width="32" height="32" alt="Ionexa AI" style="display:block; border-radius:7px; margin-bottom:12px;" />
                <span style="color:${ORANGE}; font-size:13px; letter-spacing:2px;">Ionexa AI //</span>
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
