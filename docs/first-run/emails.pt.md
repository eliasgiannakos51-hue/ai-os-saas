# The emails — pt

Every line of every email the product sends: **115 strings**. The interface has its own pack, `first-run.pt.md`, beside this one.

**Start with tier 1. It is 41 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 48 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (41)

_From the emails a person is sure or likely to receive, 5 words or more._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.subject`**

> EN — Confirm your email for Ionexa AI

Confirme o seu email para a Ionexa AI

**`email.confirm.preheader`**

> EN — One click and your account is ready.

Um clique e a sua conta fica pronta.

**`email.confirm.body`**

> EN — Press the button to confirm this address and open your Ionexa AI account.

Toque no botão para confirmar este endereço e abrir a sua conta Ionexa AI.

**`email.confirm.ignore`**

> EN — If you did not create this account, ignore this email: nothing happens without the link.

Se não criou esta conta, ignore este email: sem o link nada acontece.

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

A tua conta está pronta — não é preciso confirmar o e-mail, podes entrar já. O Ionexa AI são 13 módulos para gerir uma startup, mais uma caixa de texto livre que arquiva o que escreveres no módulo certo.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

Dica: em {path} podes simplesmente descrever o que aconteceu por palavras tuas e irá parar automaticamente ao módulo certo.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

A tua conta Ionexa AI está pronta.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

novo início de sessão na tua conta

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

Detetámos um início de sessão na tua conta Ionexa AI a partir de um dispositivo ou navegador que nunca tínhamos visto.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

Se foste tu, não precisas de fazer nada. Se não reconheces este início de sessão, muda já a tua palavra-passe.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

Novo início de sessão na tua conta Ionexa AI a partir de {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

Esta geração já corre há mais de 24 horas sem terminar: não é normal, e é provável que esteja encravada em vez de ainda a trabalhar. Não foram cobrados créditos por ela. Abre-a abaixo para tentar de novo ou apagá-la.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}” está encravado a gerar há mais de 24 horas.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

“{name}” parece encravado — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

a tua tarefa agendada terminou

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

a tua tarefa agendada não conseguiu correr

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

A tua tarefa agendada “{step}” terminou.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

A tua tarefa agendada “{step}” não conseguiu correr.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

A tua tarefa agendada terminou — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

A tua tarefa agendada não conseguiu correr — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

Créditos insuficientes: carrega ou muda de plano e agenda-a de novo.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

Créditos insuficientes: carrega ou muda de plano. Esta automação tentará de novo no próximo ciclo.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

“{name}” foi desligado

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

Falhou {count} vezes seguidas, por isso parou de correr em vez de continuar a falhar e a custar-te créditos.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

Abre-o abaixo para rever a tarefa e voltar a ligá-lo.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

“{name}” parou de correr após {count} falhas.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

“{name}” foi desligado — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

Não conseguiu correr porque a tua conta ficou sem créditos. Nada foi cobrado e nada se perdeu: carrega ou muda de plano e volta a ligá-lo, e retoma o horário habitual.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}” está em pausa: a tua conta ficou sem créditos.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}” está em pausa — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

a tua subscrição vai terminar

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Manténs o acesso completo até {date}. Até lá nada muda — os créditos que te restam continuam utilizáveis e nenhum dos teus dados é apagado.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Manténs o acesso completo até ao fim do período que já pagaste. Até lá nada muda — os créditos que te restam continuam utilizáveis e nenhum dos teus dados é apagado.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

Depois disso a conta passa para o plano gratuito. As tuas entradas, ficheiros e conversas ficam exatamente onde estão.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

Mudaste de ideias? Repõe-na

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

Podes repor a subscrição a qualquer momento antes de terminar, sem custo adicional — já pagaste este período.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

A tua subscrição Ionexa AI termina a {date}. Manténs o acesso até lá.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

A tua subscrição Ionexa AI vai terminar. Manténs o acesso até acabar o período que pagaste.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Recebemos um pedido para eliminar definitivamente a tua conta Ionexa AI e todos os registos em todos os módulos. Isto não pode ser desfeito.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

Este link expira dentro de 1 hora. Se não foste tu a pedir, ignora este e-mail e a tua conta ficará exatamente como está.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Confirma a eliminação definitiva da tua conta Ionexa AI.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

a tua semana na Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} execução de agente, {found} com resultado

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} execuções de agentes, {found} com resultado

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} crédito gasto (a tua média: {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} créditos gastos (a tua média: {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} contacto sem seguimento registado

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} contactos sem seguimento registado

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

os gastos estão {percent}% acima da tua média

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

os gastos estão {percent}% abaixo da tua média

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

o tráfego do site subiu {percent}%

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

o tráfego do site desceu {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

Alguém te contactou através de “{name}”

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

Novo envio de formulário em “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

Regista e pontua novas ideias de produto ou de negócio.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

Acompanha produtos rivais, preços e posicionamento.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

Notas e resumos de tudo o que andas a investigar.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

Temas que estás a estudar, com recursos e questionários.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

Registo de operações — símbolo, direção, resultado, lucro e prejuízo.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

Pesa as opções e regista a recomendação.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

Planos de produto — preços, roteiro, plano de lançamento.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

Ideias de conteúdo, legendas e sequências.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

Contactos, e-mails de abordagem e próximos passos.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

Comentários de utilizadores, organizados por tom e prioridade.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

Qualquer métrica que valha a pena seguir ao longo do tempo.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

Fluxos que vale a pena automatizar, e o tempo poupado.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

Recebes esta mensagem porque tens uma conta Ionexa AI.

## Tier 3 — Subjects, labels and the footer — skim (48)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.label`**

> EN — confirm your email

confirmar email

**`email.confirm.title`**

> EN — Confirm it's you

Confirme que é você

**`email.confirm.button`**

> EN — Confirm email

Confirmar email

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.label`**

> EN — signup

inscrição

**`email.welcome.title`**

> EN — welcome to Ionexa AI

bem-vindo ao Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

segurança

**`email.newDevice.when`**

> EN — When

Quando

**`email.newDevice.device`**

> EN — Device

Dispositivo

**`email.newDevice.ip`**

> EN — IP address

Endereço IP

**`email.newDevice.cta`**

> EN — Reset password

Mudar palavra-passe

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

construtor de sites

**`email.stuck.title`**

> EN — “{name}” seems stuck

“{name}” parece encravado

**`email.stuck.cta`**

> EN — Open Website Builder

Abrir o construtor de sites

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

execução agendada do agente

**`email.scheduledRun.cta`**

> EN — Open {name}

Abrir {name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

o teu agente

**`email.agent.resultCta`**

> EN — Manage your agents

Gerir os teus agentes

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — o teu resultado agendado.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

Último erro: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

Abrir os teus agentes

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}” está em pausa

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

Carregar créditos

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

Abrir os teus agentes

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

subscrição

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

eliminação de conta

**`email.deletion.title`**

> EN — confirm account deletion

confirma a eliminação da conta

**`email.deletion.cta`**

> EN — Confirm deletion

Confirmar eliminação

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

resumo

**`email.digest.title`**

> EN — this week

esta semana

**`email.digest.noticed`**

> EN — what I noticed

o que reparei

**`email.digest.cta`**

> EN — Open your dashboard

Abrir o teu painel

**`email.digest.subject`**

> EN — this week: {first}

esta semana: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} entrada nova

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} entradas novas

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

o teu site: {count} visita

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

o teu site: {count} visitas

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} crédito gasto

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} créditos gastos

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} execução de agente falhou

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} execuções de agentes falharam

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

novo envio de formulário

**`email.formSubmission.cta`**

> EN — View your websites

Ver os teus sites

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

Novo envio de formulário em {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

Interesse provavelmente genuíno

**`email.formSubmission.badges.question`**

> EN — General question

Pergunta geral

**`email.formSubmission.badges.spam`**

> EN — Possible spam

Possível spam

**`email.formSubmission.badges.unclear`**

> EN — Unclear

Pouco claro

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

Regista receitas e despesas.
