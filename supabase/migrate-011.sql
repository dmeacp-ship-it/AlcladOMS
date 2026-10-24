-- migrate-011: 'manager' role (every workflow step, no admin-only rights). Run in Supabase -> SQL Editor.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'manager', 'sales', 'approver', 'operations', 'accounts', 'plant'));
