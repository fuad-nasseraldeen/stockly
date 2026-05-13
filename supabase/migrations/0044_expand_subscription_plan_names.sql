-- Expand plan_name constraint to support Stripe-based plans and trial naming.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_subscriptions_plan_name_check'
      AND conrelid = 'public.tenant_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.tenant_subscriptions
      DROP CONSTRAINT tenant_subscriptions_plan_name_check;
  END IF;

  ALTER TABLE public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_plan_name_check
    CHECK (
      plan_name IN (
        'trial_free',
        'monthly_199',
        'annual_49',
        'basic',
        'pro',
        'business',
        'enterprise'
      )
    );
END $$;
