-- WHAT THE CODE DID TO A GENERATED SITE AFTER THE MODEL WROTE IT.
--
-- V4.6. Three enforcements now run on every generated page, in code,
-- after generation — because asking the model is not the same as making
-- it true:
--
--   - a feature the brief forbade ("no online booking") is removed
--     (lib/website-negative-instructions.ts);
--   - a site that started a page beyond MAX_PAGES_PER_SITE is stopped at
--     that page, so the pages beyond the cap are neither served nor paid
--     for (pageCapReached, in the same file);
--   - a Google Maps embed is set to a zoom that shows the building
--     (lib/website-map-embeds.ts).
--
-- Each of those is something the owner should be TOLD: "Removed the
-- online booking, as you asked" is the difference between a fix and a
-- mystery. The workspace polls the row, so the notes ride on the row.
--
-- jsonb, an array of { kind, ...facts } written by the worker and rendered
-- by the workspace through its own translations — never a sentence in one
-- language stored for a reader in another. Null for every site generated
-- before this existed, and for every site where nothing was done.
--
-- Idempotent.

alter table public.user_websites
  add column if not exists generation_notes jsonb;
comment on column public.user_websites.generation_notes is
  'What post-generation enforcement did to this site: [{kind:"removedFeature",feature,count},{kind:"pageCap",cap,started},{kind:"mapZoom",count}]. Written by api/websites/generate/process, rendered by the workspace.';
