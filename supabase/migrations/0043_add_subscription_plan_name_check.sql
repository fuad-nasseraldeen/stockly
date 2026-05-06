-- Restrict tenant subscription plan names to a controlled list.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_subscriptions_plan_name_check'
      AND conrelid = 'public.tenant_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.tenant_subscriptions
      ADD CONSTRAINT tenant_subscriptions_plan_name_check
      CHECK (plan_name IN ('basic', 'pro', 'business', 'enterprise'));
  END IF;
END $$;
