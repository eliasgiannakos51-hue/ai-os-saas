-- Help Centre seed, part 16 of 24 — 7 statements.
--
-- GENERATED from supabase/migrations/20260816_help_articles_seed.sql
-- by scripts/split-help-seed.mjs. Do not edit either by hand.
--
-- SPLIT ON STATEMENT BOUNDARIES, never inside one. Each part is a
-- complete, runnable script on its own: every statement is an UPSERT
-- on (slug, locale), so the parts may be run in any order, more than
-- once, and a part run twice changes nothing.
--
-- Run 20260816_help_articles.sql first — it creates the table and the
-- unique index these UPSERTs conflict on.

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'it', 'Come faccio un sito?', 'Apri Website Builder dal menù laterale, scrivi a parole tue cosa vuoi — cosa fa la tua attività, a chi si rivolge, che stile ti piace — e avvia la creazione. Puoi anche caricare immagini di riferimento, un logo o foto di prodotto, così segue il tuo stile. Quando è pronto lo pubblichi a un indirizzo suo con un clic.', 'websites', 0, true, array['fare un sito', 'creare sito', 'sito web', 'voglio un sito', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'it', 'Come creo un agent?', 'Nel menù Agent, descrivi in una frase cosa vuoi che venga fatto e ogni quanto — per esempio «ogni mattina mandami un riassunto delle notizie del mio settore». Ionexa costruisce l''agent da sé, lo esegue in orario e ti manda il risultato. Puoi metterlo in pausa o modificarlo quando vuoi.', 'agents', 0, true, array['creare agent', 'fare un agent', 'agent', 'automatizzare', 'automazione']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'it', 'Come creo una mission?', 'In Mission Control scrivi un obiettivo come lo diresti a una persona: «voglio più clienti entro la primavera». Ionexa lo divide in passi concreti, e poi puoi lavorarli tu o affidarne qualcuno a un agent.', 'missions', 0, true, array['creare mission', 'mission control', 'obiettivo', 'obiettivi', 'mission']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'it', 'Posso caricare file?', 'Sì — PDF, Word, Excel, CSV, testo e Markdown. Li carichi in File, Ionexa ne legge il contenuto e poi puoi fare domande su di essi. I tuoi file sono privati: nessun altro vi ha accesso e ogni download usa un link temporaneo.', 'files', 0, true, array['caricare file', 'caricare', 'pdf', 'file', 'documenti']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'it', 'Come collego Gmail o Google Drive?', 'Impostazioni > Connessioni. Scegli il servizio e approva l''accesso nella finestra di Google. Vedi esattamente cosa verrà letto prima di approvare, e puoi scollegare quando vuoi — le chiavi di accesso vengono cancellate subito.', 'integrations', 0, true, array['gmail', 'google drive', 'collegare', 'connessione', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'it', 'Cosa fate con i miei dati?', 'I tuoi dati sono tuoi. Non li vendiamo, non li usiamo per addestrare modelli, e ogni account vede solo i propri — è imposto nel database, non solo nell''applicazione. Puoi scaricarli o cancellarli quando vuoi.', 'privacy', 2, true, array['i miei dati', 'privacy', 'sicurezza', 'vendete i miei dati', 'addestrare modelli']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'it', 'Come cancello il mio account?', 'Impostazioni > Account > Elimina account. Ti verrà chiesta conferma, poi viene cancellato tutto: conversazioni, file, siti, agent, cronologia. Non è reversibile. Se prima vuoi una copia, scarica i tuoi dati dalla stessa pagina.', 'privacy', 0, true, array['cancellare account', 'eliminare account', 'chiudere l''account', 'cancellare profilo']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
