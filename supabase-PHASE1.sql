-- =====================================================================
-- PHASE 1 — Categories, Multiple Product Images
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------
create table if not exists categories (
  id          text primary key,
  name        text not null,
  image       text,
  parent_id   text references categories(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Link products to a real category row (keeps the old free-text
-- `category` column too, for anything not yet migrated).
alter table products add column if not exists category_id text references categories(id) on delete set null;

alter table categories enable row level security;
drop policy if exists "Public can view categories" on categories;
create policy "Public can view categories" on categories for select using (true);
drop policy if exists "Only admin can manage categories" on categories;
create policy "Only admin can manage categories" on categories for all
  to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- MULTIPLE PRODUCT IMAGES (products.image stays as the "main"/cover image)
-- ---------------------------------------------------------------------
create table if not exists product_images (
  id          bigint generated always as identity primary key,
  product_id  text not null references products(id) on delete cascade,
  url         text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_product_images_product_id on product_images(product_id);

alter table product_images enable row level security;
drop policy if exists "Public can view product_images" on product_images;
create policy "Public can view product_images" on product_images for select using (true);
drop policy if exists "Only admin can manage product_images" on product_images;
create policy "Only admin can manage product_images" on product_images for all
  to authenticated using (is_admin()) with check (is_admin());

-- Storage policies for category images (reuse the product-images bucket, folder "categories/")
-- No extra bucket needed — same public 'product-images' bucket, just a different sub-folder.
