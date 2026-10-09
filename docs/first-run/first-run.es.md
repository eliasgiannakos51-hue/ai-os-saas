# The first run — es

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **605 strings**. The whole product is 4043, which is why this file exists.

**Start with tier 1. It is 25 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 372 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (25)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.checkEmailBody`**

> EN — We sent a link to {email}. Open it to confirm your address and start using your account.

Enviamos un enlace a {email}. Ábrelo para confirmar tu dirección y empezar a usar tu cuenta.

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

No hemos podido crear la cuenta. Revisa los datos e inténtalo de nuevo: no se te ha cobrado nada.

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

Debes aceptar los Términos del Servicio y la Política de Privacidad para crear una cuenta.

**`pricing.businessCardDescription`**

> EN — Start with Professional or Ultimate as your team's base, then invite members for +{price}/month each — everyone gets your plan's tier on their own account.

Empieza con Professional o Ultimate como base de tu equipo y luego invita a miembros por +{price}/mes cada uno: todos obtienen el nivel de tu plan en su propia cuenta.

### login

**`auth.login.emailNotConfirmed`**

> EN — Confirm your email first. We just sent a new link to your inbox.

Confirma primero tu correo. Acabamos de enviarte un enlace nuevo.

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

No hemos podido iniciar tu sesión. Revisa el correo y la contraseña, o restablécela si no estás seguro.

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

Ese inicio de sesión no se completó. Vuelve a intentarlo o usa tu correo y contraseña abajo.

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

Trae datos reales y la IA te dirá algo sobre tu negocio en dos minutos.

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

Tus datos siguen siendo tuyos. Se guardan de forma privada, solo tú puedes leerlos y nunca se usan para entrenar nada. Puedes borrarlos, o toda tu cuenta, cuando quieras.

**`dashboard.firstTask.lead`**

> EN — Pick something to get done now. The answer arrives in a few seconds.

Elige algo para hacer ahora. La respuesta llega en unos segundos.

**`dashboard.firstTask.tasks.explain.text`**

> EN — Explain in plain words what makes a good business description on Google

Explícame con palabras sencillas qué hace buena una descripción de empresa en Google

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

Solo patrones reales de lo que acabas de importar. Si no basta para estar seguros, te lo diremos.

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV o separado por tabuladores, hasta {max}. Lo leemos y te mostramos lo que encontramos antes de guardar nada.

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

Tus fechas podrían ser día/mes o mes/día: todas caen el día 12 o antes, así que no podemos saberlo. ¿Cuál es?

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

Tu primera importación y su análisis son gratis: no gastarán créditos.

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

Todavía no hay suficiente para hablar de un patrón. Unas decenas de filas con fechas suele ser el punto en que empiezan a aparecer cosas, y preferimos no decir nada antes que inventarlo.

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

Un plan de negocio, notas de reunión, una lista de clientes. Extraemos lo registrable y dejamos el resto.

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

Un CSV exportado de tu bróker, banco o CRM. Deducimos qué es cada columna.

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

Elige lo que te resulte más fácil. Nada es obligatorio y puedes añadir más después.

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

Un plan de negocio, notas, una lista: extraemos las partes estructuradas.

### dashboard chrome

**`common.searchFailed`**

> EN — Search is unavailable right now — this is not an empty result. Try again in a moment.

La búsqueda no está disponible en este momento: esto no es un resultado vacío. Inténtalo de nuevo en un momento.

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

Estas entradas son una demo: los últimos tres meses de un pequeño estudio de diseño. No son tuyas.

### first result

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

Se muestran las {count, number} más recientes. Las entradas más antiguas siguen guardadas: usa Buscar en mis registros para encontrarlas.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

Eso parece una pregunta. ¿La respondo o la registro?

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

Describe cualquier cosa — una idea de producto, una operación, el comentario de un usuario, una métrica — y acaba automáticamente en el módulo correcto.

## Tier 2 — The labels — skim these (372)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

Acepto los

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

¿Ya tienes una cuenta?

**`auth.signup.and`**

> EN — and

y

**`auth.signup.change`**

> EN — change

cambiar

**`auth.signup.checkEmailTitle`**

> EN — Check your email

Revisa tu correo

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

Elige tu plan

**`auth.signup.continue`**

> EN — Continue

Continuar

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

Continuar al pago

**`auth.signup.country`**

> EN — Country

País

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

Selecciona tu país (opcional)

**`auth.signup.createAccount`**

> EN — Create Account

Crear cuenta

**`auth.signup.createYourAccount`**

> EN — Create your account

Crea tu cuenta

**`auth.signup.discountCode`**

> EN — Discount code

Código de descuento

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

Código de descuento (opcional)

**`auth.signup.email`**

> EN — Email

Correo electrónico

**`auth.signup.inviteCode`**

> EN — Invite code

Código de invitación

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

Código de invitación (opcional)

**`auth.signup.logIn`**

> EN — Log in

Inicia sesión

**`auth.signup.mostPopular`**

> EN — Most Popular

Más popular

**`auth.signup.password`**

> EN — Password

Contraseña

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

Elige una contraseña que cumpla todos los requisitos anteriores.

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

Política de privacidad

**`auth.signup.step`**

> EN — Step {step} of 2

Paso {step} de 2

**`auth.signup.termsOfService`**

> EN — Terms of Service

Términos del servicio

**`auth.signup.working`**

> EN — Working...

Procesando...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

Elige Professional o Ultimate como tu plan base

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

Puestos de equipo incluidos gratis en Ultimate

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets your plan's tier on their own account

Cada miembro obtiene el nivel de tu plan en su propia cuenta

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

Gestiona los puestos en cualquier momento desde Configuración de equipo

**`pricing.businessSubtitle`**

> EN — For teams building together

Para equipos que construyen juntos

**`pricing.businessTitle`**

> EN — Business

Business

**`pricing.custom`**

> EN — Custom

Personalizado

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, one {# crédito} other {# créditos}}/mes

**`pricing.features.customCredits`**

> EN — Custom credits

Créditos personalizados

**`pricing.perMonth`**

> EN — /month

/mes

**`pricing.rows.accountAndPrivacy`**

> EN — Export or delete your account

Exportar o borrar tu cuenta

**`pricing.rows.agentRunsPerHour`**

> EN — Agent runs

Ejecuciones de agentes

**`pricing.rows.aiAgents`**

> EN — Scheduled web-research agents

Agentes programados que buscan en la web

**`pricing.rows.aiChat`**

> EN — Ask me

Pregúntame

**`pricing.rows.aiMemory`**

> EN — AI Memory

Memoria AI

**`pricing.rows.askYourData`**

> EN — Ask your own records

Pregunta a tus propios datos

**`pricing.rows.automation`**

> EN — Automation

Automatización

**`pricing.rows.backgroundJobs`**

> EN — Work that runs in the background

Trabajos en segundo plano

**`pricing.rows.buildLogs`**

> EN — Website, app, image and video logs

Registros de webs, apps, imágenes y vídeos

**`pricing.rows.businessLogs`**

> EN — My records

Mis registros

**`pricing.rows.chatMemory`**

> EN — Facts remembered in chat

Datos que recuerda el chat

**`pricing.rows.chatPins`**

> EN — Pinned conversations

Conversaciones fijadas

**`pricing.rows.coding`**

> EN — AI Coding

Programación con IA

**`pricing.rows.contactSupport`**

> EN — Contact form

Formulario de contacto

**`pricing.rows.createStudio`**

> EN — Describe it, it opens the right tool

Descríbelo y abre la herramienta adecuada

**`pricing.rows.creditsPerMonth`**

> EN — Credits / month

Créditos / mes

**`pricing.rows.customAiPersona`**

> EN — Custom assistant name

Nombre propio del asistente

**`pricing.rows.deepResearch`**

> EN — Deep Research runs / month

Ejecuciones de Deep Research / mes

**`pricing.rows.documents`**

> EN — Documents

Documentos

**`pricing.rows.fileQuestionsPerHour`**

> EN — Questions about a file

Preguntas sobre un archivo

**`pricing.rows.files`**

> EN — Files stored

Archivos almacenados

**`pricing.rows.fileUploadsPerHour`**

> EN — File uploads

Subidas de archivos

**`pricing.rows.freeChatMessages`**

> EN — Free chat messages / month

Mensajes de chat gratuitos / mes

**`pricing.rows.helpCentre`**

> EN — Help Centre

Centro de ayuda

**`pricing.rows.integrationReadsPerHour`**

> EN — Reads from a connected account

Lecturas de una cuenta conectada

**`pricing.rows.integrations`**

> EN — Connected integrations

Integraciones conectadas

**`pricing.rows.listRowsShown`**

> EN — Rows shown in one list

Filas mostradas por lista

**`pricing.rows.meetings`**

> EN — Meetings → actions

Reuniones → acciones

**`pricing.rows.missionControl`**

> EN — Goals & Plans

Objetivos y planes

**`pricing.rows.notifications`**

> EN — Notifications and reminders

Avisos y recordatorios

**`pricing.rows.posts`**

> EN — Posts

Publicaciones

**`pricing.rows.predictions`**

> EN — Predictions

Patrones

**`pricing.rows.presentations`**

> EN — Presentations

Presentaciones

**`pricing.rows.projects`**

> EN — Projects

Proyectos

**`pricing.rows.publishedSites`**

> EN — Published websites

Sitios web publicados

**`pricing.rows.recordSearch`**

> EN — Record search across modules

Búsqueda en todos los registros

**`pricing.rows.siteEditsPerDay`**

> EN — Live edits per site

Ediciones en vivo por web

**`pricing.rows.siteVersionsKept`**

> EN — Versions kept per site

Versiones guardadas por web

**`pricing.rows.storage`**

> EN — Storage

Almacenamiento

**`pricing.rows.teamCollaboration`**

> EN — Members get your plan

Los miembros obtienen tu plan

**`pricing.rows.teamMembers`**

> EN — Team members

Miembros del equipo

**`pricing.rows.teamSeatsAddOn`**

> EN — Team seats

Puestos de equipo

**`pricing.rows.voiceClipLength`**

> EN — Longest recording (minutes)

Grabación más larga (minutos)

**`pricing.rows.voiceMinutes`**

> EN — Voice minutes / month

Minutos de voz / mes

**`pricing.rows.websiteBuilder`**

> EN — Website Builder

Website Builder

**`pricing.rows.websiteImageStorage`**

> EN — Storage for website photos

Espacio para fotos de la web

**`pricing.values.custom`**

> EN — Custom

Personalizado

**`pricing.values.included`**

> EN — Included

Incluido

**`pricing.values.minutesPerMonth`**

> EN — min/month

min/mes

**`pricing.values.no`**

> EN — Not included

No incluido

**`pricing.values.perDay`**

> EN — /day

/día

**`pricing.values.perHour`**

> EN — /hour

/hora

**`pricing.values.perSeat`**

> EN — +{currency}{price}/seat

+{currency}{price}/puesto

**`pricing.values.unlimited`**

> EN — Unlimited

Ilimitado

**`pricing.values.yes`**

> EN — Included

Incluido

**`auth.generateStrongPassword`**

> EN — Generate strong password

Generar contraseña segura

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

Continuar con Google

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

No se pudo iniciar sesión con Google. Inténtalo de nuevo.

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

o continuar con correo

**`auth.splash.loading`**

> EN — Loading workspace...

Cargando tu espacio de trabajo…

**`auth.splash.ready`**

> EN — Ready.

Listo.

**`auth.splash.syncing`**

> EN — Syncing data...

Sincronizando datos…

**`common.hidePassword`**

> EN — Hide password

Ocultar contraseña

**`common.showPassword`**

> EN — Show password

Mostrar contraseña

### login

**`auth.login.email`**

> EN — Email

Correo electrónico

**`auth.login.forgotPassword`**

> EN — Forgot password?

¿Olvidaste tu contraseña?

**`auth.login.logIn`**

> EN — Log In

Iniciar sesión

**`auth.login.noAccount`**

> EN — No account yet?

¿No tienes cuenta?

**`auth.login.password`**

> EN — Password

Contraseña

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

Contraseña actualizada — inicia sesión con tu nueva contraseña.

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

Inicia sesión para guardar lo que compartiste.

**`auth.login.signUp`**

> EN — Sign up

Regístrate

**`auth.login.welcomeBack`**

> EN — Welcome back

Bienvenido de nuevo

**`auth.login.working`**

> EN — Working...

Procesando...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

Vamos a hacerlo tuyo

**`dashboard.firstTask.cost`**

> EN — Free, within this month's free messages.

Gratis, dentro de los mensajes gratuitos de este mes.

**`dashboard.firstTask.import`**

> EN — Bring your data from a CSV file

Trae tus datos desde un archivo CSV

**`dashboard.firstTask.ownLabel`**

> EN — Or write what you want

O escribe lo que quieras

**`dashboard.firstTask.ownPlaceholder`**

> EN — Or write what you want done…

O escribe lo que quieres que se haga…

**`dashboard.firstTask.send`**

> EN — Start

Empezar

**`dashboard.firstTask.skip`**

> EN — Skip

Omitir

**`dashboard.firstTask.tasks.explain.label`**

> EN — Learn

Aprender

**`dashboard.firstTask.tasks.plan.label`**

> EN — Plan

Planificar

**`dashboard.firstTask.tasks.plan.text`**

> EN — Make me a plan to find my first customers this month

Hazme un plan para encontrar a mis primeros clientes este mes

**`dashboard.firstTask.tasks.write.label`**

> EN — Write

Escribir

**`dashboard.firstTask.tasks.write.text`**

> EN — Write a short email asking a supplier for a quote

Escribe un correo breve pidiendo un presupuesto a un proveedor

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

No se pudo leer ese archivo.

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

Buscando patrones en tus datos…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

Elegir otro archivo

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

Elegir archivo

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{ready} de {total} filas están listas

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

Sube tu hoja de cálculo

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

Día / mes

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

Mes / día

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

Extraer las entradas

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

Una agencia o pequeña empresa

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

Ingresos y clientes como freelance

**`dashboard.onboarding.goals.other`**

> EN — Something else

Otra cosa

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

Una startup que estoy creando

**`dashboard.onboarding.goals.trading`**

> EN — My trading

Mi trading

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

¿Qué quieres controlar principalmente?

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

Ir a tu panel

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— ignorar esta columna —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

{count, plural, one {# fila importada} other {# filas importadas}}

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

Ahora {count, plural, one {hay # fila} other {hay # filas}} en tu cuenta.

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

La importación no se completó.

**`dashboard.onboarding.importing`**

> EN — Importing…

Importando…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

{count, plural, one {Importar # fila} other {Importar # filas}}

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

El análisis no terminó.

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

Esto es lo que encontré

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

Esto parece: {label}.

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

Asignar la columna {column}

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

Qué es cada columna: cambia lo que hayamos acertado mal

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

Aún no hay nada sólido

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

Añade algo más y vuelve a ejecutarlo desde tu panel.

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

No había nada en ese texto que valiera la pena registrar.

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

Pega aquí tu texto…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

Pega lo que sea

**`dashboard.onboarding.previewSource`**

> EN — From your file

De tu archivo

**`dashboard.onboarding.previewStored`**

> EN — Stored as

Se guarda como

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

Lo que se guardará realmente

**`dashboard.onboarding.reading`**

> EN — Reading…

Leyendo…

**`dashboard.onboarding.skip`**

> EN — Skip for now

Omitir por ahora

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

{count} omitidas

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

Sube una hoja de cálculo

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

Conecta Gmail o Drive

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

Solo lectura, y solo lo que apruebes.

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

Lo añadiré yo mismo

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

Ve directo al panel y empieza desde cero.

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

Pega un texto

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

Trae tus datos

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

Paso {step} de {total}

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

Las hojas de cálculo deben ocupar {max} o menos.

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

solo se leyeron las primeras filas

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

La IA que ya conoce tu trabajo. Pregúntale lo que sea.

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

Primera Entrada en {module}

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

Logro desbloqueado: {achievement}

**`common.accountMenu`**

> EN — Account menu

Menú de cuenta

**`common.commandPalette`**

> EN — Command palette

Paleta de comandos

**`common.createStudio`**

> EN — Make anything

Crea lo que sea

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

Créditos restantes: compra más en Ajustes

**`common.creditsUnlimited`**

> EN — Unlimited

Ilimitados

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — pulsa Intro para descartar

**`common.jumpToPage`**

> EN — Jump to a module or page...

Ir a un módulo o página...

**`common.loading`**

> EN — Loading...

Cargando...

**`common.noMatches`**

> EN — No matches for “{query}”

Sin resultados para «{query}»

**`common.offline.checking`**

> EN — Checking…

Comprobando…

**`common.offline.retry`**

> EN — Try again

Reintentar

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

Nada de esta página se está actualizando.

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

Nada de esto se actualiza: se cargó hace {minutes} min.

**`common.offline.stillOffline`**

> EN — Still no connection.

Sigue sin conexión.

**`common.offline.title`**

> EN — You're offline.

Estás sin conexión.

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

Acceso de propietario: créditos ilimitados

**`common.paletteClose`**

> EN — close

cerrar

**`common.paletteNavigate`**

> EN — navigate

navegar

**`common.paletteSelect`**

> EN — select

seleccionar

**`common.search`**

> EN — Search anything...

Buscar cualquier cosa...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

Mensaje gratuito · quedan {count} este mes

**`credits.unlimited`**

> EN — Unlimited — no credits used

Ilimitado — no se usaron créditos

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

Ilimitado — habría costado {count, plural, one {# crédito} other {# créditos}}

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

{count, plural, one {Se usó # crédito} other {Se usaron # créditos}}

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

{count, plural, one {Se usó # crédito} other {Se usaron # créditos}} · {remaining, plural, one {queda #} other {quedan #}}

**`dashboard.search.dates.30d`**

> EN — 30 days

30 días

**`dashboard.search.dates.365d`**

> EN — 1 year

1 año

**`dashboard.search.dates.7d`**

> EN — 7 days

7 días

**`dashboard.search.dates.any`**

> EN — Any time

Cualquier fecha

**`dashboard.search.filters.all`**

> EN — All

Todo

**`dashboard.search.filters.date`**

> EN — Date

Fecha

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

Conversaciones

**`dashboard.search.kinds.file`**

> EN — Files

Archivos

**`dashboard.search.kinds.help`**

> EN — Help

Ayuda

**`dashboard.search.kinds.mission`**

> EN — Plans

Planes

**`dashboard.search.kinds.module`**

> EN — Entries

Entradas

**`dashboard.search.kinds.page`**

> EN — Pages

Páginas

**`dashboard.search.kinds.research`**

> EN — Research

Investigación

**`dashboard.search.kinds.website`**

> EN — Websites

Sitios web

**`sampleData.banner`**

> EN — Sample data

Datos de ejemplo

**`sampleData.clear`**

> EN — Remove the sample

Quitar el ejemplo

**`sampleData.clearFailed`**

> EN — That did not work.

No funcionó.

**`sampleData.clearing`**

> EN — Removing…

Quitando…

**`sidebar.closeMenu`**

> EN — Close menu

Cerrar el menú

**`sidebar.items.activity`**

> EN — Activity

Actividad

**`sidebar.items.affiliate`**

> EN — Affiliate

Afiliados

**`sidebar.items.agents`**

> EN — AI that works for you

IA que trabaja para ti

**`sidebar.items.aiMemory`**

> EN — What it remembers

Lo que recuerda

**`sidebar.items.analytics`**

> EN — Analytics

Analítica

**`sidebar.items.apps`**

> EN — App ideas

Ideas de apps

**`sidebar.items.automation`**

> EN — Automation

Automatización

**`sidebar.items.browserAgent`**

> EN — Browser agent

Agente de navegador

**`sidebar.items.businessAccounting`**

> EN — Accounting

Contabilidad

**`sidebar.items.businessCrm`**

> EN — CRM

Clientes (CRM)

**`sidebar.items.businessFinance`**

> EN — Company Finance

Finanzas de la empresa

**`sidebar.items.businessHealth`**

> EN — How the business is doing

Cómo va el negocio

**`sidebar.items.businessHr`**

> EN — HR

RR. HH.

**`sidebar.items.businessInventory`**

> EN — Inventory

Inventario

**`sidebar.items.businessLegal`**

> EN — Legal

Asuntos legales

**`sidebar.items.businessMarketing`**

> EN — Marketing

Marketing

**`sidebar.items.businessProcurement`**

> EN — Procurement

Compras

**`sidebar.items.businessSupport`**

> EN — Customer Support

Atención al cliente

**`sidebar.items.calendar`**

> EN — Calendar

Calendario

**`sidebar.items.campaigns`**

> EN — Campaign ideas

Ideas de campañas

**`sidebar.items.chat`**

> EN — Ask me

Pregúntame

**`sidebar.items.coding`**

> EN — Coding

Código

**`sidebar.items.competitors`**

> EN — Competitors

Competidores

**`sidebar.items.computerAgent`**

> EN — Computer agent

Agente de ordenador

**`sidebar.items.connectApis`**

> EN — APIs

Interfaces API

**`sidebar.items.connectBanking`**

> EN — Banking

Banca

**`sidebar.items.connectCalendar`**

> EN — Calendar Sync

Sincronización de calendario

**`sidebar.items.connectCrm`**

> EN — CRM Connector

Conector CRM

**`sidebar.items.connectDataSources`**

> EN — Data Sources

Fuentes de datos

**`sidebar.items.connectDrive`**

> EN — Google Drive

Google Drive

**`sidebar.items.connectEmail`**

> EN — Email

Correo

**`sidebar.items.connectGithub`**

> EN — GitHub

GitHub

**`sidebar.items.connectIot`**

> EN — IoT Devices

Dispositivos IoT

**`sidebar.items.connectMcp`**

> EN — MCP

MCP

**`sidebar.items.connectSlack`**

> EN — Slack

Slack

**`sidebar.items.content`**

> EN — Content

Contenido

**`sidebar.items.costs`**

> EN — Costs

Costes

**`sidebar.items.dataAnalysis`**

> EN — See what the numbers say

Mira qué dicen los números

**`sidebar.items.decisions`**

> EN — Decisions

Decisiones

**`sidebar.items.deepResearch`**

> EN — Look into it properly

Investígalo a fondo

**`sidebar.items.design`**

> EN — Design

Diseño

**`sidebar.items.documents`**

> EN — Documents

Documentos

**`sidebar.items.engCloud`**

> EN — Cloud

Nube

**`sidebar.items.engCode`**

> EN — Code

Código

**`sidebar.items.engDatabases`**

> EN — Database Ops

Operaciones de base de datos

**`sidebar.items.engDeployment`**

> EN — Deployment

Despliegue

**`sidebar.items.engDevops`**

> EN — DevOps

DevOps

**`sidebar.items.engInfrastructure`**

> EN — Infrastructure

Infraestructura

**`sidebar.items.engMonitoring`**

> EN — Service Monitoring

Monitorización de servicios

**`sidebar.items.engSecurity`**

> EN — Security

Seguridad

**`sidebar.items.engTesting`**

> EN — Testing

Pruebas

**`sidebar.items.favorites`**

> EN — Favorites

Favoritos

**`sidebar.items.feedback`**

> EN — Feedback

Comentarios

**`sidebar.items.files`**

> EN — Files

Archivos

**`sidebar.items.finance`**

> EN — Finances

Finanzas

**`sidebar.items.formSubmissions`**

> EN — Form submissions

Envíos de formularios

**`sidebar.items.help`**

> EN — Help Centre

Centro de ayuda

**`sidebar.items.home`**

> EN — Home

Inicio

**`sidebar.items.ideas`**

> EN — Ideas

Ideas

**`sidebar.items.images`**

> EN — Image ideas

Ideas de imágenes

**`sidebar.items.imageTool`**

> EN — Image

Imagen

**`sidebar.items.integrations`**

> EN — Integrations

Integraciones

**`sidebar.items.knowledge`**

> EN — Knowledge

Conocimiento

**`sidebar.items.knowledgeGraph`**

> EN — Knowledge Graph

Grafo de conocimiento

**`sidebar.items.learning`**

> EN — Learning

Aprendizaje

**`sidebar.items.library`**

> EN — My stuff

Mis cosas

**`sidebar.items.marketplace`**

> EN — Ready-made helpers

Ayudantes listos

**`sidebar.items.meetings`**

> EN — Meetings

Reuniones

**`sidebar.items.memory`**

> EN — Search my records

Buscar en mis registros

**`sidebar.items.mine`**

> EN — Mine

Lo mío

**`sidebar.items.missionControl`**

> EN — Goals & Plans

Objetivos y planes

**`sidebar.items.monitoring`**

> EN — Monitoring

Monitorización

**`sidebar.items.music`**

> EN — Music

Música

**`sidebar.items.newEntry`**

> EN — New entry

Nueva entrada

**`sidebar.items.operations`**

> EN — Operations

Operaciones

**`sidebar.items.personalFinance`**

> EN — Personal Finance

Finanzas personales

**`sidebar.items.personalHabits`**

> EN — Habits

Hábitos

**`sidebar.items.personalHealth`**

> EN — Health

Salud

**`sidebar.items.personalJournal`**

> EN — Journaling

Diario

**`sidebar.items.personalLifeOs`**

> EN — Life OS

Life OS

**`sidebar.items.personalShopping`**

> EN — Shopping

Compras

**`sidebar.items.personalTravel`**

> EN — Travel

Viajes

**`sidebar.items.posts`**

> EN — Posts

Publicaciones

**`sidebar.items.predictions`**

> EN — Predictions

Patrones

**`sidebar.items.presentations`**

> EN — Presentations

Presentaciones

**`sidebar.items.products`**

> EN — Products

Productos

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

Flujo de Trabajo de Producto

**`sidebar.items.projects`**

> EN — Projects

Proyectos

**`sidebar.items.published`**

> EN — Live sites

Sitios en vivo

**`sidebar.items.records`**

> EN — My records

Mis registros

**`sidebar.items.reflection`**

> EN — Your week

Tu semana

**`sidebar.items.research`**

> EN — Research

Investigación

**`sidebar.items.routing`**

> EN — Which AI is used

Qué IA se usa

**`sidebar.items.sales`**

> EN — Sales

Ventas

**`sidebar.items.scheduledJobs`**

> EN — Scheduled Jobs

Tareas programadas

**`sidebar.items.settings`**

> EN — Settings

Configuración

**`sidebar.items.systemHealth`**

> EN — System Health

Estado del sistema

**`sidebar.items.tasks`**

> EN — Tasks

Tareas

**`sidebar.items.team`**

> EN — Team

Equipo

**`sidebar.items.timeline`**

> EN — History

Historial

**`sidebar.items.trading`**

> EN — Trading

Trading

**`sidebar.items.tradingJournal`**

> EN — Trading journal

Diario de trading

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

Flujo de Trabajo de Trading

**`sidebar.items.verifyCode`**

> EN — Code Verification

Verificación de código

**`sidebar.items.verifyData`**

> EN — Data Validation

Validación de datos

**`sidebar.items.verifyFacts`**

> EN — Fact Checking

Verificación de hechos

**`sidebar.items.verifyOutput`**

> EN — Output Evaluation

Evaluación de resultados

**`sidebar.items.verifyRedTeam`**

> EN — Red Teaming

Pruebas de intrusión

**`sidebar.items.verifySecurity`**

> EN — Security Testing

Pruebas de seguridad

**`sidebar.items.verifySources`**

> EN — Source Verification

Verificación de fuentes

**`sidebar.items.videos`**

> EN — Video ideas

Ideas de vídeos

**`sidebar.items.voice`**

> EN — Voice

Voz

**`sidebar.items.websiteBuilder`**

> EN — Build a site

Crea un sitio

**`sidebar.items.websites`**

> EN — Website plans

Planes de webs

**`sidebar.items.workflows`**

> EN — Workflows

Flujos de trabajo

**`sidebar.rail.allTools`**

> EN — All tools

Todas las herramientas

**`sidebar.rail.chat`**

> EN — Chat

Chat

**`sidebar.rail.coding`**

> EN — Coding

Código

**`sidebar.rail.collapse`**

> EN — Collapse sidebar

Contraer la barra lateral

**`sidebar.rail.expand`**

> EN — Expand sidebar

Expandir la barra lateral

**`sidebar.rail.label`**

> EN — Main

Menú principal

**`sidebar.rail.new`**

> EN — New

Nuevo

**`sidebar.rail.pin`**

> EN — Pin {tool}

Fijar {tool}

**`sidebar.rail.recentChats`**

> EN — Recent chats

Chats recientes

**`sidebar.rail.recentTools`**

> EN — Recent tools

Herramientas recientes

**`sidebar.rail.remove`**

> EN — Remove {tool} from Recent tools

Quitar {tool} de las recientes

**`sidebar.rail.saveFailed`**

> EN — Could not save that change. Try again.

No se pudo guardar el cambio. Inténtalo de nuevo.

**`sidebar.rail.settings`**

> EN — Settings

Ajustes

**`sidebar.rail.unpin`**

> EN — Unpin {tool}

Desfijar {tool}

**`sidebar.rail.untitledChat`**

> EN — New conversation

Nueva conversación

**`sidebar.tabs.label`**

> EN — Main navigation

Navegación principal

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

No se pudieron cargar tus ideas: {message}

**`errors.boundary.section`**

> EN — This section could not be displayed.

Esta sección no se pudo mostrar.

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

El resto de la página no está afectada. Recargar suele solucionarlo.

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

Esto era una pregunta, así que no se archivó nada.

**`dashboard.create.answerItInstead`**

> EN — Answer it

Responderla

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

Continuar en el Chat

**`dashboard.create.loggedTo`**

> EN — Logged to:

Registrado en:

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

Registrarla igualmente

**`dashboard.create.title`**

> EN — Create Anything

Crear Cualquier Cosa

**`dashboard.create.viewModule`**

> EN — View {module} →

Ver {module} →

**`dashboard.createAnything.accomplishPlaceholder`**

> EN — What do you want to accomplish?

¿Qué quieres conseguir?

**`dashboard.createAnything.attachImage`**

> EN — Attach image

Adjuntar imagen

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

Tu respuesta...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

Continuar

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

Omitir y registrarlo igualmente

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

Un par de preguntas rápidas:

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

Describe tu idea en detalle...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

Quitar imagen

**`dashboard.createAnything.send`**

> EN — Send

Enviar

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

No se pudieron subir una o más imágenes.

**`errors.creditHistory`**

> EN — See credit history

Ver historial de créditos

**`errors.retry`**

> EN — Try again

Inténtalo de nuevo

## Tier 3 — Further in — only if you have time (208)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

Cerrar

**`common.readMore`**

> EN — Read more

Leer más

**`common.whatIsThisPage`**

> EN — What is this page?

¿Qué es esta página?

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

de {count, plural, one {# de tus entradas} other {# de tus entradas}}

**`dashboard.insights.checkIt`**

> EN — Check it yourself

Compruébalo tú mismo

**`dashboard.insights.dismiss`**

> EN — Dismiss this

Descartar

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

No se pudo descartar.

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

Ocultar los números

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

Ver los números

**`promise.greeting.afternoon`**

> EN — Good afternoon

Buenas tardes

**`promise.greeting.evening`**

> EN — Good evening

Buenas noches

**`promise.greeting.morning`**

> EN — Good morning

Buenos días

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

Descartar

**`common.noNotifications`**

> EN — No new notifications.

No hay notificaciones nuevas.

**`common.notifications`**

> EN — Notifications

Notificaciones

**`common.toggleMenu`**

> EN — Toggle menu

Mostrar u ocultar el menú

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

recarga ahora para que nada te interrumpa.

**`credits.low.none`**

> EN — No credits left this month

No quedan créditos este mes

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

{count, plural, one {Queda # crédito} other {Quedan # créditos}} este mes

**`credits.low.topUp`**

> EN — Top up

Recargar

**`language.label`**

> EN — Language

Idioma

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

No se pudo guardar el idioma: no se cambió nada.

**`pwa.install`**

> EN — Install

Instalar

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

Añádelo a la pantalla de inicio: pantalla completa y notificaciones que sí llegan.

**`pwa.installTitle`**

> EN — Install Ionexa

Instalar Ionexa

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

Safari nunca lo ofrece por su cuenta: son tres toques.

**`pwa.iosGotIt`**

> EN — Got it

Entendido

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

Toca el botón Compartir en la barra de Safari

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

Baja y toca «Añadir a pantalla de inicio»

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

Toca Añadir: Ionexa aparecerá junto a tus otras apps

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

Añadir Ionexa a la pantalla de inicio

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

Hasta entonces, el iPhone no puede enviarte notificaciones y Safari puede borrar lo guardado tras 7 días sin uso.

**`pwa.notNow`**

> EN — Not now

Ahora no

**`pwa.showHow`**

> EN — Show me how

Enséñame cómo

### first result

**`common.cancel`**

> EN — Cancel

Cancelar

**`common.created`**

> EN — ✓ created

✓ creado

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

Descartar la sugerencia

**`common.error`**

> EN — error

error

**`common.notAuthenticated`**

> EN — Not authenticated.

No has iniciado sesión.

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

Comprar créditos

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

Esta acción necesita más créditos de los que te quedan. Compra un paquete o mejora tu plan para continuar.

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

Te quedan {available} créditos y esto necesita unos {needed}. Compra un paquete o mejora tu plan para continuar.

**`credits.outOfCredits.title`**

> EN — You're out of credits

Te has quedado sin créditos

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

Mejorar plan

**`dashboard.goal.change`**

> EN — Change something

Cambiar algo

**`dashboard.goal.confirm`**

> EN — Yes, do it

Sí, hazlo

**`dashboard.goal.costsNow`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press Yes. Nothing is charged until then.

{credits, plural, one {# crédito} other {# créditos}} al pulsar «Sí». Hasta entonces no se cobra nada.

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

{credits, plural, one {# crédito} other {# créditos}} cuando pulses el botón allí. Ahora no se cobra nada.

**`dashboard.goal.dismiss`**

> EN — Never mind

Déjalo

**`dashboard.goal.fix`**

> EN — Fix the text

Corregir el texto

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

No se cobra nada ahora, ni al llegar.

**`dashboard.goal.goingTo`**

> EN — Going to

Se abrirá

**`dashboard.goal.heard`**

> EN — I heard: “{heard}”

Entendí: «{heard}»

**`dashboard.goal.routeAsk`**

> EN — Ionexa will read it

Lo leerá Ionexa

**`dashboard.goal.routeChange`**

> EN — change

cambiar

**`dashboard.goal.routeCostNow`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} on send

≈ {credits, plural, one {# crédito} other {# créditos}} al enviar

**`dashboard.goal.routeCostThere`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} there

≈ {credits, plural, one {# crédito} other {# créditos}} allí

**`dashboard.goal.sendIt`**

> EN — Yes, send it

Sí, envíalo

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

Cuéntame un poco más, para que vaya al sitio correcto.

**`dashboard.goal.which`**

> EN — Which one do you mean?

¿A cuál te refieres?

**`dashboard.goal.willHandle`**

> EN — No tool is named, so Ionexa will read it — it may answer it or save it as an entry.

No se nombra ninguna herramienta, así que Ionexa lo leerá: puede responder o guardarlo como registro.

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

Esto va a {destination}, con lo que escribiste.

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

Competidores

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

competidores conocidos

**`dashboard.ideas.customerLabel`**

> EN — Customer

Cliente

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

cliente objetivo

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

Un nuevo servicio para pequeñas empresas

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

Todas tus ideas, en un solo sitio

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

Anótala mientras aún es un borrador: aquí se puntúa, se compara con las demás y queda registrada aunque la descartes.

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

Tamaño de mercado

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

p. ej. TAM de 2000 M$

**`dashboard.ideas.mvpLabel`**

> EN — MVP

Producto mínimo viable

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

¿cómo es el producto mínimo viable?

**`dashboard.ideas.nameLabel`**

> EN — Name

Nombre

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

nombre de la idea

**`dashboard.ideas.new`**

> EN — New Idea

Nueva idea

**`dashboard.ideas.problemLabel`**

> EN — Problem

Problema

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

¿qué problema resuelve?

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

Puntuación (0-100)

**`dashboard.ideas.scorePlaceholder`**

> EN — score

puntuación

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

Veredicto

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

p. ej. seguir / descartar / observar

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

Recarga la página para ver la versión actual y vuelve a aplicar tu cambio.

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

Alguien — u otra pestaña — lo ha cambiado mientras trabajabas en ello.

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

Divídelo o sube una versión más pequeña.

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

Ese archivo es demasiado grande.

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

Abre Ajustes › Facturación para ver qué plan lo cubre.

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

Tu plan no incluye esto.

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

Compra créditos en Ajustes o espera a tu renovación mensual.

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

No tienes créditos suficientes para esto.

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

Revisa los campos marcados y envíalo de nuevo.

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

Algo del formulario no se ha aceptado.

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

Vuelve a iniciar sesión y repite la acción: no se ha perdido nada de lo que habías escrito.

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

Has cerrado sesión.

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

Probablemente se eliminó. Vuelve a la lista y elige otro.

**`errors.codes.notFound.what`**

> EN — This no longer exists.

Esto ya no existe.

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

Comprueba tu conexión e inténtalo de nuevo.

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

Tu dispositivo no ha podido conectarse.

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

Elimina algo que ya no necesites o mejora tu plan en Ajustes › Facturación.

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

Has alcanzado el límite de tu plan.

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

Espera un minuto aproximadamente y vuelve a intentarlo.

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

Demasiadas peticiones en poco tiempo.

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

Ha quedado registrado. Inténtalo de nuevo en un momento y contacta con soporte si sigue ocurriendo.

**`errors.codes.serverError.what`**

> EN — This broke on our side.

Esto ha fallado por nuestra parte.

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

Inténtalo de nuevo y contacta con soporte si vuelve a pasar.

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

Esta acción no se ha completado.

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

Conviértelo a PDF, DOCX, CSV o TXT y vuelve a subirlo.

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

Ese tipo de archivo no es compatible.

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

Es cosa nuestra y suele resolverse en unos minutos.

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

El servicio de IA no responde en este momento.

**`errors.credits.charged`**

> EN — This attempt used credits.

Este intento ha consumido créditos.

**`errors.credits.notCharged`**

> EN — You were not charged.

No se te ha cobrado nada.

**`errors.credits.refunded`**

> EN — Your credits were returned.

Tus créditos han sido devueltos.

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

Desde aquí no podemos confirmar si se ha cobrado.

**`module.exportCsv`**

> EN — Export CSV

Exportar CSV

**`module.noMatches`**

> EN — No matches for “{query}”

Sin resultados para «{query}»

**`module.save`**

> EN — Save

Guardar

**`module.saving`**

> EN — Saving...

Guardando...

**`module.searchPlaceholder`**

> EN — Search...

Buscar...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

{credits, plural, one {# crédito} other {# créditos}} por minuto de habla

**`voice.draft.discard`**

> EN — Discard

Descartar

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

No se ha enviado nada. Corrige el texto y envíalo tú.

**`voice.draft.title`**

> EN — What was heard

Lo que se ha oído

**`voice.draft.use`**

> EN — Use this text

Usar este texto

**`voice.errors.bad_request`**

> EN — That request could not be read.

No se ha podido leer esa petición.

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

El servicio está muy ocupado ahora mismo. Inténtalo en un momento.

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

No se permitió el micrófono. Siempre puedes escribir.

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

No se oyó nada en esa grabación.

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

La voz no está disponible ahora mismo. Siempre puedes escribir.

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

No hay créditos suficientes.

**`voice.errors.no_recording`**

> EN — No recording was sent.

No se envió ninguna grabación.

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

No se grabó nada.

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

La voz no está configurada en esta instalación.

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

La voz no está incluida en tu plan.

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

Se han agotado los minutos de voz de este mes.

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

No se ha podido contactar con el servicio de voz.

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

Demasiadas grabaciones en la última hora. Inténtalo en un momento.

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

No se han podido reservar los créditos para esto.

**`voice.errors.streamInterrupted`**

> EN — The connection dropped before the reply finished.

La conexión se cortó antes de terminar la respuesta.

**`voice.errors.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

La conexión se cortó: la respuesta de arriba puede estar incompleta.

**`voice.errors.too_large`**

> EN — That recording is too long.

Esa grabación es demasiado larga.

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

Has cerrado la sesión. Inicia sesión y vuelve a intentarlo.

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

Este navegador no puede grabar audio. Siempre puedes escribir.

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

Ese formato de audio no está admitido.

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

Ahora mismo no se han podido comprobar los minutos de voz.

**`voice.listening`**

> EN — Listening

Escuchando

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

Habla y luego pulsa Detener. No se envía nada hasta que lo hayas leído.

**`voice.permission.allow`**

> EN — Open the microphone

Abrir el micrófono

**`voice.permission.cancel`**

> EN — Not now

Ahora no

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

{credits, plural, one {# crédito} other {# créditos}} por minuto, {minutes, plural, one {# minuto} other {# minutos}} al mes en tu plan.

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

Lees y corriges el texto antes de que se envíe nada.

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

El audio se envía para transcribirlo y no se guarda en ningún sitio, ni por nosotros ni después.

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

La grabación empieza solo cuando pulsas y se detiene cuando vuelves a pulsar.

**`voice.permission.title`**

> EN — Before the microphone opens

Antes de abrir el micrófono

**`voice.startListening`**

> EN — Speak instead of typing

Habla en lugar de escribir

**`voice.stopListening`**

> EN — Stop

Detener

**`common.nextPage`**

> EN — Next page

Página siguiente

**`common.paginationNext`**

> EN — Next

Sig.

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

✓ actualizado

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

Competidores:

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

para: {customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

Tamaño de mercado:

**`dashboard.ideas.cardMvp`**

> EN — MVP:

Producto mínimo viable:

**`dashboard.ideas.cardProblem`**

> EN — Problem:

Problema:

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

Puntuación: {score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

¿Eliminar esta idea? No se puede deshacer.

**`dashboard.ideas.edit`**

> EN — Edit Idea

Editar la idea

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

Editar la idea: {name}

**`entityLinks.linked`**

> EN — Linked

Vinculado

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

Esto podría estar relacionado con: {titles}. ¿Vincular?

**`entityLinks.no`**

> EN — No

No

**`entityLinks.yes`**

> EN — Yes

Sí

**`module.edit`**

> EN — Edit

Editar

**`module.loggedAt`**

> EN — Logged {when}

Registrado {when}

**`module.sort.label`**

> EN — Sort:

Ordenar:

**`askAi.buttonLabel`**

> EN — Ask AI

Preguntar a la IA

**`common.networkError`**

> EN — Network error — please try again.

Error de red: inténtalo de nuevo.

**`common.textActions.accept`**

> EN — Accept

Aceptar

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

Desvincular

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

Desvincular {name}

**`favorites.add`**

> EN — Add to favorites

Añadir a favoritos

**`favorites.remove`**

> EN — Remove from favorites

Quitar de favoritos

**`module.delete`**

> EN — Delete

Eliminar

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

¿Eliminar este {label}? No se puede deshacer.

**`module.deleted`**

> EN — Deleted

Eliminado

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

También leyó {count, plural, one {# mensaje anterior} other {# mensajes anteriores}} sobre esta entrada

**`askAi.close`**

> EN — Close

Cerrar

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

Haz una pregunta sobre esta entrada — no hace falta explicar el contexto, la IA ya lo tiene.

**`askAi.placeholder`**

> EN — Ask anything about this entry...

Pregunta cualquier cosa sobre esta entrada...

**`askAi.send`**

> EN — Send

Enviar

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

La conexión se interrumpió antes de que terminara la respuesta.

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

La conexión se interrumpió: la respuesta anterior puede estar incompleta.

**`askAi.title`**

> EN — Ask AI about this {title}

Pregunta a la IA sobre este {title}

**`common.errorWithMessage`**

> EN — error: {message}

error: {message}

**`common.linked`**

> EN — ✓ linked

✓ vinculado

**`common.newMessagesBelow`**

> EN — New message below

Mensaje nuevo abajo

**`entityLinks.modalTitle`**

> EN — Link to...

Vincular a...

**`entityLinks.noMatches`**

> EN — No matches.

Sin resultados.

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

¿A qué módulo quieres vincular?

**`entityLinks.searching`**

> EN — Searching...

Buscando...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

Buscar en {module}...

**`aiSteps.counter`**

> EN — ({step}/{total})

({step}/{total})
