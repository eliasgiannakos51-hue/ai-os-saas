/**
 * Sub-processor registry — single source of truth for the companies that
 * process user data on Ionexa's behalf.  The /privacy page reads this
 * list instead of carrying hand-written JSX, so adding a vendor is a
 * one-file change that the privacy page picks up automatically.
 *
 * "onlyIf" means the vendor receives nothing unless the user activates
 * that feature — the distinction the privacy page already makes in prose.
 */
export interface SubProcessor {
  name: string;
  role: string;
  onlyIf?: string;
}

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: "Supabase",
    role: "database, file storage and authentication",
  },
  {
    name: "Vercel",
    role: "application hosting and content delivery",
  },
  {
    name: "Anthropic",
    role: "the AI model behind every text feature: chat, sites, research, presentations, posts, coding, analysis, files, meetings and agents. It receives what you send to that feature and the context the feature uses",
  },
  {
    name: "OpenAI",
    role: "turns the audio into text",
    onlyIf: "you use voice or upload a meeting recording",
  },
  {
    name: "ElevenLabs",
    role: "receives that text",
    onlyIf: "you ask for text to be read aloud",
  },
  {
    name: "Stripe",
    role: "payments. Your card details go to Stripe and never reach Ionexa. Stripe does not set cookies on the pages we serve",
  },
  {
    name: "Resend",
    role: "email delivery (for example the welcome email, and agent results you chose to receive by email)",
  },
  {
    name: "Unsplash",
    role: "photo search for sites and presentations. It receives search words, not your account details",
  },
  {
    name: "Google",
    role: "Ionexa reads from them what you ask it to. Google’s Gemini also, only if you use the Image tool: it receives the description you write and, when you change a picture or ask for it at full size, that picture, and makes the pictures. It does not receive your account details",
    onlyIf: "you connect them",
  },
  {
    name: "Slack",
    role: "sends to Slack what you set an agent to send there",
    onlyIf: "you connect them",
  },
  {
    name: "Telegram",
    role: "they receive that message",
    onlyIf: "you choose them as a destination for notifications or agent results",
  },
  {
    name: "Discord",
    role: "they receive that message",
    onlyIf: "you choose them as a destination for notifications or agent results",
  },
] as const;
