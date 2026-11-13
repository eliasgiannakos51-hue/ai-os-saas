-- Ionexa Payments: invoice settings column on payments_accounts.
-- Stores the seller's invoice preferences (auto-send, footer text, etc.).
--
-- How to undo: alter table public.payments_accounts drop column if exists invoice_settings;

alter table public.payments_accounts
  add column if not exists invoice_settings jsonb default '{"autoSendInvoice": true, "includeBusinessDetails": true, "defaultPaymentTermDays": 30, "footerText": null}';
