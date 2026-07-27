-- =====================================================================
-- SECURITY FIX — orders/order_items were readable via a blanket
-- `select * from orders` using the public anon key (anyone could dump
-- EVERY customer's name/phone/address, not just look up one order).
-- Fix: only admin can do a full table select now. Guests can still
-- look up ONE order (by its own unguessable ID, for the invoice /
-- order-success page) or their own orders (by phone, for "My Orders")
-- — but only through these two narrow functions, never a full scan.
-- =====================================================================

drop policy if exists "Anyone can view orders" on orders;
create policy "Only admin can select orders" on orders for select
  to authenticated using (is_admin());

drop policy if exists "Anyone can view order_items" on order_items;
create policy "Only admin can select order_items" on order_items for select
  to authenticated using (is_admin());

create or replace function get_order_by_id(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(o) || jsonb_build_object(
    'order_items', coalesce((select jsonb_agg(to_jsonb(oi)) from order_items oi where oi.order_id = o.id), '[]'::jsonb)
  )
  from orders o where o.id = p_id;
$$;
grant execute on function get_order_by_id(uuid) to anon, authenticated;

create or replace function get_orders_by_phone(p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    to_jsonb(o) || jsonb_build_object(
      'order_items', coalesce((select jsonb_agg(to_jsonb(oi)) from order_items oi where oi.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc
  ), '[]'::jsonb)
  from orders o where o.customer_phone = p_phone;
$$;
grant execute on function get_orders_by_phone(text) to anon, authenticated;
