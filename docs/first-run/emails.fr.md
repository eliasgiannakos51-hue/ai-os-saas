# The emails — fr

Every line of every email the product sends: **108 strings**. The interface has its own pack, `first-run.fr.md`, beside this one.

**Start with tier 1. It is 37 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 45 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (37)

_From the emails a person is sure or likely to receive, 5 words or more._

### welcome — every account gets it, minutes after signing up

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

Votre compte est prêt — aucune confirmation par e-mail n'est nécessaire, vous pouvez vous connecter tout de suite. Ionexa AI, ce sont 13 modules pour piloter une startup, plus une zone de texte libre qui classe automatiquement ce que vous écrivez dans le bon module.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

Astuce : sur {path}, décrivez simplement ce qui s'est passé et cela arrivera automatiquement dans le bon module.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

Votre compte Ionexa AI est prêt.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

nouvelle connexion à votre compte

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

Nous avons remarqué une connexion à votre compte Ionexa AI depuis un appareil ou un navigateur que nous n'avions jamais vu.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

Si c'était vous, aucune action n'est nécessaire. Si vous ne reconnaissez pas cette connexion, changez votre mot de passe immédiatement.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

Nouvelle connexion à votre compte Ionexa AI depuis {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

Cette génération tourne depuis plus de 24 heures sans se terminer — ce n’est pas normal, et elle est probablement bloquée plutôt qu’encore en cours. Aucun crédit n’a été facturé pour elle. Ouvrez-la ci-dessous pour réessayer ou la supprimer.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}” est bloqué en génération depuis plus de 24 heures.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

“{name}” semble bloqué — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

votre tâche planifiée est terminée

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

votre tâche planifiée n’a pas pu s’exécuter

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

Votre tâche planifiée “{step}” est terminée.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

Votre tâche planifiée “{step}” n’a pas pu s’exécuter.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

Votre tâche planifiée est terminée — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

Votre tâche planifiée n’a pas pu s’exécuter — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

Crédits insuffisants — rechargez ou changez d’offre, puis planifiez-la à nouveau.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

Crédits insuffisants — rechargez ou changez d’offre. Cette automatisation réessaiera au prochain cycle.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

“{name}” a été désactivé

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

Il a échoué {count} fois d’affilée, il a donc cessé de s’exécuter plutôt que de continuer à échouer et à vous coûter des crédits.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

Ouvrez-le ci-dessous pour vérifier la tâche et le réactiver.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

“{name}” s’est arrêté après {count} échecs.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

“{name}” a été désactivé — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

Il n’a pas pu s’exécuter car votre compte n’a plus de crédits. Rien n’a été facturé et rien n’a été perdu — rechargez ou passez à une offre supérieure puis réactivez-le, et il reprendra son rythme habituel.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}” est en pause — votre compte n’a plus de crédits.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}” est en pause — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

votre abonnement va prendre fin

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Vous gardez un accès complet jusqu'au {date}. Rien ne change d'ici là : vos crédits restants restent utilisables et aucune de vos données n'est supprimée.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Vous gardez un accès complet jusqu'à la fin de la période déjà payée. Rien ne change d'ici là : vos crédits restants restent utilisables et aucune de vos données n'est supprimée.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

Ensuite, le compte passe à l'offre gratuite. Vos entrées, fichiers et conversations restent exactement où ils sont.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

Vous avez changé d'avis ? Réactivez-le

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

Vous pouvez réactiver l'abonnement à tout moment avant son terme, sans frais supplémentaires : cette période est déjà payée.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

Votre abonnement Ionexa AI prend fin le {date}. Vous gardez l'accès jusque-là.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

Votre abonnement Ionexa AI va prendre fin. Vous gardez l'accès jusqu'à la fin de la période payée.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Nous avons reçu une demande de suppression définitive de votre compte Ionexa AI et de tous les enregistrements de tous les modules. C'est irréversible.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre compte restera exactement tel quel.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Confirmez la suppression définitive de votre compte Ionexa AI.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

votre semaine sur Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} exécution d’agent, {found} avec un résultat

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} exécutions d’agents, {found} avec un résultat

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} crédit dépensé (votre moyenne : {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} crédits dépensés (votre moyenne : {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} contact sans suivi enregistré

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} contacts sans suivi enregistré

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

les dépenses sont {percent}% au-dessus de votre moyenne

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

les dépenses sont {percent}% en dessous de votre moyenne

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

le trafic du site a augmenté de {percent}%

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

le trafic du site a baissé de {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

Quelqu’un vous a contacté via “{name}”

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

Nouvel envoi de formulaire sur “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

Notez et évaluez de nouvelles idées de produit ou d'entreprise.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

Suivez les produits concurrents, leurs prix et leur positionnement.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

Notes et résumés de tout ce que vous étudiez.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

Sujets que vous apprenez, avec ressources et quiz.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

Journal de trading — symbole, sens, résultat, gains et pertes.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

Pesez les options et consignez la recommandation.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

Plans produit — tarifs, feuille de route, plan de lancement.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

Idées de contenu, légendes et fils.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

Prospects, e-mails de prise de contact et prochaines étapes.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

Retours des utilisateurs, triés par ton et par priorité.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

Toute mesure qui mérite d'être suivie dans le temps.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

Les flux qui méritent d'être automatisés, et le temps gagné.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

Vous recevez ce message parce que vous avez un compte Ionexa AI.

## Tier 3 — Subjects, labels and the footer — skim (45)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### welcome — every account gets it, minutes after signing up

**`email.welcome.label`**

> EN — signup

inscription

**`email.welcome.title`**

> EN — welcome to Ionexa AI

bienvenue sur Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

sécurité

**`email.newDevice.when`**

> EN — When

Quand

**`email.newDevice.device`**

> EN — Device

Appareil

**`email.newDevice.ip`**

> EN — IP address

Adresse IP

**`email.newDevice.cta`**

> EN — Reset password

Changer le mot de passe

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

créateur de sites

**`email.stuck.title`**

> EN — “{name}” seems stuck

“{name}” semble bloqué

**`email.stuck.cta`**

> EN — Open Website Builder

Ouvrir le créateur de sites

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

exécution planifiée de l’agent

**`email.scheduledRun.cta`**

> EN — Open {name}

Ouvrir {name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

votre agent

**`email.agent.resultCta`**

> EN — Manage your agents

Gérer vos agents

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — votre résultat planifié.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

Dernière erreur : {error}

**`email.agent.disabledCta`**

> EN — Open your agents

Ouvrir vos agents

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}” est en pause

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

Recharger des crédits

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

Ouvrir vos agents

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

abonnement

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

suppression du compte

**`email.deletion.title`**

> EN — confirm account deletion

confirmez la suppression du compte

**`email.deletion.cta`**

> EN — Confirm deletion

Confirmer la suppression

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

récapitulatif

**`email.digest.title`**

> EN — this week

cette semaine

**`email.digest.noticed`**

> EN — what I noticed

ce que j’ai remarqué

**`email.digest.cta`**

> EN — Open your dashboard

Ouvrir votre tableau de bord

**`email.digest.subject`**

> EN — this week: {first}

cette semaine : {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} nouvelle entrée

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} nouvelles entrées

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

votre site : {count} visite

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

votre site : {count} visites

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} crédit dépensé

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} crédits dépensés

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} exécution d’agent a échoué

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} exécutions d’agents ont échoué

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

nouvel envoi de formulaire

**`email.formSubmission.cta`**

> EN — View your websites

Voir vos sites

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

Nouvel envoi de formulaire sur {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

Intérêt probablement réel

**`email.formSubmission.badges.question`**

> EN — General question

Question générale

**`email.formSubmission.badges.spam`**

> EN — Possible spam

Spam possible

**`email.formSubmission.badges.unclear`**

> EN — Unclear

Peu clair

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

Enregistrez les revenus et les dépenses.
