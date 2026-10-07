# The emails — es

Every line of every email the product sends: **115 strings**. The interface has its own pack, `first-run.es.md`, beside this one.

**Start with tier 1. It is 41 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 48 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (41)

_From the emails a person is sure or likely to receive, 5 words or more._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.subject`**

> EN — Confirm your email for Ionexa AI

Confirma tu correo para Ionexa AI

**`email.confirm.preheader`**

> EN — One click and your account is ready.

Un clic y tu cuenta estará lista.

**`email.confirm.body`**

> EN — Press the button to confirm this address and open your Ionexa AI account.

Pulsa el botón para confirmar esta dirección y abrir tu cuenta de Ionexa AI.

**`email.confirm.ignore`**

> EN — If you did not create this account, ignore this email: nothing happens without the link.

Si no creaste esta cuenta, ignora este correo: sin el enlace no ocurre nada.

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

Tu cuenta está lista: no hace falta confirmar el correo, puedes entrar ahora mismo. Ionexa AI son 13 módulos para llevar una startup, más una bandeja de texto libre que archiva lo que escribas en el módulo correcto.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

Consejo: en {path} puedes describir lo que pasó con tus palabras y llegará automáticamente al módulo correcto.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

Tu cuenta de Ionexa AI está lista.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

nuevo inicio de sesión en tu cuenta

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

Hemos detectado un inicio de sesión en tu cuenta de Ionexa AI desde un dispositivo o navegador que no habíamos visto antes.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

Si fuiste tú, no hace falta hacer nada. Si no reconoces este inicio de sesión, cambia tu contraseña de inmediato.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

Nuevo inicio de sesión en tu cuenta de Ionexa AI desde {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

Esta generación lleva más de 24 horas sin terminar: no es normal, y lo más probable es que esté atascada en vez de seguir trabajando. No se cobró ningún crédito por ella. Ábrela abajo para reintentarla o borrarla.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}” lleva más de 24 horas atascado generando.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

“{name}” parece atascado — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

tu tarea programada ha terminado

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

tu tarea programada no se pudo ejecutar

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

Tu tarea programada “{step}” ha terminado.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

Tu tarea programada “{step}” no se pudo ejecutar.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

Tu tarea programada ha terminado — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

Tu tarea programada no se pudo ejecutar — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

No hay créditos suficientes: recarga o mejora tu plan y vuelve a programarlo.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

No hay créditos suficientes: recarga o mejora tu plan. Esta automatización lo intentará de nuevo en el próximo ciclo.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

“{name}” se ha desactivado

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

Falló {count} veces seguidas, así que ha dejado de ejecutarse en vez de seguir fallando y seguir costándote créditos.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

Ábrelo abajo para revisar la tarea y volver a activarlo.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

“{name}” dejó de ejecutarse tras {count} fallos.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

“{name}” se ha desactivado — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

No pudo ejecutarse porque tu cuenta se quedó sin créditos. No se cobró nada y no se ha perdido nada: recarga o mejora tu plan y vuelve a activarlo, y retomará su horario habitual.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}” está en pausa: tu cuenta se quedó sin créditos.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}” está en pausa — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

tu suscripción va a terminar

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Mantendrás el acceso completo hasta el {date}. Hasta entonces no cambia nada: tus créditos restantes siguen disponibles y no se borra ninguno de tus datos.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

Mantendrás el acceso completo hasta el final del periodo que ya has pagado. Hasta entonces no cambia nada: tus créditos restantes siguen disponibles y no se borra ninguno de tus datos.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

Después la cuenta pasa al plan gratuito. Tus entradas, archivos y conversaciones se quedan donde están.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

¿Cambiaste de idea? Restáurala

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

Puedes restaurar la suscripción en cualquier momento antes de que termine, sin coste adicional: ya has pagado este periodo.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

Tu suscripción de Ionexa AI termina el {date}. Mantienes el acceso hasta entonces.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

Tu suscripción de Ionexa AI va a terminar. Mantienes el acceso hasta que se agote el periodo que pagaste.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Hemos recibido una solicitud para eliminar permanentemente tu cuenta de Ionexa AI y todos los registros de todos los módulos. Esto no se puede deshacer.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

Este enlace caduca en 1 hora. Si no lo solicitaste, ignora este correo y tu cuenta se quedará exactamente como está.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Confirma la eliminación permanente de tu cuenta de Ionexa AI.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

tu semana en Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} ejecución de agente, {found} con resultado

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} ejecuciones de agentes, {found} con resultado

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} crédito gastado (tu media: {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} créditos gastados (tu media: {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} contacto sin seguimiento registrado

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} contactos sin seguimiento registrado

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

el gasto está un {percent}% por encima de tu media

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

el gasto está un {percent}% por debajo de tu media

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

el tráfico de la web ha subido un {percent}%

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

el tráfico de la web ha bajado un {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

Alguien te ha contactado desde “{name}”

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

Nuevo envío de formulario en “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

Captura y puntúa nuevas ideas de producto o de negocio.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

Sigue productos rivales, precios y posicionamiento.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

Notas y resúmenes de lo que estés investigando.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

Temas que estudias, con recursos y cuestionarios.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

Registro de operaciones: símbolo, dirección, resultado, ganancias y pérdidas.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

Sopesa opciones y anota la recomendación.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

Planes de producto: precios, hoja de ruta, plan de lanzamiento.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

Ideas de contenido, textos y hilos.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

Clientes potenciales, correos de contacto y próximos pasos.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

Comentarios de usuarios, clasificados por tono y prioridad.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

Cualquier métrica que valga la pena seguir en el tiempo.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

Flujos que vale la pena automatizar, y el tiempo ahorrado.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

Recibes este mensaje porque tienes una cuenta en Ionexa AI.

## Tier 3 — Subjects, labels and the footer — skim (48)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.label`**

> EN — confirm your email

confirma tu correo

**`email.confirm.title`**

> EN — Confirm it's you

Confirma que eres tú

**`email.confirm.button`**

> EN — Confirm email

Confirmar correo

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.label`**

> EN — signup

registro

**`email.welcome.title`**

> EN — welcome to Ionexa AI

bienvenido a Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

seguridad

**`email.newDevice.when`**

> EN — When

Cuándo

**`email.newDevice.device`**

> EN — Device

Dispositivo

**`email.newDevice.ip`**

> EN — IP address

Dirección IP

**`email.newDevice.cta`**

> EN — Reset password

Cambiar contraseña

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

creador de webs

**`email.stuck.title`**

> EN — “{name}” seems stuck

“{name}” parece atascado

**`email.stuck.cta`**

> EN — Open Website Builder

Abrir el creador de webs

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

ejecución programada del agente

**`email.scheduledRun.cta`**

> EN — Open {name}

Abrir {name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

tu agente

**`email.agent.resultCta`**

> EN — Manage your agents

Gestionar tus agentes

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — tu resultado programado.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

Último error: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

Abrir tus agentes

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}” está en pausa

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

Recargar créditos

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

Abrir tus agentes

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

suscripción

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

eliminación de cuenta

**`email.deletion.title`**

> EN — confirm account deletion

confirma la eliminación de tu cuenta

**`email.deletion.cta`**

> EN — Confirm deletion

Confirmar eliminación

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

resumen

**`email.digest.title`**

> EN — this week

esta semana

**`email.digest.noticed`**

> EN — what I noticed

lo que he notado

**`email.digest.cta`**

> EN — Open your dashboard

Abrir tu panel

**`email.digest.subject`**

> EN — this week: {first}

esta semana: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} entrada nueva

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} entradas nuevas

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

tu web: {count} visita

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

tu web: {count} visitas

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} crédito gastado

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} créditos gastados

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} ejecución de agente falló

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} ejecuciones de agentes fallaron

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

nuevo envío de formulario

**`email.formSubmission.cta`**

> EN — View your websites

Ver tus webs

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

Nuevo envío de formulario en {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

Interés probablemente real

**`email.formSubmission.badges.question`**

> EN — General question

Pregunta general

**`email.formSubmission.badges.spam`**

> EN — Possible spam

Posible spam

**`email.formSubmission.badges.unclear`**

> EN — Unclear

Poco claro

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

Registra ingresos y gastos.
