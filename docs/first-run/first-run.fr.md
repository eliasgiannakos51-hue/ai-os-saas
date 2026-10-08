# The first run — fr

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **602 strings**. The whole product is 3974, which is why this file exists.

**Start with tier 1. It is 25 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 369 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (25)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.checkEmailBody`**

> EN — We sent a link to {email}. Open it to confirm your address and start using your account.

Nous avons envoyé un lien à {email}. Ouvrez-le pour confirmer votre adresse et commencer à utiliser votre compte.

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

Nous n'avons pas pu créer le compte. Vérifiez les informations et réessayez — vous n'avez pas été débité.

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

Vous devez accepter les Conditions d'utilisation et la Politique de confidentialité pour créer un compte.

**`pricing.businessCardDescription`**

> EN — Start with Professional or Ultimate as your team's base, then invite members for +{price}/month each — everyone gets your plan's tier on their own account.

Commencez avec Professional ou Ultimate comme base de votre équipe, puis invitez des membres pour +{price}/mois chacun — chacun obtient le niveau de votre offre sur son propre compte.

### login

**`auth.login.emailNotConfirmed`**

> EN — Confirm your email first. We just sent a new link to your inbox.

Confirmez d’abord votre e-mail. Nous venons de vous envoyer un nouveau lien.

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

Nous n'avons pas pu vous connecter. Vérifiez l'e-mail et le mot de passe, ou réinitialisez-le en cas de doute.

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

Cette connexion n'a pas abouti. Réessayez ou utilisez votre e-mail et votre mot de passe ci-dessous.

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

Apportez de vraies données et l'IA vous dira quelque chose sur votre activité en deux minutes.

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

Vos données restent les vôtres. Elles sont stockées de façon privée, vous seul pouvez les lire, et elles ne servent jamais à entraîner quoi que ce soit. Vous pouvez les supprimer, ou tout votre compte, à tout moment.

**`dashboard.firstTask.lead`**

> EN — Pick something to get done now. The answer arrives in a few seconds.

Choisis quelque chose à faire maintenant. La réponse arrive en quelques secondes.

**`dashboard.firstTask.tasks.explain.text`**

> EN — Explain in plain words what makes a good business description on Google

Explique-moi simplement ce qui fait une bonne description d'entreprise sur Google

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

Uniquement de vrais motifs dans ce que vous venez d'importer. Si cela ne suffit pas pour être sûr, nous le dirons.

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV ou séparé par tabulations, jusqu'à {max}. Nous le lisons et vous montrons le résultat avant tout enregistrement.

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

Vos dates peuvent être jour/mois ou mois/jour — toutes tombent le 12 ou avant, impossible de trancher. Laquelle ?

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

Votre premier import et son analyse sont gratuits — aucun crédit ne sera utilisé.

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

Il n'y a pas encore assez pour parler de motif. Quelques dizaines de lignes datées suffisent en général à faire apparaître quelque chose — et nous préférons ne rien dire plutôt qu'inventer.

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

Un business plan, des notes de réunion, une liste de clients. Nous extrayons ce qui peut être enregistré et laissons le reste.

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

Un export CSV de votre courtier, banque ou CRM. Nous déduisons chaque colonne.

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

Choisissez le plus simple. Rien n'est obligatoire, et vous pourrez en ajouter plus tard.

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

Un business plan, des notes, une liste — nous en extrayons les éléments structurés.

### dashboard chrome

**`common.searchFailed`**

> EN — Search is unavailable right now — this is not an empty result. Try again in a moment.

La recherche est indisponible pour le moment — ce n'est pas un résultat vide. Réessayez dans un instant.

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

Ces entrées sont une démo : trois mois d'un petit studio de design. Elles ne sont pas les vôtres.

### first result

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

Les {count, number} plus récentes sont affichées. Les entrées plus anciennes sont toujours enregistrées — utilisez la recherche dans vos enregistrements pour les retrouver.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

Cela ressemble à une question. Dois-je y répondre ou l'enregistrer ?

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

Décrivez n'importe quoi — une idée de produit, une opération, le retour d'un utilisateur, un indicateur — et cela atterrit automatiquement dans le bon module.

## Tier 2 — The labels — skim these (369)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

J'accepte les

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

Vous avez déjà un compte ?

**`auth.signup.and`**

> EN — and

et la

**`auth.signup.change`**

> EN — change

modifier

**`auth.signup.checkEmailTitle`**

> EN — Check your email

Vérifiez vos e-mails

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

Choisissez votre forfait

**`auth.signup.continue`**

> EN — Continue

Continuer

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

Continuer vers le paiement

**`auth.signup.country`**

> EN — Country

Pays

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

Sélectionnez votre pays (facultatif)

**`auth.signup.createAccount`**

> EN — Create Account

Créer le compte

**`auth.signup.createYourAccount`**

> EN — Create your account

Créez votre compte

**`auth.signup.discountCode`**

> EN — Discount code

Code promo

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

Code promo (facultatif)

**`auth.signup.email`**

> EN — Email

E-mail

**`auth.signup.inviteCode`**

> EN — Invite code

Code d'invitation

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

Code d'invitation (facultatif)

**`auth.signup.logIn`**

> EN — Log in

Connexion

**`auth.signup.mostPopular`**

> EN — Most Popular

Le plus populaire

**`auth.signup.password`**

> EN — Password

Mot de passe

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

Choisissez un mot de passe qui remplit toutes les conditions ci-dessus.

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

Politique de confidentialité

**`auth.signup.step`**

> EN — Step {step} of 2

Étape {step} sur 2

**`auth.signup.termsOfService`**

> EN — Terms of Service

Conditions d'utilisation

**`auth.signup.working`**

> EN — Working...

Traitement...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

Choisissez Professional ou Ultimate comme plan de base

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

Sièges d'équipe inclus gratuitement avec Ultimate

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets your plan's tier on their own account

Chaque membre obtient le niveau de votre offre sur son propre compte

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

Gérez les sièges à tout moment depuis les paramètres d'équipe

**`pricing.businessSubtitle`**

> EN — For teams building together

Pour les équipes qui construisent ensemble

**`pricing.businessTitle`**

> EN — Business

Business

**`pricing.custom`**

> EN — Custom

Sur mesure

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, one {# crédit} other {# crédits}}/mois

**`pricing.features.customCredits`**

> EN — Custom credits

Crédits personnalisés

**`pricing.perMonth`**

> EN — /month

/mois

**`pricing.rows.accountAndPrivacy`**

> EN — Export or delete your account

Exporter ou supprimer ton compte

**`pricing.rows.agentRunsPerHour`**

> EN — Agent runs

Exécutions d’agents

**`pricing.rows.aiAgents`**

> EN — Scheduled web-research agents

Agents programmés de recherche sur le web

**`pricing.rows.aiChat`**

> EN — Ask me

Demande-moi

**`pricing.rows.aiMemory`**

> EN — AI Memory

Mémoire IA

**`pricing.rows.askYourData`**

> EN — Ask your own records

Interroger tes propres données

**`pricing.rows.automation`**

> EN — Automation

Automatisation

**`pricing.rows.backgroundJobs`**

> EN — Work that runs in the background

Traitements en arrière-plan

**`pricing.rows.buildLogs`**

> EN — Website, app, image and video logs

Journaux de sites, applis, images et vidéos

**`pricing.rows.businessLogs`**

> EN — My records

Mes enregistrements

**`pricing.rows.chatMemory`**

> EN — Facts remembered in chat

Éléments mémorisés par le chat

**`pricing.rows.chatPins`**

> EN — Pinned conversations

Conversations épinglées

**`pricing.rows.coding`**

> EN — AI Coding

Code avec l'IA

**`pricing.rows.contactSupport`**

> EN — Contact form

Formulaire de contact

**`pricing.rows.createStudio`**

> EN — Describe it, it opens the right tool

Décrivez-le, il ouvre le bon outil

**`pricing.rows.creditsPerMonth`**

> EN — Credits / month

Crédits / mois

**`pricing.rows.customAiPersona`**

> EN — Custom assistant name

Nom d’assistant personnalisé

**`pricing.rows.deepResearch`**

> EN — Deep Research runs / month

Recherches approfondies / mois

**`pricing.rows.documents`**

> EN — Documents

Documents

**`pricing.rows.fileQuestionsPerHour`**

> EN — Questions about a file

Questions sur un fichier

**`pricing.rows.files`**

> EN — Files stored

Fichiers stockés

**`pricing.rows.fileUploadsPerHour`**

> EN — File uploads

Envois de fichiers

**`pricing.rows.freeChatMessages`**

> EN — Free chat messages / month

Messages de chat gratuits / mois

**`pricing.rows.helpCentre`**

> EN — Help Centre

Centre d’aide

**`pricing.rows.integrationReadsPerHour`**

> EN — Reads from a connected account

Lectures d’un compte connecté

**`pricing.rows.integrations`**

> EN — Connected integrations

Intégrations connectées

**`pricing.rows.listRowsShown`**

> EN — Rows shown in one list

Lignes affichées par liste

**`pricing.rows.meetings`**

> EN — Meetings → actions

Réunions → actions

**`pricing.rows.missionControl`**

> EN — Goals & Plans

Objectifs et plans

**`pricing.rows.notifications`**

> EN — Notifications and reminders

Notifications et rappels

**`pricing.rows.posts`**

> EN — Posts

Publications

**`pricing.rows.predictions`**

> EN — Predictions

Tendances

**`pricing.rows.presentations`**

> EN — Presentations

Présentations

**`pricing.rows.projects`**

> EN — Projects

Projets

**`pricing.rows.publishedSites`**

> EN — Published websites

Sites web publiés

**`pricing.rows.recordSearch`**

> EN — Record search across modules

Recherche dans toutes les données

**`pricing.rows.siteEditsPerDay`**

> EN — Live edits per site

Modifications en direct par site

**`pricing.rows.siteVersionsKept`**

> EN — Versions kept per site

Versions conservées par site

**`pricing.rows.storage`**

> EN — Storage

Stockage

**`pricing.rows.teamCollaboration`**

> EN — Members get your plan

Les membres obtiennent votre offre

**`pricing.rows.teamMembers`**

> EN — Team members

Membres de l’équipe

**`pricing.rows.teamSeatsAddOn`**

> EN — Team seats

Sièges d'équipe

**`pricing.rows.voiceClipLength`**

> EN — Longest recording (minutes)

Enregistrement le plus long (minutes)

**`pricing.rows.voiceMinutes`**

> EN — Voice minutes / month

Minutes de voix / mois

**`pricing.rows.websiteBuilder`**

> EN — Website Builder

Website Builder

**`pricing.rows.websiteImageStorage`**

> EN — Storage for website photos

Espace pour les photos du site

**`pricing.values.custom`**

> EN — Custom

Sur mesure

**`pricing.values.included`**

> EN — Included

Inclus

**`pricing.values.minutesPerMonth`**

> EN — min/month

min/mois

**`pricing.values.no`**

> EN — Not included

Non inclus

**`pricing.values.perDay`**

> EN — /day

/jour

**`pricing.values.perHour`**

> EN — /hour

/heure

**`pricing.values.perSeat`**

> EN — +{currency}{price}/seat

+{currency}{price}/siège

**`pricing.values.unlimited`**

> EN — Unlimited

Illimité

**`pricing.values.yes`**

> EN — Included

Inclus

**`auth.generateStrongPassword`**

> EN — Generate strong password

Générer un mot de passe fort

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

Continuer avec Google

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

Impossible de démarrer la connexion Google. Veuillez réessayer.

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

ou continuer avec l'e-mail

**`common.hidePassword`**

> EN — Hide password

Masquer le mot de passe

**`common.showPassword`**

> EN — Show password

Afficher le mot de passe

### login

**`auth.login.email`**

> EN — Email

E-mail

**`auth.login.forgotPassword`**

> EN — Forgot password?

Mot de passe oublié ?

**`auth.login.logIn`**

> EN — Log In

Connexion

**`auth.login.noAccount`**

> EN — No account yet?

Pas encore de compte ?

**`auth.login.password`**

> EN — Password

Mot de passe

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

Mot de passe mis à jour — connectez-vous avec votre nouveau mot de passe.

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

Connectez-vous pour enregistrer ce que vous avez partagé.

**`auth.login.signUp`**

> EN — Sign up

Inscrivez-vous

**`auth.login.welcomeBack`**

> EN — Welcome back

Content de vous revoir

**`auth.login.working`**

> EN — Working...

Traitement...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

Faisons-en le vôtre

**`dashboard.firstTask.cost`**

> EN — Free, within this month's free messages.

Gratuit, dans la limite des messages gratuits du mois.

**`dashboard.firstTask.import`**

> EN — Bring your data from a CSV file

Importe tes données depuis un fichier CSV

**`dashboard.firstTask.ownLabel`**

> EN — Or write what you want

Ou écris ce que tu veux

**`dashboard.firstTask.ownPlaceholder`**

> EN — Or write what you want done…

Ou écris ce que tu veux faire…

**`dashboard.firstTask.send`**

> EN — Start

Commencer

**`dashboard.firstTask.skip`**

> EN — Skip

Passer

**`dashboard.firstTask.tasks.explain.label`**

> EN — Learn

Apprendre

**`dashboard.firstTask.tasks.plan.label`**

> EN — Plan

Organiser

**`dashboard.firstTask.tasks.plan.text`**

> EN — Make me a plan to find my first customers this month

Fais-moi un plan pour trouver mes premiers clients ce mois-ci

**`dashboard.firstTask.tasks.write.label`**

> EN — Write

Écrire

**`dashboard.firstTask.tasks.write.text`**

> EN — Write a short email asking a supplier for a quote

Écris un court e-mail pour demander un devis à un fournisseur

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

Ce fichier n'a pas pu être lu.

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

Recherche de motifs dans vos données…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

Choisir un autre fichier

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

Choisir un fichier

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{ready} lignes sur {total} sont prêtes

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

Importez votre tableur

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

Jour / mois

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

Mois / jour

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

Extraire les entrées

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

Une agence ou petite entreprise

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

Revenus et clients en freelance

**`dashboard.onboarding.goals.other`**

> EN — Something else

Autre chose

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

Une startup que je construis

**`dashboard.onboarding.goals.trading`**

> EN — My trading

Mon trading

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

Que voulez-vous surtout suivre ?

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

Aller à votre tableau de bord

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— ignorer cette colonne —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

{count, plural, one {# ligne importée} other {# lignes importées}}

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

{count, plural, one {# ligne est} other {# lignes sont}} maintenant dans votre compte.

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

L'import n'a pas abouti.

**`dashboard.onboarding.importing`**

> EN — Importing…

Import…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

{count, plural, one {Importer # ligne} other {Importer # lignes}}

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

L'analyse ne s'est pas terminée.

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

Voici ce que j'ai trouvé

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

Cela ressemble à : {label}.

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

Associer la colonne {column}

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

Quelle colonne est quoi — corrigez ce qui est faux

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

Rien de solide pour l'instant

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

Ajoutez-en un peu plus et relancez depuis votre tableau de bord.

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

Ce texte ne contenait rien qui vaille la peine d'être enregistré.

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

Collez votre texte ici…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

Collez ce que vous voulez

**`dashboard.onboarding.previewSource`**

> EN — From your file

De votre fichier

**`dashboard.onboarding.previewStored`**

> EN — Stored as

Enregistré comme

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

Ce qui sera réellement enregistré

**`dashboard.onboarding.reading`**

> EN — Reading…

Lecture…

**`dashboard.onboarding.skip`**

> EN — Skip for now

Passer pour l'instant

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

{count} ignorées

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

Importer un tableur

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

Connecter Gmail ou Drive

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

En lecture seule, et uniquement ce que vous approuvez.

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

J'ajouterai moi-même

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

Aller directement au tableau de bord et partir de zéro.

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

Coller du texte

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

Importez vos données

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

Étape {step} sur {total}

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

Les tableurs doivent faire {max} au maximum.

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

seules les premières lignes ont été lues

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

L'IA qui connaît déjà votre travail. Demandez-lui n'importe quoi.

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

Première Entrée dans {module}

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

Succès débloqué : {achievement}

**`common.accountMenu`**

> EN — Account menu

Menu du compte

**`common.commandPalette`**

> EN — Command palette

Palette de commandes

**`common.createStudio`**

> EN — Make anything

Créer n’importe quoi

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

Crédits restants — achetez-en plus dans les Paramètres

**`common.creditsUnlimited`**

> EN — Unlimited

Illimités

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — appuyez sur Entrée pour ignorer

**`common.jumpToPage`**

> EN — Jump to a module or page...

Aller à un module ou une page...

**`common.loading`**

> EN — Loading...

Chargement...

**`common.noMatches`**

> EN — No matches for “{query}”

Aucun résultat pour « {query} »

**`common.offline.checking`**

> EN — Checking…

Vérification…

**`common.offline.retry`**

> EN — Try again

Réessayer

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

Rien sur cette page ne se met à jour.

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

Rien ici ne se met à jour — chargé il y a {minutes} min.

**`common.offline.stillOffline`**

> EN — Still no connection.

Toujours pas de connexion.

**`common.offline.title`**

> EN — You're offline.

Vous êtes hors ligne.

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

Accès propriétaire — crédits illimités

**`common.paletteClose`**

> EN — close

fermer

**`common.paletteNavigate`**

> EN — navigate

naviguer

**`common.paletteSelect`**

> EN — select

sélectionner

**`common.search`**

> EN — Search anything...

Rechercher n'importe quoi...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

Message gratuit · {count} restants ce mois-ci

**`credits.unlimited`**

> EN — Unlimited — no credits used

Illimité — aucun crédit utilisé

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

Illimité — aurait coûté {count, plural, one {# crédit} other {# crédits}}

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

{count, plural, one {# crédit utilisé} other {# crédits utilisés}}

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

{count, plural, one {# crédit utilisé} other {# crédits utilisés}} · {remaining, plural, one {# restant} other {# restants}}

**`dashboard.search.dates.30d`**

> EN — 30 days

30 jours

**`dashboard.search.dates.365d`**

> EN — 1 year

1 an

**`dashboard.search.dates.7d`**

> EN — 7 days

7 jours

**`dashboard.search.dates.any`**

> EN — Any time

À tout moment

**`dashboard.search.filters.all`**

> EN — All

Tout

**`dashboard.search.filters.date`**

> EN — Date

Date

**`dashboard.search.filters.module`**

> EN — Module

Module

**`dashboard.search.filters.type`**

> EN — Type

Type

**`dashboard.search.kinds.agent`**

> EN — Agents

Agents

**`dashboard.search.kinds.chat`**

> EN — Conversations

Conversations

**`dashboard.search.kinds.file`**

> EN — Files

Fichiers

**`dashboard.search.kinds.help`**

> EN — Help

Aide

**`dashboard.search.kinds.mission`**

> EN — Plans

Plans

**`dashboard.search.kinds.module`**

> EN — Entries

Entrées

**`dashboard.search.kinds.page`**

> EN — Pages

Pages

**`dashboard.search.kinds.research`**

> EN — Research

Recherche

**`dashboard.search.kinds.website`**

> EN — Websites

Sites web

**`sampleData.banner`**

> EN — Sample data

Données d'exemple

**`sampleData.clear`**

> EN — Remove the sample

Retirer l'exemple

**`sampleData.clearFailed`**

> EN — That did not work.

Cela n'a pas marché.

**`sampleData.clearing`**

> EN — Removing…

Retrait…

**`sidebar.closeMenu`**

> EN — Close menu

Fermer le menu

**`sidebar.items.activity`**

> EN — Activity

Activité

**`sidebar.items.affiliate`**

> EN — Affiliate

Affiliation

**`sidebar.items.agents`**

> EN — AI that works for you

L’IA qui travaille pour vous

**`sidebar.items.aiMemory`**

> EN — What it remembers

Ce dont il se souvient

**`sidebar.items.analytics`**

> EN — Analytics

Analytique

**`sidebar.items.apps`**

> EN — App ideas

Idées d’applications

**`sidebar.items.automation`**

> EN — Automation

Automatisation

**`sidebar.items.browserAgent`**

> EN — Browser agent

Agent de navigateur

**`sidebar.items.businessAccounting`**

> EN — Accounting

Comptabilité

**`sidebar.items.businessCrm`**

> EN — CRM

Clients (CRM)

**`sidebar.items.businessFinance`**

> EN — Company Finance

Finances d'entreprise

**`sidebar.items.businessHealth`**

> EN — How the business is doing

Comment va l’activité

**`sidebar.items.businessHr`**

> EN — HR

RH

**`sidebar.items.businessInventory`**

> EN — Inventory

Inventaire

**`sidebar.items.businessLegal`**

> EN — Legal

Juridique

**`sidebar.items.businessMarketing`**

> EN — Marketing

Marketing

**`sidebar.items.businessProcurement`**

> EN — Procurement

Achats

**`sidebar.items.businessSupport`**

> EN — Customer Support

Support client

**`sidebar.items.calendar`**

> EN — Calendar

Calendrier

**`sidebar.items.campaigns`**

> EN — Campaign ideas

Idées de campagnes

**`sidebar.items.chat`**

> EN — Ask me

Demande-moi

**`sidebar.items.coding`**

> EN — Coding

Code

**`sidebar.items.competitors`**

> EN — Competitors

Concurrents

**`sidebar.items.computerAgent`**

> EN — Computer agent

Agent d'ordinateur

**`sidebar.items.connectApis`**

> EN — APIs

API

**`sidebar.items.connectBanking`**

> EN — Banking

Banque

**`sidebar.items.connectCalendar`**

> EN — Calendar Sync

Synchronisation du calendrier

**`sidebar.items.connectCrm`**

> EN — CRM Connector

Connecteur CRM

**`sidebar.items.connectDataSources`**

> EN — Data Sources

Sources de données

**`sidebar.items.connectDrive`**

> EN — Google Drive

Google Drive

**`sidebar.items.connectEmail`**

> EN — Email

E-mail

**`sidebar.items.connectGithub`**

> EN — GitHub

GitHub

**`sidebar.items.connectIot`**

> EN — IoT Devices

Appareils IoT

**`sidebar.items.connectMcp`**

> EN — MCP

MCP

**`sidebar.items.connectSlack`**

> EN — Slack

Slack

**`sidebar.items.content`**

> EN — Content

Contenu

**`sidebar.items.costs`**

> EN — Costs

Coûts

**`sidebar.items.dataAnalysis`**

> EN — See what the numbers say

Vois ce que disent les chiffres

**`sidebar.items.decisions`**

> EN — Decisions

Décisions

**`sidebar.items.deepResearch`**

> EN — Look into it properly

Cherche à fond

**`sidebar.items.design`**

> EN — Design

Conception

**`sidebar.items.documents`**

> EN — Documents

Documents

**`sidebar.items.engCloud`**

> EN — Cloud

Services cloud

**`sidebar.items.engCode`**

> EN — Code

Code source

**`sidebar.items.engDatabases`**

> EN — Database Ops

Exploitation des bases

**`sidebar.items.engDeployment`**

> EN — Deployment

Déploiement

**`sidebar.items.engDevops`**

> EN — DevOps

DevOps

**`sidebar.items.engInfrastructure`**

> EN — Infrastructure

Infrastructures

**`sidebar.items.engMonitoring`**

> EN — Service Monitoring

Surveillance des services

**`sidebar.items.engSecurity`**

> EN — Security

Sécurité

**`sidebar.items.engTesting`**

> EN — Testing

Tests

**`sidebar.items.favorites`**

> EN — Favorites

Favoris

**`sidebar.items.feedback`**

> EN — Feedback

Retours

**`sidebar.items.files`**

> EN — Files

Fichiers

**`sidebar.items.finance`**

> EN — Finances

Finances

**`sidebar.items.formSubmissions`**

> EN — Form submissions

Envois de formulaires

**`sidebar.items.help`**

> EN — Help Centre

Centre d’aide

**`sidebar.items.home`**

> EN — Home

Accueil

**`sidebar.items.ideas`**

> EN — Ideas

Idées

**`sidebar.items.images`**

> EN — Image ideas

Idées d’images

**`sidebar.items.imageTool`**

> EN — Image

Image

**`sidebar.items.integrations`**

> EN — Integrations

Intégrations

**`sidebar.items.knowledge`**

> EN — Knowledge

Connaissances

**`sidebar.items.knowledgeGraph`**

> EN — Knowledge Graph

Graphe de connaissances

**`sidebar.items.learning`**

> EN — Learning

Apprentissage

**`sidebar.items.library`**

> EN — My stuff

Mes affaires

**`sidebar.items.marketplace`**

> EN — Ready-made helpers

Assistants prêts à l’emploi

**`sidebar.items.meetings`**

> EN — Meetings

Réunions

**`sidebar.items.memory`**

> EN — Search my records

Chercher dans mes données

**`sidebar.items.mine`**

> EN — Mine

Mes éléments

**`sidebar.items.missionControl`**

> EN — Goals & Plans

Objectifs et plans

**`sidebar.items.monitoring`**

> EN — Monitoring

Surveillance

**`sidebar.items.music`**

> EN — Music

Musique

**`sidebar.items.newEntry`**

> EN — New entry

Nouvelle entrée

**`sidebar.items.operations`**

> EN — Operations

Opérations

**`sidebar.items.personalFinance`**

> EN — Personal Finance

Finances personnelles

**`sidebar.items.personalHabits`**

> EN — Habits

Habitudes

**`sidebar.items.personalHealth`**

> EN — Health

Santé

**`sidebar.items.personalJournal`**

> EN — Journaling

Journal

**`sidebar.items.personalLifeOs`**

> EN — Life OS

Life OS

**`sidebar.items.personalShopping`**

> EN — Shopping

Achats

**`sidebar.items.personalTravel`**

> EN — Travel

Voyages

**`sidebar.items.posts`**

> EN — Posts

Publications

**`sidebar.items.predictions`**

> EN — Predictions

Tendances

**`sidebar.items.presentations`**

> EN — Presentations

Présentations

**`sidebar.items.products`**

> EN — Products

Produits

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

Flux de Travail Produit

**`sidebar.items.projects`**

> EN — Projects

Projets

**`sidebar.items.published`**

> EN — Live sites

Sites en ligne

**`sidebar.items.records`**

> EN — My records

Mes enregistrements

**`sidebar.items.reflection`**

> EN — Your week

Ta semaine

**`sidebar.items.research`**

> EN — Research

Recherche

**`sidebar.items.routing`**

> EN — Which AI is used

Quelle IA est utilisée

**`sidebar.items.sales`**

> EN — Sales

Ventes

**`sidebar.items.scheduledJobs`**

> EN — Scheduled Jobs

Tâches planifiées

**`sidebar.items.settings`**

> EN — Settings

Paramètres

**`sidebar.items.systemHealth`**

> EN — System Health

État du système

**`sidebar.items.tasks`**

> EN — Tasks

Tâches

**`sidebar.items.team`**

> EN — Team

Équipe

**`sidebar.items.timeline`**

> EN — History

Historique

**`sidebar.items.trading`**

> EN — Trading

Trading

**`sidebar.items.tradingJournal`**

> EN — Trading journal

Journal de trading

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

Flux de Travail Trading

**`sidebar.items.verifyCode`**

> EN — Code Verification

Vérification du code

**`sidebar.items.verifyData`**

> EN — Data Validation

Validation des données

**`sidebar.items.verifyFacts`**

> EN — Fact Checking

Vérification des faits

**`sidebar.items.verifyOutput`**

> EN — Output Evaluation

Évaluation des résultats

**`sidebar.items.verifyRedTeam`**

> EN — Red Teaming

Tests d'intrusion

**`sidebar.items.verifySecurity`**

> EN — Security Testing

Tests de sécurité

**`sidebar.items.verifySources`**

> EN — Source Verification

Vérification des sources

**`sidebar.items.videos`**

> EN — Video ideas

Idées de vidéos

**`sidebar.items.voice`**

> EN — Voice

Voix

**`sidebar.items.websiteBuilder`**

> EN — Build a site

Créer un site

**`sidebar.items.websites`**

> EN — Website plans

Projets de sites

**`sidebar.items.workflows`**

> EN — Workflows

Flux de travail

**`sidebar.rail.allTools`**

> EN — All tools

Tous les outils

**`sidebar.rail.chat`**

> EN — Chat

Discussion

**`sidebar.rail.coding`**

> EN — Coding

Code

**`sidebar.rail.collapse`**

> EN — Collapse sidebar

Réduire la barre latérale

**`sidebar.rail.expand`**

> EN — Expand sidebar

Développer la barre latérale

**`sidebar.rail.label`**

> EN — Main

Menu principal

**`sidebar.rail.new`**

> EN — New

Nouveau

**`sidebar.rail.pin`**

> EN — Pin {tool}

Épingler {tool}

**`sidebar.rail.recentChats`**

> EN — Recent chats

Discussions récentes

**`sidebar.rail.recentTools`**

> EN — Recent tools

Outils récents

**`sidebar.rail.remove`**

> EN — Remove {tool} from Recent tools

Retirer {tool} des outils récents

**`sidebar.rail.saveFailed`**

> EN — Could not save that change. Try again.

La modification n’a pas été enregistrée. Réessayez.

**`sidebar.rail.settings`**

> EN — Settings

Paramètres

**`sidebar.rail.unpin`**

> EN — Unpin {tool}

Désépingler {tool}

**`sidebar.rail.untitledChat`**

> EN — New conversation

Nouvelle conversation

**`sidebar.tabs.label`**

> EN — Main navigation

Navigation principale

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

Impossible de charger vos idées : {message}

**`errors.boundary.section`**

> EN — This section could not be displayed.

Cette section n'a pas pu être affichée.

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

Le reste de la page n'est pas affecté. Recharger suffit généralement.

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

C'était une question : rien n'a été enregistré.

**`dashboard.create.answerItInstead`**

> EN — Answer it

Y répondre

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

Continuer dans le Chat

**`dashboard.create.loggedTo`**

> EN — Logged to:

Enregistré dans :

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

L'enregistrer quand même

**`dashboard.create.title`**

> EN — Create Anything

Créer N'importe Quoi

**`dashboard.create.viewModule`**

> EN — View {module} →

Ouvrir {module} →

**`dashboard.createAnything.accomplishPlaceholder`**

> EN — What do you want to accomplish?

Que voulez-vous accomplir ?

**`dashboard.createAnything.attachImage`**

> EN — Attach image

Joindre une image

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

Votre réponse...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

Continuer

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

Ignorer et enregistrer quand même

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

Deux questions rapides :

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

Décrivez votre idée en détail...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

Retirer l'image

**`dashboard.createAnything.send`**

> EN — Send

Envoyer

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

Impossible d'envoyer une ou plusieurs images.

**`errors.creditHistory`**

> EN — See credit history

Voir l'historique des crédits

**`errors.retry`**

> EN — Try again

Réessayer

## Tier 3 — Further in — only if you have time (208)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

Fermer

**`common.readMore`**

> EN — Read more

En savoir plus

**`common.whatIsThisPage`**

> EN — What is this page?

Qu'est-ce que cette page ?

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

d'après {count, plural, one {# de vos entrées} other {# de vos entrées}}

**`dashboard.insights.checkIt`**

> EN — Check it yourself

Vérifiez vous-même

**`dashboard.insights.dismiss`**

> EN — Dismiss this

Ignorer

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

Impossible de l'ignorer.

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

Masquer les chiffres

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

Voir les chiffres

**`promise.greeting.afternoon`**

> EN — Good afternoon

Bon après-midi

**`promise.greeting.evening`**

> EN — Good evening

Bonsoir

**`promise.greeting.morning`**

> EN — Good morning

Bonjour

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

Ignorer

**`common.noNotifications`**

> EN — No new notifications.

Aucune nouvelle notification.

**`common.notifications`**

> EN — Notifications

Notifications

**`common.toggleMenu`**

> EN — Toggle menu

Afficher ou masquer le menu

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

rechargez maintenant pour ne pas être interrompu.

**`credits.low.none`**

> EN — No credits left this month

Plus de crédits ce mois-ci

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

{count, plural, one {# crédit restant} other {# crédits restants}} ce mois-ci

**`credits.low.topUp`**

> EN — Top up

Recharger

**`language.label`**

> EN — Language

Langue

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

Impossible d'enregistrer la langue — rien n'a été modifié.

**`pwa.install`**

> EN — Install

Installer

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

Ajoutez-le à l'écran d'accueil : plein écran et notifications qui arrivent vraiment.

**`pwa.installTitle`**

> EN — Install Ionexa

Installer Ionexa

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

Safari ne le propose jamais de lui-même — trois touches suffisent.

**`pwa.iosGotIt`**

> EN — Got it

Compris

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

Touchez le bouton Partager dans la barre de Safari

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

Faites défiler et touchez « Sur l'écran d'accueil »

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

Touchez Ajouter — Ionexa rejoint vos autres apps

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

Ajouter Ionexa à l'écran d'accueil

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

D'ici là, l'iPhone ne peut pas vous envoyer de notifications et Safari peut effacer vos données après 7 jours sans usage.

**`pwa.notNow`**

> EN — Not now

Pas maintenant

**`pwa.showHow`**

> EN — Show me how

Montrez-moi comment

### first result

**`common.cancel`**

> EN — Cancel

Annuler

**`common.created`**

> EN — ✓ created

✓ créé

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

Ignorer la suggestion

**`common.error`**

> EN — error

erreur

**`common.notAuthenticated`**

> EN — Not authenticated.

Non authentifié.

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

Acheter des crédits

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

Cette action demande plus de crédits qu'il ne vous en reste. Achetez un pack ou passez à un forfait supérieur pour continuer.

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

Il vous reste {available} crédits et ceci en demande environ {needed}. Achetez un pack ou passez à un forfait supérieur.

**`credits.outOfCredits.title`**

> EN — You're out of credits

Vous n'avez plus de crédits

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

Changer de forfait

**`dashboard.goal.change`**

> EN — Change something

Modifier quelque chose

**`dashboard.goal.confirm`**

> EN — Yes, do it

Oui, allez-y

**`dashboard.goal.costsNow`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press Yes. Nothing is charged until then.

{credits, plural, one {# crédit} other {# crédits}} quand vous appuyez sur « Oui ». Rien n’est facturé avant.

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

{credits, plural, one {# crédit} other {# crédits}} quand vous appuierez sur le bouton là-bas. Rien n'est facturé maintenant.

**`dashboard.goal.dismiss`**

> EN — Never mind

Laissez tomber

**`dashboard.goal.fix`**

> EN — Fix the text

Corriger le texte

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

Rien n'est facturé maintenant, ni à l'arrivée.

**`dashboard.goal.goingTo`**

> EN — Going to

Ouvrira

**`dashboard.goal.heard`**

> EN — I heard: “{heard}”

J’ai compris : « {heard} »

**`dashboard.goal.routeAsk`**

> EN — Ionexa will read it

Ionexa le lira

**`dashboard.goal.routeChange`**

> EN — change

changer

**`dashboard.goal.routeCostNow`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} on send

≈ {credits, plural, one {# crédit} other {# crédits}} à l’envoi

**`dashboard.goal.routeCostThere`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} there

≈ {credits, plural, one {# crédit} other {# crédits}} là-bas

**`dashboard.goal.sendIt`**

> EN — Yes, send it

Oui, l’envoyer

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

Dites-en un peu plus, pour que cela arrive au bon endroit.

**`dashboard.goal.which`**

> EN — Which one do you mean?

Lequel voulez-vous dire ?

**`dashboard.goal.willHandle`**

> EN — No tool is named, so Ionexa will read it — it may answer it or save it as an entry.

Aucun outil n’est nommé : Ionexa va le lire, et peut y répondre ou l’enregistrer comme entrée.

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

Ceci part vers {destination}, avec ce que vous avez écrit.

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

Concurrents

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

concurrents connus

**`dashboard.ideas.customerLabel`**

> EN — Customer

Client

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

client cible

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

Un nouveau service pour les petites entreprises

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

Toutes vos idées au même endroit

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

Notez-la tant qu'elle est encore brute : elle est notée, comparée aux autres et conservée même si vous l'écartez.

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

Taille du marché

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

p. ex. TAM de 2 Md$

**`dashboard.ideas.mvpLabel`**

> EN — MVP

Produit minimum viable

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

à quoi ressemble le produit minimum viable ?

**`dashboard.ideas.nameLabel`**

> EN — Name

Nom

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

nom de l'idée

**`dashboard.ideas.new`**

> EN — New Idea

Nouvelle idée

**`dashboard.ideas.problemLabel`**

> EN — Problem

Problème

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

quel problème cela résout-il ?

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

Note (0-100)

**`dashboard.ideas.scorePlaceholder`**

> EN — score

note

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

Décision

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

p. ex. poursuivre / abandonner / surveiller

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

Rechargez la page pour voir la version actuelle, puis refaites votre modification.

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

Quelqu'un — ou un autre onglet — l'a modifié pendant que vous y travailliez.

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

Divisez-le ou envoyez une version plus petite.

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

Ce fichier est trop volumineux.

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

Ouvrez Paramètres › Facturation pour voir quelle formule le couvre.

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

Votre formule ne comprend pas cela.

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

Achetez des crédits dans les Paramètres ou attendez votre renouvellement mensuel.

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

Vous n'avez pas assez de crédits pour cela.

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

Vérifiez les champs signalés et renvoyez-le.

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

Un élément du formulaire n'a pas été accepté.

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

Reconnectez-vous et refaites l'action — rien de ce que vous aviez saisi n'est perdu.

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

Vous êtes déconnecté.

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

L'élément a probablement été supprimé. Revenez à la liste et choisissez-en un autre.

**`errors.codes.notFound.what`**

> EN — This no longer exists.

Ceci n'existe plus.

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

Vérifiez votre connexion et réessayez.

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

Votre appareil n'a pas pu nous joindre.

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

Supprimez ce dont vous n'avez plus besoin, ou changez de formule dans Paramètres › Facturation.

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

Vous avez atteint la limite de votre formule.

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

Attendez environ une minute, puis réessayez.

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

Trop de requêtes en peu de temps.

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

L'incident est enregistré. Réessayez dans un instant et contactez le support si cela persiste.

**`errors.codes.serverError.what`**

> EN — This broke on our side.

Cela a échoué de notre côté.

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

Réessayez et contactez le support si cela se reproduit.

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

Cette action ne s'est pas terminée.

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

Convertissez-le en PDF, DOCX, CSV ou TXT puis renvoyez-le.

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

Ce type de fichier n'est pas pris en charge.

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

Cela vient de chez nous et se résout généralement en quelques minutes.

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

Le service d'IA ne répond pas pour le moment.

**`errors.credits.charged`**

> EN — This attempt used credits.

Cette tentative a consommé des crédits.

**`errors.credits.notCharged`**

> EN — You were not charged.

Vous n'avez pas été débité.

**`errors.credits.refunded`**

> EN — Your credits were returned.

Vos crédits ont été restitués.

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

Nous ne pouvons pas confirmer d'ici si cela a été débité.

**`module.exportCsv`**

> EN — Export CSV

Exporter en CSV

**`module.noMatches`**

> EN — No matches for “{query}”

Aucun résultat pour « {query} »

**`module.save`**

> EN — Save

Enregistrer

**`module.saving`**

> EN — Saving...

Enregistrement...

**`module.searchPlaceholder`**

> EN — Search...

Rechercher...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

{credits, plural, one {# crédit} other {# crédits}} par minute de parole

**`voice.draft.discard`**

> EN — Discard

Abandonner

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

Rien n'a été envoyé. Corrigez le texte, puis envoyez-le vous-même.

**`voice.draft.title`**

> EN — What was heard

Ce qui a été entendu

**`voice.draft.use`**

> EN — Use this text

Utiliser ce texte

**`voice.errors.bad_request`**

> EN — That request could not be read.

Cette requête n'a pas pu être lue.

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

Le service est très sollicité en ce moment. Réessayez dans un instant.

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

Le micro n'a pas été autorisé. Vous pouvez toujours écrire.

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

Rien n'a été entendu dans cet enregistrement.

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

La voix est indisponible pour le moment. Vous pouvez toujours écrire.

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

Crédits insuffisants.

**`voice.errors.no_recording`**

> EN — No recording was sent.

Aucun enregistrement n'a été envoyé.

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

Rien n'a été enregistré.

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

La voix n'est pas configurée sur cette installation.

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

La voix n'est pas incluse dans votre offre.

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

Les minutes de voix de ce mois sont épuisées.

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

Le service de voix est injoignable.

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

Trop d'enregistrements dans la dernière heure. Réessayez dans un instant.

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

Les crédits n'ont pas pu être réservés pour cela.

**`voice.errors.streamInterrupted`**

> EN — The connection dropped before the reply finished.

La connexion a été interrompue avant la fin de la réponse.

**`voice.errors.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

La connexion a été interrompue — la réponse ci-dessus est peut-être incomplète.

**`voice.errors.too_large`**

> EN — That recording is too long.

Cet enregistrement est trop long.

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

Vous êtes déconnecté. Connectez-vous et réessayez.

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

Ce navigateur ne peut pas enregistrer de son. Vous pouvez toujours écrire.

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

Ce format audio n'est pas pris en charge.

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

Impossible de vérifier les minutes de voix pour le moment.

**`voice.listening`**

> EN — Listening

À l'écoute

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

Parlez, puis appuyez sur Arrêter. Rien n'est envoyé avant que vous l'ayez lu.

**`voice.permission.allow`**

> EN — Open the microphone

Ouvrir le micro

**`voice.permission.cancel`**

> EN — Not now

Pas maintenant

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

{credits, plural, one {# crédit} other {# crédits}} par minute, {minutes, plural, one {# minute} other {# minutes}} par mois sur votre offre.

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

Vous lisez et corrigez le texte avant tout envoi.

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

L'audio est envoyé pour transcription et n'est stocké nulle part — ni chez nous, ni ensuite.

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

L'enregistrement ne démarre qu'à votre appui et s'arrête au suivant.

**`voice.permission.title`**

> EN — Before the microphone opens

Avant l'ouverture du micro

**`voice.startListening`**

> EN — Speak instead of typing

Parler au lieu d'écrire

**`voice.stopListening`**

> EN — Stop

Arrêter

**`common.nextPage`**

> EN — Next page

Page suivante

**`common.paginationNext`**

> EN — Next

Suiv.

**`common.paginationPage`**

> EN — Page {page} / {total}

Page {page} / {total}

**`common.paginationPrev`**

> EN — Prev

Préc.

**`common.previousPage`**

> EN — Previous page

Page précédente

**`common.updated`**

> EN — ✓ updated

✓ mis à jour

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

Concurrents :

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

pour : {customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

Taille du marché :

**`dashboard.ideas.cardMvp`**

> EN — MVP:

Produit minimum viable :

**`dashboard.ideas.cardProblem`**

> EN — Problem:

Problème :

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

Note : {score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

Supprimer cette idée ? Action irréversible.

**`dashboard.ideas.edit`**

> EN — Edit Idea

Modifier l'idée

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

Modifier l'idée : {name}

**`entityLinks.linked`**

> EN — Linked

Lié

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

Cela pourrait être lié à : {titles}. Les lier ?

**`entityLinks.no`**

> EN — No

Non

**`entityLinks.yes`**

> EN — Yes

Oui

**`module.edit`**

> EN — Edit

Modifier

**`module.loggedAt`**

> EN — Logged {when}

Enregistré {when}

**`module.sort.label`**

> EN — Sort:

Trier :

**`askAi.buttonLabel`**

> EN — Ask AI

Demander à l'IA

**`common.networkError`**

> EN — Network error — please try again.

Erreur réseau — veuillez réessayer.

**`common.textActions.accept`**

> EN — Accept

Accepter

**`common.textActions.reject`**

> EN — Reject

Rejeter

**`entityLinks.buttonLabel`**

> EN — Link to...

Lier à...

**`entityLinks.linkedToLabel`**

> EN — Linked to:

Lié à :

**`entityLinks.unlink`**

> EN — Unlink

Dissocier

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

Dissocier {name}

**`favorites.add`**

> EN — Add to favorites

Ajouter aux favoris

**`favorites.remove`**

> EN — Remove from favorites

Retirer des favoris

**`module.delete`**

> EN — Delete

Supprimer

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

Supprimer ce {label} ? Action irréversible.

**`module.deleted`**

> EN — Deleted

Supprimé

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

Il a aussi lu {count, plural, one {# message précédent} other {# messages précédents}} sur cette entrée

**`askAi.close`**

> EN — Close

Fermer

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

Posez une question sur cette entrée — pas besoin d'expliquer le contexte, l'IA l'a déjà.

**`askAi.placeholder`**

> EN — Ask anything about this entry...

Posez une question sur cette entrée...

**`askAi.send`**

> EN — Send

Envoyer

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

La connexion a été interrompue avant la fin de la réponse.

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

La connexion a été interrompue — la réponse ci-dessus est peut-être incomplète.

**`askAi.title`**

> EN — Ask AI about this {title}

Demandez à l'IA à propos de ce {title}

**`common.errorWithMessage`**

> EN — error: {message}

erreur : {message}

**`common.linked`**

> EN — ✓ linked

✓ lié

**`common.newMessagesBelow`**

> EN — New message below

Nouveau message en bas

**`entityLinks.modalTitle`**

> EN — Link to...

Lier à...

**`entityLinks.noMatches`**

> EN — No matches.

Aucun résultat.

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

À quel module voulez-vous lier ?

**`entityLinks.searching`**

> EN — Searching...

Recherche...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

Rechercher dans {module}...

**`aiSteps.counter`**

> EN — ({step}/{total})

({step}/{total})
