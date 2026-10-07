# The emails — de

Every line of every email the product sends: **115 strings**. The interface has its own pack, `first-run.de.md`, beside this one.

**Start with tier 1. It is 41 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 48 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (41)

_From the emails a person is sure or likely to receive, 5 words or more._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.subject`**

> EN — Confirm your email for Ionexa AI

Bestätige deine E-Mail für Ionexa AI

**`email.confirm.preheader`**

> EN — One click and your account is ready.

Ein Klick, und dein Konto ist bereit.

**`email.confirm.body`**

> EN — Press the button to confirm this address and open your Ionexa AI account.

Klicke auf die Schaltfläche, um diese Adresse zu bestätigen und dein Ionexa-AI-Konto zu öffnen.

**`email.confirm.ignore`**

> EN — If you did not create this account, ignore this email: nothing happens without the link.

Wenn du dieses Konto nicht erstellt hast, ignoriere diese E-Mail: Ohne den Link passiert nichts.

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

Dein Konto ist bereit — keine E-Mail-Bestätigung nötig, du kannst dich sofort anmelden. Ionexa AI besteht aus 13 Modulen für den Aufbau eines Start-ups, dazu ein freies Textfeld, das alles, was du schreibst, im richtigen Modul ablegt.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

Tipp: Unter {path} kannst du einfach in eigenen Worten beschreiben, was passiert ist — es landet automatisch im richtigen Modul.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

Dein Ionexa-AI-Konto ist bereit.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

neue Anmeldung bei deinem Konto

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

Wir haben eine Anmeldung bei deinem Ionexa-AI-Konto von einem Gerät oder Browser bemerkt, den wir noch nie gesehen haben.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

Wenn du das warst, musst du nichts tun. Falls du diese Anmeldung nicht kennst, ändere bitte sofort dein Passwort.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

Neue Anmeldung bei deinem Ionexa-AI-Konto von {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

Diese Erstellung läuft seit über 24 Stunden, ohne fertig zu werden — das ist nicht normal, und sie hängt vermutlich, statt noch zu arbeiten. Dafür wurden keine Credits berechnet. Öffne sie unten, um sie erneut zu starten oder zu löschen.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}” hängt seit über 24 Stunden in der Erstellung.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

“{name}” scheint zu hängen — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

deine geplante Aufgabe ist fertig

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

deine geplante Aufgabe konnte nicht laufen

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

Deine geplante Aufgabe “{step}” ist fertig.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

Deine geplante Aufgabe “{step}” konnte nicht laufen.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

Deine geplante Aufgabe ist fertig — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

Deine geplante Aufgabe konnte nicht laufen — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

Nicht genug Credits — lade auf oder wechsle den Tarif und plane die Aufgabe erneut.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

Nicht genug Credits — lade auf oder wechsle den Tarif. Diese Automatisierung versucht es im nächsten Zyklus erneut.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

“{name}” wurde abgeschaltet

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

Er ist {count} Mal hintereinander fehlgeschlagen und läuft deshalb nicht weiter, statt weiter fehlzuschlagen und dich Credits zu kosten.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

Öffne ihn unten, um die Aufgabe zu prüfen und ihn wieder einzuschalten.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

“{name}” hat nach {count} Fehlschlägen aufgehört zu laufen.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

“{name}” wurde abgeschaltet — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

Er konnte nicht laufen, weil dein Konto keine Credits mehr hat. Es wurde nichts berechnet und nichts ist verloren — lade auf oder wechsle den Tarif und schalte ihn wieder ein, dann nimmt er seinen normalen Zeitplan wieder auf.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}” pausiert — dein Konto hat keine Credits mehr.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}” pausiert — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

dein Abonnement läuft aus

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Du behältst den vollen Zugriff bis zum {date}. Bis dahin ändert sich nichts — deine übrigen Credits bleiben nutzbar und keine deiner Daten wird gelöscht.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Du behältst den vollen Zugriff bis zum Ende des bereits bezahlten Zeitraums. Bis dahin ändert sich nichts — deine übrigen Credits bleiben nutzbar und keine deiner Daten wird gelöscht.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

Danach wechselt das Konto in den kostenlosen Tarif. Deine Einträge, Dateien und Unterhaltungen bleiben genau dort, wo sie sind.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

Anders überlegt? Wieder aktivieren

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

Du kannst das Abonnement jederzeit vor dem Ende ohne Zusatzkosten wieder aktivieren — dieser Zeitraum ist bereits bezahlt.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

Dein Ionexa-AI-Abonnement endet am {date}. Bis dahin behältst du den Zugriff.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

Dein Ionexa-AI-Abonnement läuft aus. Du behältst den Zugriff bis zum Ende des bezahlten Zeitraums.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Wir haben eine Anfrage erhalten, dein Ionexa-AI-Konto und alle Einträge aus sämtlichen Modulen dauerhaft zu löschen. Das lässt sich nicht rückgängig machen.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

Dieser Link läuft in 1 Stunde ab. Falls du das nicht angefordert hast, ignoriere diese E-Mail — dein Konto bleibt genau so, wie es ist.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Bestätige die endgültige Löschung deines Ionexa-AI-Kontos.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

deine Woche bei Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} Agentenlauf, {found} mit Ergebnis

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} Agentenläufe, {found} mit Ergebnis

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} Credit ausgegeben (dein Schnitt: {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} Credits ausgegeben (dein Schnitt: {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} Kontakt ohne festgehaltene Nachfassung

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} Kontakte ohne festgehaltene Nachfassung

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

die Ausgaben liegen {percent}% über deinem Schnitt

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

die Ausgaben liegen {percent}% unter deinem Schnitt

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

der Website-Traffic ist um {percent}% gestiegen

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

der Website-Traffic ist um {percent}% gesunken

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

Jemand hat dich über “{name}” kontaktiert

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

Neue Formularübermittlung auf “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

Neue Produkt- oder Geschäftsideen festhalten und bewerten.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

Konkurrenzprodukte, Preise und Positionierung verfolgen.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

Notizen und Zusammenfassungen zu allem, was du recherchierst.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

Themen, die du lernst, mit Materialien und Quizfragen.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

Handelsjournal — Symbol, Richtung, Ergebnis, Gewinn und Verlust.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

Optionen abwägen und die Empfehlung festhalten.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

Produktpläne — Preise, Roadmap, Launch-Plan.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

Content-Ideen, Texte und Threads.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

Leads, Kontakt-E-Mails und nächste Schritte.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

Nutzerrückmeldungen, nach Stimmung und Priorität sortiert.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

Jede Kennzahl, die sich über die Zeit zu verfolgen lohnt.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

Abläufe, die sich zu automatisieren lohnen, und die gesparte Zeit.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

Du erhältst diese Nachricht, weil du ein Ionexa-AI-Konto hast.

## Tier 3 — Subjects, labels and the footer — skim (48)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.label`**

> EN — confirm your email

E-Mail bestätigen

**`email.confirm.title`**

> EN — Confirm it's you

Bestätige, dass du es bist

**`email.confirm.button`**

> EN — Confirm email

E-Mail bestätigen

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.label`**

> EN — signup

Registrierung

**`email.welcome.title`**

> EN — welcome to Ionexa AI

willkommen bei Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

Sicherheit

**`email.newDevice.when`**

> EN — When

Wann

**`email.newDevice.device`**

> EN — Device

Gerät

**`email.newDevice.ip`**

> EN — IP address

IP-Adresse

**`email.newDevice.cta`**

> EN — Reset password

Passwort ändern

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

Website-Baukasten

**`email.stuck.title`**

> EN — “{name}” seems stuck

“{name}” scheint zu hängen

**`email.stuck.cta`**

> EN — Open Website Builder

Website-Baukasten öffnen

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

geplanter Agentenlauf

**`email.scheduledRun.cta`**

> EN — Open {name}

{name} öffnen

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

dein Agent

**`email.agent.resultCta`**

> EN — Manage your agents

Deine Agenten verwalten

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — dein geplantes Ergebnis.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

Letzter Fehler: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

Deine Agenten öffnen

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}” pausiert

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

Credits aufladen

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

Deine Agenten öffnen

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

Abonnement

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

Kontolöschung

**`email.deletion.title`**

> EN — confirm account deletion

Kontolöschung bestätigen

**`email.deletion.cta`**

> EN — Confirm deletion

Löschung bestätigen

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

Zusammenfassung

**`email.digest.title`**

> EN — this week

diese Woche

**`email.digest.noticed`**

> EN — what I noticed

was mir aufgefallen ist

**`email.digest.cta`**

> EN — Open your dashboard

Dein Dashboard öffnen

**`email.digest.subject`**

> EN — this week: {first}

diese Woche: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} neuer Eintrag

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} neue Einträge

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

deine Website: {count} Besuch

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

deine Website: {count} Besuche

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} Credit ausgegeben

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} Credits ausgegeben

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} Agentenlauf ist fehlgeschlagen

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} Agentenläufe sind fehlgeschlagen

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

neue Formularübermittlung

**`email.formSubmission.cta`**

> EN — View your websites

Deine Websites ansehen

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

Neue Formularübermittlung auf {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

Vermutlich echtes Interesse

**`email.formSubmission.badges.question`**

> EN — General question

Allgemeine Frage

**`email.formSubmission.badges.spam`**

> EN — Possible spam

Möglicherweise Spam

**`email.formSubmission.badges.unclear`**

> EN — Unclear

Unklar

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

Einnahmen und Ausgaben erfassen.
