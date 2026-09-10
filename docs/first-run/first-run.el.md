# The first run — el

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **610 strings**. The whole product is 3067, which is why this file exists.

**Start with tier 1. It is 46 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 366 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (46)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

Δεν μπορέσαμε να δημιουργήσουμε τον λογαριασμό. Έλεγξε τα στοιχεία και δοκίμασε ξανά — δεν χρεώθηκες.

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου για να δημιουργήσεις λογαριασμό.

**`pricing.businessCardDescription`**

> EN — Start with any plan as your team's base, then invite members for +{price}/month each — everyone gets full access at your plan's tier. Perfect for teams working together.

Ξεκίνα με οποιοδήποτε πλάνο ως βάση της ομάδας σου, μετά πρόσκαλε μέλη για +{price}/μήνα το καθένα — όλοι αποκτούν πλήρη πρόσβαση στο επίπεδο του πλάνου σου. Ιδανικό για ομάδες που δουλεύουν μαζί.

### login

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

Δεν μπορέσαμε να σε συνδέσουμε. Έλεγξε το email και τον κωδικό, ή κάνε επαναφορά κωδικού αν δεν είσαι σίγουρος.

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά ή χρησιμοποίησε email και κωδικό παρακάτω.

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

Φέρε λίγα πραγματικά δεδομένα και το AI θα σου πει κάτι για την επιχείρησή σου μέσα σε δύο λεπτά.

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

Τα δεδομένα σου παραμένουν δικά σου. Αποθηκεύονται ιδιωτικά, μόνο εσύ τα διαβάζεις, και δεν χρησιμοποιούνται ποτέ για εκπαίδευση. Μπορείς να τα διαγράψεις, ή όλο τον λογαριασμό, όποτε θέλεις.

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

Μόνο πραγματικά μοτίβα από όσα μόλις εισήγαγες. Αν δεν αρκούν για να είμαστε σίγουροι, θα στο πούμε.

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV ή tab-separated, έως {max}. Το διαβάζουμε και σου δείχνουμε τι βρήκαμε πριν αποθηκευτεί οτιδήποτε.

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

Οι ημερομηνίες σου μπορεί να είναι ημέρα/μήνας ή μήνας/ημέρα — όλες πέφτουν έως τις 12, οπότε δεν μπορούμε να ξέρουμε. Ποιο από τα δύο;

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

Το πρώτο import και η ανάλυση είναι δωρεάν — δεν θα χρησιμοποιήσουν credits.

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

Δεν υπάρχουν ακόμη αρκετά για να μιλήσουμε για μοτίβο. Μερικές δεκάδες γραμμές με ημερομηνίες είναι συνήθως το σημείο που αρχίζουν να φαίνονται πράγματα — και προτιμούμε να μην πούμε τίποτα παρά να εφεύρουμε κάτι.

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

Ένα business plan, σημειώσεις, μια λίστα πελατών. Βγάζουμε ό,τι μπορεί να καταγραφεί και αφήνουμε τα υπόλοιπα.

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

Ένα CSV export από τον broker, την τράπεζα ή το CRM σου. Καταλαβαίνουμε τι είναι κάθε στήλη.

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

Διάλεξε ό,τι είναι πιο εύκολο. Τίποτα δεν είναι υποχρεωτικό, μπορείς να προσθέσεις κι αργότερα.

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

Ένα business plan, σημειώσεις, μια λίστα — βγάζουμε τα δομημένα κομμάτια.

### dashboard chrome

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

Αυτές οι καταχωρήσεις είναι δείγμα — το τρίμηνο ενός μικρού γραφείου σχεδιασμού. Δεν είναι δικές σου.

**`sidebar.hints.apps`**

> EN — Keep track of apps you are planning or have already shipped. It does not build them.

Κράτα σημειώσεις για εφαρμογές που σχεδιάζεις ή έχεις ήδη βγάλει. Δεν τις φτιάχνει.

**`sidebar.hints.coding`**

> EN — Write, explain, fix, convert and test snippets of code. It does not run code or open a repository.

Γράψε, εξήγησε, διόρθωσε, μετέτρεψε και δοκίμασε κομμάτια κώδικα. Δεν εκτελεί κώδικα ούτε ανοίγει αποθετήριο.

**`sidebar.hints.create`**

> EN — Describe what you want in one sentence; it works out the rest.

Περίγραψε τι θέλεις σε μία πρόταση· τα υπόλοιπα τα βρίσκει μόνο του.

**`sidebar.hints.deepResearch`**

> EN — Give it a topic and it searches, cross-checks and writes a sourced report

Δώσε ένα θέμα και ψάχνει, διασταυρώνει και γράφει αναφορά με πηγές

**`sidebar.hints.files`**

> EN — Upload PDFs, Word and Excel files and ask the AI questions about them

Ανέβασε PDF, Word και Excel και ρώτα το AI για αυτά

**`sidebar.hints.images`**

> EN — Keep track of images you are planning or have already made. It does not generate them.

Κράτα σημειώσεις για εικόνες που σχεδιάζεις ή έχεις ήδη φτιάξει. Δεν τις δημιουργεί.

**`sidebar.hints.integrations`**

> EN — Connect Gmail, Drive and Slack so the AI can work with your real data

Σύνδεσε Gmail, Drive και Slack ώστε το AI να δουλεύει με τα πραγματικά σου δεδομένα

**`sidebar.hints.library`**

> EN — Starred, recent and search — all your own entries in one place

Αγαπημένα, πρόσφατα και αναζήτηση — όλα σου τα δεδομένα μαζί

**`sidebar.hints.marketplace`**

> EN — Share an agent's shape as a template, and start from one someone else shared.

Μοιράσου τη δομή ενός agent ως πρότυπο και ξεκίνα από ένα που μοιράστηκε κάποιος άλλος.

**`sidebar.hints.posts`**

> EN — Say it once and get a post per platform, each at its length and in its register. It publishes nothing — you copy and post.

Πες το μία φορά και πάρε μια ανάρτηση ανά πλατφόρμα, στο μήκος και στο ύφος της. Δεν δημοσιεύει τίποτα — αντιγράφεις και αναρτάς εσύ.

**`sidebar.hints.predictions`**

> EN — Patterns found in your own rows, each with the number of entries it rests on and a link to them.

Μοτίβα στις δικές σου καταχωρήσεις, με το πλήθος των εγγραφών που τα στηρίζει και σύνδεσμο σε αυτές.

**`sidebar.hints.presentations`**

> EN — Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts.

Περίγραψε μια παρουσίαση και πάρε τις διαφάνειες — PowerPoint ή PDF, με φωτογραφίες από το Unsplash ή δικές σου. Δεν σχεδιάζει γραφήματα.

**`sidebar.hints.projects`**

> EN — A folder with a goal. What you put in is what is in it — nothing is dragged in with it.

Φάκελος με στόχο. Ό,τι βάζεις είναι ό,τι έχει — τίποτα δεν μπαίνει μόνο του.

**`sidebar.hints.published`**

> EN — Every site you have live on the web, with its traffic and version history

Κάθε site σου που είναι ζωντανό στο διαδίκτυο, με την επισκεψιμότητα και το ιστορικό εκδόσεων

**`sidebar.hints.records`**

> EN — Every log in one place — filter by type instead of hunting the menu

Όλες οι καταχωρήσεις σε ένα σημείο — φιλτράρισμα κατά τύπο αντί για ψάξιμο στο μενού

**`sidebar.hints.videos`**

> EN — Keep track of videos you are planning or have already made. It does not generate them.

Κράτα σημειώσεις για βίντεο που σχεδιάζεις ή έχεις ήδη φτιάξει. Δεν τα δημιουργεί.

**`sidebar.hints.voice`**

> EN — Have text read out loud, or speak and have it written down. Minutes are metered and the price per minute is on the page.

Άκου ένα κείμενο ή μίλα και γράφεται. Τα λεπτά μετριούνται και η τιμή ανά λεπτό είναι στη σελίδα.

### first result

**`dashboard.overview.healthScore.suggestion.recency`**

> EN — You haven't logged anything in a while — add a new entry to pick things back up.

Δεν έχεις καταγράψει κάτι εδώ και καιρό — πρόσθεσε μια νέα εγγραφή για να συνεχίσεις.

**`dashboard.overview.nextAction.revisitLink`**

> EN — You linked "{source}" to "{target}" a few days ago — worth revisiting?

Σύνδεσες το "{source}" με το "{target}" πριν από λίγες μέρες — αξίζει να το ξανακοιτάξεις;

**`dashboard.overview.nextAction.startNew`**

> EN — No new activity in the last 3 days — ready to start something new?

Καμία νέα δραστηριότητα τις τελευταίες 3 μέρες — έτοιμος/η να ξεκινήσεις κάτι νέο;

**`dashboard.overview.setupProgress.suggestion`**

> EN — Your activity score appears once you have logged {count} entries — enough that no single one decides it.

Το σκορ δραστηριότητας εμφανίζεται μόλις καταχωρήσεις {count} καταχωρήσεις — αρκετές ώστε να μην το κρίνει μία μόνο.

**`dashboard.overview.statRow.mostActiveExplain`**

> EN — The module you have written in most. Where your attention has gone.

Η ενότητα όπου γράφεις περισσότερο. Εκεί πάει η προσοχή σου.

**`dashboard.overview.statRow.thisWeekExplain`**

> EN — Logged in the last seven days — how active this week has been.

Καταχωρήθηκαν τις τελευταίες επτά μέρες — πόσο δραστήρια ήταν η εβδομάδα.

**`common.betaExpiry`**

> EN — Your beta access expires in {days, plural, one {# day} other {# days}}. <link>Upgrade to keep full access</link>.

Η beta πρόσβασή σου λήγει σε {days, plural, one {# ημέρα} other {# ημέρες}}. <link>Αναβάθμισε για να κρατήσεις πλήρη πρόσβαση</link>.

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

Εμφανίζονται οι πιο πρόσφατες {count, number}. Οι παλαιότερες καταχωρήσεις είναι αποθηκευμένες — χρησιμοποίησε την Αναζήτηση στα αρχεία σου για να τις βρεις.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

Αυτό μοιάζει με ερώτηση. Να την απαντήσω, ή να την καταγράψω;

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

Περίγραψε οτιδήποτε — μια ιδέα προϊόντος, μια συναλλαγή, ένα σχόλιο χρήστη, έναν δείκτη — και καταλήγει αυτόματα στο σωστό module.

**`dashboard.energyCheckIn.whatItDoes`**

> EN — Ionexa uses this to pick which plan step to suggest next — lighter work when you're low, demanding work when you're not.

Το Ionexa το χρησιμοποιεί για να διαλέξει ποιο βήμα του σχεδίου θα σου προτείνει — ελαφριά δουλειά όταν είσαι χαμηλά, απαιτητική όταν δεν είσαι.

**`sampleData.loadFree`**

> EN — Free — nothing is generated, and you can remove it in one click

Δωρεάν — δεν παράγεται τίποτα, και το σβήνεις με ένα κλικ

## Tier 2 — The labels — skim these (366)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

Συμφωνώ με τους

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

Έχεις ήδη λογαριασμό;

**`auth.signup.and`**

> EN — and

και

**`auth.signup.change`**

> EN — change

αλλαγή

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

Επίλεξε το πλάνο σου

**`auth.signup.continue`**

> EN — Continue

Συνέχεια

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

Συνέχεια στην Πληρωμή

**`auth.signup.country`**

> EN — Country

Χώρα

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

Επίλεξε τη χώρα σου (προαιρετικό)

**`auth.signup.createAccount`**

> EN — Create Account

Δημιουργία Λογαριασμού

**`auth.signup.createYourAccount`**

> EN — Create your account

Δημιούργησε τον λογαριασμό σου

**`auth.signup.discountCode`**

> EN — Discount code

Κωδικός έκπτωσης

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

Κωδικός έκπτωσης (προαιρετικό)

**`auth.signup.email`**

> EN — Email

Email

**`auth.signup.inviteCode`**

> EN — Invite code

Κωδικός πρόσκλησης

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

Κωδικός πρόσκλησης (προαιρετικό)

**`auth.signup.logIn`**

> EN — Log in

Σύνδεση

**`auth.signup.mostPopular`**

> EN — Most Popular

Πιο Δημοφιλές

**`auth.signup.password`**

> EN — Password

Κωδικός

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

Επιλέξτε κωδικό που πληροί όλες τις παραπάνω προϋποθέσεις.

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

την Πολιτική Απορρήτου

**`auth.signup.step`**

> EN — Step {step} of 2

Βήμα {step} από 2

**`auth.signup.termsOfService`**

> EN — Terms of Service

Όρους Χρήσης

**`auth.signup.working`**

> EN — Working...

Επεξεργασία...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

Επίλεξε Professional ή Ultimate ως βασικό πλάνο

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

Θέσεις ομάδας δωρεάν στο Ultimate

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets full access at your plan's tier

Κάθε μέλος αποκτά πλήρη πρόσβαση στο επίπεδο του πλάνου σου

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

Διαχειρίσου τις θέσεις όποτε θέλεις από τις ρυθμίσεις Ομάδας

**`pricing.businessSubtitle`**

> EN — For teams building together

Για ομάδες που χτίζουν μαζί

**`pricing.businessTitle`**

> EN — Business

Business

**`pricing.custom`**

> EN — Custom

Κατόπιν συνεννόησης

**`pricing.features.aiMemory`**

> EN — AI Memory

Μνήμη AI

**`pricing.features.basicAiChat`**

> EN — Basic AI chat

Βασική συνομιλία AI

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, one {# credit} other {# credits}}/μήνα

**`pricing.features.customAiPersonaNameInIonexaChat`**

> EN — Custom AI persona name in Ionexa Chat

Προσαρμοσμένο όνομα AI στο Ionexa Chat

**`pricing.features.customCredits`**

> EN — Custom credits

Προσαρμοσμένα credits

**`pricing.features.everythingInGrowth`**

> EN — Everything in Growth

Ό,τι περιλαμβάνει το Growth

**`pricing.features.everythingInProfessional`**

> EN — Everything in Professional

Ό,τι περιλαμβάνει το Professional

**`pricing.features.everythingInStarter`**

> EN — Everything in Starter

Ό,τι περιλαμβάνει το Starter

**`pricing.features.everythingInUltimate`**

> EN — Everything in Ultimate

Ό,τι περιλαμβάνει το Ultimate

**`pricing.features.extendedChatMemoryRetention100Vs20RecentFact`**

> EN — Extended chat memory retention (100 vs 20 recent facts)

Εκτεταμένη διατήρηση μνήμης συνομιλίας (100 έναντι 20 πρόσφατων στοιχείων)

**`pricing.features.teamCollaboration`**

> EN — Team collaboration

Συνεργασία ομάδας

**`pricing.features.unlimitedMembers`**

> EN — Unlimited members

Απεριόριστα μέλη

**`pricing.features.unlimitedTeamSeatsIncludedNoPerMemberCharge`**

> EN — Unlimited team seats included — no per-member charge

Απεριόριστες θέσεις ομάδας — χωρίς χρέωση ανά μέλος

**`pricing.features.upTo100AiAgents`**

> EN — Up to 100 AI agents

Έως 100 πράκτορες AI

**`pricing.features.upTo15AiAgentsTeams`**

> EN — Up to 15 AI agents & teams

Έως 15 πράκτορες AI & ομάδες

**`pricing.features.upTo2AiAgents`**

> EN — Up to 2 AI agents

Έως 2 πράκτορες AI

**`pricing.features.upTo50AiAgents`**

> EN — Up to 50 AI agents

Έως 50 πράκτορες AI

**`pricing.features.upTo5AiAgents`**

> EN — Up to 5 AI agents

Έως 5 πράκτορες AI

**`pricing.features.websiteAutomationBuilderAccess`**

> EN — Website & Automation Builder access

Πρόσβαση σε Website & Automation Builder

**`pricing.perMonth`**

> EN — /month

/μήνα

**`auth.generateStrongPassword`**

> EN — Generate strong password

Φτιάξε ισχυρό κωδικό

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

Συνέχεια με Google

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

Δεν ήταν δυνατή η σύνδεση με Google. Δοκίμασε ξανά.

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

ή συνέχεια με email

**`common.hidePassword`**

> EN — Hide password

Απόκρυψη κωδικού

**`common.showPassword`**

> EN — Show password

Εμφάνιση κωδικού

### login

**`auth.login.email`**

> EN — Email

Email

**`auth.login.forgotPassword`**

> EN — Forgot password?

Ξέχασες τον κωδικό;

**`auth.login.logIn`**

> EN — Log In

Σύνδεση

**`auth.login.noAccount`**

> EN — No account yet?

Δεν έχεις λογαριασμό;

**`auth.login.password`**

> EN — Password

Κωδικός

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

Ο κωδικός ενημερώθηκε — συνδέσου με τον νέο σου κωδικό.

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

Συνδέσου για να αποθηκευτεί αυτό που μοιράστηκες.

**`auth.login.signUp`**

> EN — Sign up

Εγγραφή

**`auth.login.welcomeBack`**

> EN — Welcome back

Καλώς ήρθες πίσω

**`auth.login.working`**

> EN — Working...

Επεξεργασία...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

Ας το κάνουμε δικό σου

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

Το αρχείο δεν διαβάστηκε.

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

Ψάχνει μοτίβα στα δεδομένα σου…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

Επίλεξε άλλο αρχείο

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

Επίλεξε αρχείο

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{ready} από {total} γραμμές είναι έτοιμες

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

Ανέβασε το υπολογιστικό φύλλο

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

Ημέρα / μήνας

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

Μήνας / ημέρα

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

Βγάλε τις εγγραφές

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

Μια εταιρεία ή μικρή επιχείρηση

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

Έσοδα και πελάτες ως freelancer

**`dashboard.onboarding.goals.other`**

> EN — Something else

Κάτι άλλο

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

Ένα startup που χτίζω

**`dashboard.onboarding.goals.trading`**

> EN — My trading

Το trading μου

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

Τι θέλεις κυρίως να παρακολουθείς;

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

Πήγαινε στο dashboard σου

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— αγνόησέ την —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

{count, plural, one {Εισήχθη # γραμμή} other {Εισήχθησαν # γραμμές}}

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

{count, plural, one {# γραμμή είναι} other {# γραμμές είναι}} πλέον στον λογαριασμό σου.

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

Η εισαγωγή δεν ολοκληρώθηκε.

**`dashboard.onboarding.importing`**

> EN — Importing…

Εισαγωγή…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

{count, plural, one {Εισαγωγή # γραμμής} other {Εισαγωγή # γραμμών}}

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

Η ανάλυση δεν ολοκληρώθηκε.

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

Να τι βρήκα

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

Αυτό μοιάζει με: {label}.

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

Αντιστοίχιση της στήλης {column}

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

Ποια στήλη είναι τι — άλλαξε ό,τι δεν βρήκαμε σωστά

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

Τίποτα σίγουρο ακόμη

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

Πρόσθεσε λίγα ακόμα και τρέξε το ξανά από το dashboard.

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

Δεν υπήρχε τίποτα σε αυτό το κείμενο που να αξίζει να καταγραφεί.

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

Επικόλλησε το κείμενό σου εδώ…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

Επικόλλησε οτιδήποτε

**`dashboard.onboarding.previewSource`**

> EN — From your file

Από το αρχείο σου

**`dashboard.onboarding.previewStored`**

> EN — Stored as

Αποθηκεύεται ως

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

Τι θα αποθηκευτεί στην πραγματικότητα

**`dashboard.onboarding.reading`**

> EN — Reading…

Διαβάζει…

**`dashboard.onboarding.skip`**

> EN — Skip for now

Παράλειψη προς το παρόν

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

{count} παραλείφθηκαν

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

Ανέβασε ένα υπολογιστικό φύλλο

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

Σύνδεσε Gmail ή Drive

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

Μόνο για ανάγνωση, και μόνο ό,τι εγκρίνεις.

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

Θα προσθέσω μόνος μου

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

Πήγαινε κατευθείαν στο dashboard και ξεκίνα από την αρχή.

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

Επικόλλησε κείμενο

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

Φέρε τα δεδομένα σου

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

Βήμα {step} από {total}

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

Τα υπολογιστικά φύλλα πρέπει να είναι έως {max}.

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

διαβάστηκαν μόνο οι πρώτες γραμμές

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

Η AI που ξέρει ήδη τη δουλειά σου. Ρώτα την οτιδήποτε.

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

Πρώτη Εγγραφή σε {module}

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

Ξεκλειδώθηκε επίτευγμα: {achievement}

**`common.accountMenu`**

> EN — Account menu

Μενού λογαριασμού

**`common.commandPalette`**

> EN — Command palette

Παλέτα εντολών

**`common.createStudio`**

> EN — Make anything

Φτιάξε κάτι

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

Υπόλοιπο credits — αγόρασε κι άλλα από τις Ρυθμίσεις

**`common.creditsUnlimited`**

> EN — Unlimited

Απεριόριστα

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — πάτησε Enter για απόρριψη

**`common.jumpToPage`**

> EN — Jump to a module or page...

Μετάβαση σε module ή σελίδα...

**`common.loading`**

> EN — Loading...

Φόρτωση...

**`common.noMatches`**

> EN — No matches for “{query}”

Δεν βρέθηκαν αποτελέσματα για «{query}»

**`common.offline.checking`**

> EN — Checking…

Ελέγχω…

**`common.offline.retry`**

> EN — Try again

Δοκίμασε ξανά

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

Τίποτα σε αυτή τη σελίδα δεν ενημερώνεται.

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

Τίποτα εδώ δεν ενημερώνεται — φορτώθηκε πριν από {minutes, plural, one {# λεπτό} other {# λεπτά}}.

**`common.offline.stillOffline`**

> EN — Still no connection.

Ακόμα χωρίς σύνδεση.

**`common.offline.title`**

> EN — You're offline.

Είσαι εκτός σύνδεσης.

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

Πρόσβαση ιδιοκτήτη — απεριόριστα credits

**`common.paletteClose`**

> EN — close

κλείσιμο

**`common.paletteNavigate`**

> EN — navigate

πλοήγηση

**`common.paletteSelect`**

> EN — select

επιλογή

**`common.search`**

> EN — Search anything...

Αναζήτηση...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

Δωρεάν μήνυμα · απομένουν {count} αυτόν τον μήνα

**`credits.unlimited`**

> EN — Unlimited — no credits used

Απεριόριστα — δεν χρεώθηκαν credits

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

Απεριόριστα — θα κόστιζε {count, plural, one {# credit} other {# credits}}

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

{count, plural, one {Χρεώθηκε # credit} other {Χρεώθηκαν # credits}}

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

{count, plural, one {Χρεώθηκε # credit} other {Χρεώθηκαν # credits}} · {remaining, plural, one {απομένει #} other {απομένουν #}}

**`dashboard.search.dates.30d`**

> EN — 30 days

30 ημέρες

**`dashboard.search.dates.365d`**

> EN — 1 year

1 έτος

**`dashboard.search.dates.7d`**

> EN — 7 days

7 ημέρες

**`dashboard.search.dates.any`**

> EN — Any time

Οποτεδήποτε

**`dashboard.search.filters.all`**

> EN — All

Όλα

**`dashboard.search.filters.date`**

> EN — Date

Ημερομηνία

**`dashboard.search.filters.module`**

> EN — Module

Ενότητα

**`dashboard.search.filters.type`**

> EN — Type

Τύπος

**`dashboard.search.kinds.agent`**

> EN — Agents

Πράκτορες

**`dashboard.search.kinds.chat`**

> EN — Conversations

Συνομιλίες

**`dashboard.search.kinds.file`**

> EN — Files

Αρχεία

**`dashboard.search.kinds.help`**

> EN — Help

Βοήθεια

**`dashboard.search.kinds.mission`**

> EN — Plans

Σχέδια

**`dashboard.search.kinds.module`**

> EN — Entries

Καταχωρήσεις

**`dashboard.search.kinds.page`**

> EN — Pages

Σελίδες

**`dashboard.search.kinds.research`**

> EN — Research

Έρευνα

**`dashboard.search.kinds.website`**

> EN — Websites

Ιστοσελίδες

**`sampleData.banner`**

> EN — Sample data

Δοκιμαστικά δεδομένα

**`sampleData.clear`**

> EN — Remove the sample

Καθάρισε το δείγμα

**`sampleData.clearFailed`**

> EN — That did not work.

Δεν πέτυχε.

**`sampleData.clearing`**

> EN — Removing…

Καθαρίζει…

**`sidebar.closeMenu`**

> EN — Close menu

Κλείσιμο μενού

**`sidebar.groups.ask`**

> EN — Ask

Ρώτα

**`sidebar.groups.build`**

> EN — Build

Φτιάξε

**`sidebar.groups.business`**

> EN — Business

Επιχείρηση

**`sidebar.groups.create`**

> EN — Create

Δημιουργία

**`sidebar.groups.daily`**

> EN — Daily

Καθημερινά

**`sidebar.groups.insights`**

> EN — What I noticed

Τι πρόσεξα

**`sidebar.groups.make`**

> EN — Make

Φτιάξε

**`sidebar.groups.marketplace`**

> EN — Marketplace

Αγορά

**`sidebar.groups.myBusiness`**

> EN — My business

Η επιχείρησή μου

**`sidebar.groups.operations`**

> EN — Operations

Λειτουργίες

**`sidebar.groups.organise`**

> EN — Organise

Οργάνωσε

**`sidebar.groups.run`**

> EN — Run

Τρέξε

**`sidebar.groups.see`**

> EN — See

Δες

**`sidebar.groups.settings`**

> EN — Settings

Ρυθμίσεις

**`sidebar.groups.strategy`**

> EN — Strategy

Στρατηγική

**`sidebar.groups.track`**

> EN — Track

Καταγραφή

**`sidebar.groups.tracking`**

> EN — Tracking

Παρακολούθηση

**`sidebar.groups.work`**

> EN — Work

Δούλεψε

**`sidebar.groups.workspace`**

> EN — Workspace

Χώρος εργασίας

**`sidebar.hints.affiliate`**

> EN — Your referral link, what you've earned, and how you get paid.

Ο σύνδεσμος πρόσκλησης, τι έχεις κερδίσει και πώς πληρώνεσαι.

**`sidebar.hints.agents`**

> EN — Plan the agents you want. A tracker, not a runtime.

Σχεδίασε τους agents που θέλεις. Καταγραφή, όχι εκτέλεση.

**`sidebar.hints.analytics`**

> EN — Metrics you're watching.

Μετρήσεις που παρακολουθείς.

**`sidebar.hints.automation`**

> EN — Things that run on a schedule.

Πράγματα που τρέχουν προγραμματισμένα.

**`sidebar.hints.businessHealth`**

> EN — MRR, margin, churn and runway. Owner only.

MRR, περιθώριο, απώλεια πελατών και ρευστότητα. Μόνο για τον ιδιοκτήτη.

**`sidebar.hints.campaigns`**

> EN — Plan campaigns — channel, budget, status.

Σχεδίασε καμπάνιες — κανάλι, budget, κατάσταση.

**`sidebar.hints.chat`**

> EN — Ask anything — not tied to any module.

Ρώτα οτιδήποτε — δεν συνδέεται με κάποιο module.

**`sidebar.hints.competitors`**

> EN — Track rival products, pricing and positioning.

Παρακολούθησε ανταγωνιστικά προϊόντα, τιμές και τοποθέτηση.

**`sidebar.hints.content`**

> EN — Content ideas, captions and threads.

Ιδέες περιεχομένου, λεζάντες και threads.

**`sidebar.hints.costs`**

> EN — What every AI call has cost, per model and per day.

Τι κόστισε κάθε κλήση AI, ανά μοντέλο και ανά ημέρα.

**`sidebar.hints.dataAnalysis`**

> EN — Analysis requests and what you found.

Αιτήματα ανάλυσης και τι βρήκες.

**`sidebar.hints.decisions`**

> EN — Weigh the options before you decide.

Ζύγισε τις επιλογές πριν αποφασίσεις.

**`sidebar.hints.documents`**

> EN — Freeform notes and documents you write yourself.

Ελεύθερες σημειώσεις και έγγραφα που γράφεις εσύ.

**`sidebar.hints.favorites`**

> EN — Everything you've starred.

Όλα όσα έχεις σημειώσει με αστέρι.

**`sidebar.hints.feedback`**

> EN — What users told you, in one place.

Τι σου είπαν οι χρήστες, σε ένα σημείο.

**`sidebar.hints.finance`**

> EN — Log income and expenses.

Κατέγραψε έσοδα και έξοδα.

**`sidebar.hints.formSubmissions`**

> EN — Everything visitors sent through a form on your published sites

Ό,τι έστειλαν οι επισκέπτες μέσα από φόρμα στα δημοσιευμένα σας sites

**`sidebar.hints.help`**

> EN — Answers to the questions people ask most — no credits used.

Απαντήσεις στις πιο συχνές ερωτήσεις — χωρίς χρέωση credits.

**`sidebar.hints.home`**

> EN — Your dashboard — activity, stats and quick actions.

Ο πίνακάς σου — δραστηριότητα, στατιστικά και γρήγορες ενέργειες.

**`sidebar.hints.ideas`**

> EN — Capture new ideas before you forget them.

Κατέγραψε νέες ιδέες πριν τις ξεχάσεις.

**`sidebar.hints.learning`**

> EN — Track what you're studying.

Παρακολούθησε τι μαθαίνεις.

**`sidebar.hints.memory`**

> EN — What the AI remembers about you.

Τι θυμάται το AI για σένα.

**`sidebar.hints.mine`**

> EN — Everything you have made, newest first — with a starred-only tab

Ό,τι έχεις φτιάξει, με τα πιο πρόσφατα πρώτα — και καρτέλα μόνο για τα αγαπημένα

**`sidebar.hints.missionControl`**

> EN — Set a goal, AI breaks it into steps.

Βάλε στόχο, το AI τον σπάει σε βήματα.

**`sidebar.hints.newEntry`**

> EN — Write anything down — it files itself

Γράψε οτιδήποτε — μπαίνει μόνο του στη θέση του

**`sidebar.hints.products`**

> EN — Product plans — pricing, roadmap, launch.

Σχέδια προϊόντων — τιμολόγηση, roadmap, launch.

**`sidebar.hints.productWorkflow`**

> EN — Your products, patterns and mentor in one view.

Τα προϊόντα, τα μοτίβα και ο μέντοράς σου σε μία όψη.

**`sidebar.hints.reflection`**

> EN — A weekly summary of your progress.

Εβδομαδιαία σύνοψη της προόδου σου.

**`sidebar.hints.research`**

> EN — Save research, sources and summaries.

Αποθήκευσε έρευνα, πηγές και συνόψεις.

**`sidebar.hints.routing`**

> EN — Which model each kind of request is sent to.

Σε ποιο μοντέλο πηγαίνει κάθε είδος αιτήματος.

**`sidebar.hints.sales`**

> EN — Leads, outreach and next steps.

Leads, επικοινωνία και επόμενα βήματα.

**`sidebar.hints.settings`**

> EN — Account, billing, language and preferences.

Λογαριασμός, χρεώσεις, γλώσσα και προτιμήσεις.

**`sidebar.hints.systemHealth`**

> EN — Whether the database, the queues and the providers are answering.

Αν απαντούν η βάση, οι ουρές και οι πάροχοι.

**`sidebar.hints.team`**

> EN — Invite people to your workspace.

Πρόσκαλεσε άτομα στον χώρο εργασίας σου.

**`sidebar.hints.timeline`**

> EN — Everything you've done, in order.

Όλη σου η δραστηριότητα, χρονολογικά.

**`sidebar.hints.trading`**

> EN — Trade log — symbol, direction, result, P&L.

Ημερολόγιο trades — σύμβολο, κατεύθυνση, αποτέλεσμα, P&L.

**`sidebar.hints.tradingJournal`**

> EN — Your trades, with the reasoning you wrote at the time.

Οι συναλλαγές σου, με το σκεπτικό που έγραψες τότε.

**`sidebar.hints.tradingWorkflow`**

> EN — Your trades, patterns and mentor in one view.

Τα trades, τα μοτίβα και ο μέντοράς σου σε μία όψη.

**`sidebar.hints.websiteBuilder`**

> EN — Describe a site and AI generates the real page.

Περίγραψε έναν ιστότοπο και το AI φτιάχνει την πραγματική σελίδα.

**`sidebar.hints.websites`**

> EN — Track sites you own — name, URL, status. No generation.

Παρακολούθησε ιστότοπους που έχεις — όνομα, URL, κατάσταση. Χωρίς δημιουργία.

**`sidebar.items.affiliate`**

> EN — Affiliate

Συνεργάτες

**`sidebar.items.agents`**

> EN — AI Agents

AI Πράκτορες

**`sidebar.items.analytics`**

> EN — Analytics

Αναλυτικά

**`sidebar.items.apps`**

> EN — App notes

Σημειώσεις εφαρμογών

**`sidebar.items.automation`**

> EN — Automation

Αυτοματισμοί

**`sidebar.items.businessHealth`**

> EN — Business health

Υγεία της επιχείρησης

**`sidebar.items.campaigns`**

> EN — Campaign notes

Σημειώσεις καμπανιών

**`sidebar.items.chat`**

> EN — Ionexa Chat

Ionexa Συνομιλία

**`sidebar.items.coding`**

> EN — AI Coding

Κώδικας με AI

**`sidebar.items.competitors`**

> EN — Competitors

Ανταγωνιστές

**`sidebar.items.content`**

> EN — Content

Περιεχόμενο

**`sidebar.items.costs`**

> EN — Costs

Κόστη

**`sidebar.items.dataAnalysis`**

> EN — Data Analysis

Ανάλυση δεδομένων

**`sidebar.items.decisions`**

> EN — Decisions

Αποφάσεις

**`sidebar.items.deepResearch`**

> EN — Deep Research

Βαθιά Έρευνα

**`sidebar.items.documents`**

> EN — Documents

Έγγραφα

**`sidebar.items.favorites`**

> EN — Favorites

Αγαπημένα

**`sidebar.items.feedback`**

> EN — Feedback

Ανατροφοδότηση

**`sidebar.items.files`**

> EN — Files

Αρχεία

**`sidebar.items.finance`**

> EN — Finances

Οικονομικά

**`sidebar.items.formSubmissions`**

> EN — Form submissions

Υποβολές φορμών

**`sidebar.items.help`**

> EN — Help Centre

Κέντρο βοήθειας

**`sidebar.items.home`**

> EN — Home

Αρχική

**`sidebar.items.ideas`**

> EN — Ideas

Ιδέες

**`sidebar.items.images`**

> EN — Image notes

Σημειώσεις εικόνων

**`sidebar.items.integrations`**

> EN — Integrations

Συνδέσεις

**`sidebar.items.learning`**

> EN — Learning

Εκμάθηση

**`sidebar.items.library`**

> EN — My stuff

Τα πράγματά μου

**`sidebar.items.marketplace`**

> EN — Marketplace

Αγορά

**`sidebar.items.memory`**

> EN — Search my records

Αναζήτηση

**`sidebar.items.mine`**

> EN — Mine

Τα δικά μου

**`sidebar.items.missionControl`**

> EN — Goals & Plans

Στόχοι & Σχέδια

**`sidebar.items.newEntry`**

> EN — New entry

Νέα καταχώρηση

**`sidebar.items.posts`**

> EN — Posts

Αναρτήσεις

**`sidebar.items.predictions`**

> EN — Predictions

Προβλέψεις

**`sidebar.items.presentations`**

> EN — Presentations

Παρουσιάσεις

**`sidebar.items.products`**

> EN — Products

Προϊόντα

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

Ροή Εργασίας Product

**`sidebar.items.projects`**

> EN — Projects

Projects

**`sidebar.items.published`**

> EN — Live sites

Ζωντανά site

**`sidebar.items.records`**

> EN — My records

Οι καταχωρήσεις μου

**`sidebar.items.reflection`**

> EN — Weekly Reflection

Εβδομαδιαία Αναστοχασμός

**`sidebar.items.research`**

> EN — Research

Έρευνα

**`sidebar.items.routing`**

> EN — Model routing

Δρομολόγηση μοντέλων

**`sidebar.items.sales`**

> EN — Sales

Πωλήσεις

**`sidebar.items.settings`**

> EN — Settings

Ρυθμίσεις

**`sidebar.items.systemHealth`**

> EN — System Health

Υγεία συστήματος

**`sidebar.items.team`**

> EN — Team

Ομάδα

**`sidebar.items.timeline`**

> EN — History

Ιστορικό

**`sidebar.items.trading`**

> EN — Trading

Συναλλαγές

**`sidebar.items.tradingJournal`**

> EN — Trading journal

Ημερολόγιο trading

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

Ροή Εργασίας Trading

**`sidebar.items.videos`**

> EN — Video notes

Σημειώσεις βίντεο

**`sidebar.items.voice`**

> EN — Voice

Φωνή

**`sidebar.items.websiteBuilder`**

> EN — Build a site

Φτιάξε site

**`sidebar.items.websites`**

> EN — Website plans

Σχέδια ιστότοπων

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

Δεν ήταν δυνατή η φόρτωση των ιδεών σου: {message}

**`dashboard.insights.title`**

> EN — What I noticed

Τι πρόσεξα

**`dashboard.overview.activeMission.open`**

> EN — Open the plan

Άνοιξε το σχέδιο

**`dashboard.overview.activeMission.stepsLabel`**

> EN — {completed}/{total} steps completed

{completed}/{total} βήματα ολοκληρώθηκαν

**`dashboard.overview.aiCoach.entryCount`**

> EN — {count, plural, one {# new {module} entry} other {# new {module} entries}}

{count, plural, one {# νέα καταχώρηση στο {module}} other {# νέες καταχωρήσεις στο {module}}}

**`dashboard.overview.aiCoach.mostActiveIn`**

> EN — Most active in {module}

Πιο ενεργό/ή στο {module}

**`dashboard.overview.aiCoach.noActivity`**

> EN — No activity yet this week — log something to get started.

Καμία δραστηριότητα ακόμα αυτή την εβδομάδα — καταχώρησε κάτι για να ξεκινήσεις.

**`dashboard.overview.betaFeedback.linkLabel`**

> EN — Share feedback

Στείλε feedback

**`dashboard.overview.betaFeedback.message`**

> EN — Thanks for testing Ionexa AI. Your feedback is welcome.

Ευχαριστούμε που δοκιμάζεις το Ionexa AI. Τα σχόλιά σου είναι ευπρόσδεκτα.

**`dashboard.overview.healthScore.buildingMomentum`**

> EN — Building momentum

Χτίζεις φόρα

**`dashboard.overview.healthScore.excellentConsistency`**

> EN — Excellent consistency

Εξαιρετική συνέπεια

**`dashboard.overview.healthScore.justStarting`**

> EN — Just getting started

Μόλις ξεκινάς

**`dashboard.overview.healthScore.strongProgress`**

> EN — Strong progress

Ισχυρή πρόοδος

**`dashboard.overview.healthScore.suggestion.consistency`**

> EN — Try logging something every day this week.

Δοκίμασε να καταγράφεις κάτι κάθε μέρα αυτή την εβδομάδα.

**`dashboard.overview.healthScore.suggestion.coverage`**

> EN — Try exploring a module you haven't used yet.

Δοκίμασε να εξερευνήσεις μια ενότητα που δεν έχεις χρησιμοποιήσει ακόμα.

**`dashboard.overview.healthScore.suggestion.missionSteps`**

> EN — Complete a plan step to keep your momentum going.

Ολοκλήρωσε ένα βήμα του σχεδίου για να διατηρήσεις τη φόρα σου.

**`dashboard.overview.healthScore.title`**

> EN — Business Health Score

Σκορ Υγείας Επιχείρησης

**`dashboard.overview.next.title`**

> EN — Next

Επόμενο

**`dashboard.overview.nextAction.continueMission`**

> EN — Continue: {step} from your "{goal}" plan

Συνέχισε: {step} από το σχέδιο "{goal}"

**`dashboard.overview.nextAction.cta`**

> EN — Go there →

Πήγαινε →

**`dashboard.overview.setupProgress.count`**

> EN — {done} of {total} steps

{done} από {total} βήματα

**`dashboard.overview.setupProgress.steps.firstEntry`**

> EN — Log your first entry

Κάνε την πρώτη σου καταχώρηση

**`dashboard.overview.setupProgress.steps.mission`**

> EN — Set a goal

Όρισε έναν στόχο

**`dashboard.overview.setupProgress.steps.onboarding`**

> EN — Finish the welcome questions

Ολοκλήρωσε τις ερωτήσεις υποδοχής

**`dashboard.overview.setupProgress.steps.secondModule`**

> EN — Log something in a second area

Καταχώρησε κάτι σε δεύτερη περιοχή

**`dashboard.overview.setupProgress.title`**

> EN — Setup progress

Πρόοδος ρύθμισης

**`dashboard.overview.statRow.creditsExplain`**

> EN — What is left of this month's allowance for AI work.

Ό,τι απομένει από το μηνιαίο σου όριο για δουλειά με AI.

**`dashboard.overview.statRow.creditsRemaining`**

> EN — Credits Remaining

Credits που Απομένουν

**`dashboard.overview.statRow.fillsAfter`**

> EN — Fills in after {count} entries

Γεμίζει μετά από {count} καταχωρήσεις

**`dashboard.overview.statRow.fromEntries`**

> EN — {count, plural, one {from # entry} other {from # entries}}

{count, plural, one {από # καταχώρηση} other {από # καταχωρήσεις}}

**`dashboard.overview.statRow.mostActive`**

> EN — Most Active

Πιο Ενεργό

**`dashboard.overview.statRow.ofTotal`**

> EN — {count, plural, one {of # in total} other {of # in total}}

{count, plural, one {από # συνολικά} other {από # συνολικά}}

**`dashboard.overview.statRow.openCredits`**

> EN — See the ledger →

Δες το ιστορικό →

**`dashboard.overview.statRow.openEntries`**

> EN — See the entries →

Δες τις καταχωρήσεις →

**`dashboard.overview.statRow.thisWeek`**

> EN — This Week

Αυτή την Εβδομάδα

**`dashboard.overview.statRow.totalEntries`**

> EN — Total Entries

Σύνολο Εγγραφών

**`dashboard.overview.statRow.totalEntriesExplain`**

> EN — Everything you have logged, in every module, since you started.

Ό,τι έχεις καταχωρήσει, σε κάθε ενότητα, από την αρχή.

**`dashboard.overview.whatChanged.entries`**

> EN — new entries

νέες καταχωρήσεις

**`dashboard.overview.whatChanged.insights`**

> EN — new insights

νέες παρατηρήσεις

**`dashboard.overview.whatChanged.since`**

> EN — since {when}

από {when}

**`dashboard.overview.whatChanged.title`**

> EN — What changed

Τι άλλαξε

**`errors.boundary.section`**

> EN — This section could not be displayed.

Αυτή η ενότητα δεν εμφανίστηκε.

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

Η υπόλοιπη σελίδα δεν επηρεάζεται. Μια ανανέωση συνήθως το φτιάχνει.

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

Αυτό ήταν ερώτηση, οπότε δεν καταγράφηκε τίποτα.

**`dashboard.create.answerItInstead`**

> EN — Answer it

Απάντησέ το

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

Συνέχισε στο Chat

**`dashboard.create.loggedTo`**

> EN — Logged to:

Καταγράφηκε στο:

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

Κατέγραψέ το ούτως ή άλλως

**`dashboard.create.title`**

> EN — Create Anything

Δημιουργία Οτιδήποτε

**`dashboard.create.viewModule`**

> EN — View {module} →

Άνοιγμα: {module} →

**`dashboard.createAnything.attachImage`**

> EN — Attach image

Επισύναψη εικόνας

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

Η απάντησή σου...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

Συνέχεια

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

Παράλειψη, καταγράψτε το ούτως ή άλλως

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

Δύο γρήγορες ερωτήσεις:

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

Περίγραψε την ιδέα σου αναλυτικά...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

Αφαίρεση εικόνας

**`dashboard.createAnything.send`**

> EN — Send

Αποστολή

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

Δεν ήταν δυνατή η μεταφόρτωση μίας ή περισσότερων εικόνων.

**`dashboard.energyCheckIn.change`**

> EN — Change

Άλλαξε

**`dashboard.energyCheckIn.checkedInToday`**

> EN — Today's energy: {level}/5.

Σημερινή ενέργεια: {level}/5.

**`dashboard.energyCheckIn.levelLabel`**

> EN — Energy level {level}

Επίπεδο ενέργειας {level}

**`dashboard.energyCheckIn.logged`**

> EN — Energy logged

Η ενέργεια καταγράφηκε

**`dashboard.energyCheckIn.notePlaceholder`**

> EN — Optional note...

Προαιρετική σημείωση...

**`dashboard.energyCheckIn.prompt`**

> EN — How's your energy today?

Πώς είναι η ενέργειά σου σήμερα;

**`dashboard.energyCheckIn.scaleHigh`**

> EN — 5 = great

5 = τέλεια

**`dashboard.energyCheckIn.scaleLow`**

> EN — 1 = exhausted

1 = εξαντλημένος

**`dashboard.energyCheckIn.title`**

> EN — Energy Check-In

Έλεγχος Ενέργειας

**`dashboard.firstScreen.build.example`**

> EN — Build a website for my shop

Φτιάξε site για το μαγαζί μου

**`dashboard.firstScreen.build.verb`**

> EN — Build

Φτιάξε

**`dashboard.firstScreen.cost.charged`**

> EN — Uses credits

Χρεώνει credits

**`dashboard.firstScreen.cost.free`**

> EN — Free

Δωρεάν

**`dashboard.firstScreen.cost.freeAllowance`**

> EN — Free up to your monthly limit

Δωρεάν μέχρι το μηνιαίο όριο

**`dashboard.firstScreen.label`**

> EN — Press one — it runs right away

Πάτα ένα — τρέχει αμέσως

**`dashboard.firstScreen.repeat.example`**

> EN — Every Monday, a summary of my sales

Κάθε Δευτέρα, σύνοψη των πωλήσεών μου

**`dashboard.firstScreen.repeat.verb`**

> EN — Repeat

Επανάλαβε

**`dashboard.firstScreen.understand.example`**

> EN — What do my numbers say this week?

Τι δείχνουν τα νούμερά μου αυτή τη βδομάδα;

**`dashboard.firstScreen.understand.verb`**

> EN — Understand

Κατάλαβε

**`dashboard.overview.recentEntries.empty`**

> EN — No entries yet.

Καμία καταχώρηση ακόμα.

**`dashboard.overview.recentEntries.title`**

> EN — Recent Entries

Πρόσφατες Καταχωρήσεις

**`errors.creditHistory`**

> EN — See credit history

Δες το ιστορικό credits

**`errors.retry`**

> EN — Try again

Δοκίμασε ξανά

**`sampleData.load`**

> EN — See it with sample data

Δες το με δείγμα δεδομένων

**`sampleData.loadFailed`**

> EN — That did not work. Try again.

Δεν πέτυχε. Δοκίμασε ξανά.

**`sampleData.loading`**

> EN — Loading…

Φορτώνει…

## Tier 3 — Further in — only if you have time (198)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

Κλείσιμο

**`common.readMore`**

> EN — Read more

Διάβασε περισσότερα

**`common.whatIsThisPage`**

> EN — What is this page?

Τι είναι αυτή η σελίδα;

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

από {count, plural, one {# καταχώρησή σου} other {# καταχωρήσεις σου}}

**`dashboard.insights.checkIt`**

> EN — Check it yourself

Δες το ο ίδιος

**`dashboard.insights.dismiss`**

> EN — Dismiss this

Απόρριψη

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

Δεν μπόρεσε να απορριφθεί.

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

Κρύψε τους αριθμούς

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

Δείξε τους αριθμούς

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

Απόρριψη

**`common.noNotifications`**

> EN — No new notifications.

Δεν υπάρχουν νέες ειδοποιήσεις.

**`common.notifications`**

> EN — Notifications

Ειδοποιήσεις

**`common.switchToDarkMode`**

> EN — Switch to dark mode

Εναλλαγή σε σκούρο θέμα

**`common.switchToLightMode`**

> EN — Switch to light mode

Εναλλαγή σε ανοιχτό θέμα

**`common.toggleMenu`**

> EN — Toggle menu

Εναλλαγή μενού

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

κάνε ανεφοδιασμό τώρα για να μη διακοπείς.

**`credits.low.none`**

> EN — No credits left this month

Δεν απομένουν credits αυτόν τον μήνα

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

{count, plural, one {# credit απομένει} other {# credits απομένουν}} αυτόν τον μήνα

**`credits.low.topUp`**

> EN — Top up

Ανεφοδιασμός

**`language.label`**

> EN — Language

Γλώσσα

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

Δεν αποθηκεύτηκε η γλώσσα — δεν άλλαξε τίποτα.

**`pwa.install`**

> EN — Install

Εγκατάσταση

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

Βάλ' το στην αρχική οθόνη — πλήρης οθόνη και ειδοποιήσεις που φτάνουν πραγματικά.

**`pwa.installTitle`**

> EN — Install Ionexa

Εγκατάσταση του Ionexa

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

Το Safari δεν το προτείνει ποτέ μόνο του — χρειάζεται τρία πατήματα.

**`pwa.iosGotIt`**

> EN — Got it

Κατάλαβα

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

Πάτα το κουμπί Κοινή χρήση στη γραμμή του Safari

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

Κύλησε κάτω και πάτα «Πρόσθεση στην αρχική οθόνη»

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

Πάτα Πρόσθεση — το Ionexa εμφανίζεται με τις άλλες εφαρμογές

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

Προσθήκη του Ionexa στην αρχική οθόνη

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

Μέχρι να το κάνεις, το iPhone δεν μπορεί να σου στέλνει ειδοποιήσεις και το Safari ίσως σβήσει τα αποθηκευμένα δεδομένα μετά από 7 ημέρες χωρίς χρήση.

**`pwa.notNow`**

> EN — Not now

Όχι τώρα

**`pwa.showHow`**

> EN — Show me how

Δείξε μου πώς

### first result

**`common.cancel`**

> EN — Cancel

Ακύρωση

**`common.created`**

> EN — ✓ created

✓ δημιουργήθηκε

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

Απόρριψη πρότασης

**`common.error`**

> EN — error

σφάλμα

**`common.notAuthenticated`**

> EN — Not authenticated.

Δεν έχεις συνδεθεί.

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

Αγορά credits

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

Αυτή η ενέργεια χρειάζεται περισσότερα credits από όσα σου απομένουν. Αγόρασε ένα pack ή αναβάθμισε το πλάνο σου για να συνεχίσεις.

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

Σου απομένουν {available} credits και αυτό χρειάζεται περίπου {needed}. Αγόρασε ένα pack ή αναβάθμισε το πλάνο σου για να συνεχίσεις.

**`credits.outOfCredits.title`**

> EN — You're out of credits

Εξαντλήθηκαν τα credits σου

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

Αναβάθμιση πλάνου

**`dashboard.goal.change`**

> EN — Change something

Άλλαξε κάτι

**`dashboard.goal.confirm`**

> EN — Yes, do it

Ναι, κάν' το

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

{credits, plural, one {# credit} other {# credits}} όταν πατήσεις το κουμπί εκεί. Τώρα δεν χρεώνεται τίποτα.

**`dashboard.goal.dismiss`**

> EN — Never mind

Άσ' το

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

Δεν χρεώνεται τίποτα τώρα, ούτε με την άφιξη εκεί.

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

Πες μου λίγο περισσότερα, για να πάει στο σωστό σημείο.

**`dashboard.goal.which`**

> EN — Which one do you mean?

Ποιο από τα δύο εννοείς;

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

Αυτό πάει στο {destination}, με αυτό που έγραψες.

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

Ανταγωνιστές

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

γνωστοί ανταγωνιστές

**`dashboard.ideas.customerLabel`**

> EN — Customer

Πελάτης

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

ο πελάτης-στόχος

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

Νέα υπηρεσία για μικρές επιχειρήσεις

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

Κάθε ιδέα, σε ένα μέρος

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

Γράψ' την όσο είναι ακόμα ακατέργαστη — εδώ βαθμολογείται, συγκρίνεται με τις υπόλοιπες και μένει καταγεγραμμένη ακόμα κι αν την απορρίψεις.

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

Μέγεθος αγοράς

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

π.χ. TAM 2 δισ. $

**`dashboard.ideas.mvpLabel`**

> EN — MVP

Πρώτη λειτουργική έκδοση

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

πώς μοιάζει η πρώτη έκδοση;

**`dashboard.ideas.nameLabel`**

> EN — Name

Όνομα

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

όνομα ιδέας

**`dashboard.ideas.new`**

> EN — New Idea

Νέα ιδέα

**`dashboard.ideas.problemLabel`**

> EN — Problem

Πρόβλημα

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

ποιο πρόβλημα λύνει;

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

Βαθμολογία (0-100)

**`dashboard.ideas.scorePlaceholder`**

> EN — score

βαθμολογία

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

Ετυμηγορία

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

π.χ. προχωράμε / ακύρωση / παρακολούθηση

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

Ανανέωσε τη σελίδα για να δεις την τρέχουσα εκδοχή και ξανακάνε την αλλαγή σου.

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

Κάποιος — ή μια άλλη καρτέλα — το άλλαξε ενώ δούλευες πάνω του.

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

Χώρισέ το ή ανέβασε μια μικρότερη εκδοχή.

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

Αυτό το αρχείο είναι πολύ μεγάλο.

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

Άνοιξε Ρυθμίσεις › Χρέωση για να δεις ποιο πλάνο το καλύπτει.

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

Το πλάνο σου δεν το περιλαμβάνει αυτό.

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

Αγόρασε credits από τις Ρυθμίσεις ή περίμενε τη μηνιαία ανανέωση.

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

Δεν έχεις αρκετά credits γι' αυτό.

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

Έλεγξε τα πεδία που επισημαίνονται και στείλ' το ξανά.

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

Κάτι στη φόρμα δεν έγινε δεκτό.

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

Συνδέσου ξανά και επανάλαβε την ενέργεια — δεν χάθηκε τίποτα από όσα έγραψες.

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

Έχεις αποσυνδεθεί.

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

Μάλλον διαγράφηκε. Γύρνα στη λίστα και διάλεξε άλλο.

**`errors.codes.notFound.what`**

> EN — This no longer exists.

Αυτό δεν υπάρχει πια.

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

Η συσκευή σου δεν μπόρεσε να μας βρει.

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

Διάγραψε κάτι που δεν χρειάζεσαι ή αναβάθμισε από Ρυθμίσεις › Χρέωση.

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

Έφτασες στο όριο του πλάνου σου.

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

Περίμενε περίπου ένα λεπτό και δοκίμασε άλλη μία φορά.

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

Πολλά αιτήματα σε μικρό διάστημα.

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

Καταγράφηκε. Δοκίμασε ξανά σε λίγο και επικοινώνησε με την υποστήριξη αν συνεχιστεί.

**`errors.codes.serverError.what`**

> EN — This broke on our side.

Κάτι έσπασε από τη δική μας πλευρά.

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

Δοκίμασε ξανά και επικοινώνησε με την υποστήριξη αν συμβεί δεύτερη φορά.

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

Αυτή η ενέργεια δεν ολοκληρώθηκε.

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

Μετέτρεψέ το σε PDF, DOCX, CSV ή TXT και ανέβασέ το ξανά.

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

Αυτός ο τύπος αρχείου δεν υποστηρίζεται.

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

Είναι δικό μας θέμα και συνήθως αποκαθίσταται μέσα σε λίγα λεπτά.

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

Η υπηρεσία AI δεν αποκρίνεται αυτή τη στιγμή.

**`errors.credits.charged`**

> EN — This attempt used credits.

Αυτή η προσπάθεια κατανάλωσε credits.

**`errors.credits.notCharged`**

> EN — You were not charged.

Δεν χρεώθηκες.

**`errors.credits.refunded`**

> EN — Your credits were returned.

Τα credits σου επιστράφηκαν.

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

Δεν μπορούμε να επιβεβαιώσουμε από εδώ αν χρεώθηκε.

**`module.exportCsv`**

> EN — Export CSV

Εξαγωγή CSV

**`module.noMatches`**

> EN — No matches for “{query}”

Δεν βρέθηκαν αποτελέσματα για «{query}»

**`module.save`**

> EN — Save

Αποθήκευση

**`module.saving`**

> EN — Saving...

Αποθήκευση...

**`module.searchPlaceholder`**

> EN — Search...

Αναζήτηση...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

{credits, plural, one {# credit} other {# credits}} ανά λεπτό ομιλίας

**`voice.draft.discard`**

> EN — Discard

Απόρριψη

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

Δεν έχει σταλεί τίποτα. Διόρθωσε το κείμενο και στείλ' το εσύ.

**`voice.draft.title`**

> EN — What was heard

Τι ακούστηκε

**`voice.draft.use`**

> EN — Use this text

Χρησιμοποίησέ το

**`voice.errors.bad_request`**

> EN — That request could not be read.

Αυτό το αίτημα δεν διαβάστηκε.

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

Η υπηρεσία είναι πολύ απασχολημένη αυτή τη στιγμή. Δοκίμασε σε λίγο.

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

Δεν δόθηκε άδεια για το μικρόφωνο. Μπορείς πάντα να γράψεις.

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

Δεν ακούστηκε τίποτα σε αυτή την ηχογράφηση.

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

Η φωνή δεν είναι διαθέσιμη αυτή τη στιγμή. Μπορείς πάντα να γράψεις.

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

Δεν υπάρχουν αρκετά credits.

**`voice.errors.no_recording`**

> EN — No recording was sent.

Δεν στάλθηκε ηχογράφηση.

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

Δεν ηχογραφήθηκε τίποτα.

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

Η φωνή δεν είναι ρυθμισμένη σε αυτή την εγκατάσταση.

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

Η φωνή δεν περιλαμβάνεται στο πλάνο σου.

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

Τα λεπτά φωνής αυτού του μήνα εξαντλήθηκαν.

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

Δεν ήταν δυνατή η επικοινωνία με την υπηρεσία φωνής.

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

Πάρα πολλές ηχογραφήσεις την τελευταία ώρα. Δοκίμασε σε λίγο.

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

Δεν ήταν δυνατή η δέσμευση credits γι' αυτό.

**`voice.errors.too_large`**

> EN — That recording is too long.

Αυτή η ηχογράφηση είναι πολύ μεγάλη.

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

Έχεις αποσυνδεθεί. Συνδέσου και ξαναδοκίμασε.

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

Αυτός ο browser δεν μπορεί να ηχογραφήσει. Μπορείς πάντα να γράψεις.

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

Αυτή η μορφή ήχου δεν υποστηρίζεται.

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

Δεν ήταν δυνατός ο έλεγχος των λεπτών φωνής αυτή τη στιγμή.

**`voice.listening`**

> EN — Listening

Ακούει

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

Μίλα και μετά πάτα Σταμάτα. Τίποτα δεν στέλνεται πριν το διαβάσεις.

**`voice.outOfMinutes`**

> EN — No voice minutes left this month

Δεν έμειναν λεπτά φωνής αυτόν τον μήνα

**`voice.permission.allow`**

> EN — Open the microphone

Άνοιξε το μικρόφωνο

**`voice.permission.cancel`**

> EN — Not now

Όχι τώρα

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

{credits, plural, one {# credit} other {# credits}} ανά λεπτό, {minutes, plural, one {# λεπτό} other {# λεπτά}} τον μήνα στο πλάνο σου.

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

Διαβάζεις και διορθώνεις το κείμενο πριν σταλεί οτιδήποτε.

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

Ο ήχος στέλνεται για μεταγραφή και δεν αποθηκεύεται πουθενά — ούτε από εμάς, ούτε μετά.

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

Η εγγραφή ξεκινάει μόνο όταν πατήσεις και σταματάει όταν ξαναπατήσεις.

**`voice.permission.title`**

> EN — Before the microphone opens

Πριν ανοίξει το μικρόφωνο

**`voice.settings.notConfigured`**

> EN — Voice is not set up on this deployment, so the microphone and Listen buttons do not appear.

Η φωνή δεν είναι ρυθμισμένη σε αυτή την εγκατάσταση, οπότε το μικρόφωνο και το «Άκου» δεν εμφανίζονται.

**`voice.settings.notIncluded`**

> EN — Voice is not included on your plan. Everything here can still be typed and read.

Η φωνή δεν περιλαμβάνεται στο πλάνο σου. Όλα εδώ γράφονται και διαβάζονται κανονικά.

**`voice.startListening`**

> EN — Speak instead of typing

Μίλα αντί να γράφεις

**`voice.stopListening`**

> EN — Stop

Σταμάτα

**`common.nextPage`**

> EN — Next page

Επόμενη σελίδα

**`common.paginationNext`**

> EN — Next

Επόμ.

**`common.paginationPage`**

> EN — Page {page} / {total}

Σελίδα {page} / {total}

**`common.paginationPrev`**

> EN — Prev

Προηγ.

**`common.previousPage`**

> EN — Previous page

Προηγούμενη σελίδα

**`common.updated`**

> EN — ✓ updated

✓ ενημερώθηκε

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

Ανταγωνιστές:

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

για: {customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

Μέγεθος αγοράς:

**`dashboard.ideas.cardMvp`**

> EN — MVP:

Πρώτη λειτουργική έκδοση:

**`dashboard.ideas.cardProblem`**

> EN — Problem:

Πρόβλημα:

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

Βαθμολογία: {score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

Να διαγραφεί αυτή η ιδέα; Η ενέργεια δεν αναιρείται.

**`dashboard.ideas.edit`**

> EN — Edit Idea

Επεξεργασία ιδέας

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

Επεξεργασία ιδέας: {name}

**`entityLinks.linked`**

> EN — Linked

Συνδέθηκε

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

Ίσως σχετίζεται με: {titles}. Να τα συνδέσω;

**`entityLinks.no`**

> EN — No

Όχι

**`entityLinks.yes`**

> EN — Yes

Ναι

**`module.edit`**

> EN — Edit

Επεξεργασία

**`module.loggedAt`**

> EN — Logged {when}

Καταγράφηκε {when}

**`module.sort.label`**

> EN — Sort:

Ταξινόμηση:

**`askAi.buttonLabel`**

> EN — Ask AI

Ρώτα το AI

**`common.networkError`**

> EN — Network error — please try again.

Σφάλμα δικτύου — δοκίμασε ξανά.

**`common.textActions.accept`**

> EN — Accept

Κράτησέ το

**`common.textActions.reject`**

> EN — Reject

Άφησέ το

**`entityLinks.buttonLabel`**

> EN — Link to...

Σύνδεση με...

**`entityLinks.linkedToLabel`**

> EN — Linked to:

Συνδεδεμένο με:

**`entityLinks.unlink`**

> EN — Unlink

Αποσύνδεση

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

Αποσύνδεση: {name}

**`favorites.add`**

> EN — Add to favorites

Προσθήκη στα αγαπημένα

**`favorites.remove`**

> EN — Remove from favorites

Αφαίρεση από τα αγαπημένα

**`module.delete`**

> EN — Delete

Διαγραφή

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

Να διαγραφεί αυτό το {label}; Η ενέργεια δεν αναιρείται.

**`module.deleted`**

> EN — Deleted

Διαγράφηκε

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

Διάβασε επίσης {count, plural, one {# παλιό μήνυμα} other {# παλιά μηνύματα}} για αυτή την καταχώρηση

**`askAi.close`**

> EN — Close

Κλείσιμο

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

Κάνε μια ερώτηση για αυτή την εγγραφή — δεν χρειάζεται να εξηγήσεις το context, το AI το ξέρει ήδη.

**`askAi.placeholder`**

> EN — Ask anything about this entry...

Ρώτα οτιδήποτε για αυτή την εγγραφή...

**`askAi.send`**

> EN — Send

Αποστολή

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

Η σύνδεση διακόπηκε πριν ολοκληρωθεί η απάντηση.

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

Η σύνδεση διακόπηκε — η παραπάνω απάντηση μπορεί να είναι ημιτελής.

**`askAi.title`**

> EN — Ask AI about this {title}

Ρώτα το AI για αυτό το {title}

**`common.errorWithMessage`**

> EN — error: {message}

σφάλμα: {message}

**`common.linked`**

> EN — ✓ linked

✓ συνδέθηκε

**`common.newMessagesBelow`**

> EN — New message below

Νέο μήνυμα παρακάτω

**`entityLinks.modalTitle`**

> EN — Link to...

Σύνδεση με...

**`entityLinks.noMatches`**

> EN — No matches.

Δεν βρέθηκαν αποτελέσματα.

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

Σε ποια ενότητα θέλεις να συνδέσεις;

**`entityLinks.searching`**

> EN — Searching...

Αναζήτηση...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

Αναζήτηση σε {module}...

**`aiSteps.counter`**

> EN — ({step}/{total})

({step}/{total})
