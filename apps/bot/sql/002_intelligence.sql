-- Intelligence configuration for the bot (settings, FAQ, playbooks, examples, decisions)

create table if not exists bot_intelligence_settings (
  id int primary key default 1,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into bot_intelligence_settings (id, value)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists bot_faq (
  id bigserial primary key,
  title text,
  triggers text[] not null default '{}'::text[],
  answer text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bot_playbooks (
  id bigserial primary key,
  intent text not null,
  triggers text[] not null default '{}'::text[],
  template text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bot_examples (
  id bigserial primary key,
  intent text not null,
  user_text text not null,
  ideal_answer text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists bot_decisions (
  id bigserial primary key,
  instance text not null,
  remote_jid text not null,
  intent text,
  confidence numeric,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_decisions_created_at on bot_decisions(created_at desc);
create index if not exists idx_bot_faq_enabled on bot_faq(enabled);
create index if not exists idx_bot_playbooks_enabled on bot_playbooks(enabled);
