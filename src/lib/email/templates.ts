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

// V3 Task 13 rewrote this from a 13-module feature table into ONE
// concrete first step. A welcome email is day zero of the lifecycle
// sequence, and the documented first-experience failure was precisely
// "presented with capabilities, concluded it's several LLMs in one" —
// the email must not re-teach what the first screen just unlearned.
export function welcomeEmailHtml({ email }: { email: string }): string {
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">signup · ${email}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">welcome — here's your first step</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 14px;">
      Your account is ready, no email confirmation needed. Do exactly one
      thing: open your workspace and answer one question — what do you want
      to do first? Build a website, set a goal, organise your data, or just
      ask something.
    </p>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Whichever you pick opens with the input ready. One sentence in,
      something real out — in the next minute, not after a tour.
    </p>
    <p style="margin:0;">
      <a href="${SITE_URL}/dashboard/overview" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Pick your first thing
      </a>
    </p>
  `;

  return layout({ preheader: "Your account is ready — pick your first thing.", bodyHtml });
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

// Distinct from the team invite above on purpose: a team seat puts the
// recipient inside the owner's account at the owner's tier, while a
// project collaborator keeps their own independent account and plan and
// is being granted access to exactly one mission. The copy must not
// promise the team invite's "full access at their tier" here.
export function collaborationInviteEmailHtml({
  inviterEmail,
  projectGoal,
  role,
  acceptUrl,
}: {
  inviterEmail: string;
  projectGoal: string;
  role: string;
  acceptUrl: string;
}): string {
  // The goal is the owner's own text — user content, so escaped. The
  // inviter email survived the login flow's validation (no angle
  // brackets can), and role is one of two literals, but escaping all
  // three costs nothing and assumes nothing.
  const safeGoal = escapeHtml(projectGoal);
  const safeInviter = escapeHtml(inviterEmail);
  const safeRole = escapeHtml(role);
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">project invite</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">you've been invited to collaborate</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      <span style="color:${FOREGROUND};">${safeInviter}</span> invited you to join
      their project <span style="color:${ORANGE};">&ldquo;${safeGoal}&rdquo;</span>
      on Ionexa AI as <span style="color:${FOREGROUND};">${safeRole}</span>.
      You keep your own account and plan — this shares one project, nothing else.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${acceptUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        View the invite
      </a>
    </p>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:0;">
      The invite was sent to this address and only an account with this
      address can accept it. If you weren't expecting it, you can ignore
      this email — it expires on its own.
    </p>
  `;

  return layout({
    preheader: `${inviterEmail} invited you to collaborate on a project.`,
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
}: {
  agentName: string;
  output: string;
  agentsUrl: string;
  /** EU AI Act Article 50 — the recipient has to be able to tell that what
   *  they are reading was produced by an AI system. Passed in rather than
   *  hardcoded so it can be sent in the agent's own language. */
  aiGeneratedNotice: string;
}): string {
  const safeAgentName = escapeHtml(agentName);

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">your agent</span>
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
        Manage your agents
      </a>
    </p>
  `;

  return layout({
    preheader: `${agentName} — your scheduled result.`,
    bodyHtml,
  });
}

// Sent once, when an agent switches itself off after five consecutive
// failed runs. Critical mail: the user built this thing to receive
// something on a schedule, and the single most damaging outcome is that it
// stops silently and they only notice weeks later.
export function agentDisabledEmailHtml({
  agentName,
  reason,
  consecutiveFailures,
  agentsUrl,
}: {
  agentName: string;
  reason: string;
  consecutiveFailures: number;
  agentsUrl: string;
}): string {
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">your agent</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      "${escapeHtml(agentName)}" has been switched off
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 12px;">
      It failed ${consecutiveFailures} times in a row, so it has stopped running rather than keep failing and keep costing you credits.
    </p>
    <p style="color:#f87171; font-size:13px; line-height:1.6; margin:0 0 20px;">
      Last error: ${escapeHtml(reason)}
    </p>
    <p style="color:${MUTED}; font-size:13px; line-height:1.6; margin:0 0 20px;">
      Open it below to check the task and turn it back on.
    </p>
    <p style="margin:0;">
      <a href="${agentsUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Open your agents
      </a>
    </p>
  `;

  return layout({
    preheader: `"${agentName}" stopped running after ${consecutiveFailures} failures.`,
    bodyHtml,
  });
}

// Sent when an agent is paused because the account ran out of credits.
// Distinct from the disabled email on purpose: nothing is wrong with the
// agent, and the fix is a top-up rather than an edit.
export function agentPausedNoCreditsEmailHtml({
  agentName,
  agentsUrl,
  billingUrl,
}: {
  agentName: string;
  agentsUrl: string;
  billingUrl: string;
}): string {
  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">your agent</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">
      "${escapeHtml(agentName)}" is paused
    </h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.
    </p>
    <p style="margin:0 0 12px;">
      <a href="${billingUrl}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        Top up credits
      </a>
    </p>
    <p style="margin:0;">
      <a href="${agentsUrl}" style="color:${MUTED}; font-size:12px;">Open your agents</a>
    </p>
  `;

  return layout({
    preheader: `"${agentName}" is paused — your account is out of credits.`,
    bodyHtml,
  });
}

// V3 Task 13 — the lifecycle sequence and the "your request shipped"
// notice share one generic builder: a kicker, a heading, paragraphs, an
// optional bullet list of REAL numbers, one CTA. The copy differences
// live with the cron that decides which email is due, not here.
export function lifecycleEmailHtml({
  kicker,
  heading,
  paragraphs,
  bullets = [],
  ctaLabel,
  ctaPath,
}: {
  kicker: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  ctaLabel: string;
  ctaPath: string;
}): string {
  const safeParagraphs = paragraphs
    .map(
      (p) =>
        `<p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 14px;">${escapeHtml(p)}</p>`
    )
    .join("");
  const bulletRows = bullets
    .map(
      (b) => `
              <tr>
                <td style="padding:5px 0; border-bottom:1px solid ${BORDER}; color:${FOREGROUND}; font-size:13px;">${escapeHtml(b)}</td>
              </tr>`
    )
    .join("");
  const bulletTable = bullets.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${bulletRows}</table>`
    : "";

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">${escapeHtml(kicker)}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">${escapeHtml(heading)}</h1>
    ${safeParagraphs}
    ${bulletTable}
    <p style="margin:0 0 6px;">
      <a href="${SITE_URL}${ctaPath}" style="display:inline-block; background-color:${ORANGE}; color:#000; font-size:13px; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none;">
        ${escapeHtml(ctaLabel)}
      </a>
    </p>
    <p style="color:${MUTED}; font-size:11px; line-height:1.6; margin:14px 0 0;">
      You can turn these emails off any time in Settings &rarr; Email notifications.
    </p>
  `;

  return layout({ preheader: heading, bodyHtml });
}
