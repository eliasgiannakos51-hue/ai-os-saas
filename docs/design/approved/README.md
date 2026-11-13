# The approved screens

**Dated 2026-11-04.** These 26 images are the screens the owner approved —
he delegated the approval and it was given on 2026-11-04. They are the
designs every tool screen in this app is checked against. Where a screen
here and a sentence elsewhere disagree about how a tool LOOKS, the image
wins; what a tool DOES is still the directive's (`docs/QUEUE.md`).

They were not in the repository before this date, which is why the tools
built on `src/components/shell/tool-shell.tsx` until then drew the older
conversation-left, work-right layout. The approved layout is editor-first:
`src/components/shell/editor-shell.tsx`, behind the switch `editor-shell`
(`src/lib/flags/flags.ts`), and `scripts/tests/editor-shell.prodtest.mjs`
puts it in a real browser next to these images.

## What is here

- `*.png` — the approved renders: 2880×1800 (a 1440×900 screen at 2×) for
  the computer, 780×1688 (390×844 at 2×) for the three phone screens,
  `M00`, `M01` and `M14`.
- `src/` — the mockup sources each image was rendered from, with the exact
  measurements. `src/common.css` is the measurement sheet: `.tbar` (the
  work's top bar), `.stage` and `.canvas` (the work area), `.insp` (the
  288px right panel), `.askwrap`, `.note`, `.ask`, `.selc` and `.send` (the
  floating field), `.btn` and `.pri` (buttons), `.tag` (the status tag),
  `.seg` (the segmented control). `src/common.js` draws the shared parts
  (sidebar, top bar, the work bar's history button and crumb, the field).
  03–19 were rendered from `src/common.css` + `src/common.js`; 00–02, 20,
  23, 24 and the three phone screens are self-contained files. The fonts
  are Inter from `@fontsource/inter` 5.1.0 (`src/fonts.css`). The app's own
  font is not Inter, and the mockup colours `#3A4560` (the crumb's slash)
  and `#2A3348` (the field's edge) are not tokens: the app maps them to
  `muted` and `border` (`src/app/globals.css`, «THE EDITOR LAYOUT'S
  FRAMES»).

## Every image, and where it lives in the app

| File | Screen / tool | Route in this app | Directive in `docs/QUEUE.md` |
|---|---|---|---|
| `00-Arxiki.png` | Home (the greeting and the field) | `/dashboard/overview` | ΣΥΣΤΗΜΑ DESIGN §4 (`docs/CONTEXT.md`); D.4 |
| `01-MyStuff.png` | My Stuff | `/dashboard/my-stuff` | «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ» |
| `02-Connect.png` | Connect | `/dashboard/integrations` | «12. CONNECT: ΝΕΑ ΟΘΟΝΗ» |
| `03-Meetings.png` | Meetings | `/dashboard/meetings` | «9. MEETINGS: ΝΕΑ ΟΘΟΝΗ» |
| `04-Analyze.png` | Analyze | `/dashboard/data-analysis` | «7. ANALYZE: ΝΕΑ ΟΘΟΝΗ» |
| `05-DeepResearch.png` | Deep Research | `/dashboard/deep-research` | «8. DEEP RESEARCH: ΝΕΑ ΟΘΟΝΗ» |
| `06-Translate.png` | Translate | `/dashboard/translate` | «14. TRANSLATE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `07-Rebuild.png` | Rebuild | `/dashboard/rebuild` | «10. REBUILD: ΝΕΑ ΟΘΟΝΗ» |
| `08-Site.png` | Site, with a selected piece, the floating field and the last-answer line | `/dashboard/website-builder` | «5. SITE: ΝΕΑ ΟΘΟΝΗ» |
| `09-Apps.png` | Apps | `/dashboard/app-builder` | «15. APPS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `10-Games.png` | Games | `/dashboard/games` | «11. GAMES: ΝΕΑ ΟΘΟΝΗ» |
| `11-Document.png` | Document | `/dashboard/documents` | «3. DOCUMENT: ΝΕΑ ΟΘΟΝΗ» |
| `12-Slides.png` | Slides | `/dashboard/presentations` | «4. SLIDES: ΝΕΑ ΟΘΟΝΗ» |
| `13-Posts.png` | Posts | `/dashboard/posts` | «6. POSTS: ΝΕΑ ΟΘΟΝΗ» |
| `14-Image.png` | Image, with the 288px settings panel and the price box at its foot | `/dashboard/images` | «16. IMAGE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `15-Video.png` | Video | `/dashboard/video-studio` (Coming Soon today) | «19. VIDEO: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `16-Films.png` | Films | `/dashboard/films` | «20. FILMS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `17-Editing.png` | Editing | `/dashboard/editing` | «18. EDITING: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `18-Avatars.png` | Avatars | `/dashboard/avatars` (Coming Soon today) | «21. AVATARS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `19-Audio.png` | Audio | `/dashboard/audio` (Coming Soon today) | «17. AUDIO: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |
| `20-Coding.png` | Coding | `/dashboard/coding` | «13. CODING: ΤΕΛΙΚΗ ΟΘΟΝΗ» |
| `23-iowork.png` | iowork | `/dashboard/iowork` | «22. IOWORK: ΛΕΙΤΟΥΡΓΙΚΟ, ΦΑΣΗ ΦΑΣΗ» |
| `24-Projects.png` | Projects | `/dashboard/projects` | «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» |
| `M00-Start.png` | Phone: a tool's start screen (Image) — globe, heading, three examples as rows, the options inside the field | `/dashboard/images` at 390px | «16. IMAGE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ»; every tool's empty landing |
| `M01-MyStuff.png` | Phone: My Stuff | `/dashboard/my-stuff` at 390px | «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ» |
| `M14-Image.png` | Phone: Image with work open — Chat \| Result, the primary full-width, the selection chip in the field | `/dashboard/images` at 390px | «16. IMAGE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ» |

There is no `21-` or `22-` image: Agents and Automations were not part of
the approved set.

## How a screen is checked against these

1. Open the image and the mockup source beside it; the measurement is the
   class in `src/common.css`, not the pixel in the PNG.
2. Run the screen in a real browser at 1440×900 and 390×844 —
   `SHOT_DIR=… node scripts/tests/editor-shell.prodtest.mjs` writes the
   editor layout's screenshots — and compare.
3. What the image shows that the tool cannot do yet is a follow-up in
   `docs/QUEUE.md`, never a drawn control that does nothing
   (`docs/TOOL-RULES.md`).
