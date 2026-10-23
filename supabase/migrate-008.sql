-- migrate-008: admin features. Run in Supabase -> SQL Editor (after migrate-007.sql).
-- Company settings, number formats, approval rules, activity log, customer extras, user controls.

-- 1. App settings: one row of JSON (company details, terms, VAT %, number formats, approval rules)
--    plus the uploaded letterhead image. Missing keys fall back to the defaults in lib/settings.js.
create table if not exists app_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}',
  letterhead text,                       -- data: URL of the uploaded image; null = public/letterhead.png
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into app_settings (id) values (1) on conflict (id) do nothing;
alter table app_settings enable row level security;

create or replace function app_setting(k text) returns text language sql stable as $$
  select nullif(data->>k, '') from app_settings where id = 1
$$;

-- 2. VAT rate is kept per order, so changing it in Settings never changes an existing quote.
alter table orders add column if not exists vat_rate numeric not null default 0.15;

-- 3. Number formats. Quote: <prefix>-<year>-<number>; DO / PI: <prefix>-<customer code>-<DDMMYY>-<NN>.
create or replace function next_quote_no() returns text language plpgsql as $$
declare
  v_pre text := coalesce(app_setting('quote_prefix'), 'Q') || '-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-';
  v_dig int  := coalesce(app_setting('quote_digits')::int, 3);
  v_min int  := coalesce(app_setting('quote_start')::int, 1);
  v_n   int;
begin
  perform pg_advisory_xact_lock(hashtext('quote_no'));
  select coalesce(max(substring(quote_no from length(v_pre) + 1)::int), 0) + 1 into v_n
    from orders
   where left(quote_no, length(v_pre)) = v_pre and substring(quote_no from length(v_pre) + 1) ~ '^[0-9]+$';
  return v_pre || lpad(greatest(v_n, v_min)::text, v_dig, '0');
end $$;

create or replace function assign_batch_no(p_batch bigint, p_kind text) returns text language plpgsql as $$
declare
  v_no     text;
  v_code   text;
  v_prefix text;
  v_seq    int;
begin
  perform pg_advisory_xact_lock(hashtext('batch_no'));
  if p_kind = 'DO' then
    select do_no into v_no from order_batches where id = p_batch;
  elsif p_kind = 'PI' then
    select pi_no into v_no from order_batches where id = p_batch;
  else
    raise exception 'p_kind must be DO or PI';
  end if;
  if v_no is not null then return v_no; end if;

  select coalesce(o.customer_code, 'CUS') into v_code
    from orders o join order_batches b on b.order_id = o.id
   where b.id = p_batch;
  v_prefix := coalesce(app_setting(lower(p_kind) || '_prefix'), p_kind) || '-' || v_code || '-'
           || to_char(now() at time zone 'Asia/Riyadh', 'DDMMYY') || '-';

  if p_kind = 'DO' then
    select coalesce(max(substring(do_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
      from order_batches where left(do_no, length(v_prefix)) = v_prefix;
    v_no := v_prefix || lpad(v_seq::text, 2, '0');
    update order_batches set do_no = v_no where id = p_batch;
  else
    select coalesce(max(substring(pi_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
      from order_batches where left(pi_no, length(v_prefix)) = v_prefix;
    v_no := v_prefix || lpad(v_seq::text, 2, '0');
    update order_batches set pi_no = v_no where id = p_batch;
  end if;
  return v_no;
end $$;

-- 4. Activity log: keep entries when an order is deleted, and allow entries that aren't about an order.
alter table order_events alter column order_id drop not null;
alter table order_events drop constraint if exists order_events_order_id_fkey;
alter table order_events add constraint order_events_order_id_fkey
  foreign key (order_id) references orders on delete set null;
create index if not exists order_events_at_idx on order_events (at desc);

-- 5. Customer extras: assigned salesperson and credit limit (SAR, incl. VAT).
alter table customers
  add column if not exists salesperson_id uuid references profiles on delete set null,
  add column if not exists credit_limit numeric check (credit_limit >= 0);

-- 6. User controls: last sign-in time, and signing a user out of every device.
create or replace function user_last_sign_in() returns table (id uuid, last_sign_in_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select u.id, u.last_sign_in_at from auth.users u
$$;
create or replace function sign_out_user(p_user uuid) returns void
  language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user
$$;

revoke execute on function app_setting(text)               from public, anon, authenticated;
revoke execute on function next_quote_no()                 from public, anon, authenticated;
revoke execute on function assign_batch_no(bigint, text)   from public, anon, authenticated;
revoke execute on function user_last_sign_in()             from public, anon, authenticated;
revoke execute on function sign_out_user(uuid)             from public, anon, authenticated;
