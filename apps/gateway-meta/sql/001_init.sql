create table if not exists public.meta_publication_map (
  platform text not null,
  media_id text not null,
  vehicle_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (platform, media_id)
);

create index if not exists meta_publication_map_vehicle_id_idx
  on public.meta_publication_map(vehicle_id);
