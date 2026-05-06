create table if not exists tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  status text not null default 'trial' check (status in ('trial','active','past_due','expired','cancelled')),
  plan_name text not null default 'basic',
  paid_amount numeric(10,2) null,
  currency text not null default 'ILS',
  valid_from date not null,
  valid_until date not null,
  payment_method text null,
  notes text null,
  last_reminder_sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_subscriptions_tenant_id on tenant_subscriptions(tenant_id);
create index if not exists idx_tenant_subscriptions_valid_until on tenant_subscriptions(valid_until);
create index if not exists idx_tenant_subscriptions_status on tenant_subscriptions(status);

create or replace function set_tenant_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tenant_subscriptions_updated_at on tenant_subscriptions;
create trigger trg_tenant_subscriptions_updated_at
before update on tenant_subscriptions
for each row
execute function set_tenant_subscriptions_updated_at();

-- Backfill: ensure every existing tenant has a subscription row.
insert into tenant_subscriptions (
  tenant_id,
  status,
  plan_name,
  currency,
  valid_from,
  valid_until
)
select
  t.id,
  'trial',
  'basic',
  'ILS',
  current_date,
  (current_date + interval '1 month')::date
from tenants t
left join tenant_subscriptions ts on ts.tenant_id = t.id
where ts.tenant_id is null;
