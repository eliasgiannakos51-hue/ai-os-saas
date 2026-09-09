# The first run — fr

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **598 strings**. The whole product is 2985, which is why this file exists.

**Start with tier 1. It is 44 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 364 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (44)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

Nous n'avons pas pu créer le compte. Vérifiez les informations et réessayez — vous n'avez pas été débité.

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

Vous devez accepter les Conditions d'utilisation et la Politique de confidentialité pour créer un compte.

**`pricing.businessCardDescription`**

> EN — Start with any plan as your team's base, then invite members for +{price}/month each — everyone gets full access at your plan's tier. Perfect for teams working together.

Commencez avec n'importe quel plan comme base pour votre équipe, puis invitez des membres pour +{price}/mois chacun — tout le monde obtient un accès complet au niveau de votre plan. Parfait pour les équipes qui travaillent ensemble.

### login

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

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

Ces entrées sont une démo : trois mois d'un petit studio de design. Elles ne sont pas les vôtres.

**`sidebar.hints.apps`**

> EN — Keep track of apps you are planning or have already shipped. It does not build them.

Suivez les applis que vous préparez ou avez déjà livrées. Ne les construit pas.

**`sidebar.hints.coding`**

> EN — Write, explain, fix, convert and test snippets of code. It does not run code or open a repository.

Écrivez, expliquez, corrigez, convertissez et testez des extraits de code. N'exécute pas de code et n'ouvre pas de dépôt.

**`sidebar.hints.create`**

> EN — Describe what you want in one sentence; it works out the rest.

Décrivez ce que vous voulez en une phrase ; il déduit le reste.

**`sidebar.hints.deepResearch`**

> EN — Give it a topic and it searches, cross-checks and writes a sourced report

Donnez un sujet : il cherche, recoupe et rédige un rapport sourcé

**`sidebar.hints.files`**

> EN — Upload PDFs, Word and Excel files and ask the AI questions about them

Importez des PDF, Word et Excel et posez des questions à l'IA

**`sidebar.hints.images`**

> EN — Keep track of images you are planning or have already made. It does not generate them.

Suivez les images que vous préparez ou avez déjà faites. Ne les génère pas.

**`sidebar.hints.integrations`**

> EN — Connect Gmail, Drive and Slack so the AI can work with your real data

Connectez Gmail, Drive et Slack pour que l'IA travaille sur vos vraies données

**`sidebar.hints.library`**

> EN — Starred, recent and search — all your own entries in one place

Favoris, récents et recherche — tout ce qui est à vous

**`sidebar.hints.marketplace`**

> EN — Share an agent's shape as a template, and start from one someone else shared.

Partagez la forme d'un agent comme modèle et partez de celui qu'une autre personne a partagé.

**`sidebar.hints.predictions`**

> EN — Patterns found in your own rows, each with the number of entries it rests on and a link to them.

Des tendances dans vos propres entrées, chacune avec le nombre d'enregistrements sur lequel elle repose et un lien vers eux.

**`sidebar.hints.presentations`**

> EN — Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts.

Décrivez une présentation et obtenez les diapositives : PowerPoint ou PDF, avec des photos d'Unsplash ou les vôtres. Aucun graphique.

**`sidebar.hints.published`**

> EN — Every site you have live on the web, with its traffic and version history

Tous vos sites en ligne, avec leur trafic et leur historique de versions

**`sidebar.hints.records`**

> EN — Every log in one place — filter by type instead of hunting the menu

Tous vos enregistrements au même endroit : filtrez par type au lieu de fouiller le menu

**`sidebar.hints.videos`**

> EN — Keep track of videos you are planning or have already made. It does not generate them.

Suivez les vidéos que vous préparez ou avez déjà faites. Ne les génère pas.

**`sidebar.hints.voice`**

> EN — Have text read out loud, or speak and have it written down. Minutes are metered and the price per minute is on the page.

Faites lire un texte à voix haute, ou parlez et il s'écrit. Les minutes sont comptées et le prix à la minute figure sur la page.

### first result

**`dashboard.overview.healthScore.suggestion.recency`**

> EN — You haven't logged anything in a while — add a new entry to pick things back up.

Vous n'avez rien enregistré depuis un moment — ajoutez une entrée pour reprendre.

**`dashboard.overview.nextAction.revisitLink`**

> EN — You linked "{source}" to "{target}" a few days ago — worth revisiting?

Vous avez lié "{source}" à "{target}" il y a quelques jours — ça vaut le coup d'y revenir ?

**`dashboard.overview.nextAction.startNew`**

> EN — No new activity in the last 3 days — ready to start something new?

Aucune nouvelle activité depuis 3 jours — prêt à commencer quelque chose de nouveau ?

**`dashboard.overview.setupProgress.suggestion`**

> EN — Your activity score appears once you have logged {count} entries — enough that no single one decides it.

Votre score d'activité apparaît une fois {count} entrées enregistrées — assez pour qu'aucune seule ne le décide.

**`dashboard.overview.statRow.mostActiveExplain`**

> EN — The module you have written in most. Where your attention has gone.

Le module où vous écrivez le plus. Là où va votre attention.

**`dashboard.overview.statRow.thisWeekExplain`**

> EN — Logged in the last seven days — how active this week has been.

Enregistré ces sept derniers jours — à quel point la semaine a été active.

**`common.betaExpiry`**

> EN — Your beta access expires in {days, plural, one {# day} other {# days}}. <link>Upgrade to keep full access</link>.

Votre accès bêta expire dans {days, plural, one {# jour} other {# jours}}. <link>Passez à un forfait supérieur pour garder l'accès complet</link>.

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

Les {count, number} plus récentes sont affichées. Les entrées plus anciennes sont toujours enregistrées — utilisez la recherche dans vos enregistrements pour les retrouver.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

Cela ressemble à une question. Dois-je y répondre ou l'enregistrer ?

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

Décrivez n'importe quoi — une idée de produit, une opération, le retour d'un utilisateur, un indicateur — et cela atterrit automatiquement dans le bon module.

**`dashboard.energyCheckIn.whatItDoes`**

> EN — Ionexa uses this to pick which plan step to suggest next — lighter work when you're low, demanding work when you're not.

Ionexa s'en sert pour choisir quelle étape du plan vous proposer — du travail léger quand vous êtes bas, exigeant sinon.

**`sampleData.loadFree`**

> EN — Free — nothing is generated, and you can remove it in one click

Gratuit : rien n'est généré, et vous pouvez tout retirer en un clic

## Tier 2 — The labels — skim these (364)

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

> EN — Every member gets full access at your plan's tier

Chaque membre obtient un accès complet au niveau de votre plan

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

**`pricing.features.aiMemory`**

> EN — AI Memory

Mémoire IA

**`pricing.features.basicAiChat`**

> EN — Basic AI chat

Chat IA basique

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, one {# crédit} other {# crédits}}/mois

**`pricing.features.customAiPersonaNameInIonexaChat`**

> EN — Custom AI persona name in Ionexa Chat

Nom d'assistant IA personnalisé dans Ionexa Chat

**`pricing.features.customCredits`**

> EN — Custom credits

Crédits personnalisés

**`pricing.features.everythingInGrowth`**

> EN — Everything in Growth

Tout ce que contient Growth

**`pricing.features.everythingInProfessional`**

> EN — Everything in Professional

Tout ce que contient Professional

**`pricing.features.everythingInStarter`**

> EN — Everything in Starter

Tout ce que contient Starter

**`pricing.features.everythingInUltimate`**

> EN — Everything in Ultimate

Tout ce que contient Ultimate

**`pricing.features.extendedChatMemoryRetention100Vs20RecentFact`**

> EN — Extended chat memory retention (100 vs 20 recent facts)

Rétention de mémoire de conversation étendue (100 contre 20 faits récents)

**`pricing.features.teamCollaboration`**

> EN — Team collaboration

Collaboration d'équipe

**`pricing.features.unlimitedMembers`**

> EN — Unlimited members

Membres illimités

**`pricing.features.unlimitedTeamSeatsIncludedNoPerMemberCharge`**

> EN — Unlimited team seats included — no per-member charge

Sièges d'équipe illimités inclus — sans frais par membre

**`pricing.features.upTo100AiAgents`**

> EN — Up to 100 AI agents

Jusqu'à 100 agents IA

**`pricing.features.upTo15AiAgentsTeams`**

> EN — Up to 15 AI agents & teams

Jusqu'à 15 agents IA et équipes

**`pricing.features.upTo2AiAgents`**

> EN — Up to 2 AI agents

Jusqu'à 2 agents IA

**`pricing.features.upTo50AiAgents`**

> EN — Up to 50 AI agents

Jusqu'à 50 agents IA

**`pricing.features.upTo5AiAgents`**

> EN — Up to 5 AI agents

Jusqu'à 5 agents IA

**`pricing.features.websiteAutomationBuilderAccess`**

> EN — Website & Automation Builder access

Accès à Website & Automation Builder

**`pricing.perMonth`**

> EN — /month

/mois

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

**`sidebar.groups.ask`**

> EN — Ask

Demander

**`sidebar.groups.build`**

> EN — Build

Créer

**`sidebar.groups.business`**

> EN — Business

Entreprise

**`sidebar.groups.create`**

> EN — Create

Créer

**`sidebar.groups.daily`**

> EN — Daily

Au quotidien

**`sidebar.groups.insights`**

> EN — What I noticed

Ce que j’ai remarqué

**`sidebar.groups.make`**

> EN — Make

Créer

**`sidebar.groups.marketplace`**

> EN — Marketplace

Place de marché

**`sidebar.groups.myBusiness`**

> EN — My business

Mon activité

**`sidebar.groups.operations`**

> EN — Operations

Opérations

**`sidebar.groups.organise`**

> EN — Organise

Organiser

**`sidebar.groups.run`**

> EN — Run

Lancer

**`sidebar.groups.see`**

> EN — See

Consulter

**`sidebar.groups.settings`**

> EN — Settings

Paramètres

**`sidebar.groups.strategy`**

> EN — Strategy

Stratégie

**`sidebar.groups.track`**

> EN — Track

Suivre

**`sidebar.groups.tracking`**

> EN — Tracking

Suivi

**`sidebar.groups.work`**

> EN — Work

Travailler

**`sidebar.groups.workspace`**

> EN — Workspace

Espace de travail

**`sidebar.hints.affiliate`**

> EN — Your referral link, what you've earned, and how you get paid.

Votre lien de parrainage, vos gains et comment vous êtes payé.

**`sidebar.hints.agents`**

> EN — Plan the agents you want. A tracker, not a runtime.

Planifiez les agents souhaités. Un suivi, pas un moteur.

**`sidebar.hints.analytics`**

> EN — Metrics you're watching.

Les indicateurs que vous suivez.

**`sidebar.hints.automation`**

> EN — Things that run on a schedule.

Ce qui s'exécute selon un calendrier.

**`sidebar.hints.businessHealth`**

> EN — MRR, margin, churn and runway. Owner only.

MRR, marge, attrition et trésorerie. Propriétaire uniquement.

**`sidebar.hints.campaigns`**

> EN — Plan campaigns — channel, budget, status.

Planifiez des campagnes — canal, budget, statut.

**`sidebar.hints.chat`**

> EN — Ask anything — not tied to any module.

Demandez n'importe quoi — sans lien avec un module.

**`sidebar.hints.competitors`**

> EN — Track rival products, pricing and positioning.

Suivez produits concurrents, prix et positionnement.

**`sidebar.hints.content`**

> EN — Content ideas, captions and threads.

Idées de contenu, légendes et fils.

**`sidebar.hints.costs`**

> EN — What every AI call has cost, per model and per day.

Ce qu'a coûté chaque appel d'IA, par modèle et par jour.

**`sidebar.hints.dataAnalysis`**

> EN — Analysis requests and what you found.

Demandes d'analyse et ce que vous avez trouvé.

**`sidebar.hints.decisions`**

> EN — Weigh the options before you decide.

Pesez les options avant de trancher.

**`sidebar.hints.documents`**

> EN — Freeform notes and documents you write yourself.

Notes et documents libres que vous rédigez vous-même.

**`sidebar.hints.favorites`**

> EN — Everything you've starred.

Tout ce que vous avez mis en favori.

**`sidebar.hints.feedback`**

> EN — What users told you, in one place.

Ce que les utilisateurs vous ont dit, au même endroit.

**`sidebar.hints.finance`**

> EN — Log income and expenses.

Notez revenus et dépenses.

**`sidebar.hints.formSubmissions`**

> EN — Everything visitors sent through a form on your published sites

Tout ce que les visiteurs ont envoyé via un formulaire sur vos sites publiés

**`sidebar.hints.help`**

> EN — Answers to the questions people ask most — no credits used.

Les réponses aux questions les plus fréquentes, sans consommer de crédits.

**`sidebar.hints.home`**

> EN — Your dashboard — activity, stats and quick actions.

Votre tableau de bord — activité, statistiques et actions rapides.

**`sidebar.hints.ideas`**

> EN — Capture new ideas before you forget them.

Notez les nouvelles idées avant de les oublier.

**`sidebar.hints.learning`**

> EN — Track what you're studying.

Suivez ce que vous apprenez.

**`sidebar.hints.memory`**

> EN — What the AI remembers about you.

Ce que l'IA retient de vous.

**`sidebar.hints.mine`**

> EN — Everything you have made, newest first — with a starred-only tab

Tout ce que vous avez créé, du plus récent au plus ancien, avec un onglet favoris

**`sidebar.hints.missionControl`**

> EN — Set a goal, AI breaks it into steps.

Fixez un objectif, l'IA le découpe en étapes.

**`sidebar.hints.newEntry`**

> EN — Write anything down — it files itself

Écrivez n’importe quoi — le classement se fait tout seul

**`sidebar.hints.products`**

> EN — Product plans — pricing, roadmap, launch.

Plans produit — tarifs, feuille de route, lancement.

**`sidebar.hints.productWorkflow`**

> EN — Your products, patterns and mentor in one view.

Vos produits, vos schémas et votre mentor en une vue.

**`sidebar.hints.reflection`**

> EN — A weekly summary of your progress.

Un résumé hebdomadaire de vos progrès.

**`sidebar.hints.research`**

> EN — Save research, sources and summaries.

Conservez recherches, sources et résumés.

**`sidebar.hints.routing`**

> EN — Which model each kind of request is sent to.

À quel modèle chaque type de requête est envoyé.

**`sidebar.hints.sales`**

> EN — Leads, outreach and next steps.

Prospects, prise de contact et prochaines étapes.

**`sidebar.hints.settings`**

> EN — Account, billing, language and preferences.

Compte, facturation, langue et préférences.

**`sidebar.hints.systemHealth`**

> EN — Whether the database, the queues and the providers are answering.

Si la base, les files d'attente et les fournisseurs répondent.

**`sidebar.hints.team`**

> EN — Invite people to your workspace.

Invitez des personnes dans votre espace.

**`sidebar.hints.timeline`**

> EN — Everything you've done, in order.

Tout ce que vous avez fait, dans l'ordre.

**`sidebar.hints.trading`**

> EN — Trade log — symbol, direction, result, P&L.

Journal de trades — symbole, sens, résultat, P&L.

**`sidebar.hints.tradingJournal`**

> EN — Your trades, with the reasoning you wrote at the time.

Vos transactions, avec le raisonnement noté sur le moment.

**`sidebar.hints.tradingWorkflow`**

> EN — Your trades, patterns and mentor in one view.

Vos trades, vos schémas et votre mentor en une vue.

**`sidebar.hints.websiteBuilder`**

> EN — Describe a site and AI generates the real page.

Décrivez un site et l'IA génère la vraie page.

**`sidebar.hints.websites`**

> EN — Track sites you own — name, URL, status. No generation.

Suivez les sites que vous possédez — nom, URL, statut. Sans génération.

**`sidebar.items.affiliate`**

> EN — Affiliate

Affiliation

**`sidebar.items.agents`**

> EN — AI Agents

Agents IA

**`sidebar.items.analytics`**

> EN — Analytics

Analytique

**`sidebar.items.apps`**

> EN — App notes

Notes d’applications

**`sidebar.items.automation`**

> EN — Automation

Automatisation

**`sidebar.items.businessHealth`**

> EN — Business health

Santé de l'entreprise

**`sidebar.items.campaigns`**

> EN — Campaign notes

Notes de campagnes

**`sidebar.items.chat`**

> EN — Ionexa Chat

Ionexa Discussion

**`sidebar.items.coding`**

> EN — AI Coding

Code avec l'IA

**`sidebar.items.competitors`**

> EN — Competitors

Concurrents

**`sidebar.items.content`**

> EN — Content

Contenu

**`sidebar.items.costs`**

> EN — Costs

Coûts

**`sidebar.items.dataAnalysis`**

> EN — Data Analysis

Analyse de données

**`sidebar.items.decisions`**

> EN — Decisions

Décisions

**`sidebar.items.deepResearch`**

> EN — Deep Research

Recherche approfondie

**`sidebar.items.documents`**

> EN — Documents

Documents

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

> EN — Image notes

Notes d’images

**`sidebar.items.integrations`**

> EN — Integrations

Intégrations

**`sidebar.items.learning`**

> EN — Learning

Apprentissage

**`sidebar.items.library`**

> EN — My stuff

Mes affaires

**`sidebar.items.marketplace`**

> EN — Marketplace

Place de marché

**`sidebar.items.memory`**

> EN — Search my records

Chercher dans mes données

**`sidebar.items.mine`**

> EN — Mine

Mes éléments

**`sidebar.items.missionControl`**

> EN — Goals & Plans

Objectifs et plans

**`sidebar.items.newEntry`**

> EN — New entry

Nouvelle entrée

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

**`sidebar.items.published`**

> EN — Live sites

Sites en ligne

**`sidebar.items.records`**

> EN — My records

Mes enregistrements

**`sidebar.items.reflection`**

> EN — Weekly Reflection

Bilan Hebdomadaire

**`sidebar.items.research`**

> EN — Research

Recherche

**`sidebar.items.routing`**

> EN — Model routing

Routage des modèles

**`sidebar.items.sales`**

> EN — Sales

Ventes

**`sidebar.items.settings`**

> EN — Settings

Paramètres

**`sidebar.items.systemHealth`**

> EN — System Health

État du système

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

**`sidebar.items.videos`**

> EN — Video notes

Notes de vidéos

**`sidebar.items.voice`**

> EN — Voice

Voix

**`sidebar.items.websiteBuilder`**

> EN — Build a site

Créer un site

**`sidebar.items.websites`**

> EN — Website plans

Projets de sites

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

Impossible de charger vos idées : {message}

**`dashboard.insights.title`**

> EN — What I noticed

Ce que j'ai remarqué

**`dashboard.overview.activeMission.open`**

> EN — Open the plan

Ouvrir le plan

**`dashboard.overview.activeMission.stepsLabel`**

> EN — {completed}/{total} steps completed

{completed}/{total} étapes terminées

**`dashboard.overview.aiCoach.entryCount`**

> EN — {count, plural, one {# new {module} entry} other {# new {module} entries}}

{count, plural, one {# nouvelle entrée dans {module}} other {# nouvelles entrées dans {module}}}

**`dashboard.overview.aiCoach.mostActiveIn`**

> EN — Most active in {module}

Le plus actif dans {module}

**`dashboard.overview.aiCoach.noActivity`**

> EN — No activity yet this week — log something to get started.

Aucune activité cette semaine — enregistrez quelque chose pour commencer.

**`dashboard.overview.betaFeedback.linkLabel`**

> EN — Share feedback

Envoyer un avis

**`dashboard.overview.betaFeedback.message`**

> EN — Thanks for testing Ionexa AI. Your feedback is welcome.

Merci de tester Ionexa AI. Votre avis est le bienvenu.

**`dashboard.overview.healthScore.buildingMomentum`**

> EN — Building momentum

Vous prenez de l'élan

**`dashboard.overview.healthScore.excellentConsistency`**

> EN — Excellent consistency

Excellente régularité

**`dashboard.overview.healthScore.justStarting`**

> EN — Just getting started

Vous débutez

**`dashboard.overview.healthScore.strongProgress`**

> EN — Strong progress

Bons progrès

**`dashboard.overview.healthScore.suggestion.consistency`**

> EN — Try logging something every day this week.

Essayez d'enregistrer quelque chose chaque jour cette semaine.

**`dashboard.overview.healthScore.suggestion.coverage`**

> EN — Try exploring a module you haven't used yet.

Essayez d'explorer un module que vous n'avez pas encore utilisé.

**`dashboard.overview.healthScore.suggestion.missionSteps`**

> EN — Complete a plan step to keep your momentum going.

Terminez une étape du plan pour garder votre élan.

**`dashboard.overview.healthScore.title`**

> EN — Business Health Score

Score de Santé de l'Entreprise

**`dashboard.overview.next.title`**

> EN — Next

La suite

**`dashboard.overview.nextAction.continueMission`**

> EN — Continue: {step} from your "{goal}" plan

Continuer : {step} de votre plan "{goal}"

**`dashboard.overview.nextAction.cta`**

> EN — Go there →

Y aller →

**`dashboard.overview.setupProgress.count`**

> EN — {done} of {total} steps

{done} sur {total} étapes

**`dashboard.overview.setupProgress.steps.firstEntry`**

> EN — Log your first entry

Enregistrez votre première entrée

**`dashboard.overview.setupProgress.steps.mission`**

> EN — Set a goal

Définissez un objectif

**`dashboard.overview.setupProgress.steps.onboarding`**

> EN — Finish the welcome questions

Terminez les questions d'accueil

**`dashboard.overview.setupProgress.steps.secondModule`**

> EN — Log something in a second area

Enregistrez quelque chose dans un deuxième domaine

**`dashboard.overview.setupProgress.title`**

> EN — Setup progress

Progression de la configuration

**`dashboard.overview.statRow.creditsExplain`**

> EN — What is left of this month's allowance for AI work.

Ce qu'il reste de votre quota mensuel pour le travail avec l'IA.

**`dashboard.overview.statRow.creditsRemaining`**

> EN — Credits Remaining

Crédits Restants

**`dashboard.overview.statRow.fillsAfter`**

> EN — Fills in after {count} entries

Se remplit après {count} entrées

**`dashboard.overview.statRow.fromEntries`**

> EN — {count, plural, one {from # entry} other {from # entries}}

{count, plural, one {à partir de # entrée} other {à partir de # entrées}}

**`dashboard.overview.statRow.mostActive`**

> EN — Most Active

Le Plus Actif

**`dashboard.overview.statRow.ofTotal`**

> EN — {count, plural, one {of # in total} other {of # in total}}

{count, plural, one {sur # au total} other {sur # au total}}

**`dashboard.overview.statRow.openCredits`**

> EN — See the ledger →

Voir l'historique →

**`dashboard.overview.statRow.openEntries`**

> EN — See the entries →

Voir les entrées →

**`dashboard.overview.statRow.thisWeek`**

> EN — This Week

Cette Semaine

**`dashboard.overview.statRow.totalEntries`**

> EN — Total Entries

Total des Entrées

**`dashboard.overview.statRow.totalEntriesExplain`**

> EN — Everything you have logged, in every module, since you started.

Tout ce que vous avez enregistré, dans chaque module, depuis le début.

**`dashboard.overview.whatChanged.entries`**

> EN — new entries

nouvelles entrées

**`dashboard.overview.whatChanged.insights`**

> EN — new insights

nouveaux constats

**`dashboard.overview.whatChanged.since`**

> EN — since {when}

depuis {when}

**`dashboard.overview.whatChanged.title`**

> EN — What changed

Ce qui a changé

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

**`dashboard.energyCheckIn.change`**

> EN — Change

Modifier

**`dashboard.energyCheckIn.checkedInToday`**

> EN — Today's energy: {level}/5.

Énergie du jour : {level}/5.

**`dashboard.energyCheckIn.levelLabel`**

> EN — Energy level {level}

Niveau d'énergie {level}

**`dashboard.energyCheckIn.logged`**

> EN — Energy logged

Énergie enregistrée

**`dashboard.energyCheckIn.notePlaceholder`**

> EN — Optional note...

Note facultative...

**`dashboard.energyCheckIn.prompt`**

> EN — How's your energy today?

Comment est votre énergie aujourd'hui ?

**`dashboard.energyCheckIn.scaleHigh`**

> EN — 5 = great

5 = au top

**`dashboard.energyCheckIn.scaleLow`**

> EN — 1 = exhausted

1 = épuisé

**`dashboard.energyCheckIn.title`**

> EN — Energy Check-In

Bilan d'Énergie

**`dashboard.firstScreen.build.example`**

> EN — Build a website for my shop

Créez un site pour ma boutique

**`dashboard.firstScreen.build.verb`**

> EN — Build

Créez

**`dashboard.firstScreen.cost.charged`**

> EN — Uses credits

Consomme des crédits

**`dashboard.firstScreen.cost.free`**

> EN — Free

Gratuit

**`dashboard.firstScreen.cost.freeAllowance`**

> EN — Free up to your monthly limit

Gratuit jusqu’à votre limite mensuelle

**`dashboard.firstScreen.label`**

> EN — Press one — it runs right away

Cliquez sur l’un — il s’exécute aussitôt

**`dashboard.firstScreen.repeat.example`**

> EN — Every Monday, a summary of my sales

Chaque lundi, un résumé de mes ventes

**`dashboard.firstScreen.repeat.verb`**

> EN — Repeat

Répétez

**`dashboard.firstScreen.understand.example`**

> EN — What do my numbers say this week?

Que disent mes chiffres cette semaine ?

**`dashboard.firstScreen.understand.verb`**

> EN — Understand

Comprenez

**`dashboard.overview.recentEntries.empty`**

> EN — No entries yet.

Aucune entrée pour l'instant.

**`dashboard.overview.recentEntries.title`**

> EN — Recent Entries

Entrées Récentes

**`errors.creditHistory`**

> EN — See credit history

Voir l'historique des crédits

**`errors.retry`**

> EN — Try again

Réessayer

**`sampleData.load`**

> EN — See it with sample data

Voir avec des données d'exemple

**`sampleData.loadFailed`**

> EN — That did not work. Try again.

Cela n'a pas marché. Réessayez.

**`sampleData.loading`**

> EN — Loading…

Chargement…

## Tier 3 — Further in — only if you have time (190)

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

**`common.switchToDarkMode`**

> EN — Switch to dark mode

Passer au thème sombre

**`common.switchToLightMode`**

> EN — Switch to light mode

Passer au thème clair

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

**`voice.outOfMinutes`**

> EN — No voice minutes left this month

Plus de minutes de voix ce mois-ci

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

**`voice.settings.notConfigured`**

> EN — Voice is not set up on this deployment, so the microphone and Listen buttons do not appear.

La voix n'est pas configurée sur cette installation : les boutons micro et Écouter n'apparaissent pas.

**`voice.settings.notIncluded`**

> EN — Voice is not included on your plan. Everything here can still be typed and read.

La voix n'est pas incluse dans votre offre. Tout ici reste accessible en écrivant et en lisant.

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
