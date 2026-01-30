-- SQL schema for the panel service
-- Creates tenants, users, conversations, messages, rules, quick replies and audit logs.
-- Uses gen_random_uuid() from pgcrypto for primary keys.

-- Enable the pgcrypto extension to generate UUIDs
create extension if not exists "pgcrypto";

-- Tenants: isolate companies
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Users: associated to a tenant with a specific role
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin','supervisor','agent','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversations: represent a WhatsApp thread per tenant
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  remote_jid text not null,
  status text not null default 'open' check (status in ('open','closed')),
  assigned_user_id uuid references users(id),
  -- optional notes field for CRM. Allows agents to store internal notes per conversation.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages: store messages for conversations. Either text or image with caption.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','agent','bot')),
  text text,
  image_url text,
  created_at timestamptz not null default now()
);

-- Rules: configurable automatic actions triggered by keywords.
create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  trigger_keywords text[] not null,
  -- e.g. HANDOFF_AUTO or other actions
  action text not null,
  created_at timestamptz not null default now()
);

-- Quick replies: canned responses
create table if not exists quick_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- Audit logs: record significant events such as handoffs or rule changes
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);