-- ============================================================================
-- BOTH NUMBERS, IN EVERY LANGUAGE THAT HAS TWO
-- ============================================================================
--
-- WHAT WAS WRONG. A Greek user typing "ανταγωνιστές" — the ordinary
-- plural, the way anybody would type it — was shown NO templates. The
-- keyword said "ανταγωνιστης". Measured against the live seed on
-- PostgreSQL 16, and it was never only Greek:
--
--     competitors    -> 0        competitor    -> 1
--     εκδήλωση       -> 0        εκδηλώσεις    -> 1
--     precios        -> 0        precio        -> 1
--     concurrents    -> 0        concurrent    -> 1
--     vorschriften   -> 0        vorschrift    -> 1
--     concorrenti    -> 0        concorrente   -> 1
--     أسعار          -> 0        سعر           -> 1
--
-- Nine of twenty-four probes across six languages returned nothing.
--
-- WHY. The document tsvector uses the 'simple' configuration, which does
-- no stemming — correctly, because no single Postgres configuration stems
-- ten languages. search_query makes the last term of a query a PREFIX. A
-- prefix matches a longer lexeme, so a SHORT query finds a LONG keyword;
-- the reverse never happens. Whichever number the seed was written in,
-- the other one found nothing — and the seed was inconsistent about
-- which, so it failed in both directions.
--
-- WHY THIS IS AN UPDATE AND NOT AN EDIT OF THE SEED. The seed in
-- 20260826000000_agent_templates.sql ends `on conflict (slug) do nothing`,
-- which is right — it must never overwrite a template somebody improved
-- in place. That also means editing those literals would fix nothing in
-- any database where they have already been inserted. This writes the
-- corrected arrays over the twelve BUILT-IN slugs only.
--
-- SHARED TEMPLATES ARE NOT TOUCHED. The `where shared_by is null` below
-- is what keeps a user's own shared template out of this: its keywords
-- are theirs, this file has no opinion about them, and rewriting somebody
-- else's data because it looked wrong to us is not a migration.
--
-- `document` is a GENERATED ... STORED column, so it is recomputed by the
-- update itself. No reindex, no second statement.
--
-- The word lists live in scripts/lib/template-plurals.mjs, classified by
-- language, and scripts/tests/template-plurals.test.mjs fails if this file
-- drifts from them or if a new template arrives with only one number.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- First six built-ins.
update public.agent_templates t
   set keywords = v.keywords
  from (values
  ('competitor-watch', array[
    'competitor', 'competitors', 'rival', 'rivals', 'competition',
    'market', 'markets', 'weekly', 'ανταγωνιστης', 'ανταγωνιστες',
    'ανταγωνισμος', 'ανταγωνισμοι', 'competencia', 'competencias',
    'concurrent', 'concurrents', 'wettbewerber', 'concorrente',
    'concorrenti', '競合', '竞争对手', 'منافس', 'منافسون']),
  ('daily-news-watch', array[
    'news', 'daily', 'updates', 'update', 'latest', 'briefing',
    'briefings', 'morning', 'νεα', 'ειδησεις', 'ειδηση', 'ημερησιο',
    'ημερησια', 'noticias', 'noticia', 'nouvelles', 'nouvelle',
    'nachrichten', 'nachricht', 'notizie', 'notizia', 'ニュース', '新闻',
    'أخبار', 'خبر']),
  ('event-watch', array[
    'events', 'event', 'conference', 'conferences', 'trade show',
    'trade shows', 'exhibition', 'exhibitions', 'calendar', 'calendars',
    'εκδηλωσεις', 'εκδηλωση', 'συνεδριο', 'συνεδρια', 'eventos', 'evento',
    'événements', 'événement', 'veranstaltungen', 'veranstaltung',
    'eventi', 'イベント', '活动', 'فعاليات', 'فعالية']),
  ('grant-funding-watch', array[
    'grant', 'grants', 'funding', 'subsidy', 'subsidies', 'finance',
    'programme', 'programmes', 'scheme', 'schemes', 'επιδοτηση',
    'επιδοτησεις', 'χρηματοδοτηση', 'χρηματοδοτησεις', 'subvención',
    'subvenciones', 'subvention', 'subventions', 'förderung',
    'förderungen', 'sovvenzione', 'sovvenzioni', '助成金', '补贴', 'منحة',
    'منح']),
  ('job-market-watch', array[
    'jobs', 'job', 'hiring', 'recruitment', 'salary', 'salaries', 'roles',
    'role', 'careers', 'career', 'εργασια', 'εργασιες', 'προσληψεις',
    'προσληψη', 'μισθος', 'μισθοι', 'empleo', 'empleos', 'emploi',
    'emplois', 'stellen', 'stelle', 'lavoro', 'lavori', '求人', '招聘',
    'وظائف', 'وظيفة']),
  ('market-landscape', array[
    'market', 'markets', 'landscape', 'landscapes', 'industry',
    'industries', 'sector', 'sectors', 'overview', 'overviews',
    'research', 'monthly', 'αγορα', 'αγορες', 'κλαδος', 'κλαδοι',
    'ερευνα', 'ερευνες', 'mercado', 'mercados', 'marché', 'marchés',
    'markt', 'märkte', 'mercato', 'mercati', '市場', '市场', 'سوق', 'أسواق'])
) as v(slug, keywords)
 where t.slug = v.slug
   and t.shared_by is null
   and t.keywords is distinct from v.keywords;

-- The other six. TWO STATEMENTS, NOT ONE: a single VALUES list of all
-- twelve is one indivisible ~7KB statement, which cannot be pasted into a
-- SQL editor in pieces. Split at a point that changes nothing semantically.
update public.agent_templates t
   set keywords = v.keywords
  from (values
  ('price-check', array[
    'price', 'prices', 'cost', 'costs', 'rate', 'rates', 'quote',
    'quotes', 'value', 'values', 'exchange', 'exchanges', 'τιμη', 'τιμες',
    'κοστος', 'κοστη', 'ισοτιμια', 'ισοτιμιες', 'precio', 'precios',
    'prix', 'preis', 'preise', 'prezzo', 'prezzi', 'preço', 'preços',
    '価格', '价格', 'سعر', 'أسعار']),
  ('regulation-monitor', array[
    'regulation', 'regulations', 'law', 'laws', 'compliance', 'legal',
    'rules', 'rule', 'policy', 'policies', 'νομοθεσια', 'νομοθεσιες',
    'κανονισμος', 'κανονισμοι', 'συμμορφωση', 'συμμορφωσεις',
    'regulación', 'regulaciones', 'réglementation', 'réglementations',
    'vorschrift', 'vorschriften', 'normativa', 'normative', '規制', '法规',
    'لوائح', 'لائحة']),
  ('release-notes-digest', array[
    'release', 'releases', 'changelog', 'changelogs', 'version',
    'versions', 'update', 'updates', 'software', 'tool', 'tools',
    'εκδοση', 'εκδοσεις', 'ενημερωση', 'ενημερωσεις', 'versión',
    'versiones', 'fassung', 'fassungen', 'versione', 'versioni', 'リリース',
    '版本', 'إصدار', 'إصدارات']),
  ('reputation-check', array[
    'reputation', 'reviews', 'review', 'mentions', 'mention', 'sentiment',
    'brand', 'brands', 'feedback', 'φημη', 'φημες', 'κριτικες', 'κριτικη',
    'reputación', 'reputaciones', 'réputation', 'réputations', 'ruf',
    'rufe', 'reputazione', 'reputazioni', '評判', '声誉', 'سمعة']),
  ('supplier-check', array[
    'supplier', 'suppliers', 'vendor', 'vendors', 'partner', 'partners',
    'risk', 'risks', 'due diligence', 'προμηθευτης', 'προμηθευτες',
    'ρισκο', 'ρισκα', 'proveedor', 'proveedores', 'fournisseur',
    'fournisseurs', 'lieferant', 'lieferanten', 'fornitore', 'fornitori',
    '仕入先', '供应商', 'مورد', 'موردون']),
  ('weekly-summary', array[
    'explain', 'summary', 'summaries', 'learn', 'understand', 'primer',
    'primers', 'briefing', 'briefings', 'εξηγηση', 'εξηγησεις',
    'περιληψη', 'περιληψεις', 'explicar', 'expliquer', 'erklären',
    'spiegare', '説明', '解释', 'شرح', 'شروح'])
) as v(slug, keywords)
 where t.slug = v.slug
   and t.shared_by is null
   and t.keywords is distinct from v.keywords;

-- Say what happened, loudly enough to notice it did not.
do $$
declare
  n_wrong int;
begin
  select count(*)
    into n_wrong
    from public.agent_templates t
   where t.shared_by is null
     and t.slug in (
       'competitor-watch','daily-news-watch','event-watch','grant-funding-watch',
       'job-market-watch','market-landscape','price-check','regulation-monitor',
       'release-notes-digest','reputation-check','supplier-check','weekly-summary')
     -- The Greek plural is the case the bug was reported as. If it is not
     -- in the array, the update did not land on that row.
     and not (t.keywords && array['ανταγωνιστες','ειδησεις','εκδηλωσεις',
                                  'επιδοτησεις','εργασιες','αγορες','τιμες',
                                  'νομοθεσιες','εκδοσεις','κριτικες',
                                  'προμηθευτες','περιληψεις']);

  if n_wrong > 0 then
    raise exception
      'template keywords not updated on % built-in template(s)', n_wrong;
  end if;

  raise notice 'template keywords carry both numbers on all 12 built-ins';
end $$;

notify pgrst, 'reload schema';
