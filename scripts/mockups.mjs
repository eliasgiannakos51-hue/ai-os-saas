// Three design mockups for the next Ionexa interface, and their photographs.
//
// WHY A GENERATOR AND NOT THREE HAND-WRITTEN HTML FILES:
// the three differ ONLY in their tokens and three structural decisions
// (does the rail exist on home, how wide is it, is the headline serif).
// Written by hand they would drift: a copy edit lands in two of three and
// the comparison stops being a comparison. Here the CONTENT is one source
// and the SKIN is the variable, which is the claim the mockups are making
// in the first place.
//
// The numbers inside the mockups ("14 invoices") are SAMPLE, and each page
// says so in its own footer. Nothing here is measured; nothing here should
// be read as measured.
//
// Run: node scripts/mockups.mjs           # writes docs/mockups/*.html, shoots them
//      SKIP_SHOTS=1 node scripts/mockups.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/mockups";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/mockup-shots";

// ---------------------------------------------------------------- the skins
const SKINS = [
  {
    id: "a-claude",
    name: "A - ANOIXTO (Claude)",
    note: "Light paper, one clay accent, no rail on home.",
    rail: "none-on-home",
    railW: 236,
    headlineFont: 'ui-serif, "Iowan Old Style", Georgia, serif',
    headlineSize: "40px",
    headlineWeight: "400",
    vars: {
      bg: "#faf9f7", canvas: "#faf9f7", surface: "#ffffff", rail: "#f4f2ee",
      text: "#1f1e1d", muted: "#6b6763", faint: "#908b85", line: "#e7e3dd",
      accent: "#c15f3c", accentText: "#ffffff", chip: "#f1eee9",
    },
  },
  {
    id: "b-chatgpt",
    name: "B - SKOURO (ChatGPT)",
    note: "Near-black, white send button, rail always on with history.",
    rail: "always",
    railW: 258,
    headlineFont: "inherit",
    headlineSize: "30px",
    headlineWeight: "600",
    vars: {
      bg: "#0d0d0d", canvas: "#0d0d0d", surface: "#171717", rail: "#000000",
      text: "#ececec", muted: "#9b9b9b", faint: "#6e6e6e", line: "#262626",
      accent: "#ffffff", accentText: "#0d0d0d", chip: "#1e1e1e",
    },
  },
  {
    id: "c-hybrid",
    name: "C - YBRIDIKO",
    note: "Icon rail that names itself, muted indigo, panel is first class.",
    rail: "icons",
    railW: 220,
    headlineFont: "inherit",
    headlineSize: "34px",
    headlineWeight: "550",
    vars: {
      bg: "#ffffff", canvas: "#f7f7f8", surface: "#ffffff", rail: "#fbfbfc",
      text: "#15161a", muted: "#70727d", faint: "#9a9ca6", line: "#e6e7eb",
      accent: "#5b6bb0", accentText: "#ffffff", chip: "#f2f3f6",
    },
  },
  {
    id: "c-simple",
    name: "C2 - APLO",
    note: "Three rows in the rail. Every tool still reachable, through the field.",
    rail: "minimal",
    railW: 244,
    headlineFont: "inherit",
    headlineSize: "36px",
    headlineWeight: "550",
    screens: ["home", "typed", "menu", "filter", "grid", "chat", "build"],
    vars: {
      bg: "#ffffff", canvas: "#f7f7f8", surface: "#ffffff", rail: "#fbfbfc",
      text: "#15161a", muted: "#70727d", faint: "#9a9ca6", line: "#e6e7eb",
      accent: "#5b6bb0", accentText: "#ffffff", chip: "#f2f3f6",
    },
  },
];

// -------------------------------------------------------------- the content
// One source for all three. Edited once, lands in all three.
// Every feature carries three things, and the third is the one that was
// missing: an icon, the name a customer would say, and ONE line saying what
// it does. Without the line a grid of seventeen icons is a quiz.
const NAV = [
  ["MAKE", [
    ["Build a site", "layout", "One description, a real page, the HTML to take away."],
    ["Documents", "doc", "Letters, offers and reports, in your own words."],
    ["Presentations", "deck", "A deck you download and finish in PowerPoint."],
    ["Posts", "share", "One idea, five platforms, each in its own shape."],
    ["AI Coding", "code", "Describe the change; get the code and the diff."],
    ["See the numbers", "chart", "Upload a file, get what moved and why."],
  ]],
  ["ASK", [
    ["Ask me", "chat", "Anything, with your own records as the context."],
    ["Look into it", "search", "A longer answer, with its sources listed."],
    ["Predictions", "trend", "What next month looks like, from what happened."],
    ["Voice", "mic", "Talk instead of typing. Needs a speech key set."],
  ]],
  ["RUN", [
    ["Works for you", "bot", "Agents that carry out a job on your behalf."],
    ["Automation", "bolt", "When this happens, do that - without you."],
  ]],
  ["SEE", [
    ["Mine", "clock", "Everything you have made, in one list."],
    ["Files", "folder", "What you uploaded, and what reads it."],
    ["Finances", "euro", "Invoices: what is paid, and what is late."],
    ["Sales", "people", "Customers, deals, and where each one stands."],
    ["Trading", "trend", "Positions and rules. Reads only; places nothing."],
  ]],
];
const HISTORY = ["Pricing for the catering deck", "Why September is down 8%", "Landing page copy", "Invoice chase - 3 late", "Instagram week plan"];
const HOME_CARDS = [
  ["Build a site", "A page for your business, from one description."],
  ["Explain my numbers", "What moved this month, and why."],
  ["Repeat last week", "The post that worked, again, for this week."],
];
const FOLLOWUPS = ["Which three are the latest?", "Draft the chase email", "Compare with August"];
const SOURCES = ["14 invoices - Sept", "sales.csv", "Your pricing page"];

const ICONS = {
  layout: "M3 3h18v18H3z M3 9h18", doc: "M6 2h8l4 4v16H6z M14 2v4h4",
  deck: "M3 4h18v12H3z M12 16v4 M8 20h8", share: "M6 12a3 3 0 1 0 0-.1 M18 6a3 3 0 1 0 0-.1 M18 18a3 3 0 1 0 0-.1 M8.6 10.7l6.8-3.4 M8.6 13.3l6.8 3.4",
  code: "M9 6l-6 6 6 6 M15 6l6 6-6 6", chat: "M4 5h16v11H9l-5 4z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4", trend: "M3 17l6-6 4 4 7-8 M21 7v5h-5",
  bot: "M5 8h14v11H5z M9 2v6 M15 2v6", bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l4 2", folder: "M3 6h6l2 3h10v11H3z",
  euro: "M17 6a7 7 0 1 0 0 12 M4 10h9 M4 14h9",
  chart: "M4 20V9 M10 20V4 M16 20v-7 M3 20h18",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M17 7a3 3 0 1 1 0 6 M18 21a5 5 0 0 0-1-3",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
};

const icon = (k) => '<svg viewBox="0 0 24 24" class="ic" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="' + (ICONS[k] || ICONS.doc) + '"/></svg>';

// ------------------------------------------------------------------ the css
// Every rule here earns its place or is not written. There are no shadows,
// no gradients and no background art: the three things the current UI uses
// hardest and the three a person reads as noise before they read anything.
function css(skin) {
  const v = skin.vars;
  return [
    ":root{",
    "--bg:" + v.bg + ";--canvas:" + v.canvas + ";--surface:" + v.surface + ";--rail:" + v.rail + ";",
    "--text:" + v.text + ";--muted:" + v.muted + ";--faint:" + v.faint + ";--line:" + v.line + ";",
    "--accent:" + v.accent + ";--accentText:" + v.accentText + ";--chip:" + v.chip + ";",
    "--railW:" + skin.railW + "px;--r:10px;--gut:28px}",
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{background:var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,-apple-system,'Segoe UI',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}",
    ".ic{width:17px;height:17px;flex:none;opacity:.72}",
    // ---- shell
    ".shell{display:flex;min-height:100vh}",
    ".rail{width:var(--railW);flex:none;background:var(--rail);border-right:1px solid var(--line);padding:18px 12px;display:flex;flex-direction:column;gap:2px}",
    ".brand{display:flex;align-items:center;gap:9px;padding:4px 8px 20px;font-weight:600;letter-spacing:.2px}",
    ".dot{width:15px;height:15px;border-radius:50%;border:1.5px solid var(--accent)}",
    ".grp{font-size:10.5px;letter-spacing:.9px;color:var(--faint);padding:16px 8px 6px;font-weight:600}",
    ".nav{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;color:var(--muted);cursor:pointer;font-size:14px}",
    ".nav:hover{background:var(--chip);color:var(--text)}",
    ".nav.on{background:var(--chip);color:var(--text);font-weight:500}",
    ".nav.on .ic{opacity:1;color:var(--accent)}",
    ".new{display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;font-size:14px;color:var(--text);cursor:pointer;margin-bottom:4px}",
    ".hist{font-size:13.5px;color:var(--muted);padding:6px 8px;border-radius:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}",
    ".hist:hover{background:var(--chip);color:var(--text)}",
    ".main{flex:1;min-width:0;display:flex;flex-direction:column}",
    // ---- top bar: four things, never more
    ".top{height:52px;display:flex;align-items:center;gap:14px;padding:0 var(--gut);border-bottom:1px solid transparent}",
    ".top .sp{flex:1}",
    ".ghost{color:var(--muted);font-size:13.5px;cursor:pointer}",
    ".ava{width:27px;height:27px;border-radius:50%;background:var(--chip);border:1px solid var(--line);display:grid;place-items:center;font-size:11.5px;color:var(--muted)}",
    ".burger{display:none;cursor:pointer}",
    ".deskmenu{margin-left:4px}",
    ".deskmenu:hover{color:var(--text)}",
    // ---- home
    ".home{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px var(--gut) 60px;gap:0}",
    ".h1{font-family:" + skin.headlineFont + ";font-size:" + skin.headlineSize + ";font-weight:" + skin.headlineWeight + ";letter-spacing:-.4px;text-align:center;max-width:620px;line-height:1.25}",
    ".sub{color:var(--muted);font-size:14.5px;margin-top:12px;text-align:center}",
    ".wrap{width:100%;max-width:680px;margin-top:30px}",
    // ---- the one field
    ".field{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 14px 10px;transition:border-color .15s}",
    ".field:focus-within{border-color:var(--accent)}",
    ".ta{width:100%;border:0;outline:0;background:transparent;color:var(--text);font:inherit;resize:none;min-height:46px}",
    ".ta::placeholder{color:var(--faint)}",
    ".row{display:flex;align-items:center;gap:8px;margin-top:6px}",
    ".tool{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--muted);cursor:pointer}",
    ".tool:hover{background:var(--chip)}",
    ".send{margin-left:auto;width:30px;height:30px;border-radius:8px;background:var(--accent);color:var(--accentText);display:grid;place-items:center;cursor:pointer}",
    ".seen{color:var(--faint);font-size:12.5px;margin-top:11px;text-align:center}",
    // ---- cards: three, same weight, no shadow
    ".cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:26px}",
    ".card{border:1px solid var(--line);border-radius:12px;padding:14px;cursor:pointer;background:var(--surface);transition:border-color .15s}",
    ".card:hover{border-color:var(--accent)}",
    ".card b{display:block;font-size:14px;font-weight:550;margin-bottom:4px}",
    ".card span{color:var(--muted);font-size:13px;line-height:1.45}",
    // ---- chat
    ".cols{flex:1;display:flex;min-height:0}",
    ".thread{flex:1;min-width:0;display:flex;flex-direction:column;padding:0 var(--gut)}",
    ".scroll{flex:1;overflow:auto;padding:22px 0 10px;max-width:720px;width:100%;margin:0 auto}",
    ".me{background:var(--chip);border-radius:12px;padding:11px 14px;max-width:78%;margin-left:auto;font-size:14.5px}",
    ".ai{margin:22px 0 0;font-size:15px;line-height:1.65}",
    ".ai p{margin-bottom:10px}",
    ".srcs{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0 2px}",
    ".src{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:12.5px;color:var(--muted);cursor:pointer}",
    ".src i{width:5px;height:5px;border-radius:50%;background:var(--accent);font-style:normal}",
    ".lab{font-size:11px;letter-spacing:.7px;color:var(--faint);font-weight:600;margin-bottom:7px}",
    ".fups{display:flex;flex-direction:column;gap:7px;margin-top:20px;border-top:1px solid var(--line);padding-top:16px}",
    ".fup{border:1px solid var(--line);border-radius:9px;padding:9px 13px;font-size:14px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:space-between}",
    ".fup:hover{border-color:var(--accent)}",
    ".fup em{color:var(--faint);font-style:normal}",
    ".composer{max-width:720px;width:100%;margin:0 auto;padding:10px 0 18px}",
    ".sees{color:var(--faint);font-size:12px;margin-top:9px;text-align:center;line-height:1.5}",
    // On a phone the side panel has nowhere to go. It does NOT vanish:
    // it becomes a card in the thread that opens full screen, which is
    // the only version of "the panel beside" a 390px screen can keep.
    ".opener{display:none;align-items:center;gap:10px;border:1px solid var(--line);border-radius:11px;padding:12px 14px;margin:16px 0 0;background:var(--surface);cursor:pointer}",
    ".opener b{font-size:13.5px;font-weight:550}",
    ".opener span{color:var(--muted);font-size:12.5px}",
    ".opener em{margin-left:auto;color:var(--faint);font-style:normal}",
    // ---- the panel beside (Claude's artifacts, Gemini's card)
    ".panel{width:400px;flex:none;border-left:1px solid var(--line);background:var(--canvas);display:flex;flex-direction:column}",
    ".ph{height:46px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--muted)}",
    ".ph b{color:var(--text);font-weight:550;font-size:13.5px}",
    ".pb{padding:16px;overflow:auto}",
    ".rcard{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:10px}",
    ".rcard h4{font-size:13px;font-weight:600;margin-bottom:12px}",
    ".kv{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px}",
    ".kv:last-child{border:0}",
    ".kv span{color:var(--muted)}",
    ".kv b{font-weight:550}",
    ".bar{height:5px;border-radius:3px;background:var(--chip);margin-top:12px;overflow:hidden}",
    ".bar i{display:block;height:100%;background:var(--accent)}",
    // ---- builder
    ".build{flex:1;display:flex;min-height:0}",
    ".left{flex:1;min-width:0;padding:26px var(--gut);overflow:auto;max-width:620px}",
    ".ttl{font-size:21px;font-weight:600;letter-spacing:-.2px}",
    ".lede{color:var(--muted);font-size:14px;margin-top:5px}",
    ".steps{display:flex;align-items:center;gap:7px;margin:20px 0 18px;font-size:12.5px;color:var(--faint);flex-wrap:wrap}",
    ".steps b{color:var(--text);font-weight:550}",
    ".steps u{text-decoration:none;color:var(--line)}",
    ".chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}",
    ".chip{border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12.5px;color:var(--muted);cursor:pointer}",
    ".chip:hover{border-color:var(--accent);color:var(--text)}",
    ".notdo{border:1px solid var(--line);border-radius:11px;padding:14px 16px;margin-top:22px}",
    ".notdo b{font-size:12.5px;display:block;margin-bottom:8px}",
    ".notdo li{list-style:none;color:var(--muted);font-size:13px;padding:3px 0 3px 15px;position:relative}",
    ".notdo li:before{content:'-';position:absolute;left:0;color:var(--faint)}",
    ".go{margin-top:20px;background:var(--accent);color:var(--accentText);border:0;border-radius:9px;padding:10px 18px;font:inherit;font-weight:550;font-size:14px;cursor:pointer}",
    ".opts{display:flex;gap:18px;align-items:center;margin-top:16px;font-size:13.5px;color:var(--muted);flex-wrap:wrap}",
    ".sel{border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--text);background:var(--surface)}",
    // ---- the live preview inside the panel
    ".frame{border:1px solid var(--line);border-radius:11px;overflow:hidden;background:#fff;color:#1a1a1a}",
    ".fhero{padding:30px 22px;background:#f4f1ec;text-align:center}",
    ".fhero h5{font-size:17px;font-weight:600;margin-bottom:6px;color:#1a1a1a}",
    ".fhero p{font-size:12px;color:#6b6763}",
    ".fbtn{display:inline-block;margin-top:12px;background:#1a1a1a;color:#fff;border-radius:7px;padding:6px 14px;font-size:11.5px}",
    ".fgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:16px}",
    ".fg{background:#f6f5f3;border-radius:7px;height:52px}",
    ".fline{height:7px;border-radius:4px;background:#ece9e4;margin:0 16px 8px}",
    // ---- the honest footer
    ".foot{padding:10px var(--gut) 16px;color:var(--faint);font-size:11.5px;text-align:center}",
    // ---- the minimal rail: New, Recent, and the way to everything else
    ".railfoot{margin-top:auto;padding-top:8px;border-top:1px solid var(--line)}",
    ".kbd{margin-left:auto;font-size:10.5px;color:var(--faint);border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-family:inherit}",
    // ---- what the field decided, shown, and changeable
    // A system that silently picks the tool is a system nobody can correct.
    // The chip is the whole difference between "it understands" and "it
    // claims to understand".
    ".routed{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:14px;flex-wrap:wrap;font-size:13px;color:var(--muted)}",
    ".rchip{display:flex;align-items:center;gap:7px;border:1px solid var(--accent);border-radius:999px;padding:5px 13px;color:var(--text);font-size:13px}",
    ".rchip .ic{color:var(--accent);opacity:1;width:15px;height:15px}",
    ".change{color:var(--accent);cursor:pointer}",
    ".inline{display:flex;gap:9px;justify-content:center;margin-top:14px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--muted)}",
    // ---- everything else, one keystroke away
    ".ovl{position:fixed;inset:0;background:rgba(16,18,28,.30);display:flex;align-items:flex-start;justify-content:center;padding:96px 16px 16px;z-index:5}",
    ".pal{width:580px;max-width:100%;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}",
    ".palin{padding:15px 18px;border-bottom:1px solid var(--line);color:var(--faint);font-size:15px;display:flex;align-items:center;gap:10px}",
    ".palbody{max-height:470px;overflow:auto;padding:6px 8px 10px}",
    ".palrow{display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:8px;font-size:14px;color:var(--text);cursor:pointer}",
    ".palrow.on{background:var(--chip)}",
    ".palrow em{margin-left:auto;color:var(--faint);font-size:12px;font-style:normal;flex:none}",
    ".palrow span{display:flex;flex-direction:column;gap:1px;min-width:0}",
    ".palrow b{font-weight:500;font-size:14px}",
    ".palrow i{font-style:normal;color:var(--muted);font-size:12.5px;line-height:1.35}",
    ".palq{color:var(--text)}",
    ".palcount{margin-left:auto;font-size:12px;color:var(--faint)}",
    // ---- all tools, as a page
    ".tools{flex:1;overflow:auto;padding:26px var(--gut) 40px;max-width:980px;width:100%;margin:0 auto}",
    ".gsec{margin-top:22px}",
    ".grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}",
    ".gcard{border:1px solid var(--line);border-radius:12px;padding:14px;cursor:pointer;background:var(--surface);transition:border-color .15s}",
    ".gcard:hover{border-color:var(--accent)}",
    ".gic{width:30px;height:30px;border-radius:8px;background:var(--chip);display:grid;place-items:center;margin-bottom:10px;color:var(--accent)}",
    ".gic .ic{opacity:1}",
    ".gcard b{display:block;font-size:14px;font-weight:550;margin-bottom:3px}",
    ".gcard span{color:var(--muted);font-size:12.5px;line-height:1.45;display:block}",
    // ---- screens + tabs
    "[data-screen]{display:none}",
    ".main[data-screen]{position:relative}",
    ".tabs{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:9;display:flex;gap:4px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:4px}",
    ".tab{padding:5px 13px;border-radius:999px;font-size:12.5px;color:var(--muted);cursor:pointer}",
    ".tab.on{background:var(--accent);color:var(--accentText)}",
    "body.shot .tabs{display:none}",
    // ---- mobile: the rail becomes the burger, the panel becomes a tab
    "@media(max-width:560px){",
    ":root{--gut:16px}",
    ".rail{display:none}.burger{display:block}.panel{display:none}.deskmenu{display:none}",
    ".opener{display:flex}",
    ".top .brand{display:none}",
    ".cards{grid-template-columns:1fr}",
    ".h1{font-size:" + (parseInt(skin.headlineSize) - 7) + "px}",
    ".left{max-width:none;padding:18px var(--gut)}",
    ".top{border-bottom:1px solid var(--line)}",
    ".fgrid{grid-template-columns:1fr 1fr}",
    ".grid{grid-template-columns:1fr}",
    ".ovl{padding-top:60px}",
    "}",
  ].join("");
}

// --------------------------------------------------------------- the markup
const railNav = (active) =>
  NAV.map(([group, items]) =>
    '<div class="grp">' + group + "</div>" +
    items.map(([label, ic]) =>
      '<div class="nav' + (label === active ? " on" : "") + '">' + icon(ic) + "<span>" + label + "</span></div>"
    ).join("")
  ).join("");

function rail(skin, screen, active) {
  if (skin.rail === "none-on-home" && screen === "home") return "";
  const history = screen === "chat"
    ? '<div class="new">+ New chat</div>' + HISTORY.map((h) => '<div class="hist">' + h + "</div>").join("")
    : "";
  // History goes ABOVE the groups in all three. The first version put it
  // under them in two of the three, which on a 900px screen pushed every
  // conversation below the fold: the thing you came back for, hidden by
  // the thing you can reach from anywhere.
  if (skin.rail === "minimal") {
    // Three rows. Not because less is a style, but because every row here
    // is a decision the person has to make before they can type, and only
    // these three survive the question "would they miss it".
    return '<nav class="rail"><div class="brand"><span class="dot"></span>Ionexa</div>' +
      '<div class="new">+ New</div>' +
      '<div class="grp">RECENT</div>' +
      HISTORY.map((h) => '<div class="hist">' + h + "</div>").join("") +
      '<div class="railfoot"><div class="nav">' + icon("search") +
      "<span>All tools</span><span class=\"kbd\">/</span></div>" +
      '<div class="nav">' + icon("gear") + "<span>Settings</span></div></div></nav>";
  }
  return '<nav class="rail"><div class="brand"><span class="dot"></span>Ionexa</div>' +
    history + railNav(active) + "</nav>";
}

// When the rail is not on the screen, the top bar carries the brand and the
// way back to it. Without that, A's home had an EMPTY top-left corner: the
// five-second test fails on "where am I", before it ever reaches "what do I
// press".
const top = (railless) =>
  '<header class="top"><svg class="ic burger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
  (railless ? '<div class="brand" style="padding:0;gap:8px"><span class="dot"></span>Ionexa</div>' +
    '<span class="ghost deskmenu">Menu</span>' : "") +
  '<div class="sp"></div><span class="ghost">500 credits</span><div class="ava">O</div></header>';

const arrow = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const clip = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>';

// send=false on the builder: there is already a "Build it" button under it,
// and two buttons that do the same thing is the question the five-second
// test fails on.
const field = (placeholder, send, value) =>
  '<div class="field"><textarea class="ta" placeholder="' + placeholder + '">' + (value || "") + "</textarea>" +
  '<div class="row"><div class="tool">' + clip + "</div>" +
  (send === false ? "" : '<div class="send">' + arrow + "</div>") + "</div></div>";

const opener = (title, sub) =>
  '<div class="opener"><b>' + title + '</b><span>' + sub + '</span><em>Open &rarr;</em></div>';

const FOOT = '<div class="foot">Mockup. The numbers on this page are a sample, not a measurement.</div>';

// The typed state is the one that decides whether "say it and it happens"
// is a product or a slogan. The system picks the tool - and then SAYS which
// one it picked, next to a way to change it. Without that line the person
// cannot tell a right guess from a wrong one until the credits are spent.
const TYPED = "A landing page for my catering business - warm, with the menu and a contact form";

function routed() {
  return '<div class="routed"><span>Going to</span>' +
    '<span class="rchip">' + icon("layout") + "Build a site</span>" +
    '<span class="change">change</span></div>' +
    '<div class="inline"><span>Images <select class="sel"><option>Mine only</option></select></span>' +
    '<span>Pages <select class="sel"><option>One</option></select></span>' +
    '<span style="color:var(--faint)">30 credits</span></div>';
}

const palRow = (label, ic, blurb, on) =>
  '<div class="palrow' + (on ? " on" : "") + '">' + icon(ic) +
  "<span><b>" + label + "</b><i>" + blurb + "</i></span><em>" + (on ? "Enter" : "") + "</em></div>";

function palette(query) {
  // Nothing was deleted. It is one keystroke away, the keystroke is printed
  // in the rail where the rows used to be, and typing narrows the list -
  // which is the only reason seventeen rows are usable at all.
  const q = (query || "").toLowerCase();
  const match = (label, blurb) => !q || (label + " " + blurb).toLowerCase().includes(q);
  const groups = NAV.map(([group, items]) => [group, items.filter(([l, , b]) => match(l, b))])
    .filter(([, items]) => items.length);
  let first = true;
  const rows = groups.map(([group, items]) =>
    '<div class="grp">' + group + "</div>" +
    items.map(([label, ic, blurb]) => {
      const on = first; first = false;
      return palRow(label, ic, blurb, on);
    }).join("")
  ).join("");
  const tail = q
    ? '<div class="palrow"><span><b>Describe it instead</b><i>Press Esc and just say what you want.</i></span></div>'
    : "";
  const head = q
    ? '<span class="palq">' + query + '</span><span class="palcount">' +
      groups.reduce((n, g) => n + g[1].length, 0) + " of 17</span>"
    : "<span>Type a tool, or just describe what you want...</span>";
  return '<div class="ovl"><div class="pal"><div class="palin">' + icon("search") + head + "</div>" +
    '<div class="palbody">' + rows + tail + "</div></div></div>";
}

// The grid is the third road, and the one for a person who does not yet
// know the words: seventeen cards, four groups, every card saying what it
// is for. A palette rewards knowing the name; a grid does not require it.
function gridScreen(skin) {
  const groups = NAV.map(([group, items]) =>
    '<div class="gsec"><div class="grp">' + group + "</div><div class=\"grid\">" +
    items.map(([label, ic, blurb]) =>
      '<div class="gcard"><div class="gic">' + icon(ic) + "</div>" +
      "<b>" + label + "</b><span>" + blurb + "</span></div>").join("") +
    "</div></div>").join("");
  return '<section data-screen="grid" class="main">' + top(false) +
    '<div class="tools"><div class="ttl">All tools</div>' +
    '<div class="lede">Seventeen. Or type what you want on the home screen and it picks one for you.</div>' +
    '<div class="field" style="margin:18px 0 6px;max-width:420px"><textarea class="ta" style="min-height:0;height:21px" ' +
    'placeholder="Filter..."></textarea></div>' +
    groups + "</div>" + FOOT + "</section>";
}

function homeScreen(skin, mode) {
  const typed = mode === "typed";
  const body = typed
    ? field("", true, TYPED) + routed()
    : field("Describe it in detail...") +
      '<div class="seen">Reading your 14 invoices, 3 sites and 8 documents - sample</div>' +
      '<div class="cards">' +
      HOME_CARDS.map(([t, d]) => '<div class="card"><b>' + t + "</b><span>" + d + "</span></div>").join("") +
      "</div>";
  return '<section data-screen="' + (mode || "home") + '" class="main">' +
    top(skin.rail === "none-on-home") +
    '<div class="home"><h1 class="h1">What do you want to do?</h1>' +
    '<div class="sub">Say it in your own words. It picks the tool and shows you which.</div>' +
    '<div class="wrap">' + body + "</div></div>" + FOOT +
    (mode === "menu" ? palette() : mode === "filter" ? palette("site") : "") + "</section>";
}

function chatScreen() {
  return '<section data-screen="chat" class="main">' + top(false) +
    '<div class="cols"><div class="thread"><div class="scroll">' +
    '<div class="me">Why is September down compared to August?</div>' +
    '<div class="ai"><p>September is 8% below August, and it is one cause, not a trend: three invoices totalling EUR 4,180 are past due. Volume is flat; collection is not.</p>' +
    '<p>Everything else moved less than 2%.</p>' +
    '<div class="lab">SOURCES</div><div class="srcs">' +
    SOURCES.map((s) => '<div class="src"><i></i>' + s + "</div>").join("") + "</div>" +
    opener("September", "3 late invoices, EUR 4,180") +
    '<div class="fups">' + FOLLOWUPS.map((f) => '<div class="fup">' + f + "<em>&rarr;</em></div>").join("") + "</div>" +
    "</div></div>" +
    '<div class="composer">' + field("Ask anything...") +
    '<div class="sees">It sees your entries, your goals and the files you uploaded. It sees nothing you have not added, and changes nothing unless you ask.</div>' +
    "</div></div>" +
    '<aside class="panel"><div class="ph"><b>September</b><span>&middot; from your records</span></div>' +
    '<div class="pb"><div class="rcard"><h4>WHAT MOVED</h4>' +
    '<div class="kv"><span>Invoiced</span><b>EUR 21,400</b></div>' +
    '<div class="kv"><span>Collected</span><b>EUR 17,220</b></div>' +
    '<div class="kv"><span>Past due</span><b>EUR 4,180</b></div>' +
    '<div class="bar"><i style="width:80%"></i></div></div>' +
    '<div class="rcard"><h4>THE THREE LATE ONES</h4>' +
    '<div class="kv"><span>Kafe Thessaloniki</span><b>18 days</b></div>' +
    '<div class="kv"><span>Hotel Olympia</span><b>11 days</b></div>' +
    '<div class="kv"><span>Studio Nine</span><b>6 days</b></div></div>' +
    "</div></aside></div>" + FOOT + "</section>";
}

function buildScreen() {
  const step = (n, s, on) => (on ? "<b>" + s + "</b>" : s) + (n < 5 ? ' <u>/</u> ' : "");
  return '<section data-screen="build" class="main">' + top(false) +
    '<div class="build"><div class="left">' +
    '<div class="ttl">Build a site</div>' +
    '<div class="lede">Describe it. You get a real page, a preview beside this, and the HTML to take away.</div>' +
    '<div class="steps">' + step(1, "Describe", true) + step(2, "Generate") + step(3, "Edit") + step(4, "Preview") + step(5, "Publish") + "</div>" +
    field("A landing page for my catering business - warm, a menu, a contact form...", false) +
    '<div class="chips"><div class="chip">A cafe with a menu</div><div class="chip">A photographer portfolio</div><div class="chip">A SaaS page with pricing</div></div>' +
    '<div class="opts"><span>Images <select class="sel"><option>Mine only</option></select></span>' +
    '<span>Pages <select class="sel"><option>One</option></select></span></div>' +
    '<button class="go">Build it</button>' +
    '<div class="notdo"><b>WHAT THIS DOES NOT DO</b><ul>' +
    "<li>It is a few pages, not a shop and not an app.</li>" +
    "<li>It does not connect to your systems.</li>" +
    "<li>It generates no photographs - yours, or none.</li>" +
    "<li>You own the HTML; nothing is locked in here.</li>" +
    "</ul></div>" + opener("Preview", "Thessaloniki Catering, one page") + "</div>" +
    '<aside class="panel"><div class="ph"><b>Preview</b><span>&middot; updates as you type</span></div>' +
    '<div class="pb"><div class="frame"><div class="fhero"><h5>Thessaloniki Catering</h5>' +
    "<p>Food for forty, delivered warm.</p><span class=\"fbtn\">See the menu</span></div>" +
    '<div class="fgrid"><div class="fg"></div><div class="fg"></div><div class="fg"></div></div>' +
    '<div class="fline" style="width:70%"></div><div class="fline" style="width:52%"></div>' +
    '<div class="fline" style="width:61%;margin-bottom:16px"></div></div></div></aside>' +
    "</div>" + FOOT + "</section>";
}

const LABELS = { home: "Home", typed: "...typed", menu: "Palette", filter: "Palette, filtered",
  grid: "All tools", chat: "Chat", build: "Build a site" };

function screenOf(skin, id) {
  if (id === "grid") return rail(skin, "grid", "") + gridScreen(skin);
  if (id === "chat") return rail(skin, "chat", "Ask me") + chatScreen();
  if (id === "build") return rail(skin, "build", "Build a site") + buildScreen();
  return rail(skin, "home", "") + homeScreen(skin, id === "home" ? null : id);
}

function page(skin) {
  const ids = skin.screens || ["home", "chat", "build"];
  const tabs = '<div class="tabs">' +
    ids.map((k) => '<div class="tab" data-go="' + k + '">' + LABELS[k] + "</div>").join("") + "</div>";
  // Each screen carries its own rail, because whether the rail exists at
  // all is one of the things the skins disagree about.
  const body = ids.map((id) =>
    '<div class="shell" data-shell="' + id + '">' + screenOf(skin, id) + "</div>").join("");
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Ionexa " + skin.name + "</title><style>" + css(skin) +
    "[data-shell]{display:none}" +
    ids.map((k) => "body.s-" + k + " [data-shell=" + k + "]{display:flex}").join("") +
    ids.map((k) => "body.s-" + k + " [data-screen=" + k + "]{display:flex}").join("") +
    "</style></head><body class=\"s-home\">" + body + tabs +
    "<script>" +
    "function go(s){document.body.className=(document.body.classList.contains('shot')?'shot ':'')+'s-'+s;" +
    "document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('on',t.dataset.go===s)});" +
    "if(location.hash.slice(1)!==s)location.hash=s}" +
    "document.querySelectorAll('.tab').forEach(function(t){t.onclick=function(){go(t.dataset.go)}});" +
    "go(location.hash.slice(1)||'home');" +
    "addEventListener('hashchange',function(){go(location.hash.slice(1)||'home')});" +
    "</script></body></html>";
}

// ------------------------------------------------------------------ write
mkdirSync(OUT, { recursive: true });
for (const skin of SKINS) {
  writeFileSync(OUT + "/" + skin.id + ".html", page(skin));
  console.log("  " + OUT + "/" + skin.id + ".html   " + skin.note);
}

// ------------------------------------------------------------------ shoot
// Photographed the same way the product is: a real browser, two real
// viewports, and the screen asserted before the file is written. A mockup
// saved under the wrong name is worse than no mockup, because it is the
// one you then argue about.
if (process.env.SKIP_SHOTS) {
  console.log("\nSKIP_SHOTS=1 - not photographing");
  process.exit(0);
}
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const DEVICES = [["desktop", 1440, 900], ["phone", 390, 844]];
let n = 0;
try {
  for (const skin of SKINS) {
    for (const [dev, w, h] of DEVICES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      const p = await ctx.newPage();
      for (const screen of (skin.screens || ["home", "chat", "build"])) {
        await p.goto("file://" + process.cwd() + "/" + OUT + "/" + skin.id + ".html#" + screen);
        await p.evaluate(() => document.body.classList.add("shot"));
        await p.waitForTimeout(150);
        const shown = await p.evaluate(() => {
          const el = document.querySelector("[data-shell]:not([style*='none'])");
          const vis = [...document.querySelectorAll("[data-shell]")].find((d) => d.offsetParent !== null);
          return vis ? vis.dataset.shell : (el ? el.dataset.shell : "none");
        });
        if (shown !== screen) throw new Error(skin.id + " " + screen + ": the page is showing " + shown);
        const file = SHOT_DIR + "/" + skin.id + "-" + dev + "-" + screen + ".png";
        await p.screenshot({ path: file });
        console.log("  " + file);
        n++;
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log("\n" + n + " shots, every one asserted to be the screen its name claims.");
