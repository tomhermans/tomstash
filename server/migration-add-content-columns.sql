alter table links
  add column content_md text,
  add column content_fetched_at timestamptz,
  add column lang text;
