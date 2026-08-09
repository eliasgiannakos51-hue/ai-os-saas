// The questions that do not need a model.
//
// A large share of support traffic is the same handful of questions with
// stable, factual answers: what does it cost, how do I cancel, what are
// credits, how do I make a website. Every one of those currently costs a
// full Claude call — reserve, stream, settle, log — to reproduce a
// sentence that has not changed in months. That is the cheapest cost line
// in the product to remove, because removing it makes the answer BETTER:
// a fixed answer cannot hallucinate a price.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE.
//
// 1. NO NUMBERS THAT MOVE. Not one answer states a price, a credit cost,
//    an allowance or a plan limit. Those live in lib/billing/plans.ts and
//    on /pricing, they change, and a stale number in a canned answer is
//    worse than no answer at all — it is a quote the user will hold us
//    to. Every money question routes to /pricing instead. The test
//    enforces this with a digit scan, so it cannot rot.
//
// 2. NOTHING PERSONAL. A canned answer is identical for every user, so it
//    may only ever answer a question about the PRODUCT. "How many credits
//    do I have left" looks like a FAQ and is not one — it is a question
//    about this account, and it must reach the real path. See
//    isAccountSpecific().

export type KnowledgeArticle = {
  /** Stable id — also the /help anchor and the cache key prefix. */
  id: string;
  category:
    | "billing"
    | "credits"
    | "account"
    | "websites"
    | "agents"
    | "missions"
    | "chat"
    | "files"
    | "integrations"
    | "privacy"
    | "getting-started";
  /** Shown as the article heading in /help. */
  title: string;
  /** The canned reply. Complete on its own — it is sent verbatim. */
  answer: string;
  /** Phrasings a user actually types. Matched case/accent-insensitively. */
  triggers: string[];
  /** Where the user goes for the live numbers or to do the thing. */
  href?: string;
};

export const KNOWLEDGE_BASE: KnowledgeArticle[] = [
  // ---------------- billing ----------------
  {
    id: "pricing-overview",
    category: "billing",
    title: "Πόσο κοστίζει το Ionexa;",
    answer:
      "Υπάρχει δωρεάν πλάνο για να δοκιμάσεις, και επί πληρωμή πλάνα καθώς μεγαλώνουν οι ανάγκες σου. Οι τρέχουσες τιμές και το τι περιλαμβάνει το καθένα είναι πάντα στη σελίδα /pricing — δεν τις γράφω εδώ γιατί αλλάζουν και δεν θέλω να σου δώσω παλιό νούμερο.",
    triggers: [
      "ποσο κοστιζει", "τιμη", "τιμες", "κοστος", "ποσο κανει", "how much", "pricing", "price",
      "τι πακετα υπαρχουν", "ποια πακετα", "πλανα", "plans", "συνδρομη", "subscription",
    ],
    href: "/pricing",
  },
  {
    id: "change-plan",
    category: "billing",
    title: "Πώς αλλάζω πλάνο;",
    answer:
      "Από τις Ρυθμίσεις > Χρέωση. Επιλέγεις το πλάνο που θέλεις και η αλλαγή ισχύει αμέσως. Σε αναβάθμιση πληρώνεις μόνο τη διαφορά για το υπόλοιπο της περιόδου· σε υποβάθμιση κρατάς το τρέχον πλάνο μέχρι να τελειώσει η περίοδος που έχεις ήδη πληρώσει.",
    triggers: [
      "πως αλλαζω πλανο", "αλλαγη πλανου", "αναβαθμιση", "upgrade", "downgrade", "υποβαθμιση",
      "change plan", "αλλαξω συνδρομη",
    ],
    href: "/dashboard/settings",
  },
  {
    id: "cancel",
    category: "billing",
    title: "Πώς ακυρώνω τη συνδρομή μου;",
    answer:
      "Ρυθμίσεις > Χρέωση > Ακύρωση συνδρομής. Δεν χάνεις αμέσως την πρόσβαση: το πλάνο σου συνεχίζει μέχρι το τέλος της περιόδου που έχεις ήδη πληρώσει και μετά ο λογαριασμός πέφτει στο δωρεάν πλάνο. Τα δεδομένα σου μένουν — δεν διαγράφεται τίποτα με την ακύρωση.",
    triggers: [
      "πως ακυρωνω", "ακυρωση", "να ακυρωσω", "cancel", "unsubscribe", "διακοπη συνδρομης",
      "σταματησω τη συνδρομη",
    ],
    href: "/dashboard/settings",
  },
  {
    id: "invoices",
    category: "billing",
    title: "Πού βρίσκω τις αποδείξεις μου;",
    answer:
      "Ρυθμίσεις > Χρέωση > Ιστορικό πληρωμών. Κάθε χρέωση έχει απόδειξη σε PDF που κατεβάζεις από εκεί. Οι πληρωμές γίνονται μέσω Stripe και δεν αποθηκεύουμε ποτέ τα στοιχεία της κάρτας σου.",
    triggers: ["αποδειξη", "αποδειξεις", "τιμολογιο", "invoice", "receipt", "ιστορικο πληρωμων"],
    href: "/dashboard/settings",
  },
  {
    id: "refund",
    category: "billing",
    title: "Μπορώ να ζητήσω επιστροφή χρημάτων;",
    answer:
      "Ναι — γράψε μας τι έγινε και θα το δούμε. Αν χρεώθηκες κατά λάθος ή κάτι δεν δούλεψε όπως έπρεπε, το διορθώνουμε. Στείλε μήνυμα από τις Ρυθμίσεις > Υποστήριξη με τον αριθμό της χρέωσης.",
    triggers: ["επιστροφη χρηματων", "refund", "να μου επιστρεψετε", "χρεωθηκα λαθος"],
    href: "/dashboard/settings",
  },

  // ---------------- credits ----------------
  {
    id: "what-are-credits",
    category: "credits",
    title: "Τι είναι τα credits;",
    answer:
      "Τα credits είναι το νόμισμα με το οποίο πληρώνεις τις ενέργειες AI: ένα μήνυμα στο chat, μια δημιουργία website, μια εκτέλεση agent. Κάθε πλάνο δίνει ένα μηνιαίο απόθεμα που ανανεώνεται, και μπορείς να αγοράσεις έξτρα πακέτα αν τελειώσουν νωρίτερα. Πόσα δίνει το κάθε πλάνο θα το δεις στο /pricing.",
    triggers: [
      "τι ειναι τα credits", "τι ειναι credits", "credits", "μοναδες", "what are credits",
      "πως δουλευουν τα credits",
    ],
    href: "/pricing",
  },
  {
    id: "credit-cost-per-action",
    category: "credits",
    title: "Πόσα credits κοστίζει κάθε ενέργεια;",
    answer:
      "Η χρέωση δεν είναι σταθερή ανά ενέργεια — υπολογίζεται από το πραγματικό κόστος της κάθε κλήσης, οπότε ένα σύντομο μήνυμα κοστίζει λιγότερο από ένα μεγάλο. Πριν από κάθε ακριβή ενέργεια βλέπεις εκτίμηση, και μετά την ολοκλήρωση βλέπεις την πραγματική χρέωση στο ιστορικό σου.",
    triggers: [
      "ποσα credits κοστιζει", "ποσο χρεωνει", "ποσα credits χρειαζονται", "χρεωση ανα",
      "how many credits", "credit cost",
    ],
    href: "/dashboard/settings",
  },
  {
    id: "credits-ran-out",
    category: "credits",
    title: "Τελείωσαν τα credits μου — τι κάνω;",
    answer:
      "Δύο επιλογές: περιμένεις την επόμενη μηνιαία ανανέωση, ή αγοράζεις ένα πακέτο credits που προστίθεται αμέσως και δεν λήγει στο τέλος του μήνα. Και τα δύο γίνονται από τις Ρυθμίσεις > Χρέωση.",
    triggers: [
      "τελειωσαν τα credits", "δεν εχω credits", "εξαντληθηκαν", "ran out of credits",
      "πως αγοραζω credits", "να παρω credits",
    ],
    href: "/dashboard/settings",
  },
  {
    id: "credits-rollover",
    category: "credits",
    title: "Μεταφέρονται τα credits στον επόμενο μήνα;",
    answer:
      "Τα μηνιαία credits του πλάνου ανανεώνονται κάθε μήνα και δεν συσσωρεύονται. Τα credits που αγοράζεις σε πακέτο είναι διαφορετικά: μένουν στον λογαριασμό σου μέχρι να τα χρησιμοποιήσεις.",
    triggers: ["μεταφερονται", "rollover", "χανονται τα credits", "συσσωρευονται", "expire credits"],
  },

  // ---------------- getting started / features ----------------
  {
    id: "create-website",
    category: "websites",
    title: "Πώς φτιάχνω website;",
    answer:
      "Πήγαινε στο Website Builder από το πλαϊνό μενού, γράψε με απλά λόγια τι θέλεις (τι κάνει η επιχείρησή σου, σε ποιον απευθύνεται, τι ύφος θες) και πάτα δημιουργία. Μπορείς να ανεβάσεις και εικόνες αναφοράς — λογότυπο, φωτογραφίες προϊόντων — για να ακολουθήσει το στυλ σου. Όταν είναι έτοιμο, το δημοσιεύεις σε δική του διεύθυνση με ένα κλικ.",
    triggers: [
      "πως φτιαχνω website", "πως φτιαχνω ιστοσελιδα", "δημιουργια website", "create website",
      "θελω ενα site", "website builder", "ιστοσελιδα",
    ],
    href: "/dashboard/website-builder",
  },
  {
    id: "publish-website",
    category: "websites",
    title: "Πώς δημοσιεύω το website μου;",
    answer:
      "Από το Website Builder, άνοιξε το site και πάτα Δημοσίευση. Διαλέγεις ένα όνομα για τη διεύθυνση και το site γίνεται αμέσως ζωντανό. Κάθε δημοσίευση κρατιέται σαν έκδοση, οπότε μπορείς να γυρίσεις πίσω σε προηγούμενη αν χρειαστεί.",
    triggers: ["πως δημοσιευω", "publish", "να το ανεβασω", "live site", "δημοσιευση site"],
    href: "/dashboard/website-builder",
  },
  {
    id: "create-agent",
    category: "agents",
    title: "Πώς φτιάχνω agent;",
    answer:
      "Στο μενού Agents, περίγραψε σε μία πρόταση τι θέλεις να κάνει και κάθε πότε — π.χ. «κάθε πρωί στείλε μου περίληψη των νέων του κλάδου μου». Το Ionexa φτιάχνει τον agent μόνο του, τον τρέχει στην ώρα του και σου στέλνει το αποτέλεσμα. Μπορείς να τον σταματήσεις ή να τον αλλάξεις όποτε θες.",
    triggers: [
      "πως φτιαχνω agent", "δημιουργια agent", "create agent", "αυτοματοποιηση", "agents",
      "θελω εναν agent",
    ],
    href: "/dashboard/agents",
  },
  {
    id: "create-mission",
    category: "missions",
    title: "Πώς φτιάχνω mission;",
    answer:
      "Στο Mission Control γράφεις έναν στόχο όπως θα τον έλεγες σε άνθρωπο — «θέλω περισσότερους πελάτες μέχρι την άνοιξη». Το Ionexa τον σπάει σε συγκεκριμένα βήματα, και μετά μπορείς να τα δουλέψεις μόνος σου ή να αναθέσεις κάποια σε agent.",
    triggers: [
      "πως φτιαχνω mission", "mission control", "στοχος", "στοχους", "create mission", "missions",
    ],
    href: "/dashboard/mission",
  },
  {
    id: "invite-code",
    category: "account",
    title: "Πού βάζω τον κωδικό πρόσκλησης;",
    answer:
      "Στη φόρμα εγγραφής υπάρχει πεδίο για κωδικό πρόσκλησης. Αν έχεις ήδη λογαριασμό, τον καταχωρείς από τις Ρυθμίσεις > Λογαριασμός. Μόλις περάσει, τα προνόμια που δίνει ενεργοποιούνται αμέσως στον λογαριασμό σου.",
    triggers: [
      "κωδικος προσκλησης", "invite code", "beta code", "κωδικο beta", "που βαζω τον κωδικο",
      "προσκληση",
    ],
    href: "/dashboard/settings",
  },
  {
    id: "chat-memory",
    category: "chat",
    title: "Θυμάται το chat προηγούμενες συνομιλίες;",
    answer:
      "Μέσα στην ίδια συνομιλία θυμάται πάντα τα προηγούμενα μηνύματα. Ανάμεσα σε διαφορετικές συνομιλίες κρατά μόνο μόνιμα χρήσιμα στοιχεία — όνομα, επάγγελμα, προτιμήσεις — και αυτό υπάρχει στα επί πληρωμή πλάνα. Μπορείς να δεις ό,τι έχει κρατήσει, και να το σβήσεις, από τις Ρυθμίσεις > Μνήμη.",
    triggers: [
      "θυμαται", "μνημη", "memory", "προηγουμενες συνομιλιες", "ξεχναει", "δεν θυμαται",
    ],
    href: "/dashboard/memory",
  },
  {
    id: "upload-files",
    category: "files",
    title: "Μπορώ να ανεβάσω αρχεία;",
    answer:
      "Ναι — PDF, Word, Excel, CSV, κείμενο και Markdown. Τα ανεβάζεις στο Files, το Ionexa διαβάζει το περιεχόμενό τους και μετά μπορείς να κάνεις ερωτήσεις πάνω σε αυτά. Τα αρχεία σου είναι ιδιωτικά: κανείς άλλος δεν έχει πρόσβαση και κάθε κατέβασμα γίνεται με προσωρινό σύνδεσμο.",
    triggers: ["ανεβασω αρχειο", "upload", "pdf", "αρχεια", "files", "εγγραφα"],
    href: "/dashboard/files",
  },
  {
    id: "connect-gmail",
    category: "integrations",
    title: "Πώς συνδέω Gmail ή Google Drive;",
    answer:
      "Ρυθμίσεις > Συνδέσεις. Διαλέγεις την υπηρεσία και εγκρίνεις την πρόσβαση στο παράθυρο της Google. Βλέπεις ακριβώς τι θα διαβάζει πριν το εγκρίνεις, και μπορείς να αποσυνδέσεις όποτε θες — τότε τα κλειδιά πρόσβασης διαγράφονται αμέσως.",
    triggers: [
      "gmail", "google drive", "συνδεση", "integration", "slack", "πως συνδεω", "connect",
    ],
    href: "/dashboard/integrations",
  },
  {
    id: "languages",
    category: "getting-started",
    title: "Σε ποιες γλώσσες δουλεύει;",
    answer:
      "Το περιβάλλον υπάρχει σε δέκα γλώσσες και το αλλάζεις από τις Ρυθμίσεις. Το AI απαντά στη γλώσσα που του γράφεις, ανεξάρτητα από τη γλώσσα του περιβάλλοντος.",
    triggers: ["γλωσσα", "γλωσσες", "language", "αγγλικα", "ελληνικα", "μεταφραση"],
    href: "/dashboard/settings",
  },

  // ---------------- account & privacy ----------------
  {
    id: "delete-account",
    category: "privacy",
    title: "Πώς διαγράφω τον λογαριασμό μου;",
    answer:
      "Ρυθμίσεις > Λογαριασμός > Διαγραφή λογαριασμού. Θα σου ζητηθεί επιβεβαίωση, και μετά διαγράφονται όλα: συνομιλίες, αρχεία, websites, agents, ιστορικό. Δεν είναι αναστρέψιμο. Αν θέλεις πρώτα αντίγραφο, κατέβασε τα δεδομένα σου από την ίδια σελίδα.",
    triggers: [
      "διαγραφη λογαριασμου", "delete account", "να σβησω τον λογαριασμο", "κλεισιμο λογαριασμου",
    ],
    href: "/dashboard/settings",
  },
  {
    id: "export-data",
    category: "privacy",
    title: "Μπορώ να κατεβάσω τα δεδομένα μου;",
    answer:
      "Ναι. Ρυθμίσεις > Λογαριασμός > Εξαγωγή δεδομένων. Παίρνεις ένα αρχείο με όλα όσα έχεις δημιουργήσει — συνομιλίες, missions, websites, αρχεία, ιστορικό χρεώσεων. Τα κλειδιά πρόσβασης των συνδεδεμένων λογαριασμών εξαιρούνται για λόγους ασφάλειας.",
    triggers: ["κατεβασω τα δεδομενα", "export", "εξαγωγη", "gdpr", "αντιγραφο δεδομενων"],
    href: "/dashboard/settings",
  },
  {
    id: "data-privacy",
    category: "privacy",
    title: "Τι κάνετε με τα δεδομένα μου;",
    answer:
      "Τα δεδομένα σου είναι δικά σου. Δεν τα πουλάμε, δεν τα χρησιμοποιούμε για εκπαίδευση μοντέλων, και κάθε λογαριασμός βλέπει μόνο τα δικά του — αυτό επιβάλλεται στη βάση, όχι μόνο στην εφαρμογή. Μπορείς να τα κατεβάσεις ή να τα διαγράψεις όποτε θες.",
    triggers: [
      "δεδομενα μου", "ιδιωτικοτητα", "privacy", "ασφαλεια", "τα πουλατε", "εκπαιδευση μοντελων",
    ],
    // /privacy, not /legal/privacy — there is no /legal segment in this
    // app (src/app/privacy/page.tsx). The wrong path was invisible while
    // nothing rendered these links; the Help Centre renders every one of
    // them, so a 404 here is now a 404 a user clicks.
    href: "/privacy",
  },
  {
    id: "password-reset",
    category: "account",
    title: "Ξέχασα τον κωδικό μου.",
    answer:
      "Στη σελίδα σύνδεσης πάτα «Ξέχασα τον κωδικό μου» και βάλε το email σου. Θα σου έρθει σύνδεσμος επαναφοράς. Αν δεν φτάνει, κοίτα και στα ανεπιθύμητα.",
    triggers: [
      "ξεχασα τον κωδικο", "password", "reset password", "επαναφορα κωδικου", "δεν μπορω να μπω",
    ],
    href: "/login",
  },
  {
    id: "team-members",
    category: "account",
    title: "Μπορώ να προσθέσω άτομα από την ομάδα μου;",
    answer:
      "Ναι, στα πλάνα που περιλαμβάνουν ομάδα. Ρυθμίσεις > Ομάδα, προσκαλείς με email και το άτομο μπαίνει στον ίδιο χώρο εργασίας. Ποια πλάνα το έχουν και πόσες θέσεις δίνουν θα το δεις στο /pricing.",
    triggers: ["ομαδα", "team", "συνεργατες", "προσκληση μελους", "collaboration", "χρηστες"],
    href: "/pricing",
  },
  {
    id: "notifications",
    category: "account",
    title: "Πώς ρυθμίζω τις ειδοποιήσεις;",
    answer:
      "Ρυθμίσεις > Ειδοποιήσεις. Ξεχωριστά για email και για ειδοποιήσεις στο κινητό, και ανά τύπο — αποτελέσματα agent, υπενθυμίσεις, χαμηλά credits. Οι κρίσιμες ειδοποιήσεις ασφαλείας δεν απενεργοποιούνται.",
    triggers: ["ειδοποιησεις", "notifications", "email ειδοποιησεις", "push", "να μη μου στελνετε"],
    href: "/dashboard/settings",
  },
  {
    id: "mobile-app",
    category: "getting-started",
    title: "Υπάρχει εφαρμογή για κινητό;",
    answer:
      "Το Ionexa εγκαθίσταται στο κινητό σου απευθείας από τον browser — άνοιξέ το και διάλεξε «Προσθήκη στην αρχική οθόνη». Λειτουργεί σαν κανονική εφαρμογή, με εικονίδιο και ειδοποιήσεις, χωρίς να περάσεις από app store.",
    triggers: ["εφαρμογη κινητου", "mobile app", "android", "iphone", "ios", "κινητο", "app"],
  },
  {
    id: "what-is-ionexa",
    category: "getting-started",
    title: "Τι είναι το Ionexa;",
    answer:
      "Ένας χώρος εργασίας όπου λες τι θέλεις και γίνεται: φτιάχνει websites, τρέχει agents που δουλεύουν μόνοι τους σε πρόγραμμα, σπάει στόχους σε βήματα, διαβάζει τα αρχεία σου και απαντά πάνω σε αυτά. Αντί για δέκα ξεχωριστά εργαλεία που δεν μιλάνε μεταξύ τους, ένα που τα ξέρει όλα.",
    triggers: ["τι ειναι το ionexa", "what is ionexa", "τι κανει", "τι προσφερετε", "about"],
  },
  {
    id: "contact-support",
    category: "account",
    title: "Πώς επικοινωνώ με άνθρωπο;",
    answer:
      "Ρυθμίσεις > Υποστήριξη, και γράψε μας. Αν το θέμα αφορά χρέωση, βάλε και τον αριθμό της χρέωσης για να το βρούμε γρήγορα.",
    triggers: [
      "επικοινωνια", "support", "ανθρωπο", "υποστηριξη", "contact", "να μιλησω με καποιον",
    ],
    href: "/dashboard/settings",
  },
];

// --- matching ---------------------------------------------------------

/** Greek accents and case removed, so «Πόσο» matches "ποσο". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Questions that LOOK like FAQs but are about this account.
 *
 * "How many credits does a website cost" is a product question with one
 * true answer. "How many credits do I have left" is the same words plus a
 * first person, and answering it from a fixed string would be a lie. Any
 * possessive or first-person marker disqualifies the message outright —
 * the canned path is not allowed to guess about a specific user.
 */
const ACCOUNT_SPECIFIC_MARKERS = [
  "μου", "εχω", "ειμαι", "εγω", "εμενα", "δικο μου", "δικα μου", "μας",
  "χρεωθηκα", "πληρωσα", "αγορασα", "εφτιαξα", "εκανα",
  "my", "i have", "i am", "i was", "me", "mine", "my account", "my credits",
];

export function isAccountSpecific(message: string): boolean {
  const n = normalize(message);
  return ACCOUNT_SPECIFIC_MARKERS.some((m) => n.includes(normalize(m)));
}

export type CannedMatch = {
  article: KnowledgeArticle;
  confidence: number;
};

const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Best canned answer for a message, or null to fall through to the model.
 *
 * Scoring is deliberately conservative. A trigger only counts when it
 * appears as a whole phrase, and confidence is scaled by how much of the
 * message the trigger accounts for — so "πόσο κοστίζει;" scores high while
 * a 300-word message that happens to contain "τιμή" somewhere does not.
 * Anything under 0.85 goes to the model, because a wrong canned answer is
 * far more expensive than the call it saved.
 */
export function matchCannedAnswer(
  message: string,
  threshold: number = CONFIDENCE_THRESHOLD
): CannedMatch | null {
  const n = normalize(message);
  if (!n) return null;
  // A long message is a conversation, not a lookup.
  if (n.split(" ").length > 40) return null;
  if (isAccountSpecific(message)) return null;

  let best: CannedMatch | null = null;

  for (const article of KNOWLEDGE_BASE) {
    for (const trigger of article.triggers) {
      const t = normalize(trigger);
      if (!t || !n.includes(t)) continue;

      // How much of what the user wrote is this trigger? A short question
      // that IS the trigger scores 1; a long one scores proportionally
      // less. Multi-word triggers get a bonus: "πως ακυρωνω" is a much
      // stronger signal than "τιμη".
      const coverage = t.length / n.length;
      const specificity = Math.min(1, t.split(" ").length / 2);
      const confidence = Math.min(1, coverage * 0.75 + specificity * 0.45);

      if (!best || confidence > best.confidence) {
        best = { article, confidence: Number(confidence.toFixed(4)) };
      }
    }
  }

  return best && best.confidence >= threshold ? best : null;
}

/** Every article, for /help and for the support chat's grounding. */
export function articlesByCategory(): Map<string, KnowledgeArticle[]> {
  const byCat = new Map<string, KnowledgeArticle[]>();
  for (const a of KNOWLEDGE_BASE) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  return byCat;
}
