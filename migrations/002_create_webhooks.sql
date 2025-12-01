create table if not exists public.webhooks (
  id uuid default gen_random_uuid() primary key,
  provider text not null,
  provider_event text,
  provider_event_id text,
  provider_payload jsonb,
  created_at timestamptz default now()
);

create unique index if not exists webhooks_provider_event_id_uindex on public.webhooks (provider, provider_event_id);
