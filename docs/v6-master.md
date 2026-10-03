# IONEXA V6 — MASTER

Το πλάνο του ιδιοκτήτη, όπως το έδωσε στις 2026-10-03, μαζί με την
ενότητα 1.0 που πρόσθεσε. Κρατιέται εδώ όπως γράφτηκε. Η σειρά εργασίας
και η κατάσταση κάθε γραμμής ζουν στο `docs/QUEUE.md`, όχι εδώ.

**Τι έχει αλλάξει από τότε που γράφτηκε (με απόφαση του ιδιοκτήτη):**
- **1.1 Credits: έγινε**, commit 063da767 (2026-10-03).
- **1.2 Design: τα χρώματα και το sidebar που γράφει παρακάτω
  αντικαταστάθηκαν** από το «ΣΥΣΤΗΜΑ DESIGN» στο `docs/CONTEXT.md`, που
  ο ιδιοκτήτης όρισε ως «αντικαθιστά κάθε προηγούμενη πρόταση».
- **1.3 και 1.0: «Kling και Runway: όχι. Μόνο Gemini.»** Όπου παρακάτω
  αναφέρονται Kling, Runway ή Seedream για εικόνα/βίντεο, ισχύει πλέον
  Nano Banana Pro και Veo 3.1 μέσω Gemini API.
- **1.3 Cinematic: μόνο Φάση 1** (στυλ Α και ΣΤ, 5 κλάδοι, όλη η ροή,
  έλεγχος ποιότητας, Activity Timeline, Completion Contract) μετά την
  έγκρισή του· οι Φάσεις 2–4 αργότερα.

Τα ονόματα αρχείων που το πλάνο ζητά να γραφτούν αργότερα (οι εκθέσεις
κλεισίματος, η λίστα V7, η έρευνα UX) γράφονται εδώ χωρίς διαδρομή,
γιατί δεν υπάρχουν ακόμα.

---

## 0. ΚΑΤΑΣΤΑΣΗ — ΜΗΝ ΞΑΝΑΚΑΝΕΙΣ ΑΥΤΑ (όπως τα έγραψε ο ιδιοκτήτης)

ΕΓΙΝΑΝ: Ασφάλεια (published sites σε CSP sandbox, 13/13) · Design μέρος
1+2 (Commissioner, sidebar, Όλα τα εργαλεία, πηγές στο chat, Build
δίπλα-δίπλα, κινήσεις) · Router μετρήθηκε 30/30 · Φωνή: κάρτες
επιβεβαίωσης · Καθολική μνήμη, meetings, margin gate 4× · Αναλύσεις 3D,
βίντεο, παιχνίδια, εικόνες, τιμολόγηση · `docs/intelligence-os.md` ·
CONNECT security (Gmail/Drive read-only, wrapUntrusted).

ΑΠΟΦΑΣΕΙΣ: Margin πραγματικό 4× · Credits ίδιο μέγεθος παντού, €0,02,
Ultimate 10.000, υπόλοιπα ως τον μηδενισμό, παλιά πακέτα όπως είναι, νέα
με μπόνους · 3D: διακόπτης OFF, μόνο δικά μας scripts, 8× ως ρητή
εξαίρεση, Growth+ · Βίντεο: 4K από Pro+, αρχεία χωρίς λήξη όσο χωράνε ·
Παιχνίδια: κουίζ από αρχεία πρώτο, όχι arcade · Intelligence OS:
Sandbox+Permissions πριν Coding Agent, Evaluation Lab πριν Router,
Activity Timeline πρώτο.

## 1.0 ΟΛΑ ΤΑ ΜΟΝΤΕΛΑ ΚΑΙ ΤΑ ΚΛΕΙΔΙΑ

1. **Απογραφή** του τι έχει μπει στο Vercel (ANTHROPIC · OPENAI · GROQ ·
   DEEPGRAM · ELEVENLABS · BFL/FLUX · IDEOGRAM · RUNWAY · VAPID): για
   κάθε κλειδί, αν το διαβάζει κώδικας, για τι, τι λείπει. Έλεγχος
   εγκυρότητας με μία φθηνή κλήση όπου γίνεται. Κανένα κλειδί σε log ή
   έγγραφο.
2. **Κάθε μοντέλο με ρόλο στον router**, με failover που το λέει στον
   χρήστη, χρέωση πραγματικό κόστος ×4:
   - ΚΕΙΜΕΝΟ: Opus (δύσκολα, κριτής) · Sonnet (τα περισσότερα) · Haiku
     (ταξινόμηση, σύνοψη) · OpenAI (δεύτερος κριτής, failover) · Groq
     (ταχύτητα).
   - ΗΧΟΣ: Deepgram (απομαγνητοφώνηση) · Whisper (εφεδρεία) ·
     ElevenLabs (φωνή).
   - ΕΙΚΟΝΑ: Flux (φωτορεαλισμός) · Ideogram (κείμενο σε εικόνα).
   - ΒΙΝΤΕΟ: Runway — *αντικαταστάθηκε από «μόνο Gemini»*.
3. **Τι άλλο χρειαζόμαστε**: Google, aggregator, αναζήτηση, Firecrawl,
   αφαίρεση φόντου, Google/Microsoft OAuth, Telegram, Vercel token — με
   τιμή, δωρεάν tier, εμπορική χρήση, αναγκαίο ή όχι, link. Λιγότερα
   κλειδιά όπου γίνεται.
4. **Ασφάλεια κλειδιών**: όλα server-side· spending limit σε κάθε
   πάροχο· `/dashboard/system-health` δείχνει ποια λειτουργούν· feature
   χωρίς κλειδί το λέει.

## V6.1 — ΕΚΚΡΕΜΗ

- **1.1 Credits ίδιο μέγεθος** — μέτρηση πληρωμένων, αποφάσεις, gate.
- **1.2 Νέο design εφαρμογής** — μόνο design/layout/components· routes,
  data, security, CONNECT άθικτα· mockup, link, ΟΚ, μετά εφαρμογή.
  (Η οπτική προδιαγραφή: «ΣΥΣΤΗΜΑ DESIGN» στο `docs/CONTEXT.md`.)
- **1.3 Cinematic sites** — όπως στο
  `docs/v6-cinematic-sites-2026-10-03.md`: στυλ Α–Ζ, πίνακας κλάδων,
  ροή με κόστος πριν, δικά μας prompts, σκηνοθεσία, αλλαγές με λόγια,
  credits = κόστος ×4 με τη δωρεάν επανάληψη μέσα, απόδοση, ασφάλεια,
  δείγματα, benchmark.
- **1.4 Βίντεο (feature)** — η μηχανή του 1.3: adapter (task id +
  webhook/cron), ράψιμο κλιπ, στήλες στο ai_videos (migration), κόστος
  ανά δευτερόλεπτο.
- **1.5 Εικόνες (feature)** — native 4K· 8K μόνο ως «μεγεθυμένη»,
  Ultimate· WebP.
- **1.6 Παιχνίδια** — κουίζ από αρχεία πρώτο, μέσα από τη μηχανή του
  website, στο sandbox.
- **1.7 Χάρτης/βίντεο σε published sites** — αν δεν παίζουν λόγω
  sandbox: ξεχωριστό domain, με τη ρύθμιση DNS/Vercel.
- **1.8 Bots και benchmark** — e2e-bot σε κάθε production deploy·
  benchmark με τυφλό κριτή, μόνο μετρημένα νούμερα· τα 12 🟡 → 🟢.
- **1.9 CONNECT ζωντανό** — Gmail πρώτο, μετά Drive, read-only.
- **1.10 Τα ανοιχτά του V5** — user-isolation suite· χαιρετισμός στα
  ελληνικά με το πραγματικό όνομα· «ψάξε τους ανταγωνιστές μου» →
  Έρευνα· nav_events warning στο /api/health >48h· εξαγωγή ~40 προτάσεων
  ανά γλώσσα για ανθρώπινο έλεγχο.
- **1.11 Τελικός έλεγχος V6.1** — έκθεση κλεισίματος (v6.1-closing).

## V6.2 — INTELLIGENCE OS ΦΑΣΕΙΣ 1–2

Φάση 1: Activity Timeline · Completion Contract · Verify loop στο
builder (+~30%, μετρημένο) · Parallel Deep Research.
Φάση 2: Evaluation Lab · πλήρης Model Router · Adaptive Compute ·
Project Context Engine · Critic Agents, Visual QA. Έκθεση κλεισίματος
(v6.2-closing).

## V6.3 — INTELLIGENCE OS ΦΑΣΕΙΣ 3–5

Φάση 3: Sandbox + Permission System → Agent Orchestrator → Subagents →
Coding Agent → Knowledge Graph. Φάση 4: Browser Agent → Computer Use
(ποτέ ενέργεια χωρίς έγκριση της στιγμής). Φάση 5: Builders, Multi-agent
Projects, Observability, Cost/Latency Optimizer. Εκθέσεις κλεισίματος
(v6-closing, v7-list).

## ΚΑΝΟΝΕΣ ΓΙΑ ΟΛΑ

Μία ενότητα τη φορά · κάθε νέο: gate + mutations + ζωντανή απόδειξη ·
margin 4× σε ό,τι καλεί μοντέλο · κόστος πριν σε ό,τι ακριβό · τίποτα
στο sidebar πριν δουλεύει (notBuilt) · μη αναστρέψιμα ποτέ χωρίς έγκριση
της στιγμής · κανένα νούμερο που δεν μετρήθηκε · τα όργανα ελέγχου
τρέχουν ό,τι τρέχει η παραγωγή · κάθε αναφορά τελειώνει με «ΝΕΑ
MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ» και «ΤΙ ΧΡΕΙΑΖΟΜΑΙ ΑΠΟ ΣΕΝΑ».

## ΤΙ ΘΑ ΒΑΛΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ (όταν ζητηθεί)

BOT_EMAIL / BOT_PASSWORD στα GitHub Actions secrets · GOOGLE_OAUTH
client id/secret στο Vercel · κλειδιά εικόνας/βίντεο στο environment ·
απάντηση για χάρτη/βίντεο σε published site · ΟΚ στα mockups.
