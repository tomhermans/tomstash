-- Reference table for the example server in this folder (Postgres / Supabase).
-- Adjust to taste. The extension only needs the server to accept the POST body
-- described in the README; it does not talk to the database directly.

create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null,
  description text,
  tags jsonb not null default '[]',
  category text,
  favicon_url text,
  image_url text,
  author text,
  reading_time integer,
  lang text,
  content_md text,
  content_fetched_at timestamptz,
  is_read boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists links_created_at_idx on links (created_at desc);
create index if not exists links_tags_idx on links using gin (tags);
