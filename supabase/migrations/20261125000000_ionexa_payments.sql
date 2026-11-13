-- Ionexa Payments: users connect their business and accept payments from
-- THEIR customers, through Stripe Connect Express accounts. The money
-- flows: customer → Stripe → user's connected account → user's bank.
--
-- This is the SAME Stripe Connect Express infrastructure the affiliate
-- programme already uses (lib/affiliate/connect.ts), generalised to every
-- user. Express means Stripe hosts the onboarding and owns KYC.
--
-- DENY-ALL to the browser. Every table here is written by the server under
-- the service role, because a client insert into payments_products could
-- create a checkout that charges a stranger, and a client update to
-- payments_accounts could fake a payouts_enabled flag. Read and written
-- only through createAdminClient() in lib/payments/*.ts and api/payments/.
--
-- How to undo: DROP TABLE payments_payouts, payments_transactions,
--   payments_products, payments_accounts CASCADE;

-- The user's connected Stripe Express account.
CREATE TABLE IF NOT EXISTS public.payments_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL,
  business_name text,
  payouts_enabled boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  country text,
  default_currency text DEFAULT 'eur',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (stripe_account_id)
);

ALTER TABLE public.payments_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments_accounts FROM anon, authenticated;

-- Products/services the user sells through Ionexa Payments.
CREATE TABLE IF NOT EXISTS public.payments_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.payments_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents > 0 AND price_cents <= 99999900),
  currency text NOT NULL DEFAULT 'eur',
  stripe_price_id text,
  stripe_product_id text,
  is_active boolean NOT NULL DEFAULT true,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_interval text CHECK (recurring_interval IS NULL OR recurring_interval IN ('month', 'year')),
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments_products FROM anon, authenticated;

CREATE INDEX idx_payments_products_user ON public.payments_products (user_id) WHERE is_active;

-- Transactions: payments from the user's customers.
CREATE TABLE IF NOT EXISTS public.payments_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.payments_accounts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.payments_products(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  fee_cents integer NOT NULL DEFAULT 0,
  net_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
  customer_email text,
  customer_name text,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments_transactions FROM anon, authenticated;

CREATE INDEX idx_payments_transactions_user ON public.payments_transactions (user_id, created_at DESC);
CREATE INDEX idx_payments_transactions_stripe ON public.payments_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Payout history: when money moved to the user's bank.
CREATE TABLE IF NOT EXISTS public.payments_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.payments_accounts(id) ON DELETE CASCADE,
  stripe_payout_id text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'eur',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  arrival_date timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments_payouts FROM anon, authenticated;

CREATE INDEX idx_payments_payouts_user ON public.payments_payouts (user_id, created_at DESC);
