-- =====================================================================
-- Atomic order placement — equivalent to the Firestore runTransaction()
-- block that used to be in functions/index.js / api/place-order.js.
-- The API layer (Node) computes real prices/GST from current DB data,
-- then calls this function ONCE with everything pre-computed. Because
-- Postgres functions run inside a single transaction, if ANY step
-- fails (e.g. not enough stock) the whole order is rolled back —
-- nothing partially written, same guarantee Firestore gave you.
-- =====================================================================
create or replace function place_order_atomic(payload jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid;
  item jsonb;
  v_id text;
  v_qty int;
  updated_rows int;
begin
  insert into orders (
    customer_name, customer_phone, customer_email, customer_address,
    customer_city, customer_pincode, customer_state,
    subtotal, delivery_fee, amount, payment_method, payment_id, status, gst_breakup
  ) values (
    payload->'customer'->>'name',
    payload->'customer'->>'phone',
    payload->'customer'->>'email',
    payload->'customer'->>'address',
    payload->'customer'->>'city',
    payload->'customer'->>'pincode',
    payload->'customer'->>'state',
    (payload->>'subtotal')::numeric,
    (payload->>'deliveryFee')::numeric,
    (payload->>'amount')::numeric,
    payload->>'paymentMethod',
    coalesce(payload->>'paymentId', ''),
    payload->>'status',
    payload->'gstBreakup'
  ) returning id into v_order_id;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    v_id := item->>'id';
    v_qty := (item->>'qty')::int;

    -- Conditional update: only succeeds if enough stock exists. Postgres
    -- locks this row during the update, so two simultaneous orders for
    -- the last unit can never both succeed (same protection Firestore's
    -- transaction gave you).
    update products set stock = stock - v_qty, updated_at = now()
      where id = v_id and stock >= v_qty;
    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then
      raise exception 'Insufficient stock for product %', v_id;
    end if;

    insert into order_items (order_id, product_id, name, price, qty)
      values (v_order_id, v_id, item->>'name', (item->>'price')::numeric, v_qty);

    insert into stock_movements (
      product_id, product_name, type, qty, rate, cost_price_at_sale, profit, order_id, note
    ) values (
      v_id, item->>'name', 'sale', -v_qty, (item->>'price')::numeric,
      (item->>'costPriceAtSale')::numeric,
      round(((item->>'price')::numeric - (item->>'costPriceAtSale')::numeric) * v_qty, 2),
      v_order_id, 'Sold via order #' || left(v_order_id::text, 8)
    );
  end loop;

  return v_order_id;
end;
$$;

-- =====================================================================
-- record_purchase — stock bought in from a supplier. Updates
-- products.stock and recalculates a weighted-average cost price in
-- product_costs, then logs the movement. Runs atomically.
-- =====================================================================
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

-- =====================================================================
-- record_adjustment — manual stock correction (damage/loss/miscount).
-- =====================================================================
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
  select name, stock into v_name, v_old_stock from products where id = p_product_id for update;
  if v_name is null then raise exception 'Product % not found', p_product_id; end if;

  v_new_stock := greatest(0, v_old_stock + p_delta);
  update products set stock = v_new_stock, updated_at = now() where id = p_product_id;

  insert into stock_movements (product_id, product_name, type, qty, rate, note)
    values (p_product_id, v_name, 'adjustment', p_delta, 0, p_note);
end;
$$;

-- =====================================================================
-- Permissions — who can call what.
-- place_order_atomic: only the API server (service_role key) should
-- ever call this, never the browser directly.
-- record_purchase / record_adjustment: only a LOGGED-IN admin
-- (Supabase Auth session -> "authenticated" role) should call these —
-- this is what makes them safe to call from the admin panel's anon-key
-- client once the admin has signed in.
-- =====================================================================
revoke execute on function place_order_atomic(jsonb) from public;
grant execute on function place_order_atomic(jsonb) to service_role;

revoke execute on function record_purchase(text, int, numeric, text, text, text, date, text, text, text) from public;
grant execute on function record_purchase(text, int, numeric, text, text, text, date, text, text, text) to authenticated;

revoke execute on function record_adjustment(text, int, text) from public;
grant execute on function record_adjustment(text, int, text) to authenticated;

-- Admin also needs to read/write product_costs, orders, order_items,
-- stock_movements, and update/insert/delete products — but ONLY when
-- logged in (authenticated role), never anonymously.
create policy "Authenticated admin can manage products"
  on products for all
  to authenticated
  using (true) with check (true);

create policy "Authenticated admin can read product_costs"
  on product_costs for select
  to authenticated
  using (true);

-- Orders are publicly readable by design (same as the original
-- firestore.rules "allow read: if true") — guest customers aren't
-- logged in, so "My Orders" and the tax invoice page look orders up
-- by phone number / the order's own (practically unguessable) ID,
-- not by an authenticated account. Only an admin can change status.
create policy "Anyone can view orders"
  on orders for select
  using (true);

create policy "Authenticated admin can update orders"
  on orders for update
  to authenticated
  using (true) with check (true);

create policy "Anyone can view order_items"
  on order_items for select
  using (true);

create policy "Authenticated admin can read stock_movements"
  on stock_movements for select
  to authenticated
  using (true);

-- min_stock: low-stock threshold per product, used by the admin
-- dashboard's "low stock" widget (defaults to 5, same as before).
alter table products add column if not exists min_stock integer not null default 5;

-- Extra product fields used by the admin "Add/Edit Product" form
-- (missed in the first pass of the schema).
alter table products add column if not exists sku text default '';
alter table products add column if not exists mrp numeric(10,2);
alter table products add column if not exists description text default '';
