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
// Rules 2 and 3 (web search, real images) are phrased as conditional on
// actually having that capability wired into the call ("whenever you
// have access to such a tool/convention") rather than an unconditional
// command — several of this checklist's call sites (the Create
// Anything/Automations classifier, Mission Control's Planner/Reviewer)
// don't have a web_search tool or an image convention wired in at all,
// and an unconditional "always search"/"always use a real image"
// instruction would be actively misleading there.
export const AI_QUALITY_CHECKLIST_EN = `
FINAL QUALITY CHECK (do this before returning your final answer):
1. Re-read the user's request line by line — does your answer actually include EVERY specific thing that was asked for (images, numbers, names, details)? If anything is missing, add it before answering.
2. If the request genuinely needs real, current information (prices, facts, statistics) and you have a web search tool available to you, always use it instead of guessing or relying on old training knowledge.
3. If real photos are needed and you have a way to include one (e.g. the PLACEHOLDER/Unsplash convention, where available to you), always use that instead of a placeholder with no real image.
4. Never invent specific, real-world facts belonging to the user (product prices, addresses, phone numbers, etc.) that weren't given to you — ask instead if something like that is missing and actually needed.`;

export const AI_QUALITY_CHECKLIST_EL = `
ΤΕΛΙΚΟΣ ΕΛΕΓΧΟΣ ΠΟΙΟΤΗΤΑΣ (κάν' το πριν επιστρέψεις την τελική απάντηση):
1. Έλεγξε ΞΑΝΑ το αίτημα του χρήστη γραμμή-γραμμή — η απάντησή σου περιλαμβάνει πραγματικά ΚΑΘΕ συγκεκριμένο στοιχείο που ζητήθηκε (εικόνες, αριθμούς, ονόματα, λεπτομέρειες); Αν κάτι λείπει, πρόσθεσέ το πριν απαντήσεις.
2. Αν το αίτημα χρειάζεται πραγματικά, τρέχοντα στοιχεία (τιμές, γεγονότα, στατιστικά) και έχεις διαθέσιμο εργαλείο web search, χρησιμοποίησέ το ΠΑΝΤΑ αντί να μαντεύεις ή να βασίζεσαι σε παλιά γνώση.
3. Αν χρειάζονται πραγματικές φωτογραφίες και έχεις τρόπο να συμπεριλάβεις μία (π.χ. τη σύμβαση PLACEHOLDER/Unsplash, όπου είναι διαθέσιμη σε εσένα), χρησιμοποίησέ την ΠΑΝΤΑ αντί για placeholder χωρίς πραγματική εικόνα.
4. ΜΗΝ εφευρίσκεις συγκεκριμένα, πραγματικά στοιχεία του χρήστη (τιμές προϊόντων, διευθύνσεις, τηλέφωνα κ.λπ.) που δεν σου δόθηκαν — ρώτησε αντ' αυτού αν κάτι τέτοιο λείπει και χρειάζεται πραγματικά.`;
