-- Run after server/schema.sql when the extension talks to Supabase directly.
-- It lets the anon key insert rows but not read, change or delete them.

alter table links enable row level security;

create policy "extension can insert links"
  on links
  for insert
  to anon
  with check (true);
