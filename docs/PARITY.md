# Feature parity: what the other assistants offer, and where Ionexa stands

Researched **2026-11-05**, from what each company has announced publicly.
Every "seen" date below is that day. The Ionexa column was checked against
the code on the same day, file by file, not from memory.

**Scope:** only shipped or formally announced features. Anything rumoured,
leaked, or listed only as "on the roadmap" is out of scope. One example: the
browser control Gemini Spark lists as "planned" in G1 is left out.

**Deliberately excluded:** companion and romance personas (Grok's
companions), adult or "spicy" modes, and anything else that does not belong
in a small-business assistant. They are not researched further and get no
PAR row.

**How to read the Ionexa column**

- **HAS**: built, and its tile in `src/lib/nav/all-tools.ts` is `ready: true`
  (or it is part of Chat).
- **PARTIAL**: one of three things. It is built behind a switch in
  `src/lib/flags/flags.ts`, which starts at "you and the test account" and
  is opened on /dashboard/system-health. Or it is built but narrower than
  the competitors' version. Or its tile is `ready: false`, with the screen
  already built.
- **MISSING**: nothing in the code does it.

Whether a switch has already been opened to everyone is a setting in the
database (`feature_flags`), and this document cannot see it. "Behind a
switch" therefore means "not on by default".

**How to read the sources.** Each source has an id (S1, C1 and so on),
listed at the end. Where a source is marked **(title only)**, only its
headline was seen in search, and the page itself was not opened. Such a
source shows that the feature was announced. It does not show that the
feature still exists: ChatGPT announced group chats in 2025 and began
retiring them on 2026-07-09 (S10).

---

## 1. Chat and memory

| Feature | Who offers it (source) | Ionexa | Evidence in the repo |
|---|---|---|---|
| Web search with sources in the answer | ChatGPT S1, Claude C2, Le Chat L1, Perplexity P1 | **HAS** | `web_search` tool in `src/app/api/chat/route.ts`; `src/lib/ai/providers/citations.ts` |
| Memory the user can see and edit | ChatGPT S1, Claude C1 (2026-07-10, 2026-08-25), Le Chat L3, Perplexity P1 ("Brain", 2026-07-13), Gemini G3 ("Personal Intelligence") | **HAS** | /dashboard/ai-memory (`src/app/dashboard/ai-memory/page.tsx`), extraction in `src/lib/chat/memory.ts`, store in `src/lib/memory/store.ts` |
| One memory shared by every tool | Claude C1 (memory across chat and Cowork, 2026-08-25) | **HAS**, and it is the product's premise (`docs/CONTEXT.md`, ΑΡΧΕΣ 2) | `src/lib/ai/cross-module-context.ts` |
| Incognito / temporary chat | Claude C1 (2025-09-11) | **MISSING** | no such mode in `src/app/api/chat/route.ts` |
| Share a conversation as a link | — (not re-checked this round) | **MISSING** | only projects share (`src/app/api/projects/[id]/share/route.ts`) |
| Monthly recap of your own use | Claude C1 ("Reflect", 2026-07-09) | **PARTIAL**: a weekly review, on request | `src/lib/reflection-agent.ts`, /dashboard/reflection |
| Answers that arrive as interactive UI (charts, timelines, small tools inside the answer) | ChatGPT S2 (Intelligent UI, 2026-10-07), Claude C1 (charts, 2026-03-12), Gemini G3, Perplexity P1 (2026-10-05) | **PARTIAL**: a chart, only under an answer about an attached data file, behind `chat-charts` | `src/lib/chat/answer-chart.ts` |
| Ready answers for product questions with no model call | — | **HAS** (Ionexa's own) | `src/lib/support/knowledge-base.ts`, wired in `src/app/api/chat/route.ts` |

## 2. Voice

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Spoken back-and-forth conversation | ChatGPT S1, Claude C4 (title only), Gemini G1 (Live), Le Chat L2, Grok X1 (Voice 3.0, 2026-10-14) | **HAS**, turn by turn: listen, think, speak | `src/components/voice/voice-conversation.tsx`, `src/app/api/voice/transcribe/route.ts`, `src/app/api/voice/speak/route.ts` |
| Dictation in any field | Gemini G2 (macOS, 2026-07-31) | **HAS** inside Ionexa. Not system-wide, because there is no desktop app | /dashboard/voice, `src/lib/voice/voice-command.ts` |
| Camera or screen sharing during a live conversation | not sourced this round | **MISSING** | — |

## 3. Vision and files

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Attach a PDF or image to a chat message | ChatGPT S1, Le Chat L1 | **PARTIAL**, behind `chat-attachments` | `src/lib/flags/flags.ts`, `attachedImages` in `src/app/api/chat/route.ts` |
| Questions about a set of documents | ChatGPT S1 | **HAS** | Analyze: `src/lib/jobs/handlers/file-ask.ts`, /dashboard/data-analysis |
| Data analysis with charts | ChatGPT S1 (runs code), Le Chat L1 (code interpreter) | **HAS**, computed by code and not in a Python sandbox | `src/lib/data-analysis/query.ts`, `src/lib/data-analysis/analyse.ts` |
| Meeting recording → transcript, summary, actions | Manus M1 (Zoom connector, 2026-06-09) | **HAS** | /dashboard/meetings, `src/lib/meetings/meeting-analyse-call.ts` |

## 4. Images, video, audio, 3D

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Image generation and editing | ChatGPT S1, Gemini G3 (Nano Banana), Grok X1 (Imagine Image 2.0, 2026-08-07), Le Chat L1 + L2, Perplexity P3 (title only) | **HAS** (needs the image key) | `src/app/api/images/generate/route.ts`, `src/app/api/images/[id]/edit/route.ts`; all-tools `image`, `needs: "imageKey"` |
| Your own likeness in images | Gemini G2 (avatar insertion, 2026-07-31) | **MISSING** | — |
| Video generation | Gemini G1 (Omni, 2026-05-19), ChatGPT S11 (Sora 2, title only), Grok X2 (Imagine Video 1.5, title only) | **MISSING**: tile is `ready: false` | all-tools `video` → /dashboard/video-studio; `docs/VIDEO-PROVIDERS.md` |
| Video editing | Manus M1 (Video Editor, 2026-10-01), Gemini G1 | **PARTIAL**: built behind `editing-tool`, tile `ready: false` | all-tools `editing`, `docs/EDITING-REMOTION.md` |
| Music | Gemini G3 (Lyria 3 Pro, 2026-04-24) | **MISSING**: `audio` tile `ready: false` | all-tools `audio`, `docs/AUDIO-PROVIDERS.md` |
| Voice-over | Manus M1 (ElevenLabs, 2026-08-03) | **PARTIAL**: text-to-speech exists for voice and is not offered as a tool of its own | `src/app/api/voice/speak/route.ts` |
| Talking avatar video | Gemini G1 ("custom AI avatar" in Omni) | **MISSING**: tile `ready: false` | all-tools `avatars`, `docs/AVATARS-PROVIDERS.md` |
| 3D models | — | **PARTIAL**: built behind `3d-tool`, no provider key yet | all-tools `threeD`, `docs/3D-PROVIDERS.md` |

## 5. Deep research

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Multi-step research with a cited report | ChatGPT S1, Claude C3 (title only), Le Chat L2, Perplexity P1 | **HAS** | /dashboard/deep-research, `src/lib/research/research.ts` |
| Several models answer and compared | Perplexity P1 (Model Council, 2026-08-04) | **deliberately not**: "Ο χρήστης δεν διαλέγει μοντέλο" (`docs/CONTEXT.md`, ΑΡΧΕΣ 3) | — |

## 6. Making things: canvas, artifacts, documents

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Documents | Claude C1 (Docs, 2026-09-16; files since 2025-09-09), ChatGPT S1 (canvas), Le Chat L1 | **HAS** | `src/lib/documents/write-call.ts` |
| Slides | Claude C1 (2026-09-16; PowerPoint 2026-02-05), Manus M1 (2026-07-14) | **HAS** | `src/lib/presentations/generate.ts` |
| Spreadsheets with formulas | Claude C1 (Excel, 2025-11-24) | **PARTIAL**, behind `sheets-tool` | `src/lib/sheets/grid.ts`, /dashboard/sheets |
| Highlight part of a draft and ask for an edit | Claude C1 (2026-06-12), ChatGPT S1 (canvas) | **not checked this round** | — |
| Websites, published, with your own domain | Manus M1 (Auto-Publish, Hosting Modes), Perplexity P1 (website publishing, 2026-07-13) | **HAS** | `src/lib/website-builder.ts`, `src/lib/publishing/custom-domain.ts` |
| Web apps that save data | Le Chat L1 ("micro-apps"), ChatGPT S2 ("on-demand tools") | **MISSING**: tile `ready: false` | all-tools `apps` → /dashboard/app-builder |
| Games | Manus M1 (Game Dev, 2026-10-01) | **HAS** | `src/lib/games/game-call.ts` |
| Social posts | Gemini G4 (campaign concepts) | **HAS** | `src/lib/posts/generate.ts` |
| Translation of a page or a document | — | **PARTIAL**: inside Documents and the Site builder. Its own tile is `ready: false` | `src/lib/translate/translate-call.ts`, all-tools `translate` |

## 7. Code

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Write, explain, fix, convert and test code | ChatGPT S1 (canvas: writing and debugging) | **HAS** | `src/lib/coding/operations.ts`, /dashboard/coding |
| Run the code in a sandbox | ChatGPT S1, Le Chat L1 | **MISSING** | `src/lib/coding/operations.ts` writes code and never executes it |

## 8. Agents, computer and browser use

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| An agent that does a task on its own (research and write) | ChatGPT S3, Claude C1 (Cowork), Gemini G1 (Spark), Grok X1 (Grok Bot), Perplexity P2 (Computer), Manus M1, Le Chat L4 (Work mode) | **HAS** | /dashboard/agents, `src/lib/agents/agent-runner.ts` |
| An agent that uses a browser and clicks through sites | ChatGPT S3 (agent) + S4 (Atlas), Claude C5 (Chrome, GA; title only), Perplexity P2 (Comet, Computer), Manus M1 (Preferred Browser) | **MISSING** | QUEUE BR1; `docs/BROWSER-PROVIDERS.md` |
| A cloud agent with its own computer that keeps going while you are away | Claude C1 (Cowork remote, 2026-07-07), Gemini G1/G2 (Spark, not in the EEA), Grok X1 (Grok Bot, 2026-08-11), Perplexity P2 (Computer), Manus M1 (Cloud Computer) | **MISSING** | — |
| A desktop app that acts on local files | Claude C1 (Cowork), Perplexity P1 (Personal Computer for Windows, 2026-08-04), Gemini G1 (macOS) | **MISSING**: `iowork` tile `ready: false` | all-tools `iowork`, `docs/IOWORK-TECH.md` |
| Plan first, then act | Manus M1 (Plan Mode, 2026-07-22) | **PARTIAL**: Create Studio shows what it understood, plus the cost, before it acts | `src/app/api/create-studio/detect/route.ts` |

## 9. Connectors, MCP and apps

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Read Gmail, Drive, Calendar and Slack from chat | Claude C1 (connectors, Microsoft 365), Gemini G1 (Gmail and Calendar), Perplexity P4 (title only), Manus M1 (Gmail and Calendar) | **HAS** (read-only) | `src/lib/integrations/chat-tool.ts`, `src/lib/integrations/providers.ts` |
| Act in them (send mail, create events) | Claude C1 (Microsoft 365 write tools, 2026-07-07), Gemini G1 (Spark drafts emails) | **MISSING** | `src/lib/integrations/chat-tool.ts` is search-only |
| Connect any MCP server | Claude C1 (since 2025-08-21), Le Chat L3 (custom MCP connectors) | **PARTIAL**: it connects and runs from its own page, and Chat does not call it | `src/lib/mcp/client.ts`, `src/app/api/mcp/[id]/run/route.ts`; all-tools note "Chat does not use these apps yet" |
| Directory of third-party apps inside chat | ChatGPT S6 (Apps SDK), Claude C1 (plugin directory, 2026-09-25), Perplexity P1 (Skills Marketplace, 2026-09-21) | **MISSING** | — |
| Business systems (Salesforce, Shopify, Similarweb) | Claude C1 (Salesforce, 2026-09-15), Manus M1 (Shopify, Similarweb) | **MISSING** | — |
| Google Business Profile: reviews, hours, performance | Gemini G4 (2026-06-10) | **MISSING** | no Business Profile code under `src/lib/integrations/` |
| Delegate from a team chat app | Claude C1 (Claude Tag in Slack, 2026-06-23), Grok X1 (Grok in X, 2026-08-29) | **PARTIAL**: Telegram both ways, behind `telegram-bot`. Notifications going out work today | `src/lib/telegram/pairing.ts`, `src/lib/notify/dispatch.ts` |

## 10. Scheduled tasks and briefings

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Scheduled and recurring tasks | ChatGPT S1, Claude C1 (2025-11-24, Cowork 2026-02-25), Gemini G1 (Spark triggers), Manus M1 (Scheduled Tasks 2.0), Perplexity P1 (Automations, 2026-10-05) | **HAS** | `src/app/api/cron/agent-runs/route.ts`, `src/app/api/cron/scheduled-runs/route.ts`, `src/lib/automations/runner.ts` |
| Event-triggered automations | Gemini G1 (triggers) | **HAS** | `src/app/api/cron/automation-flows/route.ts` |
| Morning brief from your inbox and calendar | Gemini G1 (Daily Brief, 2026-05-19), ChatGPT S5 (Pulse, title only) | **PARTIAL**: an agent can be scheduled for 07:00, but no brief reads mail and calendar. The weekly digest is data only | `src/app/api/weekly-digest/route.ts` |
| Proactive alerts about your business | Gemini G4 (notebook alerts) | **PARTIAL**: lead and meeting-action reminders | `src/app/api/cron/lead-reminders/route.ts` |

## 11. Projects and workspaces

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Projects: chats, files and context in one place | ChatGPT S1, Claude C1, Le Chat L2, Gemini G3 (Notebooks), Manus M1 (Projects that learn, 2026-05-06) | **HAS** | /dashboard/projects |
| Share a project read-only | Claude C1 (Team/Enterprise) | **HAS** | `src/app/api/projects/[id]/share/route.ts` |
| Shared team workspace | Perplexity P1 (2026-08-04), Grok X1 (Team Bots, 2026-09-28) | **PARTIAL**: team seats on a plan, without shared chats | `src/lib/team/seat-limits.ts` |
| Group chats | ChatGPT **retired** them from 2026-07-09 (S10) | **MISSING**, and not pursued | — |

## 12. Custom assistants and skills

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Build an assistant from a description | ChatGPT S1 (custom GPTs), Le Chat L1 (agents) | **HAS** | `src/lib/agents/agent-builder.ts` |
| Teach a procedure once (skills) | Claude C1 (Skills since 2025-10), Gemini G1 (Spark "teachable skills"), Perplexity P1 | **PARTIAL**, behind `skills-tool` | `src/lib/skills/load.ts`, /dashboard/skills |
| Store or marketplace of others' assistants | ChatGPT S1 (GPT Store), Perplexity P1 | **MISSING** | — |

## 13. Shopping and booking

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Shopping research and checkout inside chat | ChatGPT S7 + S8 (title only), Gemini G5 (Universal Cart), Gemini G1 (OpenTable, Instacart) | **MISSING** | — |
| Build and run an online shop from chat | Manus M1 (Shopify, 2026-05-25) | **MISSING** | — |

## 14. Study and learning

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Study mode: quizzes, flashcards, a study plan | ChatGPT S9 (title only), Perplexity P5 (language learning, title only) | **PARTIAL**: six ready-made "learn" jobs that open Chat with a prompt, and no study mode of its own | `src/lib/nav/quick-jobs.ts` (group `learn`) |

## 15. Apps on every device

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Mobile | native apps: Claude C1, Gemini G1, Le Chat L1, Grok X1, Perplexity P3 (Comet for Android) | **PARTIAL**: an installable web app (PWA), not a store app | `src/app/manifest.ts`, `src/lib/pwa/install-prompt.ts`; `docs/MOBILE-TECHNOLOGY.md` |
| Desktop | Claude C1, Gemini G1 (macOS), Perplexity P1 (Windows) | **MISSING** | all-tools `iowork` |
| Browser of its own, or an extension | ChatGPT S4 (Atlas), Claude C5, Perplexity P2 (Comet) | **MISSING** | — |
| Built into a phone | Perplexity P2 (Galaxy S26), Manus M1 (OPPO, 2026-10-13) | **out of reach** for a company of this size | — |

## 16. Developer API

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| A public API for your own use | Perplexity P1 (API credentials, 2026-07-27; Decisions API, 2026-10-19), Grok X1 | **MISSING** | no user API keys in `src/app/api/` |
| Bring your own model key | Manus M1 (Flex, 2026-09-29) | **deliberately not**: same principle as Model Council | — |

## 17. Other areas found

| Feature | Who offers it | Ionexa | Evidence |
|---|---|---|---|
| Health records and fitness data | ChatGPT S12 (title only), Claude C1 (2026-01-12) | **MISSING**, and outside a business assistant's job | — |
| Business-performance questions over your own data | Gemini G4 (Business Profile) | **HAS** for the user's own records | /dashboard/business-health, `src/app/api/my-stuff/ask/route.ts` |
| Effort / speed control per question | Perplexity P1 (Effort Mode, 2026-09-21) | **deliberately not** (CONTEXT, ΑΡΧΕΣ 3) | — |

---

## Ranked: what is MISSING or PARTIAL, by value to a small business and by build cost

Value: **H** high, **M** medium, **L** low, for a small business that already
pays for one assistant. Cost: **S** about a session, **M** a few sessions,
**L** a project, or blocked on a key or an outside approval. These are
judgements made on 2026-11-05, not measurements. Rows are sorted by value,
then by cost.

| # | Item | Status | Value | Cost | Why | QUEUE |
|---|---|---|---|---|---|---|
| 1 | Files and images in Chat for everyone | PARTIAL | H | S | Built. It needs only the browser check and the switch | PAR-1 → CD1 |
| 2 | Spreadsheets for everyone | PARTIAL | H | S | Built behind `sheets-tool`. Spreadsheets are a small business's daily tool | PAR-2 → SH1 |
| 3 | Morning brief from mail, calendar and My Stuff | PARTIAL | H | S–M | Every input already exists: the Gmail and Calendar read, agents, the schedule. What is missing is the one job that joins them | PAR-3 |
| 4 | Act in connected apps (draft and send mail, create events) | MISSING | H | M | Reading is done. Writing needs an approval step and new OAuth scopes | PAR-4 → AG1 |
| 5 | MCP apps usable from Chat | PARTIAL | H | M | Connect and run already work. Chat's tool loop exists (`src/lib/integrations/chat-tool.ts`) | PAR-5 → CN1 |
| 6 | Google Business Profile: reviews, hours, performance | MISSING | H | M | Reviews and hours are the first thing a Greek shop asks about. Needs Google's API approval | PAR-6 |
| 7 | Web apps that save data | MISSING | H | L | The most-asked "make" for a small business (a booking form, a client list). A real generator | PAR-7 → APP1 |
| 8 | Skills (teach once) | PARTIAL | M | S | Built behind `skills-tool` | PAR-8 → SK1 |
| 9 | Translate as its own tool | PARTIAL | M | S | Built behind `translate-tool`. Valuable for tourism businesses | PAR-9 → TR1 |
| 10 | Incognito chat (no memory, no history) | MISSING | M | S | Privacy that users ask for by name. It skips the memory write and the history save | PAR-10 |
| 11 | Telegram both ways | PARTIAL | M | S | Built behind `telegram-bot` | PAR-11 → TG1 |
| 12 | Interactive answers (charts and small tools in Chat) | PARTIAL | M | M | Every competitor moved here in 2026 (S2, C1, G3, P1). Today the chart only works on data files | PAR-12 |
| 13 | Video generation | MISSING | M | M | Marketing clips. Blocked on a provider key | PAR-13 → VID1 |
| 14 | Video editing | PARTIAL | M | M | Built behind `editing-tool` | PAR-14 → ED1 |
| 15 | Agent that uses a browser | MISSING | M | L | Forms, bookings and portals. Needs a browser provider and a safety design | PAR-15 → BR1 |
| 16 | Cloud agent with its own computer | MISSING | M | L | Gemini Spark is not offered in the EEA (G2), which leaves an opening in Greece. A large build | PAR-16 → BR1 |
| 17 | Desktop app | MISSING | M | L | Waiting for the owner's answers on platform and signing | PAR-17 → IOW1 |
| 18 | Native mobile apps | PARTIAL | M | L | The PWA covers most of it. The stores cost money and review time | PAR-18 |
| 19 | Shop from chat (Shopify-style store) | MISSING | M | L | Only for sellers, and a large integration | PAR-19 |
| 20 | Share a conversation as a link | MISSING | L | S | Handy for sending to an accountant. The token pattern already exists in the projects share | PAR-20 |
| 21 | Study mode | PARTIAL | L | S | The learn jobs exist, and a small business is rarely studying | PAR-21 |
| 22 | Music | MISSING | L | M | Background tracks for videos. Needs a provider | PAR-22 → AUD1 |
| 23 | Talking avatars | MISSING | L | M | Needs a provider key | PAR-23 → AVT1 |
| 24 | 3D | PARTIAL | L | M | Built, and no provider key yet | PAR-24 → 3D1 |
| 25 | Your likeness in images | MISSING | L | M | Consent and likeness rules come first | PAR-25 |
| 26 | Code that runs in a sandbox | MISSING | L | L | Analysis is already computed by code. A sandbox is infrastructure | PAR-26 |
| 27 | Directory or marketplace of third-party apps and assistants | MISSING | L | L | It needs other developers first | PAR-27 |
| 28 | Public developer API | MISSING | L | M | A small business does not call APIs | PAR-28 |
| 29 | Live camera or screen sharing in a voice conversation | MISSING | L | L | Real-time video. Turn-by-turn voice already works | PAR-29 |
| 30 | Shopping and checkout (buying) | MISSING | L | L | Consumer buying, not the business's job | PAR-30 |
| 31 | Health records | MISSING | L | L | Outside a business assistant, and special-category data under GDPR | PAR-31 |

---

## Sources (all seen 2026-11-05)

| id | Source | What it supports |
|---|---|---|
| S1 | [ChatGPT Capabilities Overview](https://help.openai.com/en/articles/9260256-chatgptcapabilities-overview) (OpenAI Help Center, page says "updated 2 months ago") | search, deep research, image input and generation, file uploads, data analysis that runs code, voice, canvas, memory, projects, scheduled tasks, custom GPTs, GPT Store |
| S2 | [OpenAI rolls out GPT-6 with Intelligent UI](https://www.testingcatalog.com/openai-rolls-out-gpt-6-with-intelligent-ui-in-chatgpt.md) (TestingCatalog, press) | 2026-10-07: interactive answers, small tools built in chat, progressive answers |
| S3 | [Introducing ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/) (title only) | agent |
| S4 | [Introducing ChatGPT Atlas](https://openai.com/index/introducing-chatgpt-atlas/) (title only) | browser |
| S5 | [Introducing ChatGPT Pulse](https://openai.com/index/introducing-chatgpt-pulse/) (title only) | proactive brief |
| S6 | [Introducing apps in ChatGPT and the new Apps SDK](https://openai.com/index/introducing-apps-in-chatgpt/) (title only) | apps inside chat |
| S7 | [Buy it in ChatGPT: Instant Checkout](https://openai.com/index/buy-it-in-chatgpt/) (title only) | checkout |
| S8 | [Introducing shopping research in ChatGPT](https://openai.com/index/chatgpt-shopping-research/) (title only) | shopping research |
| S9 | [Introducing study mode in ChatGPT](https://openai.com/index/chatgpt-study-mode/) (title only) | study mode |
| S10 | [Group chats in ChatGPT (retiring)](https://help.openai.com/en/articles/12703475-group-chats-in-chatgpt) | retirement began 2026-07-09: no new group chats |
| S11 | [Sora 2 is here](https://openai.com/index/sora-2/) (title only) | video |
| S12 | [Launching Health in ChatGPT](https://openai.com/index/health-in-chatgpt/) (title only) | health |
| C1 | [Claude release notes](https://support.claude.com/en/articles/12138966-release-notes) (latest entry 2026-10-07) | every Claude date in the tables above |
| C2 | [Claude web search now available globally](https://www.anthropic.com/news/web-search) (title only) | web search |
| C3 | [Claude takes research to new places](https://www.anthropic.com/news/research) (title only) | research |
| C4 | [Think through hard problems in voice mode](https://claude.com/blog/think-through-hard-problems-in-voice-mode) (title only) | voice |
| C5 | [Claude in Chrome is generally available](https://claude.com/resources/articles/claude-in-chrome-generally-available) (title only) | browser extension |
| G1 | [The Gemini app becomes more agentic](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/) (2026-05-19) | Live, Omni video, Daily Brief, Spark, triggers, skills, MCP apps, macOS |
| G2 | [Gemini Drops, July 2026](https://blog.google/products-and-platforms/products/gemini/gemini-drop-july-2026/) (2026-07-31) | Spark worldwide except the EEA, UK, Switzerland and Nigeria; avatar insertion; Dropbox, Zillow and Viator |
| G3 | [Gemini Drops, April 2026](https://blog.google/innovation-and-ai/products/gemini-app/gemini-drop-april-2026/) (2026-04-24) | Personal Intelligence, Notebooks + NotebookLM, Lyria 3 Pro, interactive visualizations |
| G4 | [New Gemini app features for small businesses](https://blog.google/innovation-and-ai/products/gemini-app/gemini-features-for-businesses/) (2026-06-10) | Business Profile, reviews, notebooks, alerts, campaigns |
| G5 | [100 things we announced at Google I/O 2026](https://blog.google/innovation-and-ai/technology/ai/google-io-2026-all-our-announcements/) (2026-05-20) | Universal Cart in the Gemini app |
| X1 | [xAI news](https://x.ai/news) | Voice 3.0, Team Bots, Grok Bot, Grok Build, Imagine Image 2.0, Grok in X, the API |
| X2 | [Grok Imagine Video 1.5](https://x.ai/news/grok-imagine-video-1-5) (title only) | video |
| P1 | [Perplexity changelog](https://www.perplexity.ai/changelog) (entries 2026-07-13 to 2026-10-19) | Brain, website publishing, API credentials, shared workspaces, Windows app, Model Council, Computer in Email, Skills Marketplace, Effort Mode, Automations, visualizations, connector controls, Decisions API |
| P2 | [What we shipped, 2026-02-26](https://www.perplexity.ai/changelog/what-we-shipped---february-27-2026) | Perplexity Computer, Galaxy S26, Comet voice |
| P3 | [Comet for Android, Nano Banana Pro, inline prices](https://www.perplexity.ai/changelog/what-we-shipped-november-22nd) (title only) | images |
| P4 | [New App Connectors, enhanced Memory](https://www.perplexity.ai/en-GB/changelog/what-we-shipped-september-19th) (title only) | connectors |
| P5 | [Email assistant, language learning, stock indicators](https://www.perplexity.ai/zh-HK/changelog/what-we-shipped-september-26th) (title only) | learning |
| M1 | [Manus product blog](https://manus.im/es-419/blog/product) (entries 2026-04-30 to 2026-10-30) | every Manus date in the tables above |
| L1 | [The all new le Chat](https://mistral.ai/news/all-new-le-chat/) (2025-02-06) | web search, files, code interpreter, images, canvas, memories, micro-apps, mobile |
| L2 | [Le Chat dives deep](https://mistral.ai/news/le-chat-dives-deep/) (2025-07-17) | deep research, voice, projects, image editing |
| L3 | [Le Chat. Custom MCP connectors. Memories.](https://mistral.ai/news/le-chat-mcp-connectors-memories/) (title only; 2025-09-02 per the news index) | MCP, memories |
| L4 | [Mistral news](https://mistral.ai/news/) | Work mode in Le Chat, 2026-05-22 |

**Not re-checked this round:** Gemini Canvas, Gemini Deep Research and Gems,
which are long-standing, had no 2026 source opened, and are not claimed
above. Grok DeepSearch and Grok Tasks are in the same position. Re-check
before quoting any of them.
