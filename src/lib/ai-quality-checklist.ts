import "server-only";

// ONE shared, foundational quality-check instruction, appended to every
// AI-generation system prompt in the app (Website Builder, Ionexa Chat +
// Mentor Mode, Create Anything, Mission Control planning, Automations/
// mission-step execution, and any future generation feature — e.g. a
// Presentation Builder) instead of each feature re-writing its own
// slightly different phrasing that drifts over time. Two language
// variants since this app's existing system prompts are a genuine mix of
// English (Website Builder) and Greek (Chat/Mentor/Mission Control/Create
// Anything's user-facing "message" field) — each call site appends
// whichever variant matches its own prompt's language.
//
// This is a five-step CYCLE, not a checklist of independent tips, and
// that shape is deliberate: steps 1-2 produce the work, step 3 re-reads
// the request against the produced work, step 4 is an explicit
// instruction to GO BACK and fix rather than to caveat, and step 5 is a
// final safety gate. The closing line ("do not return a result that
// hasn't passed all five") is what makes step 3 mean something — without
// it, a model reliably treats self-review as optional narration.
//
// Steps 2 and 3's tool clauses are phrased as conditional on actually
// having that capability wired into the call ("whenever such a tool is
// available to you") rather than as unconditional commands — several of
// this checklist's call sites (the Create Anything/Automations
// classifier, Mission Control's Planner/Reviewer) have no web_search tool
// and no image convention wired in at all, and an unconditional "always
// search"/"always use a real image" instruction would be actively
// misleading there, pushing the model to claim it searched when it
// could not.
// Grammar/typography correctness, in both variants. Added after a real
// tester report: AI output in Greek contained agreement errors ("το
// κινητήρια δύναμη" for "η κινητήρια δύναμη"). Models handle inflected
// languages far better when explicitly told to re-check agreement, so
// every user-facing generation carries this — appended inside the two
// checklist constants above AND exported standalone for the surfaces
// whose prompt contract cannot absorb the full cycle.
export const LANGUAGE_QUALITY_EN = `
LANGUAGE QUALITY: write with correct spelling, grammar and syntax in the user's language. In inflected languages (Greek, German, French, ...) pay particular attention to gender, case, and adjective-noun/article-noun agreement — re-read your answer for agreement errors before returning it. When you give examples, make them SPECIFIC and realistic, with concrete numbers and names — never vague placeholders like "e.g. some company X".`;

export const LANGUAGE_QUALITY_EL = `
ΠΟΙΟΤΗΤΑ ΓΛΩΣΣΑΣ: γράψε με σωστή ορθογραφία, γραμματική και σύνταξη στη γλώσσα του χρήστη. Πρόσεξε ιδιαίτερα το γένος, την πτώση και τη συμφωνία άρθρου-ουσιαστικού και επιθέτου-ουσιαστικού στα Ελληνικά (π.χ. «η κινητήρια δύναμη», ποτέ «το κινητήρια δύναμη») — ξαναδιάβασε την απάντησή σου για τέτοια λάθη πριν την επιστρέψεις. Όταν δίνεις παραδείγματα, να είναι ΣΥΓΚΕΚΡΙΜΕΝΑ και ρεαλιστικά, με πραγματικά νούμερα και ονόματα — όχι αόριστα («π.χ. μια εταιρεία Χ»).`;

export const AI_QUALITY_CHECKLIST_EN = `
MANDATORY QUALITY CYCLE before you return anything:
1. DO exactly what was asked — every single detail, nothing skipped, nothing quietly simplified.
2. SEARCH the internet for EVERY number, price, statistic or current fact, and for EVERY image that is needed — never guess, and never fall back on old training knowledge when a search tool is available to you. (If no search tool is available in this call, say plainly which figures you could not verify instead of inventing them.)
3. CHECK your own result: re-read the request sentence by sentence and confirm that EACH requested item is genuinely present in your output — not merely mentioned or promised, but actually there.
4. If anything is missing, wrong, or weaker than asked for, FIX it before answering. Go back and produce the corrected version — do not deliver an incomplete result with an apology or a caveat attached.
5. Confirm the result is SAFE: no malicious or harmful element, no misleading claim, no invented fact presented as real. Specific real-world details belonging to the user (product prices, addresses, phone numbers, opening hours) must never be fabricated — ask for them, or mark them clearly as placeholders.
DO NOT return a result that has not passed all five steps.` + LANGUAGE_QUALITY_EN;

export const AI_QUALITY_CHECKLIST_EL = `
ΥΠΟΧΡΕΩΤΙΚΟΣ ΚΥΚΛΟΣ ΠΟΙΟΤΗΤΑΣ πριν επιστρέψεις οτιδήποτε:
1. ΚΑΝΕ ό,τι ζητήθηκε — κάθε λεπτομέρεια, χωρίς παραλείψεις, χωρίς σιωπηλές απλοποιήσεις.
2. ΨΑΞΕ στο internet για ΚΑΘΕ αριθμό/τιμή/στατιστικό/τρέχον στοιχείο και για ΚΑΘΕ εικόνα που χρειάζεται — μη μαντεύεις ποτέ και μη βασίζεσαι σε παλιά γνώση όταν έχεις διαθέσιμο εργαλείο αναζήτησης. (Αν δεν υπάρχει διαθέσιμο εργαλείο αναζήτησης σε αυτή την κλήση, πες καθαρά ποια νούμερα δεν μπόρεσες να επαληθεύσεις αντί να τα επινοήσεις.)
3. ΕΛΕΓΞΕ το αποτέλεσμά σου: διάβασε ξανά το αίτημα πρόταση-πρόταση και επιβεβαίωσε ότι ΚΑΘΕ ζητούμενο υπάρχει πραγματικά στο output σου — όχι απλώς αναφερμένο ή υποσχεμένο, αλλά όντως εκεί.
4. Αν κάτι λείπει, είναι λάθος ή πιο φτωχό απ' ό,τι ζητήθηκε, ΔΙΟΡΘΩΣΕ το πριν απαντήσεις. Γύρνα πίσω και παρήγαγε τη διορθωμένη έκδοση — μην παραδίδεις ημιτελές αποτέλεσμα με μια συγγνώμη ή μια επιφύλαξη από δίπλα.
5. Επιβεβαίωσε ότι το αποτέλεσμα είναι ΑΣΦΑΛΕΣ: κανένα κακόβουλο ή επιβλαβές στοιχείο, καμία παραπλανητική δήλωση, κανένα εφευρημένο στοιχείο παρουσιασμένο ως πραγματικό. Συγκεκριμένα πραγματικά στοιχεία του χρήστη (τιμές προϊόντων, διευθύνσεις, τηλέφωνα, ώρες λειτουργίας) δεν επιτρέπεται ΠΟΤΕ να επινοηθούν — ζήτησέ τα, ή σημείωσέ τα καθαρά ως placeholder.
ΜΗΝ επιστρέψεις αποτέλεσμα που δεν έχει περάσει και τα πέντε βήματα.` + LANGUAGE_QUALITY_EL;


// Compact variant for the short, format-constrained transformations in
// api/text-actions (rewrite / translate / improve / explain).
//
// Those prompts end with a hard "Return ONLY the rewritten text — no
// preamble, no explanation" contract, and the UI splices the reply
// straight back into the user's field. The full cycle above would fight
// that contract: its step 2 tells the model to state which figures it
// could not verify, which is exactly the kind of extra prose that would
// land inside a note. This keeps the two steps that DO apply to a
// text transformation — do the whole thing, invent nothing — and drops
// the ones that don't (no search tool and no images are wired into that
// endpoint).
export const AI_QUALITY_CYCLE_TRANSFORM_EN = `
BEFORE RETURNING: re-read the input and confirm you transformed ALL of it (nothing dropped, no section skipped, meaning preserved), and that you added no fact, number or detail that was not already in the input. If either is wrong, redo it. Then return only the transformed text, with no commentary about this check.`;
