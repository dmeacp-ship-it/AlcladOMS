-- migrate-012: free-plan usage numbers for the admin usage panel. Run in Supabase -> SQL Editor.
create or replace function app_usage() returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
    'mau', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')
  )
$$;
revoke all on function app_usage() from public, anon, authenticated;
