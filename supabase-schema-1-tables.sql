-- =====================================================================
-- ShopInHand — Supabase (Postgres) schema
-- Migrated from Firestore collections: products, product_costs,
-- orders, stock_movements
-- =====================================================================

-- ---------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------
create table products (
  id          text primary key,            -- keep same string ids as Firestore had
  name        text not null,
  price       numeric(10,2) not null,
  image       text,
  stock       integer not null default 0,
  gst_rate    numeric(5,2) not null default 0,
  hsn_code    text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PRODUCT COSTS (admin-only — weighted avg cost price, used for profit calc)
-- ---------------------------------------------------------------------
create table product_costs (
  product_id  text primary key references products(id) on delete cascade,
  cost_price  numeric(10,2) not null default 0,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------
create table orders (
  id              uuid primary key default gen_random_uuid(),
  customer_name   text not null,
  customer_phone  text not null,
  customer_email  text,
  customer_address text not null,
  customer_city   text not null,
  customer_pincode text not null,
  customer_state  text not null,
  subtotal        numeric(10,2) not null,
  delivery_fee    numeric(10,2) not null default 0,
  amount          numeric(10,2) not null,
  payment_method  text not null check (payment_method in ('COD','ONLINE')),
  payment_id      text default '',
  status          text not null default 'pending',
  gst_breakup     jsonb,                    -- keep GST calc breakup as JSON (line items, CGST/SGST/IGST)
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ORDER ITEMS (normalized out of the Firestore `items` array)
-- ---------------------------------------------------------------------
create table order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  text not null,
  name        text not null,
  price       numeric(10,2) not null,
  qty         integer not null
);

-- ---------------------------------------------------------------------
-- STOCK MOVEMENTS (purchase / sale / adjustment ledger)
-- ---------------------------------------------------------------------
create table stock_movements (
  id                bigint generated always as identity primary key,
  product_id        text not null references products(id) on delete cascade,
  product_name      text not null,
  type              text not null check (type in ('purchase','sale','adjustment')),
  qty               integer not null,       -- negative for sale, positive for purchase
  rate              numeric(10,2),
  cost_price_at_sale numeric(10,2),
  profit            numeric(10,2),
  order_id          uuid references orders(id),
  supplier          text default '',
  supplier_gstin    text default '',
  invoice_number    text default '',
  purchase_date     date,
  note              text default '',
  bill_url          text default '',
  bill_file_name    text default '',
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes for common queries
-- ---------------------------------------------------------------------
create index idx_order_items_order_id on order_items(order_id);
create index idx_stock_movements_product_id on stock_movements(product_id);
create index idx_orders_created_at on orders(created_at desc);
create index idx_stock_movements_created_at on stock_movements(created_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security (RLS) — mirrors your firestore.rules intent:
-- products are publicly readable, everything else is admin/server-only.
-- ---------------------------------------------------------------------
alter table products enable row level security;
alter table product_costs enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table stock_movements enable row level security;

-- Public (anon key) can READ products only
create policy "Public can view products"
  on products for select
  using (true);

-- No public policies on product_costs, orders, order_items, stock_movements
-- means the anon key cannot read/write them at all — only your Vercel
-- API functions (using the service_role key, which bypasses RLS) can.
