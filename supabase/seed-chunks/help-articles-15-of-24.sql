-- Help Centre seed, part 15 of 24 — 7 statements.
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
values ('chat-memory', 'de', 'Merkt sich der Chat frühere Unterhaltungen?', 'Innerhalb einer Unterhaltung merkt er sich die früheren Nachrichten immer. Zwischen verschiedenen Unterhaltungen behält er nur dauerhaft Nützliches — deinen Namen, was du machst, deine Vorlieben — und das gibt es in den bezahlten Tarifen. Was er behalten hat, kannst du unter Einstellungen > Erinnerung ansehen und löschen.', 'chat', 0, true, array['merkt sich', 'erinnert sich', 'gedächtnis', 'frühere unterhaltungen', 'vergisst', 'chatverlauf']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'it', 'Che cos''è Ionexa?', 'Uno spazio di lavoro dove l''AI fa il lavoro invece di limitarsi a consigliare: crea il tuo sito, esegue agent secondo una pianificazione, divide i tuoi obiettivi in passi, legge i tuoi file e risponde su di essi, e tiene tutto ciò che registri in un unico posto ricercabile.', 'getting-started', 2, true, array['cos''è ionexa', 'che cos''è', 'a cosa serve', 'cosa fa', 'come funziona']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'it', 'Quanto costa Ionexa?', 'C''è un piano gratuito per provarlo e piani a pagamento man mano che le esigenze crescono. I prezzi attuali e cosa include ciascuno sono sempre sulla pagina /pricing: non li scriviamo qui perché cambiano e un numero vecchio è peggio di nessun numero.', 'billing', 0, true, array['quanto costa', 'prezzo', 'prezzi', 'piani', 'abbonamento']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'it', 'Cosa sono i credits?', 'I credits sono la moneta con cui paghi le azioni AI: un messaggio in chat, la generazione di un sito, l''esecuzione di un agent. Ogni piano include una dotazione mensile che si rinnova, e puoi comprare pacchetti extra se finisce prima. Quanto include ogni piano è su /pricing.', 'credits', 0, true, array['cosa sono i credits', 'credits', 'come funzionano i credits', 'unità']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'it', 'Ho finito i credits, e adesso?', 'Due possibilità: aspettare il rinnovo mensile, oppure comprare un pacchetto di credits, che viene aggiunto subito e non scade a fine mese. Entrambe si trovano in Impostazioni > Fatturazione.', 'credits', 2, true, array['finiti i credits', 'senza credits', 'comprare credits', 'altri credits']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'it', 'Come cambio piano?', 'Impostazioni > Fatturazione. Scegli il piano che vuoi e il cambio ha effetto subito. In caso di passaggio superiore paghi solo la differenza per il resto del periodo; scendendo mantieni il piano attuale fino alla fine del periodo già pagato.', 'billing', 1, true, array['cambiare piano', 'passare a un piano superiore', 'downgrade', 'cambiare abbonamento']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'it', 'Come annullo l''abbonamento?', 'Impostazioni > Fatturazione > Annulla abbonamento. Non perdi subito l''accesso: il piano prosegue fino alla fine del periodo già pagato e poi l''account passa al piano gratuito. I tuoi dati restano — annullare non cancella niente.', 'billing', 2, true, array['annullare', 'disdire l''abbonamento', 'cancellare abbonamento', 'disiscrivermi']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
