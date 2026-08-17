-- Help Centre seed, part 18 of 24 — 7 statements.
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
values ('create-website', 'pt', 'Como faço um site?', 'Abra o Website Builder no menu lateral, escreva por palavras suas o que quer — o que faz o seu negócio, a quem se dirige, que estilo gosta — e carregue em criar. Também pode carregar imagens de referência, um logótipo ou fotografias de produto, para seguir o seu estilo. Quando estiver pronto publica-o num endereço próprio com um clique.', 'websites', 0, true, array['fazer um site', 'criar site', 'página web', 'quero um site', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'pt', 'Como crio um agente?', 'No menu Agentes, descreva numa frase o que quer que seja feito e com que frequência — por exemplo «todas as manhãs envia-me um resumo das notícias do meu setor». O Ionexa constrói o agente sozinho, corre-o à hora certa e envia-lhe o resultado. Pode pausá-lo ou alterá-lo quando quiser.', 'agents', 0, true, array['criar agente', 'fazer um agente', 'agentes', 'automatizar', 'automatização']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'pt', 'Como crio uma missão?', 'No Mission Control escreve um objetivo como o diria a uma pessoa: «quero mais clientes até à primavera». O Ionexa divide-o em passos concretos, e depois pode trabalhá-los você ou entregar alguns a um agente.', 'missions', 0, true, array['criar missão', 'mission control', 'objetivo', 'objetivos', 'missões']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'pt', 'Posso carregar ficheiros?', 'Sim — PDF, Word, Excel, CSV, texto e Markdown. Carrega-os em Ficheiros, o Ionexa lê o conteúdo e depois pode fazer perguntas sobre eles. Os seus ficheiros são privados: mais ninguém tem acesso e cada descarga usa uma ligação temporária.', 'files', 0, true, array['carregar ficheiro', 'carregar', 'pdf', 'ficheiros', 'documentos']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'pt', 'Como ligo o Gmail ou o Google Drive?', 'Definições > Ligações. Escolha o serviço e aprove o acesso na janela da Google. Vê exatamente o que vai ser lido antes de aprovar, e pode desligar quando quiser — as chaves de acesso são apagadas de imediato.', 'integrations', 0, true, array['gmail', 'google drive', 'ligar', 'ligação', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'pt', 'O que fazem com os meus dados?', 'Os seus dados são seus. Não os vendemos, não os usamos para treinar modelos, e cada conta vê apenas os seus — isso é imposto na base de dados, não só na aplicação. Pode descarregá-los ou apagá-los quando quiser.', 'privacy', 2, true, array['os meus dados', 'privacidade', 'segurança', 'vendem os meus dados', 'treinar modelos']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'pt', 'Como apago a minha conta?', 'Definições > Conta > Eliminar conta. Ser-lhe-á pedida confirmação e depois apaga-se tudo: conversas, ficheiros, sites, agentes, histórico. Não é reversível. Se quiser uma cópia antes, descarregue os seus dados na mesma página.', 'privacy', 0, true, array['apagar conta', 'eliminar conta', 'fechar conta', 'apagar perfil']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
