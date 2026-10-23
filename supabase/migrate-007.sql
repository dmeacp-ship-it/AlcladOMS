-- migrate-007: optional username, so people can sign in with "hemant" instead of a full email.
-- Run in Supabase -> SQL Editor. Usernames are stored lowercase and must be unique.
alter table profiles add column if not exists username text
  check (username ~ '^[a-z0-9._-]{3,30}$');
create unique index if not exists profiles_username_key on profiles (username);
