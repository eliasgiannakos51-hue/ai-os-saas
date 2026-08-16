// The English Help Centre — the BASE language, and the fallback every
// other locale lands on when it has no article of its own.
//
// Complete on purpose: all 27 slugs, no gaps. The loader falls back to en
// and never to el, so a hole here would surface as a missing article
// rather than as a wrong-language one, and there is no third fallback
// behind it.
//
// NO NUMBERS THAT MOVE. Not one article states a price, a credit cost or
// an allowance — those live in lib/billing/plans.ts and on /pricing, they
// change, and a stale number in a canned answer is a quote a customer will
// hold us to. The knowledge-base test enforces this with a digit scan.
//
// The triggers are the phrasings an ENGLISH speaker types. They are not a
// translation of the Greek list; a Greek user's list legitimately contains
// English product nouns, and reusing it here is what made an English user
// typing "pricing" score 0.975 and receive a Greek paragraph.
export const EN = [
  {
    slug: "pricing-overview", category: "billing", order: 0,
    title: "How much does Ionexa cost?",
    body: "There is a free plan to try it with, and paid plans as your needs grow. Current prices and what each one includes are always on the /pricing page — they are not written here because they change and a stale number is worse than no number.",
    triggers: ["how much", "how much does it cost", "cost", "price", "pricing", "what does it cost", "plans", "what plans", "subscription", "how much is it"],
  },
  {
    slug: "change-plan", category: "billing", order: 1,
    title: "How do I change plan?",
    body: "Settings > Billing. Pick the plan you want and the change takes effect immediately. On an upgrade you pay only the difference for the rest of the period; on a downgrade you keep your current plan until the period you have already paid for ends.",
    triggers: ["change plan", "upgrade", "downgrade", "switch plan", "change subscription", "move to a bigger plan"],
  },
  {
    slug: "cancel", category: "billing", order: 2,
    title: "How do I cancel my subscription?",
    body: "Settings > Billing > Cancel subscription. You do not lose access straight away: your plan runs to the end of the period you have already paid for, and the account then drops to the free plan. Your data stays — cancelling deletes nothing.",
    triggers: ["cancel", "cancel subscription", "unsubscribe", "stop my subscription", "how do i cancel", "end subscription"],
  },
  {
    slug: "invoices", category: "billing", order: 3,
    title: "Where do I find my receipts?",
    body: "Settings > Billing > Payment history. Every charge has a PDF receipt you can download from there. Payments run through Stripe and we never store your card details.",
    triggers: ["receipt", "receipts", "invoice", "invoices", "billing history", "payment history"],
  },
  {
    slug: "refund", category: "billing", order: 4,
    title: "Can I ask for a refund?",
    body: "Yes — tell us what happened and we will look at it. If you were charged by mistake, or something did not work as it should have, we put it right. Message us from Settings > Support with the charge reference.",
    triggers: ["refund", "money back", "charged by mistake", "wrong charge", "get my money back"],
  },
  {
    slug: "what-are-credits", category: "credits", order: 0,
    title: "What are credits?",
    body: "Credits are the currency you pay for AI actions with: a chat message, generating a website, an agent run. Each plan comes with a monthly allowance that renews, and you can buy extra packs if you run out sooner. How much each plan includes is on /pricing.",
    triggers: ["what are credits", "credits", "what is a credit", "how do credits work", "units"],
  },
  {
    slug: "credit-cost-per-action", category: "credits", order: 1,
    title: "How many credits does each action cost?",
    body: "The charge is not fixed per action — it is worked out from what the call actually cost, so a short message costs less than a long one. Before every expensive action you see an estimate, and once it finishes you see the real charge in your history.",
    triggers: ["how many credits", "credit cost", "cost per action", "how much does it charge", "what does an action cost"],
  },
  {
    slug: "credits-ran-out", category: "credits", order: 2,
    title: "I have run out of credits — what now?",
    body: "Two options: wait for the next monthly renewal, or buy a credit pack, which is added immediately and does not expire at the end of the month. Both are in Settings > Billing.",
    triggers: ["ran out of credits", "no credits", "out of credits", "buy credits", "get more credits", "credits finished"],
  },
  {
    slug: "credits-rollover", category: "credits", order: 3,
    title: "Do credits roll over to the next month?",
    body: "A plan's monthly credits renew each month and do not accumulate. Credits you buy in a pack are different: they stay on your account until you use them.",
    triggers: ["roll over", "rollover", "do credits expire", "do credits carry over", "lose my credits"],
  },
  {
    slug: "create-website", category: "websites", order: 0,
    title: "How do I make a website?",
    body: "Open Website Builder from the sidebar, write in plain words what you want — what your business does, who it is for, what style you like — and press create. You can upload reference images too, a logo or product photos, so it follows your look. When it is ready you publish it to its own address in one click.",
    triggers: ["make a website", "create website", "build a website", "website builder", "i want a site", "new website"],
  },
  {
    slug: "publish-website", category: "websites", order: 1,
    title: "How do I publish my website?",
    body: "In Website Builder, open the site and press Publish. You choose a name for the address and the site goes live immediately. Every publish is kept as a version, so you can roll back to an earlier one if you need to.",
    triggers: ["publish", "how do i publish", "put it live", "go live", "make my site public"],
  },
  {
    slug: "create-agent", category: "agents", order: 0,
    title: "How do I make an agent?",
    body: "In the Agents menu, describe in one sentence what you want done and how often — for example \"every morning send me a summary of news in my industry\". Ionexa builds the agent itself, runs it on time and sends you the result. You can pause or change it whenever you like.",
    triggers: ["make an agent", "create agent", "agents", "automation", "i want an agent", "automate something"],
  },
  {
    slug: "create-mission", category: "missions", order: 0,
    title: "How do I make a mission?",
    body: "In Mission Control you write a goal the way you would say it to a person — \"I want more customers by spring\". Ionexa breaks it into concrete steps, and you can then work through them yourself or hand some of them to an agent.",
    triggers: ["make a mission", "mission control", "goal", "goals", "create mission", "missions"],
  },
  {
    slug: "invite-code", category: "account", order: 0,
    title: "Where do I enter an invite code?",
    body: "There is a field for an invite code on the sign-up form. If you already have an account you enter it in Settings > Account. Once it is accepted, whatever it grants is active on your account straight away.",
    triggers: ["invite code", "beta code", "where do i put the code", "invitation", "promo code"],
  },
  {
    slug: "chat-memory", category: "chat", order: 0,
    title: "Does the chat remember earlier conversations?",
    body: "Within one conversation it always remembers the earlier messages. Between conversations it keeps only lastingly useful details — your name, what you do, your preferences — and that is on the paid plans. You can see everything it has kept, and delete it, in Settings > Memory.",
    triggers: ["remember", "memory", "previous conversations", "does it forget", "chat history", "it does not remember"],
  },
  {
    slug: "upload-files", category: "files", order: 0,
    title: "Can I upload files?",
    body: "Yes — PDF, Word, Excel, CSV, text and Markdown. You upload them in Files, Ionexa reads what is in them, and then you can ask questions about them. Your files are private: nobody else has access and every download uses a temporary link.",
    triggers: ["upload a file", "upload", "pdf", "files", "documents", "can i upload"],
  },
  {
    slug: "connect-gmail", category: "integrations", order: 0,
    title: "How do I connect Gmail or Google Drive?",
    body: "Settings > Integrations. Pick the service and approve access in Google's own window. You see exactly what it will read before you approve, and you can disconnect whenever you like — the access keys are deleted immediately when you do.",
    triggers: ["gmail", "google drive", "connect", "integration", "slack", "how do i connect", "link my email"],
  },
  {
    slug: "languages", category: "getting-started", order: 0,
    title: "What languages does it work in?",
    body: "The interface is available in ten languages and you change it in Settings. The AI replies in whatever language you write to it in, regardless of the interface language.",
    triggers: ["language", "languages", "english", "greek", "translation", "change language"],
  },
  {
    slug: "delete-account", category: "privacy", order: 0,
    title: "How do I delete my account?",
    body: "Settings > Account > Delete account. You will be asked to confirm, and then everything goes: conversations, files, websites, agents, history. It cannot be undone. If you want a copy first, download your data from the same page.",
    triggers: ["delete account", "delete my account", "close my account", "remove my account"],
  },
  {
    slug: "export-data", category: "privacy", order: 1,
    title: "Can I download my data?",
    body: "Yes. Settings > Account > Export data. You get a file with everything you have made — conversations, missions, websites, files, billing history. The access keys for connected accounts are left out for security reasons.",
    triggers: ["download my data", "export", "export data", "gdpr", "copy of my data"],
  },
  {
    slug: "data-privacy", category: "privacy", order: 2,
    title: "What do you do with my data?",
    body: "Your data is yours. We do not sell it, we do not use it to train models, and every account sees only its own — that is enforced in the database, not just in the application. You can download it or delete it whenever you want.",
    triggers: ["my data", "privacy", "security", "do you sell my data", "train models", "is my data safe"],
  },
  {
    slug: "password-reset", category: "account", order: 1,
    title: "I have forgotten my password.",
    body: "On the sign-in page press \"Forgot my password\" and enter your email. A reset link will be sent to you. If it does not arrive, check your spam folder as well.",
    triggers: ["forgot my password", "password", "reset password", "cannot log in", "cannot sign in"],
  },
  {
    slug: "team-members", category: "account", order: 2,
    title: "Can I add people from my team?",
    body: "Yes, on the plans that include a team. Settings > Team, invite by email and that person joins the same workspace. Which plans include it and how many seats they give is on /pricing.",
    triggers: ["team", "colleagues", "invite a member", "collaboration", "add users", "share my workspace"],
  },
  {
    slug: "notifications", category: "account", order: 3,
    title: "How do I set up notifications?",
    body: "Settings > Notifications. Separately for email and for phone notifications, and per type — agent results, reminders, low credits. Critical security notifications cannot be switched off.",
    triggers: ["notifications", "email notifications", "push", "stop emailing me", "turn off notifications"],
  },
  {
    slug: "mobile-app", category: "getting-started", order: 1,
    title: "Is there a mobile app?",
    body: "There is no app in the stores, but Ionexa installs on your phone from the browser: open it, choose \"Add to Home Screen\", and it behaves like an app with its own icon and notifications. It works on the phone's browser without installing anything too.",
    triggers: ["mobile app", "app", "android", "iphone", "ios", "is there an app", "on my phone"],
  },
  {
    slug: "what-is-ionexa", category: "getting-started", order: 2,
    title: "What is Ionexa?",
    body: "A workspace where the AI does the work rather than only advising you: it makes your website, runs agents on a schedule, breaks your goals into steps, reads your files and answers questions about them, and keeps everything you have logged in one searchable place.",
    triggers: ["what is ionexa", "what is this", "what does it do", "what can it do", "how does it work"],
  },
  {
    slug: "contact-support", category: "account", order: 4,
    title: "How do I contact you?",
    body: "Settings > Support, or reply to any email we have sent you. A person reads it — say what you were trying to do and what happened instead, and we will come back to you.",
    triggers: ["contact", "support", "help", "talk to a human", "customer service", "email you"],
  },
];
