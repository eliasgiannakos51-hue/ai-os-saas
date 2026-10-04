# The emails — el

Every line of every email the product sends: **108 strings**. The interface has its own pack, `first-run.el.md`, beside this one.

**Start with tier 1. It is 37 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 45 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (37)

_From the emails a person is sure or likely to receive, 5 words or more._

### welcome — every account gets it, minutes after signing up

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

Ο λογαριασμός σου είναι έτοιμος — δεν χρειάζεται επιβεβαίωση email, μπορείς να συνδεθείς αμέσως. Το Ionexa AI είναι 13 ενότητες για να τρέχεις μια startup, συν ένα ελεύθερο πεδίο που αρχειοθετεί ό,τι γράφεις στη σωστή.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

Συμβουλή: στο {path} μπορείς απλώς να περιγράψεις τι έγινε με δικά σου λόγια και θα καταλήξει αυτόματα στη σωστή ενότητα.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

Ο λογαριασμός σου στο Ionexa AI είναι έτοιμος.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

νέα σύνδεση στον λογαριασμό σου

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

Εντοπίσαμε σύνδεση στον λογαριασμό σου στο Ionexa AI από συσκευή ή πρόγραμμα περιήγησης που δεν έχουμε ξαναδεί.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

Αν ήσουν εσύ, δεν χρειάζεται να κάνεις τίποτα. Αν δεν αναγνωρίζεις αυτή τη σύνδεση, άλλαξε αμέσως τον κωδικό σου.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

Νέα σύνδεση στον λογαριασμό σου στο Ionexa AI από {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

Αυτή η δημιουργία τρέχει πάνω από 24 ώρες χωρίς να ολοκληρωθεί — δεν είναι φυσιολογικό, και πιθανότατα έχει κολλήσει αντί να δουλεύει ακόμη. Δεν χρεώθηκαν credits γι’ αυτήν. Άνοιξέ την παρακάτω για να δοκιμάσεις ξανά ή να τη διαγράψεις.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

Το “{name}” έχει κολλήσει σε δημιουργία πάνω από 24 ώρες.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

Το “{name}” φαίνεται κολλημένο — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

η προγραμματισμένη εργασία σου ολοκληρώθηκε

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

η προγραμματισμένη εργασία σου δεν μπόρεσε να τρέξει

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

Η προγραμματισμένη εργασία σου “{step}” ολοκληρώθηκε.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

Η προγραμματισμένη εργασία σου “{step}” δεν μπόρεσε να τρέξει.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

Η προγραμματισμένη εργασία σου ολοκληρώθηκε — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

Η προγραμματισμένη εργασία σου δεν μπόρεσε να τρέξει — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

Δεν υπάρχουν αρκετά credits — συμπλήρωσε ή αναβάθμισε το πλάνο σου και προγραμμάτισέ το ξανά.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

Δεν υπάρχουν αρκετά credits — συμπλήρωσε ή αναβάθμισε το πλάνο σου. Ο αυτοματισμός θα ξαναπροσπαθήσει τον επόμενο κύκλο.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

Ο πράκτορας “{name}” απενεργοποιήθηκε

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

Απέτυχε {count} φορές στη σειρά, οπότε σταμάτησε να τρέχει αντί να συνεχίσει να αποτυγχάνει και να σου κοστίζει credits.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

Άνοιξέ τον παρακάτω για να ελέγξεις την εργασία και να τον ενεργοποιήσεις ξανά.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

Ο πράκτορας “{name}” σταμάτησε μετά από {count} αποτυχίες.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

Ο πράκτορας “{name}” απενεργοποιήθηκε — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

Δεν μπόρεσε να τρέξει επειδή ο λογαριασμός σου έμεινε από credits. Δεν χρεώθηκε τίποτα και δεν χάθηκε τίποτα — συμπλήρωσε credits ή αναβάθμισε και ενεργοποίησέ τον ξανά, και συνεχίζει κανονικά το πρόγραμμά του.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

Ο πράκτορας “{name}” είναι σε παύση — ο λογαριασμός σου έμεινε από credits.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

Ο πράκτορας “{name}” είναι σε παύση — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

η συνδρομή σου έχει οριστεί να λήξει

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Διατηρείς πλήρη πρόσβαση μέχρι τις {date}. Μέχρι τότε δεν αλλάζει τίποτα — τα credits που σου μένουν παραμένουν διαθέσιμα και κανένα δεδομένο σου δεν διαγράφεται.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Διατηρείς πλήρη πρόσβαση μέχρι το τέλος της περιόδου που έχεις ήδη πληρώσει. Μέχρι τότε δεν αλλάζει τίποτα — τα credits που σου μένουν παραμένουν διαθέσιμα και κανένα δεδομένο σου δεν διαγράφεται.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

Μετά από αυτό ο λογαριασμός περνά στο δωρεάν πλάνο. Οι καταχωρήσεις, τα αρχεία και οι συνομιλίες σου μένουν ακριβώς εκεί που είναι.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

Άλλαξες γνώμη; Επανέφερέ την

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

Μπορείς να επαναφέρεις τη συνδρομή οποιαδήποτε στιγμή πριν λήξει, χωρίς επιπλέον χρέωση — έχεις ήδη πληρώσει γι' αυτή την περίοδο.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

Η συνδρομή σου στο Ionexa AI λήγει στις {date}. Διατηρείς πρόσβαση μέχρι τότε.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

Η συνδρομή σου στο Ionexa AI έχει οριστεί να λήξει. Διατηρείς πρόσβαση μέχρι να τελειώσει η περίοδος που πλήρωσες.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Λάβαμε αίτημα οριστικής διαγραφής του λογαριασμού σου στο Ionexa AI και κάθε εγγραφής σε όλες τις ενότητες. Αυτό δεν αναιρείται.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

Ο σύνδεσμος λήγει σε 1 ώρα. Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email και ο λογαριασμός σου θα μείνει ακριβώς όπως είναι.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Επιβεβαίωσε την οριστική διαγραφή του λογαριασμού σου στο Ionexa AI.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

η εβδομάδα σου στο Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} εκτέλεση πράκτορα, {found} με αποτέλεσμα

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} εκτελέσεις πρακτόρων, {found} με αποτέλεσμα

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} credit ξοδεύτηκε (μέσος όρος σου: {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} credits ξοδεύτηκαν (μέσος όρος σου: {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} επαφή χωρίς καταγεγραμμένη συνέχεια

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} επαφές χωρίς καταγεγραμμένη συνέχεια

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

τα έξοδα είναι {percent}% πάνω από τον μέσο όρο σου

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

τα έξοδα είναι {percent}% κάτω από τον μέσο όρο σου

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

η επισκεψιμότητα της ιστοσελίδας είναι {percent}% πάνω

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

η επισκεψιμότητα της ιστοσελίδας είναι {percent}% κάτω

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

Κάποιος επικοινώνησε μαζί σου μέσω του “{name}”

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

Νέα υποβολή φόρμας στο “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

Κατέγραψε και βαθμολόγησε νέες ιδέες προϊόντος ή επιχείρησης.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

Παρακολούθησε ανταγωνιστικά προϊόντα, τιμές και τοποθέτηση.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

Σημειώσεις και περιλήψεις από ό,τι ερευνάς.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

Θέματα που μελετάς, με πηγές και κουίζ.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

Ημερολόγιο συναλλαγών — σύμβολο, κατεύθυνση, αποτέλεσμα, κέρδος και ζημιά.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

Ζύγισε επιλογές και κατέγραψε τη σύσταση.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

Σχέδια προϊόντος — τιμολόγηση, οδικός χάρτης, πλάνο κυκλοφορίας.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

Ιδέες περιεχομένου, λεζάντες και σειρές αναρτήσεων.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

Υποψήφιοι πελάτες, email επικοινωνίας και επόμενα βήματα.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

Σχόλια χρηστών, ταξινομημένα κατά διάθεση και προτεραιότητα.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

Κάθε μέγεθος που αξίζει να παρακολουθείς στον χρόνο.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

Ροές που αξίζει να αυτοματοποιηθούν, και ο χρόνος που κερδίζεται.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

Λαμβάνεις αυτό το μήνυμα επειδή έχεις λογαριασμό στο Ionexa AI.

## Tier 3 — Subjects, labels and the footer — skim (45)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### welcome — every account gets it, minutes after signing up

**`email.welcome.label`**

> EN — signup

εγγραφή

**`email.welcome.title`**

> EN — welcome to Ionexa AI

καλώς ήρθες στο Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

ασφάλεια

**`email.newDevice.when`**

> EN — When

Πότε

**`email.newDevice.device`**

> EN — Device

Συσκευή

**`email.newDevice.ip`**

> EN — IP address

Διεύθυνση IP

**`email.newDevice.cta`**

> EN — Reset password

Αλλαγή κωδικού

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

δημιουργία ιστοσελίδων

**`email.stuck.title`**

> EN — “{name}” seems stuck

Το “{name}” φαίνεται κολλημένο

**`email.stuck.cta`**

> EN — Open Website Builder

Άνοιγμα του Website Builder

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

προγραμματισμένη εκτέλεση πράκτορα

**`email.scheduledRun.cta`**

> EN — Open {name}

Άνοιγμα: {name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

ο πράκτοράς σου

**`email.agent.resultCta`**

> EN — Manage your agents

Διαχείριση των πρακτόρων σου

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — το προγραμματισμένο αποτέλεσμά σου.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

Τελευταίο σφάλμα: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

Άνοιγμα των πρακτόρων σου

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

Ο πράκτορας “{name}” είναι σε παύση

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

Συμπλήρωση credits

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

Άνοιγμα των πρακτόρων σου

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

συνδρομή

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

διαγραφή λογαριασμού

**`email.deletion.title`**

> EN — confirm account deletion

επιβεβαίωση διαγραφής λογαριασμού

**`email.deletion.cta`**

> EN — Confirm deletion

Επιβεβαίωση διαγραφής

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

σύνοψη

**`email.digest.title`**

> EN — this week

αυτή η εβδομάδα

**`email.digest.noticed`**

> EN — what I noticed

τι πρόσεξα

**`email.digest.cta`**

> EN — Open your dashboard

Άνοιγμα του πίνακά σου

**`email.digest.subject`**

> EN — this week: {first}

αυτή η εβδομάδα: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} νέα καταχώρηση

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} νέες καταχωρήσεις

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

η ιστοσελίδα σου: {count} επίσκεψη

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

η ιστοσελίδα σου: {count} επισκέψεις

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} credit ξοδεύτηκε

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} credits ξοδεύτηκαν

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} εκτέλεση πράκτορα απέτυχε

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} εκτελέσεις πρακτόρων απέτυχαν

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

νέα υποβολή φόρμας

**`email.formSubmission.cta`**

> EN — View your websites

Δες τις ιστοσελίδες σου

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

Νέα υποβολή φόρμας στο {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

Μάλλον γνήσιο ενδιαφέρον

**`email.formSubmission.badges.question`**

> EN — General question

Γενική ερώτηση

**`email.formSubmission.badges.spam`**

> EN — Possible spam

Πιθανώς ανεπιθύμητο

**`email.formSubmission.badges.unclear`**

> EN — Unclear

Ασαφές

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

Κατέγραψε έσοδα και έξοδα.
