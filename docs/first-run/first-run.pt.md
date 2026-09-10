# The first run — pt

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **610 strings**. The whole product is 3067, which is why this file exists.

**Start with tier 1. It is 46 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 366 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (46)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

Não conseguimos criar a conta. Verifica os dados e tenta outra vez — não te foi cobrado nada.

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

Tem de aceitar os Termos de Serviço e a Política de Privacidade para criar uma conta.

**`pricing.businessCardDescription`**

> EN — Start with any plan as your team's base, then invite members for +{price}/month each — everyone gets full access at your plan's tier. Perfect for teams working together.

Comece com qualquer plano como base da sua equipe, depois convide membros por +{price}/mês cada — todos obtêm acesso completo ao nível do seu plano. Perfeito para equipes que trabalham juntas.

### login

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

Não conseguimos iniciar a tua sessão. Verifica o email e a palavra-passe, ou repõe-na se não tiveres a certeza.

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

Esse início de sessão não foi concluído. Tente novamente ou use o seu e-mail e palavra-passe abaixo.

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

Traz dados reais e a IA vai dizer-te algo sobre o teu negócio em dois minutos.

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

Os teus dados continuam a ser teus. São guardados de forma privada, só tu os podes ler, e nunca são usados para treinar nada. Podes apagá-los, ou a conta inteira, quando quiseres.

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

Apenas padrões reais do que acabaste de importar. Se não houver o suficiente para ter certeza, dizemos isso.

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV ou separado por tabulações, até {max}. Lemos e mostramos o que encontrámos antes de guardar seja o que for.

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

As tuas datas podem ser dia/mês ou mês/dia — todas caem no dia 12 ou antes, por isso não conseguimos saber. Qual é?

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

A tua primeira importação e análise são gratuitas — não vão usar créditos.

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

Ainda não há aqui o suficiente para falar de um padrão. Algumas dezenas de linhas com datas costuma ser o ponto em que as coisas começam a aparecer — e preferimos não dizer nada a inventar algo.

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

Um plano de negócios, notas de reunião, uma lista de clientes. Extraímos o que é registável e deixamos o resto.

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

Um CSV exportado da tua corretora, banco ou CRM. Percebemos o que é cada coluna.

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

Escolhe o que for mais fácil. Nada é obrigatório e podes adicionar mais depois.

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

Um plano de negócios, notas, uma lista — extraímos as partes estruturadas.

### dashboard chrome

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

Estas entradas são uma demonstração — três meses de um pequeno estúdio de design. Não são suas.

**`sidebar.hints.apps`**

> EN — Keep track of apps you are planning or have already shipped. It does not build them.

Acompanhe as apps que está a planear ou já lançou. Não as constrói.

**`sidebar.hints.coding`**

> EN — Write, explain, fix, convert and test snippets of code. It does not run code or open a repository.

Escreva, explique, corrija, converta e teste excertos de código. Não executa código nem abre um repositório.

**`sidebar.hints.create`**

> EN — Describe what you want in one sentence; it works out the rest.

Descreva o que quer numa frase; o resto ele descobre.

**`sidebar.hints.deepResearch`**

> EN — Give it a topic and it searches, cross-checks and writes a sourced report

Dá um tema: pesquisa, cruza fontes e escreve um relatório com referências

**`sidebar.hints.files`**

> EN — Upload PDFs, Word and Excel files and ask the AI questions about them

Carrega PDF, Word e Excel e faz perguntas à IA sobre eles

**`sidebar.hints.images`**

> EN — Keep track of images you are planning or have already made. It does not generate them.

Acompanhe as imagens que está a planear ou já fez. Não as gera.

**`sidebar.hints.integrations`**

> EN — Connect Gmail, Drive and Slack so the AI can work with your real data

Ligue Gmail, Drive e Slack para a IA trabalhar com os seus dados reais

**`sidebar.hints.library`**

> EN — Starred, recent and search — all your own entries in one place

Favoritos, recentes e pesquisa — tudo o seu num só sítio

**`sidebar.hints.marketplace`**

> EN — Share an agent's shape as a template, and start from one someone else shared.

Partilhe a forma de um agente como modelo e comece a partir de um que outra pessoa partilhou.

**`sidebar.hints.posts`**

> EN — Say it once and get a post per platform, each at its length and in its register. It publishes nothing — you copy and post.

Diz uma vez e recebe uma publicação por plataforma, no seu tamanho e tom. Não publica nada: copias e publicas tu.

**`sidebar.hints.predictions`**

> EN — Patterns found in your own rows, each with the number of entries it rests on and a link to them.

Padrões nos seus próprios registos, cada um com o número de entradas em que assenta e uma ligação para elas.

**`sidebar.hints.presentations`**

> EN — Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts.

Descreve uma apresentação e recebe os diapositivos: PowerPoint ou PDF, com fotos do Unsplash ou tuas. Não desenha gráficos.

**`sidebar.hints.projects`**

> EN — A folder with a goal. What you put in is what is in it — nothing is dragged in with it.

Uma pasta com um objetivo. O que colocas é o que lá está — nada entra sozinho.

**`sidebar.hints.published`**

> EN — Every site you have live on the web, with its traffic and version history

Todos os seus sites no ar, com o tráfego e o histórico de versões

**`sidebar.hints.records`**

> EN — Every log in one place — filter by type instead of hunting the menu

Todos os registos num só lugar — filtre por tipo em vez de procurar no menu

**`sidebar.hints.videos`**

> EN — Keep track of videos you are planning or have already made. It does not generate them.

Acompanhe os vídeos que está a planear ou já fez. Não os gera.

**`sidebar.hints.voice`**

> EN — Have text read out loud, or speak and have it written down. Minutes are metered and the price per minute is on the page.

Ouça um texto lido em voz alta, ou fale e ele é escrito. Os minutos são contados e o preço por minuto está na página.

### first result

**`dashboard.overview.healthScore.suggestion.recency`**

> EN — You haven't logged anything in a while — add a new entry to pick things back up.

Você não registra nada há um tempo — adicione uma nova entrada para retomar.

**`dashboard.overview.nextAction.revisitLink`**

> EN — You linked "{source}" to "{target}" a few days ago — worth revisiting?

Você vinculou "{source}" a "{target}" há alguns dias — vale a pena revisitar?

**`dashboard.overview.nextAction.startNew`**

> EN — No new activity in the last 3 days — ready to start something new?

Nenhuma atividade nova nos últimos 3 dias — pronto para começar algo novo?

**`dashboard.overview.setupProgress.suggestion`**

> EN — Your activity score appears once you have logged {count} entries — enough that no single one decides it.

A sua pontuação de atividade aparece assim que registar {count} entradas — suficientes para que nenhuma sozinha a decida.

**`dashboard.overview.statRow.mostActiveExplain`**

> EN — The module you have written in most. Where your attention has gone.

O módulo onde mais escreve. Para onde vai a sua atenção.

**`dashboard.overview.statRow.thisWeekExplain`**

> EN — Logged in the last seven days — how active this week has been.

Registado nos últimos sete dias — o quão ativa foi a semana.

**`common.betaExpiry`**

> EN — Your beta access expires in {days, plural, one {# day} other {# days}}. <link>Upgrade to keep full access</link>.

Seu acesso beta expira em {days, plural, one {# dia} other {# dias}}. <link>Faça upgrade para manter o acesso completo</link>.

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

A mostrar as {count, number} mais recentes. As entradas mais antigas continuam guardadas — use a pesquisa nos seus registos para as encontrar.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

Isso parece uma pergunta. Respondo ou registo?

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

Descreva qualquer coisa — uma ideia de produto, uma operação, o feedback de um utilizador, uma métrica — e vai parar automaticamente ao módulo certo.

**`dashboard.energyCheckIn.whatItDoes`**

> EN — Ionexa uses this to pick which plan step to suggest next — lighter work when you're low, demanding work when you're not.

O Ionexa usa isto para escolher que passo do plano te sugerir — trabalho leve quando estás em baixo, exigente quando não estás.

**`sampleData.loadFree`**

> EN — Free — nothing is generated, and you can remove it in one click

Grátis — não é gerado nada, e remove com um clique

## Tier 2 — The labels — skim these (366)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

Concordo com os

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

Já tem uma conta?

**`auth.signup.and`**

> EN — and

e a

**`auth.signup.change`**

> EN — change

alterar

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

Escolha seu plano

**`auth.signup.continue`**

> EN — Continue

Continuar

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

Continuar para o pagamento

**`auth.signup.country`**

> EN — Country

País

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

Selecione seu país (opcional)

**`auth.signup.createAccount`**

> EN — Create Account

Criar conta

**`auth.signup.createYourAccount`**

> EN — Create your account

Crie sua conta

**`auth.signup.discountCode`**

> EN — Discount code

Código de desconto

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

Código de desconto (opcional)

**`auth.signup.email`**

> EN — Email

E-mail

**`auth.signup.inviteCode`**

> EN — Invite code

Código de convite

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

Código de convite (opcional)

**`auth.signup.logIn`**

> EN — Log in

Entrar

**`auth.signup.mostPopular`**

> EN — Most Popular

Mais popular

**`auth.signup.password`**

> EN — Password

Senha

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

Escolha uma palavra-passe que cumpra todos os requisitos acima.

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

Política de Privacidade

**`auth.signup.step`**

> EN — Step {step} of 2

Passo {step} de 2

**`auth.signup.termsOfService`**

> EN — Terms of Service

Termos de Serviço

**`auth.signup.working`**

> EN — Working...

Processando...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

Escolha Professional ou Ultimate como seu plano base

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

Vagas de equipe incluídas gratuitamente no Ultimate

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets full access at your plan's tier

Cada membro recebe acesso completo ao nível do seu plano

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

Gerencie as vagas a qualquer momento nas configurações da Equipe

**`pricing.businessSubtitle`**

> EN — For teams building together

Para equipes que constroem juntas

**`pricing.businessTitle`**

> EN — Business

Business

**`pricing.custom`**

> EN — Custom

Personalizado

**`pricing.features.aiMemory`**

> EN — AI Memory

Memória de IA

**`pricing.features.basicAiChat`**

> EN — Basic AI chat

Chat de IA básico

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, one {# crédito} other {# créditos}}/mês

**`pricing.features.customAiPersonaNameInIonexaChat`**

> EN — Custom AI persona name in Ionexa Chat

Nome personalizado do assistente no Ionexa Chat

**`pricing.features.customCredits`**

> EN — Custom credits

Créditos personalizados

**`pricing.features.everythingInGrowth`**

> EN — Everything in Growth

Tudo o que o Growth inclui

**`pricing.features.everythingInProfessional`**

> EN — Everything in Professional

Tudo o que o Professional inclui

**`pricing.features.everythingInStarter`**

> EN — Everything in Starter

Tudo o que o Starter inclui

**`pricing.features.everythingInUltimate`**

> EN — Everything in Ultimate

Tudo o que o Ultimate inclui

**`pricing.features.extendedChatMemoryRetention100Vs20RecentFact`**

> EN — Extended chat memory retention (100 vs 20 recent facts)

Retenção alargada da memória de conversa (100 em vez de 20 factos recentes)

**`pricing.features.teamCollaboration`**

> EN — Team collaboration

Colaboração em equipa

**`pricing.features.unlimitedMembers`**

> EN — Unlimited members

Membros ilimitados

**`pricing.features.unlimitedTeamSeatsIncludedNoPerMemberCharge`**

> EN — Unlimited team seats included — no per-member charge

Lugares de equipa ilimitados incluídos — sem custo por membro

**`pricing.features.upTo100AiAgents`**

> EN — Up to 100 AI agents

Até 100 agentes de IA

**`pricing.features.upTo15AiAgentsTeams`**

> EN — Up to 15 AI agents & teams

Até 15 agentes de IA e equipas

**`pricing.features.upTo2AiAgents`**

> EN — Up to 2 AI agents

Até 2 agentes de IA

**`pricing.features.upTo50AiAgents`**

> EN — Up to 50 AI agents

Até 50 agentes de IA

**`pricing.features.upTo5AiAgents`**

> EN — Up to 5 AI agents

Até 5 agentes de IA

**`pricing.features.websiteAutomationBuilderAccess`**

> EN — Website & Automation Builder access

Acesso ao Website & Automation Builder

**`pricing.perMonth`**

> EN — /month

/mês

**`auth.generateStrongPassword`**

> EN — Generate strong password

Gerar senha forte

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

Continuar com Google

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

Não foi possível iniciar o login com Google. Tente novamente.

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

ou continuar com email

**`common.hidePassword`**

> EN — Hide password

Ocultar palavra-passe

**`common.showPassword`**

> EN — Show password

Mostrar palavra-passe

### login

**`auth.login.email`**

> EN — Email

E-mail

**`auth.login.forgotPassword`**

> EN — Forgot password?

Esqueceu a senha?

**`auth.login.logIn`**

> EN — Log In

Entrar

**`auth.login.noAccount`**

> EN — No account yet?

Ainda não tem conta?

**`auth.login.password`**

> EN — Password

Senha

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

Senha atualizada — entre com sua nova senha.

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

Inicie sessão para guardar o que partilhou.

**`auth.login.signUp`**

> EN — Sign up

Cadastre-se

**`auth.login.welcomeBack`**

> EN — Welcome back

Bem-vindo de volta

**`auth.login.working`**

> EN — Working...

Processando...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

Vamos torná-lo teu

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

Não foi possível ler esse ficheiro.

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

À procura de padrões nos teus dados…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

Escolher outro ficheiro

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

Escolher ficheiro

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{ready} de {total} linhas estão prontas

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

Carrega a tua folha de cálculo

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

Dia / mês

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

Mês / dia

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

Extrair as entradas

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

Uma agência ou pequeno negócio

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

Rendimentos e clientes como freelancer

**`dashboard.onboarding.goals.other`**

> EN — Something else

Outra coisa

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

Uma startup que estou a criar

**`dashboard.onboarding.goals.trading`**

> EN — My trading

O meu trading

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

O que queres sobretudo acompanhar?

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

Ir para o teu painel

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— ignorar esta coluna —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

{count, plural, one {# linha importada} other {# linhas importadas}}

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

{count, plural, one {# linha está} other {# linhas estão}} agora na tua conta.

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

A importação não foi concluída.

**`dashboard.onboarding.importing`**

> EN — Importing…

A importar…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

{count, plural, one {Importar # linha} other {Importar # linhas}}

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

A análise não terminou.

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

Eis o que encontrei

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

Isto parece: {label}.

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

Mapear a coluna {column}

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

Que coluna é o quê — muda o que ficou errado

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

Ainda nada de sólido

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

Adiciona um pouco mais e corre isto outra vez a partir do teu painel.

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

Não havia nada nesse texto que valesse a pena registar.

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

Cola aqui o teu texto…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

Cola o que quiseres

**`dashboard.onboarding.previewSource`**

> EN — From your file

Do teu ficheiro

**`dashboard.onboarding.previewStored`**

> EN — Stored as

Guardado como

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

O que será realmente guardado

**`dashboard.onboarding.reading`**

> EN — Reading…

A ler…

**`dashboard.onboarding.skip`**

> EN — Skip for now

Ignorar por agora

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

{count} ignoradas

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

Carrega uma folha de cálculo

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

Liga o Gmail ou o Drive

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

Apenas leitura, e só o que aprovares.

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

Adiciono eu próprio

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

Vai direto ao painel e começa do zero.

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

Cola algum texto

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

Traz os teus dados

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

Passo {step} de {total}

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

As folhas de cálculo têm de ter {max} ou menos.

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

apenas as primeiras linhas foram lidas

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

A IA que já conhece o seu trabalho. Pergunte-lhe o que quiser.

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

Primeira Entrada em {module}

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

Conquista desbloqueada: {achievement}

**`common.accountMenu`**

> EN — Account menu

Menu da conta

**`common.commandPalette`**

> EN — Command palette

Paleta de comandos

**`common.createStudio`**

> EN — Make anything

Cria qualquer coisa

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

Créditos restantes — compre mais nas Definições

**`common.creditsUnlimited`**

> EN — Unlimited

Ilimitados

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — prima Enter para dispensar

**`common.jumpToPage`**

> EN — Jump to a module or page...

Ir para um módulo ou página...

**`common.loading`**

> EN — Loading...

Carregando...

**`common.noMatches`**

> EN — No matches for “{query}”

Nenhum resultado para «{query}»

**`common.offline.checking`**

> EN — Checking…

A verificar…

**`common.offline.retry`**

> EN — Try again

Tentar de novo

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

Nada nesta página está a atualizar.

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

Nada aqui está a atualizar — carregado há {minutes} min.

**`common.offline.stillOffline`**

> EN — Still no connection.

Continua sem ligação.

**`common.offline.title`**

> EN — You're offline.

Está offline.

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

Acesso de proprietário — créditos ilimitados

**`common.paletteClose`**

> EN — close

fechar

**`common.paletteNavigate`**

> EN — navigate

navegar

**`common.paletteSelect`**

> EN — select

selecionar

**`common.search`**

> EN — Search anything...

Pesquisar qualquer coisa...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

Mensagem gratuita · {count} restantes este mês

**`credits.unlimited`**

> EN — Unlimited — no credits used

Ilimitado — nenhum crédito usado

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

Ilimitado — teria custado {count, plural, one {# crédito} other {# créditos}}

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

{count, plural, one {# crédito usado} other {# créditos usados}}

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

{count, plural, one {# crédito usado} other {# créditos usados}} · {remaining, plural, one {# restante} other {# restantes}}

**`dashboard.search.dates.30d`**

> EN — 30 days

30 dias

**`dashboard.search.dates.365d`**

> EN — 1 year

1 ano

**`dashboard.search.dates.7d`**

> EN — 7 days

7 dias

**`dashboard.search.dates.any`**

> EN — Any time

Qualquer data

**`dashboard.search.filters.all`**

> EN — All

Tudo

**`dashboard.search.filters.date`**

> EN — Date

Data

**`dashboard.search.filters.module`**

> EN — Module

Módulo

**`dashboard.search.filters.type`**

> EN — Type

Tipo

**`dashboard.search.kinds.agent`**

> EN — Agents

Agentes

**`dashboard.search.kinds.chat`**

> EN — Conversations

Conversas

**`dashboard.search.kinds.file`**

> EN — Files

Arquivos

**`dashboard.search.kinds.help`**

> EN — Help

Ajuda

**`dashboard.search.kinds.mission`**

> EN — Plans

Planos

**`dashboard.search.kinds.module`**

> EN — Entries

Entradas

**`dashboard.search.kinds.page`**

> EN — Pages

Páginas

**`dashboard.search.kinds.research`**

> EN — Research

Pesquisa

**`dashboard.search.kinds.website`**

> EN — Websites

Sites

**`sampleData.banner`**

> EN — Sample data

Dados de exemplo

**`sampleData.clear`**

> EN — Remove the sample

Remover o exemplo

**`sampleData.clearFailed`**

> EN — That did not work.

Não resultou.

**`sampleData.clearing`**

> EN — Removing…

A remover…

**`sidebar.closeMenu`**

> EN — Close menu

Fechar o menu

**`sidebar.groups.ask`**

> EN — Ask

Perguntar

**`sidebar.groups.build`**

> EN — Build

Criar

**`sidebar.groups.business`**

> EN — Business

Negócio

**`sidebar.groups.create`**

> EN — Create

Criar

**`sidebar.groups.daily`**

> EN — Daily

No dia a dia

**`sidebar.groups.insights`**

> EN — What I noticed

O que reparei

**`sidebar.groups.make`**

> EN — Make

Criar

**`sidebar.groups.marketplace`**

> EN — Marketplace

Mercado

**`sidebar.groups.myBusiness`**

> EN — My business

O meu negócio

**`sidebar.groups.operations`**

> EN — Operations

Operações

**`sidebar.groups.organise`**

> EN — Organise

Organizar

**`sidebar.groups.run`**

> EN — Run

Executar

**`sidebar.groups.see`**

> EN — See

Ver

**`sidebar.groups.settings`**

> EN — Settings

Configurações

**`sidebar.groups.strategy`**

> EN — Strategy

Estratégia

**`sidebar.groups.track`**

> EN — Track

Registar

**`sidebar.groups.tracking`**

> EN — Tracking

Acompanhamento

**`sidebar.groups.work`**

> EN — Work

Trabalhar

**`sidebar.groups.workspace`**

> EN — Workspace

Espaço de trabalho

**`sidebar.hints.affiliate`**

> EN — Your referral link, what you've earned, and how you get paid.

O teu link de referência, o que ganhaste e como recebes.

**`sidebar.hints.agents`**

> EN — Plan the agents you want. A tracker, not a runtime.

Planeie os agentes que quer. Um registo, não um runtime.

**`sidebar.hints.analytics`**

> EN — Metrics you're watching.

As métricas que acompanha.

**`sidebar.hints.automation`**

> EN — Things that run on a schedule.

Coisas que correm com horário.

**`sidebar.hints.businessHealth`**

> EN — MRR, margin, churn and runway. Owner only.

MRR, margem, cancelamentos e tesouraria. Apenas o proprietário.

**`sidebar.hints.campaigns`**

> EN — Plan campaigns — channel, budget, status.

Planeie campanhas — canal, orçamento, estado.

**`sidebar.hints.chat`**

> EN — Ask anything — not tied to any module.

Pergunte qualquer coisa — sem ligação a nenhum módulo.

**`sidebar.hints.competitors`**

> EN — Track rival products, pricing and positioning.

Acompanhe produtos rivais, preços e posicionamento.

**`sidebar.hints.content`**

> EN — Content ideas, captions and threads.

Ideias de conteúdo, legendas e threads.

**`sidebar.hints.costs`**

> EN — What every AI call has cost, per model and per day.

Quanto custou cada chamada de IA, por modelo e por dia.

**`sidebar.hints.dataAnalysis`**

> EN — Analysis requests and what you found.

Pedidos de análise e o que encontrou.

**`sidebar.hints.decisions`**

> EN — Weigh the options before you decide.

Pese as opções antes de decidir.

**`sidebar.hints.documents`**

> EN — Freeform notes and documents you write yourself.

Notas e documentos livres que escreve você.

**`sidebar.hints.favorites`**

> EN — Everything you've starred.

Tudo o que marcou.

**`sidebar.hints.feedback`**

> EN — What users told you, in one place.

O que os utilizadores lhe disseram, num só lugar.

**`sidebar.hints.finance`**

> EN — Log income and expenses.

Registe receitas e despesas.

**`sidebar.hints.formSubmissions`**

> EN — Everything visitors sent through a form on your published sites

Tudo o que os visitantes enviaram por um formulário nos seus sites publicados

**`sidebar.hints.help`**

> EN — Answers to the questions people ask most — no credits used.

Respostas às perguntas mais frequentes, sem gastar créditos.

**`sidebar.hints.home`**

> EN — Your dashboard — activity, stats and quick actions.

O teu painel — atividade, estatísticas e ações rápidas.

**`sidebar.hints.ideas`**

> EN — Capture new ideas before you forget them.

Registe ideias novas antes de as esquecer.

**`sidebar.hints.learning`**

> EN — Track what you're studying.

Acompanhe o que está a estudar.

**`sidebar.hints.memory`**

> EN — What the AI remembers about you.

O que a IA se lembra sobre si.

**`sidebar.hints.mine`**

> EN — Everything you have made, newest first — with a starred-only tab

Tudo o que criou, do mais recente, com um separador só de favoritos

**`sidebar.hints.missionControl`**

> EN — Set a goal, AI breaks it into steps.

Defina um objetivo e a IA divide-o em passos.

**`sidebar.hints.newEntry`**

> EN — Write anything down — it files itself

Escreva o que quiser — arruma-se sozinho

**`sidebar.hints.products`**

> EN — Product plans — pricing, roadmap, launch.

Planos de produto — preços, roteiro, lançamento.

**`sidebar.hints.productWorkflow`**

> EN — Your products, patterns and mentor in one view.

Os seus produtos, padrões e mentor numa vista.

**`sidebar.hints.reflection`**

> EN — A weekly summary of your progress.

Um resumo semanal do seu progresso.

**`sidebar.hints.research`**

> EN — Save research, sources and summaries.

Guarde pesquisa, fontes e resumos.

**`sidebar.hints.routing`**

> EN — Which model each kind of request is sent to.

Para que modelo vai cada tipo de pedido.

**`sidebar.hints.sales`**

> EN — Leads, outreach and next steps.

Contactos, abordagem e próximos passos.

**`sidebar.hints.settings`**

> EN — Account, billing, language and preferences.

Conta, faturação, idioma e preferências.

**`sidebar.hints.systemHealth`**

> EN — Whether the database, the queues and the providers are answering.

Se a base de dados, as filas e os fornecedores respondem.

**`sidebar.hints.team`**

> EN — Invite people to your workspace.

Convide pessoas para o seu espaço.

**`sidebar.hints.timeline`**

> EN — Everything you've done, in order.

Tudo o que fez, por ordem.

**`sidebar.hints.trading`**

> EN — Trade log — symbol, direction, result, P&L.

Diário de trades — símbolo, direção, resultado, P&L.

**`sidebar.hints.tradingJournal`**

> EN — Your trades, with the reasoning you wrote at the time.

As tuas operações, com o raciocínio que escreveste na altura.

**`sidebar.hints.tradingWorkflow`**

> EN — Your trades, patterns and mentor in one view.

Os seus trades, padrões e mentor numa vista.

**`sidebar.hints.websiteBuilder`**

> EN — Describe a site and AI generates the real page.

Descreva um site e a IA gera a página real.

**`sidebar.hints.websites`**

> EN — Track sites you own — name, URL, status. No generation.

Acompanhe sites que tem — nome, URL, estado. Sem geração.

**`sidebar.items.affiliate`**

> EN — Affiliate

Afiliados

**`sidebar.items.agents`**

> EN — AI Agents

Agentes de IA

**`sidebar.items.analytics`**

> EN — Analytics

Análises

**`sidebar.items.apps`**

> EN — App notes

Notas de apps

**`sidebar.items.automation`**

> EN — Automation

Automação

**`sidebar.items.businessHealth`**

> EN — Business health

Saúde do negócio

**`sidebar.items.campaigns`**

> EN — Campaign notes

Notas de campanhas

**`sidebar.items.chat`**

> EN — Ionexa Chat

Ionexa Conversa

**`sidebar.items.coding`**

> EN — AI Coding

Programar com IA

**`sidebar.items.competitors`**

> EN — Competitors

Concorrentes

**`sidebar.items.content`**

> EN — Content

Conteúdo

**`sidebar.items.costs`**

> EN — Costs

Custos

**`sidebar.items.dataAnalysis`**

> EN — Data Analysis

Análise de dados

**`sidebar.items.decisions`**

> EN — Decisions

Decisões

**`sidebar.items.deepResearch`**

> EN — Deep Research

Investigação profunda

**`sidebar.items.documents`**

> EN — Documents

Documentos

**`sidebar.items.favorites`**

> EN — Favorites

Favoritos

**`sidebar.items.feedback`**

> EN — Feedback

Feedback

**`sidebar.items.files`**

> EN — Files

Ficheiros

**`sidebar.items.finance`**

> EN — Finances

Finanças

**`sidebar.items.formSubmissions`**

> EN — Form submissions

Envios de formulários

**`sidebar.items.help`**

> EN — Help Centre

Centro de ajuda

**`sidebar.items.home`**

> EN — Home

Início

**`sidebar.items.ideas`**

> EN — Ideas

Ideias

**`sidebar.items.images`**

> EN — Image notes

Notas de imagens

**`sidebar.items.integrations`**

> EN — Integrations

Integrações

**`sidebar.items.learning`**

> EN — Learning

Aprendizado

**`sidebar.items.library`**

> EN — My stuff

As minhas coisas

**`sidebar.items.marketplace`**

> EN — Marketplace

Mercado

**`sidebar.items.memory`**

> EN — Search my records

Procurar nos meus registos

**`sidebar.items.mine`**

> EN — Mine

As minhas coisas

**`sidebar.items.missionControl`**

> EN — Goals & Plans

Objetivos e planos

**`sidebar.items.newEntry`**

> EN — New entry

Nova entrada

**`sidebar.items.posts`**

> EN — Posts

Publicações

**`sidebar.items.predictions`**

> EN — Predictions

Padrões

**`sidebar.items.presentations`**

> EN — Presentations

Apresentações

**`sidebar.items.products`**

> EN — Products

Produtos

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

Fluxo de Trabalho de Produto

**`sidebar.items.projects`**

> EN — Projects

Projetos

**`sidebar.items.published`**

> EN — Live sites

Sites no ar

**`sidebar.items.records`**

> EN — My records

Os meus registos

**`sidebar.items.reflection`**

> EN — Weekly Reflection

Reflexão Semanal

**`sidebar.items.research`**

> EN — Research

Pesquisa

**`sidebar.items.routing`**

> EN — Model routing

Encaminhamento de modelos

**`sidebar.items.sales`**

> EN — Sales

Vendas

**`sidebar.items.settings`**

> EN — Settings

Configurações

**`sidebar.items.systemHealth`**

> EN — System Health

Estado do sistema

**`sidebar.items.team`**

> EN — Team

Equipe

**`sidebar.items.timeline`**

> EN — History

Histórico

**`sidebar.items.trading`**

> EN — Trading

Trading

**`sidebar.items.tradingJournal`**

> EN — Trading journal

Diário de trading

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

Fluxo de Trabalho de Trading

**`sidebar.items.videos`**

> EN — Video notes

Notas de vídeos

**`sidebar.items.voice`**

> EN — Voice

Voz

**`sidebar.items.websiteBuilder`**

> EN — Build a site

Criar um site

**`sidebar.items.websites`**

> EN — Website plans

Planos de sites

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

Não foi possível carregar as suas ideias: {message}

**`dashboard.insights.title`**

> EN — What I noticed

O que reparei

**`dashboard.overview.activeMission.open`**

> EN — Open the plan

Abrir o plano

**`dashboard.overview.activeMission.stepsLabel`**

> EN — {completed}/{total} steps completed

{completed}/{total} etapas concluídas

**`dashboard.overview.aiCoach.entryCount`**

> EN — {count, plural, one {# new {module} entry} other {# new {module} entries}}

{count, plural, one {# nova entrada em {module}} other {# novas entradas em {module}}}

**`dashboard.overview.aiCoach.mostActiveIn`**

> EN — Most active in {module}

Mais ativo em {module}

**`dashboard.overview.aiCoach.noActivity`**

> EN — No activity yet this week — log something to get started.

Nenhuma atividade ainda esta semana — registre algo para começar.

**`dashboard.overview.betaFeedback.linkLabel`**

> EN — Share feedback

Enviar feedback

**`dashboard.overview.betaFeedback.message`**

> EN — Thanks for testing Ionexa AI. Your feedback is welcome.

Obrigado por testar o Ionexa AI. O teu feedback é bem-vindo.

**`dashboard.overview.healthScore.buildingMomentum`**

> EN — Building momentum

Ganhando ritmo

**`dashboard.overview.healthScore.excellentConsistency`**

> EN — Excellent consistency

Consistência excelente

**`dashboard.overview.healthScore.justStarting`**

> EN — Just getting started

Começando agora

**`dashboard.overview.healthScore.strongProgress`**

> EN — Strong progress

Ótimo progresso

**`dashboard.overview.healthScore.suggestion.consistency`**

> EN — Try logging something every day this week.

Tente registrar algo todos os dias desta semana.

**`dashboard.overview.healthScore.suggestion.coverage`**

> EN — Try exploring a module you haven't used yet.

Tente explorar um módulo que ainda não usou.

**`dashboard.overview.healthScore.suggestion.missionSteps`**

> EN — Complete a plan step to keep your momentum going.

Conclui uma etapa do plano para manteres o teu ritmo.

**`dashboard.overview.healthScore.title`**

> EN — Business Health Score

Pontuação de Saúde do Negócio

**`dashboard.overview.next.title`**

> EN — Next

A seguir

**`dashboard.overview.nextAction.continueMission`**

> EN — Continue: {step} from your "{goal}" plan

Continue: {step} do teu plano "{goal}"

**`dashboard.overview.nextAction.cta`**

> EN — Go there →

Ir até lá →

**`dashboard.overview.setupProgress.count`**

> EN — {done} of {total} steps

{done} de {total} passos

**`dashboard.overview.setupProgress.steps.firstEntry`**

> EN — Log your first entry

Registe a sua primeira entrada

**`dashboard.overview.setupProgress.steps.mission`**

> EN — Set a goal

Defina um objetivo

**`dashboard.overview.setupProgress.steps.onboarding`**

> EN — Finish the welcome questions

Termine as perguntas de boas-vindas

**`dashboard.overview.setupProgress.steps.secondModule`**

> EN — Log something in a second area

Registe algo numa segunda área

**`dashboard.overview.setupProgress.title`**

> EN — Setup progress

Progresso da configuração

**`dashboard.overview.statRow.creditsExplain`**

> EN — What is left of this month's allowance for AI work.

O que resta da sua quota mensal para trabalho com IA.

**`dashboard.overview.statRow.creditsRemaining`**

> EN — Credits Remaining

Créditos Restantes

**`dashboard.overview.statRow.fillsAfter`**

> EN — Fills in after {count} entries

Preenche-se após {count} entradas

**`dashboard.overview.statRow.fromEntries`**

> EN — {count, plural, one {from # entry} other {from # entries}}

{count, plural, one {a partir de # entrada} other {a partir de # entradas}}

**`dashboard.overview.statRow.mostActive`**

> EN — Most Active

Mais Ativo

**`dashboard.overview.statRow.ofTotal`**

> EN — {count, plural, one {of # in total} other {of # in total}}

{count, plural, one {de # no total} other {de # no total}}

**`dashboard.overview.statRow.openCredits`**

> EN — See the ledger →

Ver o histórico →

**`dashboard.overview.statRow.openEntries`**

> EN — See the entries →

Ver as entradas →

**`dashboard.overview.statRow.thisWeek`**

> EN — This Week

Esta Semana

**`dashboard.overview.statRow.totalEntries`**

> EN — Total Entries

Total de Entradas

**`dashboard.overview.statRow.totalEntriesExplain`**

> EN — Everything you have logged, in every module, since you started.

Tudo o que registou, em cada módulo, desde o início.

**`dashboard.overview.whatChanged.entries`**

> EN — new entries

entradas novas

**`dashboard.overview.whatChanged.insights`**

> EN — new insights

observações novas

**`dashboard.overview.whatChanged.since`**

> EN — since {when}

desde {when}

**`dashboard.overview.whatChanged.title`**

> EN — What changed

O que mudou

**`errors.boundary.section`**

> EN — This section could not be displayed.

Não foi possível mostrar esta secção.

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

O resto da página não é afetado. Recarregar costuma resolver.

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

Isto era uma pergunta, por isso nada foi arquivado.

**`dashboard.create.answerItInstead`**

> EN — Answer it

Responder

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

Continuar no Chat

**`dashboard.create.loggedTo`**

> EN — Logged to:

Registado em:

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

Registar mesmo assim

**`dashboard.create.title`**

> EN — Create Anything

Criar Qualquer Coisa

**`dashboard.create.viewModule`**

> EN — View {module} →

Abrir {module} →

**`dashboard.createAnything.attachImage`**

> EN — Attach image

Anexar imagem

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

A sua resposta...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

Continuar

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

Ignorar e registar mesmo assim

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

Duas perguntas rápidas:

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

Descreva a sua ideia em detalhe...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

Remover imagem

**`dashboard.createAnything.send`**

> EN — Send

Enviar

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

Não foi possível carregar uma ou mais imagens.

**`dashboard.energyCheckIn.change`**

> EN — Change

Alterar

**`dashboard.energyCheckIn.checkedInToday`**

> EN — Today's energy: {level}/5.

Energia de hoje: {level}/5.

**`dashboard.energyCheckIn.levelLabel`**

> EN — Energy level {level}

Nível de energia {level}

**`dashboard.energyCheckIn.logged`**

> EN — Energy logged

Energia registrada

**`dashboard.energyCheckIn.notePlaceholder`**

> EN — Optional note...

Nota opcional...

**`dashboard.energyCheckIn.prompt`**

> EN — How's your energy today?

Como está sua energia hoje?

**`dashboard.energyCheckIn.scaleHigh`**

> EN — 5 = great

5 = ótimo

**`dashboard.energyCheckIn.scaleLow`**

> EN — 1 = exhausted

1 = exausto

**`dashboard.energyCheckIn.title`**

> EN — Energy Check-In

Registo de Energia

**`dashboard.firstScreen.build.example`**

> EN — Build a website for my shop

Cria um site para a minha loja

**`dashboard.firstScreen.build.verb`**

> EN — Build

Cria

**`dashboard.firstScreen.cost.charged`**

> EN — Uses credits

Consome créditos

**`dashboard.firstScreen.cost.free`**

> EN — Free

Grátis

**`dashboard.firstScreen.cost.freeAllowance`**

> EN — Free up to your monthly limit

Grátis até ao limite mensal

**`dashboard.firstScreen.label`**

> EN — Press one — it runs right away

Carregue num — corre logo

**`dashboard.firstScreen.repeat.example`**

> EN — Every Monday, a summary of my sales

Todas as segundas, um resumo das minhas vendas

**`dashboard.firstScreen.repeat.verb`**

> EN — Repeat

Repete

**`dashboard.firstScreen.understand.example`**

> EN — What do my numbers say this week?

O que dizem os meus números esta semana?

**`dashboard.firstScreen.understand.verb`**

> EN — Understand

Entende

**`dashboard.overview.recentEntries.empty`**

> EN — No entries yet.

Ainda sem entradas.

**`dashboard.overview.recentEntries.title`**

> EN — Recent Entries

Entradas Recentes

**`errors.creditHistory`**

> EN — See credit history

Ver histórico de créditos

**`errors.retry`**

> EN — Try again

Tentar de novo

**`sampleData.load`**

> EN — See it with sample data

Ver com dados de exemplo

**`sampleData.loadFailed`**

> EN — That did not work. Try again.

Não resultou. Tente de novo.

**`sampleData.loading`**

> EN — Loading…

A carregar…

## Tier 3 — Further in — only if you have time (198)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

Fechar

**`common.readMore`**

> EN — Read more

Ler mais

**`common.whatIsThisPage`**

> EN — What is this page?

O que é esta página?

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

de {count, plural, one {# das tuas entradas} other {# das tuas entradas}}

**`dashboard.insights.checkIt`**

> EN — Check it yourself

Vê tu mesmo

**`dashboard.insights.dismiss`**

> EN — Dismiss this

Dispensar

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

Não foi possível dispensar.

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

Ocultar os números

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

Ver os números

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

Dispensar

**`common.noNotifications`**

> EN — No new notifications.

Nenhuma notificação nova.

**`common.notifications`**

> EN — Notifications

Notificações

**`common.switchToDarkMode`**

> EN — Switch to dark mode

Mudar para o tema escuro

**`common.switchToLightMode`**

> EN — Switch to light mode

Mudar para o tema claro

**`common.toggleMenu`**

> EN — Toggle menu

Mostrar ou ocultar o menu

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

recarrega agora para nada te interromper.

**`credits.low.none`**

> EN — No credits left this month

Sem créditos este mês

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

{count, plural, one {Resta # crédito} other {Restam # créditos}} este mês

**`credits.low.topUp`**

> EN — Top up

Recarregar

**`language.label`**

> EN — Language

Idioma

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

Não foi possível guardar o idioma — nada foi alterado.

**`pwa.install`**

> EN — Install

Instalar

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

Coloque-o no ecrã principal: ecrã inteiro e notificações que chegam mesmo.

**`pwa.installTitle`**

> EN — Install Ionexa

Instalar o Ionexa

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

O Safari nunca sugere isto sozinho — são três toques.

**`pwa.iosGotIt`**

> EN — Got it

Percebi

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

Toque no botão Partilhar na barra do Safari

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

Desça e toque em «Adicionar ao ecrã principal»

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

Toque em Adicionar — o Ionexa aparece com as outras apps

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

Adicionar o Ionexa ao ecrã principal

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

Até lá, o iPhone não pode enviar-lhe notificações e o Safari pode apagar o que guardou ao fim de 7 dias sem uso.

**`pwa.notNow`**

> EN — Not now

Agora não

**`pwa.showHow`**

> EN — Show me how

Mostrar como

### first result

**`common.cancel`**

> EN — Cancel

Cancelar

**`common.created`**

> EN — ✓ created

✓ criado

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

Dispensar a sugestão

**`common.error`**

> EN — error

erro

**`common.notAuthenticated`**

> EN — Not authenticated.

Não autenticado.

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

Comprar créditos

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

Esta ação precisa de mais créditos do que tens. Compra um pacote ou muda de plano para continuares.

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

Restam-te {available} créditos e isto precisa de cerca de {needed}. Compra um pacote ou muda de plano.

**`credits.outOfCredits.title`**

> EN — You're out of credits

Ficaste sem créditos

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

Mudar de plano

**`dashboard.goal.change`**

> EN — Change something

Mudar alguma coisa

**`dashboard.goal.confirm`**

> EN — Yes, do it

Sim, faz isso

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

{credits, plural, one {# crédito} other {# créditos}} quando carregares no botão lá. Agora não é cobrado nada.

**`dashboard.goal.dismiss`**

> EN — Never mind

Deixa estar

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

Agora não é cobrado nada, nem à chegada.

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

Diz um pouco mais, para isto ir ao sítio certo.

**`dashboard.goal.which`**

> EN — Which one do you mean?

Qual deles queres dizer?

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

Isto vai para {destination}, com o que escreveste.

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

Concorrentes

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

concorrentes conhecidos

**`dashboard.ideas.customerLabel`**

> EN — Customer

Cliente

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

cliente-alvo

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

Um novo serviço para pequenas empresas

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

Todas as ideias num só lugar

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

Anote enquanto ainda está em bruto: aqui é pontuada, comparada com as outras e fica guardada mesmo que a descarte.

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

Tamanho do mercado

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

ex.: TAM de US$ 2 mil milhões

**`dashboard.ideas.mvpLabel`**

> EN — MVP

Produto mínimo viável

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

como é o produto mínimo viável?

**`dashboard.ideas.nameLabel`**

> EN — Name

Nome

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

nome da ideia

**`dashboard.ideas.new`**

> EN — New Idea

Nova ideia

**`dashboard.ideas.problemLabel`**

> EN — Problem

Problema

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

que problema isto resolve?

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

Pontuação (0-100)

**`dashboard.ideas.scorePlaceholder`**

> EN — score

pontuação

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

Veredito

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

ex.: seguir / descartar / observar

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

Recarrega a página para veres a versão atual e repete a tua alteração.

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

Alguém — ou outro separador — alterou isto enquanto trabalhavas nele.

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

Divide-o ou carrega uma versão mais pequena.

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

Esse ficheiro é demasiado grande.

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

Abre Definições › Faturação para veres que plano o cobre.

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

O teu plano não inclui isto.

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

Compra créditos nas Definições ou espera pela renovação mensal.

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

Não tens créditos suficientes para isto.

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

Verifica os campos assinalados e envia outra vez.

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

Algo no formulário não foi aceite.

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

Inicia sessão outra vez e repete a ação — não perdeste nada do que tinhas escrito.

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

A tua sessão terminou.

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

Provavelmente foi eliminado. Volta à lista e escolhe outro.

**`errors.codes.notFound.what`**

> EN — This no longer exists.

Isto já não existe.

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

Verifica a tua ligação e tenta outra vez.

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

O teu dispositivo não conseguiu contactar-nos.

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

Elimina algo de que já não precises, ou muda de plano em Definições › Faturação.

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

Chegaste ao limite do teu plano.

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

Espera cerca de um minuto e tenta mais uma vez.

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

Demasiados pedidos em pouco tempo.

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

Ficou registado. Tenta outra vez daqui a pouco e contacta o apoio se continuar.

**`errors.codes.serverError.what`**

> EN — This broke on our side.

Isto falhou do nosso lado.

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

Tenta outra vez e contacta o apoio se acontecer de novo.

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

Esta ação não foi concluída.

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

Converte-o para PDF, DOCX, CSV ou TXT e carrega outra vez.

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

Esse tipo de ficheiro não é suportado.

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

É do nosso lado e costuma resolver-se em poucos minutos.

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

O serviço de IA não está a responder neste momento.

**`errors.credits.charged`**

> EN — This attempt used credits.

Esta tentativa consumiu créditos.

**`errors.credits.notCharged`**

> EN — You were not charged.

Não te foi cobrado nada.

**`errors.credits.refunded`**

> EN — Your credits were returned.

Os teus créditos foram devolvidos.

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

Daqui não conseguimos confirmar se foi cobrado.

**`module.exportCsv`**

> EN — Export CSV

Exportar CSV

**`module.noMatches`**

> EN — No matches for “{query}”

Nenhum resultado para «{query}»

**`module.save`**

> EN — Save

Salvar

**`module.saving`**

> EN — Saving...

Salvando...

**`module.searchPlaceholder`**

> EN — Search...

Pesquisar...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

{credits, plural, one {# crédito} other {# créditos}} por minuto de fala

**`voice.draft.discard`**

> EN — Discard

Descartar

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

Não foi enviado nada. Corrige o texto e envia-o tu.

**`voice.draft.title`**

> EN — What was heard

O que foi ouvido

**`voice.draft.use`**

> EN — Use this text

Usar este texto

**`voice.errors.bad_request`**

> EN — That request could not be read.

Não foi possível ler esse pedido.

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

O serviço está muito ocupado neste momento. Tenta daqui a pouco.

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

O microfone não foi autorizado. Podes sempre escrever.

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

Não se ouviu nada nessa gravação.

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

A voz não está disponível neste momento. Podes sempre escrever.

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

Créditos insuficientes.

**`voice.errors.no_recording`**

> EN — No recording was sent.

Não foi enviada nenhuma gravação.

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

Não foi gravado nada.

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

A voz não está configurada nesta instalação.

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

A voz não está incluída no teu plano.

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

Os minutos de voz deste mês acabaram.

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

Não foi possível contactar o serviço de voz.

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

Demasiadas gravações na última hora. Tenta daqui a pouco.

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

Não foi possível reservar créditos para isto.

**`voice.errors.too_large`**

> EN — That recording is too long.

Essa gravação é demasiado longa.

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

A tua sessão terminou. Inicia sessão e tenta de novo.

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

Este navegador não consegue gravar áudio. Podes sempre escrever.

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

Esse formato de áudio não é suportado.

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

Não foi possível verificar os minutos de voz neste momento.

**`voice.listening`**

> EN — Listening

A ouvir

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

Fala e depois carrega em Parar. Nada é enviado antes de o teres lido.

**`voice.outOfMinutes`**

> EN — No voice minutes left this month

Sem minutos de voz este mês

**`voice.permission.allow`**

> EN — Open the microphone

Abrir o microfone

**`voice.permission.cancel`**

> EN — Not now

Agora não

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

{credits, plural, one {# crédito} other {# créditos}} por minuto, {minutes, plural, one {# minuto} other {# minutos}} por mês no teu plano.

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

Lês e corriges o texto antes de ser enviado seja o que for.

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

O áudio é enviado para transcrição e não é guardado em lado nenhum — nem por nós, nem depois.

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

A gravação só começa quando carregas e para quando carregas de novo.

**`voice.permission.title`**

> EN — Before the microphone opens

Antes de o microfone abrir

**`voice.settings.notConfigured`**

> EN — Voice is not set up on this deployment, so the microphone and Listen buttons do not appear.

A voz não está configurada nesta instalação, por isso os botões de microfone e Ouvir não aparecem.

**`voice.settings.notIncluded`**

> EN — Voice is not included on your plan. Everything here can still be typed and read.

A voz não está incluída no teu plano. Tudo aqui continua a poder ser escrito e lido.

**`voice.startListening`**

> EN — Speak instead of typing

Fala em vez de escrever

**`voice.stopListening`**

> EN — Stop

Parar

**`common.nextPage`**

> EN — Next page

Próxima página

**`common.paginationNext`**

> EN — Next

Próx.

**`common.paginationPage`**

> EN — Page {page} / {total}

Página {page} / {total}

**`common.paginationPrev`**

> EN — Prev

Ant.

**`common.previousPage`**

> EN — Previous page

Página anterior

**`common.updated`**

> EN — ✓ updated

✓ atualizado

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

Concorrentes:

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

para: {customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

Tamanho do mercado:

**`dashboard.ideas.cardMvp`**

> EN — MVP:

Produto mínimo viável:

**`dashboard.ideas.cardProblem`**

> EN — Problem:

Problema:

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

Pontuação: {score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

Eliminar esta ideia? Não é possível anular.

**`dashboard.ideas.edit`**

> EN — Edit Idea

Editar a ideia

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

Editar a ideia: {name}

**`entityLinks.linked`**

> EN — Linked

Vinculado

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

Isso pode estar relacionado a: {titles}. Vincular?

**`entityLinks.no`**

> EN — No

Não

**`entityLinks.yes`**

> EN — Yes

Sim

**`module.edit`**

> EN — Edit

Editar

**`module.loggedAt`**

> EN — Logged {when}

Registado {when}

**`module.sort.label`**

> EN — Sort:

Ordenar:

**`askAi.buttonLabel`**

> EN — Ask AI

Perguntar à IA

**`common.networkError`**

> EN — Network error — please try again.

Erro de rede — tente novamente.

**`common.textActions.accept`**

> EN — Accept

Aceitar

**`common.textActions.reject`**

> EN — Reject

Descartar

**`entityLinks.buttonLabel`**

> EN — Link to...

Vincular a...

**`entityLinks.linkedToLabel`**

> EN — Linked to:

Vinculado a:

**`entityLinks.unlink`**

> EN — Unlink

Desassociar

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

Desassociar {name}

**`favorites.add`**

> EN — Add to favorites

Adicionar aos favoritos

**`favorites.remove`**

> EN — Remove from favorites

Remover dos favoritos

**`module.delete`**

> EN — Delete

Eliminar

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

Eliminar este {label}? Não é possível anular.

**`module.deleted`**

> EN — Deleted

Eliminado

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

Também leu {count, plural, one {# mensagem anterior} other {# mensagens anteriores}} sobre esta entrada

**`askAi.close`**

> EN — Close

Fechar

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

Faça uma pergunta sobre esta entrada — não precisa explicar o contexto, a IA já o tem.

**`askAi.placeholder`**

> EN — Ask anything about this entry...

Pergunte qualquer coisa sobre esta entrada...

**`askAi.send`**

> EN — Send

Enviar

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

A ligação foi interrompida antes de a resposta terminar.

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

A ligação foi interrompida — a resposta acima pode estar incompleta.

**`askAi.title`**

> EN — Ask AI about this {title}

Pergunte à IA sobre este {title}

**`common.errorWithMessage`**

> EN — error: {message}

erro: {message}

**`common.linked`**

> EN — ✓ linked

✓ associado

**`common.newMessagesBelow`**

> EN — New message below

Nova mensagem abaixo

**`entityLinks.modalTitle`**

> EN — Link to...

Vincular a...

**`entityLinks.noMatches`**

> EN — No matches.

Nenhum resultado.

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

A qual módulo você quer vincular?

**`entityLinks.searching`**

> EN — Searching...

Buscando...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

Buscar em {module}...

**`aiSteps.counter`**

> EN — ({step}/{total})

({step}/{total})
