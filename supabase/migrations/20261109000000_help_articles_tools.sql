-- Help articles: one per tool from the All Tools grid (directive 41, Κομμάτι 1).
-- Generated, idempotent (UPSERT). No digits in any body — prices live on /pricing.
-- How to undo: DELETE FROM help_articles WHERE slug IN ('tool-my-stuff','tool-meetings','tool-analyze','tool-research','tool-translate','tool-rebuild','tool-apps','tool-games','tool-document','tool-slides','tool-posts','tool-image','tool-3d','tool-video','tool-films','tool-editing','tool-avatars','tool-audio','tool-coding','tool-automations','tool-iowork','tool-projects');

-- ============================================================
-- ENGLISH
-- ============================================================

-- My Stuff
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-my-stuff', 'en',
  'What is My Stuff?',
  'Everything you create or upload is kept here: documents, images, data files, sites, presentations. Search by name or ask a question about what is inside a file. Filter by type or by project. Upload files of your own — PDF, images, spreadsheets — and they are stored privately.',
  'tools', 0,
  array['my stuff', 'my files', 'where are my files', 'find my documents', 'uploaded files']::text[],
  '/dashboard/my-stuff', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Meetings
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-meetings', 'en',
  'How do I use Meetings?',
  'Upload a recording or record directly from your browser (with a consent notice first). Ionexa transcribes it with speaker names, gives you a summary and action items, and you can click any line in the transcript to jump to that moment. Ask follow-up questions about the meeting from the field below.',
  'tools', 1,
  array['meetings', 'record a meeting', 'transcription', 'transcript', 'meeting notes', 'meeting summary']::text[],
  '/dashboard/meetings', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Analyze
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-analyze', 'en',
  'How do I analyze data?',
  'Upload a spreadsheet or a CSV, or point to data you have already stored. Ask a question in plain words and Ionexa computes the answer from the actual numbers — every figure is calculated by code, never guessed by the AI. The result comes with a chart when it fits.',
  'tools', 2,
  array['analyze', 'data analysis', 'spreadsheet', 'csv', 'analyze data', 'chart', 'numbers']::text[],
  '/dashboard/data-analysis', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Deep Research
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-research', 'en',
  'What is Deep Research?',
  'Give it a question or a topic and Ionexa searches, reads and cross-checks real sources, then writes a report with numbered claims. Click a claim to see which source it came from. You can turn the result into a Document or Slides from the same page.',
  'tools', 3,
  array['deep research', 'research', 'search sources', 'investigate', 'research report']::text[],
  '/dashboard/deep-research', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Translate
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-translate', 'en',
  'What is Translate?',
  'Paste a text, pick the languages you want, and get it back paragraph by paragraph. This tool is coming soon — for now, you can translate from inside Documents and the Site builder.',
  'tools', 4,
  array['translate', 'translation', 'translate text', 'how to translate']::text[],
  '/dashboard/translate', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Rebuild
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-rebuild', 'en',
  'What is Rebuild?',
  'Say "I want something like X" and Ionexa breaks it into function boxes you can pick or change. It shows each phase with its cost in credits before you approve, then builds it step by step using the real tools — Site, Apps, Coding — so the result is yours to keep and edit.',
  'tools', 5,
  array['rebuild', 'clone a site', 'make something like', 'build like', 'copy a website']::text[],
  '/dashboard/rebuild', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Apps
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-apps', 'en',
  'What is Apps?',
  'Describe a small business application — bookings, orders, stock, a form — and Ionexa builds it with screens and saved data. This tool is coming soon.',
  'tools', 6,
  array['apps', 'build an app', 'application', 'booking app', 'order app']::text[],
  '/dashboard/app-builder', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Games
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-games', 'en',
  'How do I make a game?',
  'Describe what you want — the rules, the characters, the controls — and Ionexa builds a playable game right in the browser. You change one thing at a time by pressing its box. Publish it to its own address when it is ready.',
  'tools', 7,
  array['game', 'games', 'make a game', 'build a game', 'create a game']::text[],
  '/dashboard/games', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Document
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-document', 'en',
  'How do I make a document?',
  'Open Documents, describe what you need or start typing. The AI fills in from your description; you edit any part by hand or by telling it what to change. Export to Word or PDF when you are done.',
  'tools', 8,
  array['document', 'documents', 'make a document', 'write a letter', 'create a document', 'word document']::text[],
  '/dashboard/documents', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Slides
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-slides', 'en',
  'How do I make a presentation?',
  'Open Slides, describe the subject or paste an outline. Ionexa builds the deck slide by slide, with notes. Reorder, add or delete slides, and edit any one by selecting it. Present in fullscreen or export to PowerPoint and PDF.',
  'tools', 9,
  array['slides', 'presentation', 'make a presentation', 'powerpoint', 'deck', 'slide deck']::text[],
  '/dashboard/presentations', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Posts
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-posts', 'en',
  'How do I make social media posts?',
  'Open Posts, say what you want to talk about, and Ionexa writes a version for each platform — LinkedIn, X, Instagram, Threads, Facebook — at the right length and tone. Edit any one, approve, and schedule the time.',
  'tools', 10,
  array['posts', 'social media', 'linkedin post', 'instagram', 'create a post', 'schedule posts']::text[],
  '/dashboard/posts', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Image
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-image', 'en',
  'How do I create images?',
  'Describe what you want and Ionexa generates it. Change it by saying what to fix — a new version is made, the original stays. You can also upload an image and ask for a variation in the same style. Download or send to My Stuff when you are happy.',
  'tools', 11,
  array['image', 'images', 'create image', 'generate image', 'make a picture', 'ai image']::text[],
  '/dashboard/images', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- 3D
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-3d', 'en',
  'What is 3D?',
  'Take a few photos of an object or product and Ionexa turns them into a three-dimensional model you can rotate. This tool is coming soon.',
  'tools', 12,
  array['3d', 'three d', '3d model', 'make a 3d model']::text[],
  '/dashboard/3d', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Video
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-video', 'en',
  'What is Video?',
  'Describe a clip or give it an image with a description, and Ionexa generates a short video. This tool is coming soon.',
  'tools', 13,
  array['video', 'make a video', 'generate video', 'create a video', 'ai video']::text[],
  '/dashboard/video-studio', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Films
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-films', 'en',
  'What is Films?',
  'From an idea or a half-written script, Ionexa builds a scene-by-scene storyboard and produces each shot in the background, with a price before every charge. This tool is coming soon.',
  'tools', 14,
  array['films', 'make a film', 'movie', 'filmmaking', 'storyboard']::text[],
  '/dashboard/films', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Editing
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-editing', 'en',
  'What is Editing?',
  'Upload a video or bring clips from other tools, arrange them on a timeline described in boxes, add text and music, and export. This tool is coming soon.',
  'tools', 15,
  array['editing', 'video editing', 'edit a video', 'montage', 'timeline']::text[],
  '/dashboard/editing', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Avatars
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-avatars', 'en',
  'What is Avatars?',
  'A talking avatar that presents from a script, for product demos or explainers. This tool is coming soon.',
  'tools', 16,
  array['avatars', 'talking avatar', 'avatar video', 'presenter']::text[],
  '/dashboard/avatars', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Audio
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-audio', 'en',
  'What is Audio?',
  'Voice-over from text in many languages and voices, podcasts from a two-speaker script, and recording cleanup. This tool is coming soon.',
  'tools', 17,
  array['audio', 'voice over', 'podcast', 'text to speech', 'make audio']::text[],
  '/dashboard/audio', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Coding
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-coding', 'en',
  'How do I use Coding?',
  'Describe what you want built or fixed, and Ionexa writes and runs the code. You see the changes file by file, accept or reject each one, and connect a GitHub repository to push the result.',
  'tools', 18,
  array['coding', 'write code', 'fix code', 'programming', 'github', 'developer']::text[],
  '/dashboard/coding', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Automations
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-automations', 'en',
  'What are Automations?',
  'A visual flow of steps that run on their own: when something happens, do this, then that. Connect boxes on a canvas, each one an action or a check. Automations run in the background and notify you when they finish.',
  'tools', 19,
  array['automations', 'automation', 'workflow', 'automate', 'if this then that']::text[],
  '/dashboard/automation', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- iowork
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-iowork', 'en',
  'What is iowork?',
  'An app that connects your computer to Ionexa, so the AI can work on your local files and tools. This is coming soon.',
  'tools', 20,
  array['iowork', 'desktop app', 'local files', 'connect my computer']::text[],
  '/dashboard/iowork', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Projects
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-projects', 'en',
  'What are Projects?',
  'A place to group related work — documents, sites, images, data — under one name with a goal. You see a count by kind, memory notes for context, recent items, and a field to create new things inside the project. Share a read-only link with someone else.',
  'tools', 21,
  array['projects', 'project', 'organize work', 'group my work', 'share a project']::text[],
  '/dashboard/projects', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- ============================================================
-- GREEK
-- ============================================================

-- My Stuff
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-my-stuff', 'el',
  'Τι είναι το My Stuff;',
  'Ό,τι δημιουργείς ή ανεβάζεις κρατιέται εδώ: έγγραφα, εικόνες, αρχεία δεδομένων, sites, παρουσιάσεις. Ψάξε με όνομα ή κάνε ερώτηση πάνω σε αρχείο. Φιλτράρισε κατά τύπο ή project. Ανέβασε δικά σου αρχεία — PDF, εικόνες, υπολογιστικά φύλλα — και αποθηκεύονται ιδιωτικά.',
  'tools', 0,
  array['my stuff', 'τα αρχεια μου', 'που ειναι τα αρχεια μου', 'αρχεια', 'ανεβασμενα']::text[],
  '/dashboard/my-stuff', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Meetings
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-meetings', 'el',
  'Πώς χρησιμοποιώ τα Meetings;',
  'Ανέβασε μια ηχογράφηση ή κάνε εγγραφή απευθείας από τον browser (με ειδοποίηση συγκατάθεσης πρώτα). Το Ionexa την απομαγνητοφωνεί με ονόματα ομιλητών, σου δίνει περίληψη και ενέργειες, και πατώντας μια γραμμή στην απομαγνητοφώνηση πας σε εκείνο το σημείο. Κάνε ερωτήσεις για τη σύσκεψη από το πεδίο κάτω.',
  'tools', 1,
  array['meetings', 'συσκεψη', 'ηχογραφηση', 'απομαγνητοφωνηση', 'σημειωσεις συσκεψης']::text[],
  '/dashboard/meetings', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Analyze
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-analyze', 'el',
  'Πώς αναλύω δεδομένα;',
  'Ανέβασε ένα υπολογιστικό φύλλο ή CSV, ή δείξε δεδομένα που έχεις ήδη αποθηκεύσει. Κάνε μια ερώτηση με απλά λόγια και το Ionexa υπολογίζει την απάντηση από τους πραγματικούς αριθμούς — κάθε νούμερο υπολογίζεται με κώδικα, δεν μαντεύεται. Το αποτέλεσμα έρχεται με γράφημα αν ταιριάζει.',
  'tools', 2,
  array['αναλυση', 'δεδομενα', 'υπολογιστικο φυλλο', 'csv', 'αναλυση δεδομενων', 'γραφημα']::text[],
  '/dashboard/data-analysis', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Deep Research
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-research', 'el',
  'Τι είναι η Deep Research;',
  'Δώσε μια ερώτηση ή θέμα και το Ionexa ψάχνει, διαβάζει και διασταυρώνει πραγματικές πηγές, και γράφει αναφορά με αριθμημένους ισχυρισμούς. Πάτα σε έναν ισχυρισμό για να δεις από ποια πηγή βγήκε. Μπορείς να μετατρέψεις το αποτέλεσμα σε Document ή Slides από την ίδια σελίδα.',
  'tools', 3,
  array['deep research', 'ερευνα', 'πηγες', 'αναφορα', 'αναζητηση πηγων']::text[],
  '/dashboard/deep-research', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Translate
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-translate', 'el',
  'Τι είναι το Translate;',
  'Επικόλλησε ένα κείμενο, διάλεξε τις γλώσσες που θες, και πάρε τη μετάφραση παράγραφο παράγραφο. Αυτό το εργαλείο έρχεται σύντομα — προς το παρόν, μεταφράζεις μέσα από τα Documents και τον Site builder.',
  'tools', 4,
  array['μεταφραση', 'translate', 'πως μεταφραζω', 'μεταφραζω κειμενο']::text[],
  '/dashboard/translate', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Rebuild
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-rebuild', 'el',
  'Τι είναι το Rebuild;',
  'Πες «θέλω κάτι σαν το Χ» και το Ionexa το σπάει σε κουτιά λειτουργιών που επιλέγεις ή αλλάζεις. Δείχνει κάθε φάση με το κόστος σε credits πριν εγκρίνεις, και χτίζει βήμα βήμα με τα πραγματικά εργαλεία — Site, Apps, Coding — οπότε το αποτέλεσμα είναι δικό σου να κρατήσεις και αλλάξεις.',
  'tools', 5,
  array['rebuild', 'θελω κατι σαν', 'αντιγραφη site', 'χτισε σαν', 'φτιαξε σαν']::text[],
  '/dashboard/rebuild', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Apps
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-apps', 'el',
  'Τι είναι τα Apps;',
  'Περίγραψε μια μικρή επαγγελματική εφαρμογή — κρατήσεις, παραγγελίες, απόθεμα, φόρμα — και το Ionexa τη χτίζει με οθόνες και αποθηκευμένα δεδομένα. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 6,
  array['apps', 'εφαρμογη', 'φτιαξε εφαρμογη', 'κρατησεις', 'παραγγελιες']::text[],
  '/dashboard/app-builder', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Games
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-games', 'el',
  'Πώς φτιάχνω παιχνίδι;',
  'Περίγραψε τι θέλεις — τους κανόνες, τους χαρακτήρες, τον χειρισμό — και το Ionexa φτιάχνει ένα παιχνίδι που παίζεται στον browser. Αλλάζεις ένα πράγμα κάθε φορά πατώντας το κουτί του. Δημοσίευσέ το σε δική του διεύθυνση όταν είναι έτοιμο.',
  'tools', 7,
  array['παιχνιδι', 'games', 'φτιαξε παιχνιδι', 'δημιουργια παιχνιδιου']::text[],
  '/dashboard/games', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Document
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-document', 'el',
  'Πώς φτιάχνω έγγραφο;',
  'Άνοιξε τα Documents, περίγραψε τι χρειάζεσαι ή αρχίζεις να γράφεις. Το AI συμπληρώνει από την περιγραφή σου· αλλάζεις οποιοδήποτε μέρος με το χέρι ή λέγοντάς του τι να αλλάξει. Εξαγωγή σε Word ή PDF.',
  'tools', 8,
  array['εγγραφο', 'documents', 'φτιαξε εγγραφο', 'γραψε ενα γραμμα', 'word']::text[],
  '/dashboard/documents', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Slides
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-slides', 'el',
  'Πώς φτιάχνω παρουσίαση;',
  'Άνοιξε τα Slides, περίγραψε το θέμα ή επικόλλησε μια δομή. Το Ionexa χτίζει τη σειρά slide σε slide, με σημειώσεις. Αναδιάταξε, πρόσθεσε ή σβήσε slides, και επεξεργάσου οποιοδήποτε επιλέγοντάς το. Κάνε παρουσίαση σε fullscreen ή εξαγωγή σε PowerPoint και PDF.',
  'tools', 9,
  array['slides', 'παρουσιαση', 'φτιαξε παρουσιαση', 'powerpoint', 'διαφανειες']::text[],
  '/dashboard/presentations', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Posts
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-posts', 'el',
  'Πώς φτιάχνω posts για social media;',
  'Άνοιξε τα Posts, πες τι θέλεις να πεις, και το Ionexa γράφει μια εκδοχή για κάθε πλατφόρμα — LinkedIn, X, Instagram, Threads, Facebook — στο σωστό μέγεθος και ύφος. Επεξεργάσου, έγκρινε και προγραμμάτισε.',
  'tools', 10,
  array['posts', 'social media', 'linkedin', 'instagram', 'δημοσιευση', 'post']::text[],
  '/dashboard/posts', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Image
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-image', 'el',
  'Πώς δημιουργώ εικόνες;',
  'Περίγραψε τι θέλεις και το Ionexa το δημιουργεί. Άλλαξέ το λέγοντας τι να φτιάξει — γίνεται νέα έκδοση, το πρωτότυπο μένει. Μπορείς να ανεβάσεις εικόνα και να ζητήσεις παραλλαγή στο ίδιο ύφος. Κατέβασε ή στείλε στο My Stuff.',
  'tools', 11,
  array['εικονα', 'εικονες', 'δημιουργια εικονας', 'φτιαξε εικονα', 'ai εικονα']::text[],
  '/dashboard/images', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- 3D
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-3d', 'el',
  'Τι είναι το 3D;',
  'Τράβηξε μερικές φωτογραφίες ενός αντικειμένου ή προϊόντος και το Ionexa τις μετατρέπει σε τρισδιάστατο μοντέλο που περιστρέφεται. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 12,
  array['3d', 'τρισδιαστατο', '3d μοντελο']::text[],
  '/dashboard/3d', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Video
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-video', 'el',
  'Τι είναι το Video;',
  'Περίγραψε ένα κλιπ ή δώσε εικόνα με περιγραφή, και το Ionexa δημιουργεί ένα σύντομο βίντεο. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 13,
  array['video', 'βιντεο', 'δημιουργια βιντεο', 'φτιαξε βιντεο']::text[],
  '/dashboard/video-studio', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Films
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-films', 'el',
  'Τι είναι τα Films;',
  'Από μια ιδέα ή ένα ημιτελές σενάριο, το Ionexa χτίζει ένα storyboard σκηνή-σκηνή και παράγει κάθε πλάνο στο παρασκήνιο, με τιμή πριν από κάθε χρέωση. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 14,
  array['films', 'ταινια', 'σκηνοθεσια', 'storyboard', 'φτιαξε ταινια']::text[],
  '/dashboard/films', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Editing
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-editing', 'el',
  'Τι είναι το Editing;',
  'Ανέβασε βίντεο ή φέρε κλιπ από άλλα εργαλεία, τοποθέτησέ τα σε timeline με κουτιά, πρόσθεσε κείμενο και μουσική, και εξαγωγή. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 15,
  array['editing', 'μονταζ', 'επεξεργασια βιντεο', 'timeline']::text[],
  '/dashboard/editing', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Avatars
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-avatars', 'el',
  'Τι είναι τα Avatars;',
  'Ένα avatar που μιλά από σενάριο, για demos προϊόντων ή επεξηγήσεις. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 16,
  array['avatars', 'avatar', 'παρουσιαστης', 'avatar βιντεο']::text[],
  '/dashboard/avatars', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Audio
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-audio', 'el',
  'Τι είναι το Audio;',
  'Voice-over από κείμενο σε πολλές γλώσσες και φωνές, podcast από σενάριο δύο ομιλητών, και καθαρισμός ηχογράφησης. Αυτό το εργαλείο έρχεται σύντομα.',
  'tools', 17,
  array['audio', 'ηχος', 'voice over', 'podcast', 'κειμενο σε φωνη']::text[],
  '/dashboard/audio', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Coding
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-coding', 'el',
  'Πώς χρησιμοποιώ το Coding;',
  'Περίγραψε τι θέλεις να φτιαχτεί ή να διορθωθεί, και το Ionexa γράφει και τρέχει τον κώδικα. Βλέπεις τις αλλαγές αρχείο αρχείο, δέχεσαι ή απορρίπτεις κάθε μία, και συνδέεις repository στο GitHub για να στείλεις το αποτέλεσμα.',
  'tools', 18,
  array['coding', 'κωδικας', 'προγραμματισμος', 'github', 'γραψε κωδικα']::text[],
  '/dashboard/coding', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Automations
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-automations', 'el',
  'Τι είναι τα Automations;',
  'Μια οπτική ροή βημάτων που τρέχουν μόνα τους: όταν γίνεται κάτι, κάνε αυτό, μετά εκείνο. Σύνδεσε κουτιά σε καμβά, κάθε ένα μια ενέργεια ή ένας έλεγχος. Τα automations τρέχουν στο παρασκήνιο και σε ειδοποιούν.',
  'tools', 19,
  array['automations', 'αυτοματισμοι', 'workflow', 'αυτοματοποιηση']::text[],
  '/dashboard/automation', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- iowork
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-iowork', 'el',
  'Τι είναι το iowork;',
  'Μια εφαρμογή που συνδέει τον υπολογιστή σου με το Ionexa, ώστε η AI να δουλέψει στα τοπικά αρχεία και εργαλεία σου. Έρχεται σύντομα.',
  'tools', 20,
  array['iowork', 'εφαρμογη υπολογιστη', 'τοπικα αρχεια', 'συνδεση υπολογιστη']::text[],
  '/dashboard/iowork', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;

-- Projects
INSERT INTO help_articles (slug, locale, title, body, category, "order", triggers, href, published)
VALUES (
  'tool-projects', 'el',
  'Τι είναι τα Projects;',
  'Ένα μέρος να ομαδοποιήσεις σχετική δουλειά — έγγραφα, sites, εικόνες, δεδομένα — κάτω από ένα όνομα με στόχο. Βλέπεις μέτρηση ανά τύπο, σημειώσεις μνήμης, πρόσφατα αντικείμενα, και πεδίο για δημιουργία μέσα στο project. Μοιράσου σύνδεσμο μόνο για ανάγνωση.',
  'tools', 21,
  array['projects', 'project', 'οργανωση δουλειας', 'ομαδοποιηση', 'μοιρασου project']::text[],
  '/dashboard/projects', true
)
ON CONFLICT (slug, locale) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, category = EXCLUDED.category,
  "order" = EXCLUDED."order", triggers = EXCLUDED.triggers, href = EXCLUDED.href,
  published = EXCLUDED.published;
