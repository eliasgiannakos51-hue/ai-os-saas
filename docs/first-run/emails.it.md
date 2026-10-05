# The emails — it

Every line of every email the product sends: **115 strings**. The interface has its own pack, `first-run.it.md`, beside this one.

**Start with tier 1. It is 41 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 48 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (41)

_From the emails a person is sure or likely to receive, 5 words or more._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.subject`**

> EN — Confirm your email for Ionexa AI

Conferma la tua email per Ionexa AI

**`email.confirm.preheader`**

> EN — One click and your account is ready.

Un clic e il tuo account è pronto.

**`email.confirm.body`**

> EN — Press the button to confirm this address and open your Ionexa AI account.

Premi il pulsante per confermare questo indirizzo e aprire il tuo account Ionexa AI.

**`email.confirm.ignore`**

> EN — If you did not create this account, ignore this email: nothing happens without the link.

Se non hai creato tu questo account, ignora questa email: senza il link non succede nulla.

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

Il tuo account è pronto — nessuna conferma via e-mail necessaria, puoi accedere subito. Ionexa AI è composto da 13 moduli per gestire una startup, più un campo di testo libero che archivia quello che scrivi nel modulo giusto.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

Suggerimento: su {path} puoi semplicemente descrivere cosa è successo con parole tue e finirà automaticamente nel modulo giusto.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

Il tuo account Ionexa AI è pronto.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

nuovo accesso al tuo account

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

Abbiamo rilevato un accesso al tuo account Ionexa AI da un dispositivo o browser che non avevamo mai visto.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

Se sei stato tu, non devi fare nulla. Se non riconosci questo accesso, cambia subito la password.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

Nuovo accesso al tuo account Ionexa AI da {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

Questa generazione va avanti da più di 24 ore senza finire: non è normale, ed è probabile che sia bloccata invece che ancora al lavoro. Non è stato addebitato alcun credito. Aprila qui sotto per riprovare o eliminarla.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}” è bloccato in generazione da più di 24 ore.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

“{name}” sembra bloccato — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

la tua attività programmata è terminata

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

la tua attività programmata non è riuscita a partire

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

La tua attività programmata “{step}” è terminata.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

La tua attività programmata “{step}” non è riuscita a partire.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

La tua attività programmata è terminata — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

La tua attività programmata non è riuscita a partire — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

Crediti insufficienti: ricarica o passa a un piano superiore, poi riprogrammala.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

Crediti insufficienti: ricarica o passa a un piano superiore. Questa automazione riproverà al prossimo ciclo.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

“{name}” è stato spento

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

Ha fallito {count} volte di fila, quindi ha smesso di girare invece di continuare a fallire e a costarti crediti.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

Aprilo qui sotto per controllare l’attività e riaccenderlo.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

“{name}” si è fermato dopo {count} fallimenti.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

“{name}” è stato spento — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

Non è riuscito a girare perché il tuo account ha finito i crediti. Non è stato addebitato nulla e non è andato perso nulla: ricarica o passa a un piano superiore e riaccendilo, e riprende il suo ritmo abituale.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}” è in pausa: il tuo account ha finito i crediti.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}” è in pausa — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

il tuo abbonamento sta per terminare

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Manterrai l'accesso completo fino al {date}. Fino ad allora non cambia nulla: i crediti che ti restano sono ancora utilizzabili e nessuno dei tuoi dati viene eliminato.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Manterrai l'accesso completo fino alla fine del periodo che hai già pagato. Fino ad allora non cambia nulla: i crediti che ti restano sono ancora utilizzabili e nessuno dei tuoi dati viene eliminato.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

Dopodiché l'account passa al piano gratuito. Le tue voci, i file e le conversazioni restano esattamente dove sono.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

Hai cambiato idea? Ripristinalo

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

Puoi ripristinare l'abbonamento in qualsiasi momento prima della scadenza, senza costi aggiuntivi: questo periodo è già pagato.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

Il tuo abbonamento Ionexa AI termina il {date}. Fino ad allora mantieni l'accesso.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

Il tuo abbonamento Ionexa AI sta per terminare. Mantieni l'accesso fino alla fine del periodo pagato.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Abbiamo ricevuto una richiesta di eliminazione definitiva del tuo account Ionexa AI e di tutte le registrazioni in ogni modulo. L'operazione non è reversibile.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

Questo link scade tra 1 ora. Se non sei stato tu a richiederlo, ignora questa e-mail: il tuo account resterà esattamente com'è.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Conferma l'eliminazione definitiva del tuo account Ionexa AI.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

la tua settimana su Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} esecuzione dell’agente, {found} con un risultato

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} esecuzioni degli agenti, {found} con un risultato

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} credito speso (la tua media: {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} crediti spesi (la tua media: {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} contatto senza seguito registrato

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} contatti senza seguito registrato

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

la spesa è {percent}% sopra la tua media

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

la spesa è {percent}% sotto la tua media

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

il traffico del sito è salito del {percent}%

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

il traffico del sito è sceso del {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

Qualcuno ti ha contattato tramite “{name}”

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

Nuovo invio dal modulo su “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

Raccogli e valuta nuove idee di prodotto o di business.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

Segui i prodotti rivali, i prezzi e il posizionamento.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

Appunti e sintesi di tutto ciò che stai studiando.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

Argomenti che stai studiando, con risorse e quiz.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

Registro operazioni — simbolo, direzione, esito, profitti e perdite.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

Valuta le opzioni e annota la raccomandazione.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

Piani di prodotto — prezzi, roadmap, piano di lancio.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

Idee di contenuto, didascalie e thread.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

Contatti, e-mail di primo approccio e passi successivi.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

Feedback degli utenti, ordinati per tono e priorità.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

Qualsiasi metrica che valga la pena seguire nel tempo.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

Flussi che vale la pena automatizzare, e il tempo risparmiato.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

Ricevi questo messaggio perché hai un account Ionexa AI.

## Tier 3 — Subjects, labels and the footer — skim (48)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.label`**

> EN — confirm your email

conferma email

**`email.confirm.title`**

> EN — Confirm it's you

Conferma che sei tu

**`email.confirm.button`**

> EN — Confirm email

Conferma email

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.label`**

> EN — signup

registrazione

**`email.welcome.title`**

> EN — welcome to Ionexa AI

benvenuto su Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

sicurezza

**`email.newDevice.when`**

> EN — When

Quando

**`email.newDevice.device`**

> EN — Device

Dispositivo

**`email.newDevice.ip`**

> EN — IP address

Indirizzo IP

**`email.newDevice.cta`**

> EN — Reset password

Cambia password

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

creatore di siti

**`email.stuck.title`**

> EN — “{name}” seems stuck

“{name}” sembra bloccato

**`email.stuck.cta`**

> EN — Open Website Builder

Apri il creatore di siti

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

esecuzione programmata dell’agente

**`email.scheduledRun.cta`**

> EN — Open {name}

Apri {name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

il tuo agente

**`email.agent.resultCta`**

> EN — Manage your agents

Gestisci i tuoi agenti

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — il tuo risultato programmato.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

Ultimo errore: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

Apri i tuoi agenti

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}” è in pausa

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

Ricarica crediti

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

Apri i tuoi agenti

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

abbonamento

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

eliminazione account

**`email.deletion.title`**

> EN — confirm account deletion

conferma l'eliminazione dell'account

**`email.deletion.cta`**

> EN — Confirm deletion

Conferma eliminazione

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

riepilogo

**`email.digest.title`**

> EN — this week

questa settimana

**`email.digest.noticed`**

> EN — what I noticed

cosa ho notato

**`email.digest.cta`**

> EN — Open your dashboard

Apri la tua dashboard

**`email.digest.subject`**

> EN — this week: {first}

questa settimana: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} nuova voce

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} nuove voci

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

il tuo sito: {count} visita

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

il tuo sito: {count} visite

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} credito speso

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} crediti spesi

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} esecuzione dell’agente è fallita

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} esecuzioni degli agenti sono fallite

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

nuovo invio dal modulo

**`email.formSubmission.cta`**

> EN — View your websites

Guarda i tuoi siti

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

Nuovo invio dal modulo su {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

Interesse probabilmente autentico

**`email.formSubmission.badges.question`**

> EN — General question

Domanda generica

**`email.formSubmission.badges.spam`**

> EN — Possible spam

Possibile spam

**`email.formSubmission.badges.unclear`**

> EN — Unclear

Poco chiaro

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

Registra entrate e uscite.
