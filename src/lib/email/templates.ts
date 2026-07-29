import "server-only";

// Plain, table-based HTML with inline styles only — no <style> blocks, no
// flexbox/grid, no CSS variables. Email clients (especially Outlook
// desktop) strip or ignore most modern CSS, so everything here is written
// to degrade gracefully rather than rely on it.

const BG = "#090909";
const PANEL = "#141414";
const BORDER = "#2a2a2a";
const AMBER = "#f59e0b";
const FOREGROUND = "#f5f5f5";
const MUTED = "#a3a3a3";
const MONO_STACK = "'Courier New', Courier, monospace";

function layout({ preheader, bodyHtml }: { preheader: string; bodyHtml: string }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nexa AI</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BG}; font-family:${MONO_STACK};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding-bottom:24px;">
                <span style="color:${AMBER}; font-size:13px; letter-spacing:2px;">Nexa AI //</span>
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
                  You're receiving this because you have a Nexa AI account.
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
                  <span style="color:${AMBER}; font-size:13px;">${title}</span><br />
                  <span style="color:${MUTED}; font-size:12px;">${blurb}</span>
                </td>
              </tr>`
  ).join("");

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">signup · ${email}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">welcome to Nexa AI</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Your account is ready — no email confirmation needed, you can log in right
      away. Nexa AI is 13 modules for running a startup, plus a free-text inbox
      that files anything you type into the right one.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${moduleRows}
    </table>
    <p style="color:${MUTED}; font-size:12px; line-height:1.6; margin:20px 0 0;">
      Tip: on <span style="color:${AMBER};">/dashboard/create</span> you can just
      describe what happened in plain English and it'll land in the right module
      automatically.
    </p>
  `;

  return layout({ preheader: "Your Nexa AI account is ready.", bodyHtml });
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
                <td style="padding:6px 0; border-bottom:1px solid ${BORDER}; color:${AMBER}; font-size:13px; text-align:right;">${m.count}</td>
              </tr>`
    )
    .join("");

  const bodyHtml = `
    <span style="color:${MUTED}; font-size:12px;">digest · ${periodLabel}</span>
    <h1 style="color:${FOREGROUND}; font-size:20px; margin:12px 0 16px;">your week on Nexa AI</h1>
    <p style="color:${MUTED}; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${total} new ${total === 1 ? "entry" : "entries"} logged for ${email} this week.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows || `<tr><td style="color:${MUTED}; font-size:13px; padding:6px 0;">Nothing logged this week.</td></tr>`}
    </table>
  `;

  return layout({ preheader: `Your Nexa AI weekly digest — ${total} new entries.`, bodyHtml });
}
