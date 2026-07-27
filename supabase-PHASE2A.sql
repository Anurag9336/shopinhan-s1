-- =====================================================================
-- PHASE 2A — Brands, Suppliers, Site Settings, extra product fields,
-- more order statuses. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BRANDS
-- ---------------------------------------------------------------------
create table if not exists brands (
  id          text primary key,
  name        text not null,
  logo        text,
  description text default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table products add column if not exists brand_id text references brands(id) on delete set null;

alter table brands enable row level security;
drop policy if exists "Public can view active brands" on brands;
create policy "Public can view active brands" on brands for select using (true);
drop policy if exists "Only admin can manage brands" on brands;
create policy "Only admin can manage brands" on brands for all
  to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- SUPPLIERS (master list — purchases now reference a supplier_id)
-- ---------------------------------------------------------------------
create table if not exists suppliers (
  id            text primary key,
  name          text not null,
  gstin         text default '',
  phone         text default '',
  email         text default '',
  address       text default '',
  created_at    timestamptz not null default now()
);
-- Note: purchase entries still store supplier name/GSTIN as plain text in
-- stock_movements (unchanged) — this table is a lookup list the purchase
-- form pulls from, so you type a supplier's details once, not every time.

alter table suppliers enable row level security;
drop policy if exists "Only admin can view suppliers" on suppliers;
create policy "Only admin can view suppliers" on suppliers for select
  to authenticated using (is_admin());
drop policy if exists "Only admin can manage suppliers" on suppliers;
create policy "Only admin can manage suppliers" on suppliers for all
  to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- SITE SETTINGS (single row, key-value-ish) — lets admin edit store
-- name/contact/bank/GST from the admin panel instead of editing code.
-- ---------------------------------------------------------------------
create table if not exists site_settings (
  id            int primary key default 1,
  store_name    text default 'ShopInHand',
  tagline       text default '',
  phone         text default '',
  whatsapp      text default '',
  email         text default '',
  address       text default '',
  gstin         text default '',
  seller_state  text default '',
  bank_account_name text default '',
  bank_account_no   text default '',
  bank_ifsc         text default '',
  bank_name         text default '',
  free_delivery_above numeric(10,2) default 499,
  delivery_fee        numeric(10,2) default 39,
  updated_at    timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into site_settings (id) values (1) on conflict (id) do nothing;

alter table site_settings enable row level security;
drop policy if exists "Public can view site_settings" on site_settings;
create policy "Public can view site_settings" on site_settings for select using (true);
drop policy if exists "Only admin can update site_settings" on site_settings;
create policy "Only admin can update site_settings" on site_settings for update
  to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- PRODUCT: barcode, discount, featured flag
-- ---------------------------------------------------------------------
alter table products add column if not exists barcode text default '';
alter table products add column if not exists discount_percent numeric(5,2) default 0;
alter table products add column if not exists featured boolean not null default false;

-- ---------------------------------------------------------------------
-- ORDERS: expand allowed statuses (packed, returned, refund_requested)
-- ---------------------------------------------------------------------
alter table orders drop constraint if exists orders_status_check;
-- (status was free-text with no hard constraint before, this just documents
-- the allowed set going forward via the admin dropdown — no DB check added,
-- to avoid breaking any existing order rows with older status values.)

-- ---------------------------------------------------------------------
-- STOCK_MOVEMENTS: allow a 'return' type (stock returned to supplier)
-- ---------------------------------------------------------------------
alter table stock_movements drop constraint if exists stock_movements_type_check;
alter table stock_movements add constraint stock_movements_type_check
  check (type in ('purchase','sale','adjustment','return'));

create or replace function record_return(
  p_product_id text, p_qty int, p_rate numeric, p_note text default ''
) returns void
language plpgsql
security definer set search_path = public
as $$
declare v_name text; v_old_stock int; v_new_stock int;
begin
  if not is_admin() then raise exception 'Not authorized'; end if;
  select name, stock into v_name, v_old_stock from products where id = p_product_id for update;
  if v_name is null then raise exception 'Product % not found', p_product_id; end if;
  if v_old_stock < p_qty then raise exception 'Sirf % stock hai, % return nahi ho sakta', v_old_stock, p_qty; end if;
  v_new_stock := v_old_stock - p_qty;
  update products set stock = v_new_stock, updated_at = now() where id = p_product_id;
  insert into stock_movements (product_id, product_name, type, qty, rate, note)
    values (p_product_id, v_name, 'return', -p_qty, p_rate, p_note);
end;
$$;
revoke execute on function record_return(text, int, numeric, text) from public;
grant execute on function record_return(text, int, numeric, text) to authenticated;
