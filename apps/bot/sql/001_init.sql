-- Minimal schema for dedupe + conversations

create table if not exists bot_messages_dedupe (
  id text primary key,
  instance text not null,
  remote_jid text not null,
  direction text not null,
  received_at timestamptz not null default now()
);

create table if not exists bot_conversations (
  instance text not null,
  remote_jid text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (instance, remote_jid)
);

create index if not exists idx_bot_conversations_updated_at on bot_conversations(updated_at desc);
create index if not exists idx_bot_conversations_instance_updated_at on bot_conversations(instance, updated_at desc);

create index if not exists idx_bot_messages_dedupe_received_at on bot_messages_dedupe(received_at);

-- Contact rules table: define per-number bot behaviour
create table if not exists bot_contact_rules (
  number text primary key,
  bot_mode text not null default 'ON',
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bot_contact_rules_updated_at on bot_contact_rules(updated_at);

-- Conversation-level rules: allow overriding bot behaviour per conversation (instance + remote_jid)
create table if not exists bot_conversation_rules (
  instance text not null,
  remote_jid text not null,
  bot_mode text not null default 'ON',
  notes text,
  updated_at timestamptz not null default now(),
  primary key (instance, remote_jid)
);

create index if not exists idx_bot_conversation_rules_updated_at on bot_conversation_rules(updated_at);

-- Tags assigned to conversations for segmentation/filters
create table if not exists bot_conversation_tags (
  instance text not null,
  remote_jid text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (instance, remote_jid, tag)
);

-- Notes attached to conversations
create table if not exists bot_conversation_notes (
  instance text not null,
  remote_jid text not null,
  note text not null,
  created_at timestamptz not null default now(),
  primary key (instance, remote_jid, created_at)
);

-- Predefined quick replies for operators
create table if not exists bot_quick_replies (
  id serial primary key,
  slug text not null unique,
  content text not null,
  created_at timestamptz not null default now()
);
