-- =====================================================================
-- SECURITY FIX — admin authorization was too loose (`to authenticated
-- using (true)` meant ANY logged-in Supabase Auth user, not just your
-- admin email(s), could edit products/orders/stock via the API — the
-- ADMIN_EMAILS check in admin-guard.js is a UI convenience only, it is
-- NOT a security boundary because someone could call Supabase directly
-- with their own session, skipping your admin panel entirely).
-- This patch replaces "any authenticated user" with "only emails in
-- the admin_users table", enforced at the database level.
-- =====================================================================

-- Private table of admin emails — RLS enabled with NO policies, so it
-- is unreadable/unwritable via the API by anyone (including admins) —
-- only editable by you via the Supabase SQL Editor (which uses the
-- postgres superuser role, not subject to RLS).
create table if not exists admin_users (
  email text primary key
);
alter table admin_users enable row level security;

-- >>> EDIT THIS: put your real admin email(s) here, then run this file <<<
insert into admin_users (email) values ('owner@example.com')
on conflict (email) do nothing;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users where email = auth.jwt() ->> 'email'
  );
$$;
grant execute on function is_admin() to authenticated;

-- ---- Replace the old "any authenticated user" policies ----
drop policy if exists "Authenticated admin can manage products" on products;
create policy "Only admin can manage products"
  on products for all
  to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "Authenticated admin can read product_costs" on product_costs;
create policy "Only admin can read product_costs"
  on product_costs for select
  to authenticated
  using (is_admin());

drop policy if exists "Authenticated admin can update orders" on orders;
create policy "Only admin can update orders"
  on orders for update
  to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "Authenticated admin can read stock_movements" on stock_movements;
create policy "Only admin can read stock_movements"
  on stock_movements for select
  to authenticated
  using (is_admin());

-- ---- Add the same real check INSIDE the purchase/adjustment
-- functions too (defense in depth — even though only 'authenticated'
-- can call them, that role alone is no longer good enough). ----
create or replace function record_purchase(
  p_product_id text, p_qty int, p_rate numeric,
  p_supplier text default '', p_supplier_gstin text default '',
  p_invoice_number text default '', p_purchase_date date default null,
  p_note text default '', p_bill_url text default '', p_bill_file_name text default ''
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
  v_old_stock int;
  v_old_cost numeric;
  v_new_stock int;
  v_new_cost numeric;
begin
  if not is_admin() then raise exception 'Not authorized'; end if;

  select name, stock into v_name, v_old_stock from products where id = p_product_id for update;
  if v_name is null then raise exception 'Product % not found', p_product_id; end if;

  select cost_price into v_old_cost from product_costs where product_id = p_product_id;
  v_old_cost := coalesce(v_old_cost, 0);
  v_new_stock := v_old_stock + p_qty;
  v_new_cost := case when v_new_stock > 0
    then round(((v_old_stock * v_old_cost) + (p_qty * p_rate)) / v_new_stock, 2)
    else p_rate end;

  update products set stock = v_new_stock, updated_at = now() where id = p_product_id;
  insert into product_costs (product_id, cost_price, updated_at)
    values (p_product_id, v_new_cost, now())
    on conflict (product_id) do update set cost_price = v_new_cost, updated_at = now();

  insert into stock_movements (
    product_id, product_name, type, qty, rate, supplier, supplier_gstin,
    invoice_number, purchase_date, note, bill_url, bill_file_name
  ) values (
    p_product_id, v_name, 'purchase', p_qty, p_rate, p_supplier, p_supplier_gstin,
    p_invoice_number, p_purchase_date, p_note, p_bill_url, p_bill_file_name
  );
end;
$$;

create or replace function record_adjustment(
  p_product_id text, p_delta int, p_note text default ''
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
  v_old_stock int;
  v_new_stock int;
begin
  if not is_admin() then raise exception 'Not authorized'; end if;

  select name, stock into v_name, v_old_stock from products where id = p_product_id for update;
  if v_name is null then raise exception 'Product % not found', p_product_id; end if;

  v_new_stock := greatest(0, v_old_stock + p_delta);
  update products set stock = v_new_stock, updated_at = now() where id = p_product_id;

  insert into stock_movements (product_id, product_name, type, qty, rate, note)
    values (p_product_id, v_name, 'adjustment', p_delta, 0, p_note);
end;
$$;

-- =====================================================================
-- Storage policies — public buckets only make READ public by default.
-- Without explicit policies below, uploads from the admin panel would
-- fail (good — nobody could write); these policies turn uploads back
-- on, but ONLY for the admin (is_admin()), never anonymous visitors.
-- Run this AFTER creating the 'product-images' and 'purchase-bills'
-- buckets in Supabase Dashboard → Storage (mark both "Public").
-- =====================================================================
create policy "Public can view product-images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "Only admin can upload product-images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and is_admin());

create policy "Public can view purchase-bills"
  on storage.objects for select
  using (bucket_id = 'purchase-bills');

create policy "Only admin can upload purchase-bills"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'purchase-bills' and is_admin());
