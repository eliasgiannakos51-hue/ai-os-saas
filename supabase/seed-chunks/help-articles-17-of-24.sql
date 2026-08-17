-- Help Centre seed, part 17 of 24 — 7 statements.
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
values ('chat-memory', 'it', 'La chat ricorda le conversazioni precedenti?', 'All''interno della stessa conversazione ricorda sempre i messaggi precedenti. Tra conversazioni diverse conserva solo ciò che resta utile a lungo — il suo nome, di cosa si occupa, le sue preferenze — e questo è disponibile nei piani a pagamento. Può vedere tutto ciò che ha conservato, ed eliminarlo, in Impostazioni > Memoria.', 'chat', 0, true, array['ricorda', 'memoria', 'conversazioni precedenti', 'dimentica', 'non ricorda', 'cronologia della chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'pt', 'O que é o Ionexa?', 'Um espaço de trabalho onde a IA faz o trabalho em vez de apenas aconselhar: cria o seu site, corre agentes segundo um horário, divide os seus objetivos em passos, lê os seus ficheiros e responde sobre eles, e guarda tudo o que regista num único sítio pesquisável.', 'getting-started', 2, true, array['o que é o ionexa', 'o que é isto', 'para que serve', 'o que faz', 'como funciona']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'pt', 'Quanto custa o Ionexa?', 'Há um plano gratuito para experimentar e planos pagos à medida que as necessidades crescem. Os preços atuais e o que cada um inclui estão sempre na página /pricing — não são escritos aqui porque mudam, e um número desatualizado é pior do que número nenhum.', 'billing', 0, true, array['quanto custa', 'preço', 'preços', 'planos', 'subscrição']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'pt', 'O que são os créditos?', 'Os créditos são a moeda com que paga as ações de IA: uma mensagem no chat, gerar um site, a execução de um agente. Cada plano inclui uma dotação mensal que se renova, e pode comprar pacotes extra se acabarem antes. Quanto inclui cada plano está em /pricing.', 'credits', 0, true, array['o que são créditos', 'créditos', 'como funcionam os créditos', 'unidades']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'pt', 'Fiquei sem créditos — e agora?', 'Duas opções: esperar pela renovação mensal, ou comprar um pacote de créditos, que é adicionado de imediato e não expira no fim do mês. Ambas em Definições > Faturação.', 'credits', 2, true, array['sem créditos', 'créditos acabaram', 'comprar créditos', 'mais créditos']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'pt', 'Como mudo de plano?', 'Definições > Faturação. Escolha o plano que quer e a mudança aplica-se de imediato. Numa subida paga apenas a diferença do resto do período; numa descida mantém o plano atual até terminar o período já pago.', 'billing', 1, true, array['mudar de plano', 'subir de plano', 'descer de plano', 'mudar subscrição']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'pt', 'Como cancelo a minha subscrição?', 'Definições > Faturação > Cancelar subscrição. Não perde o acesso de imediato: o plano segue até ao fim do período já pago e depois a conta passa ao plano gratuito. Os seus dados ficam — cancelar não apaga nada.', 'billing', 2, true, array['cancelar', 'cancelar subscrição', 'anular subscrição', 'terminar subscrição']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
