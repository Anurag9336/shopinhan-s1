// =====================================================================
// ShopInHand — core store engine (shared by every customer-facing page)
// Vanilla JS + Supabase JS client (loaded from CDN, no build step).
// =====================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORE_SETTINGS } from './supabase-config.js';
import { trackEvent } from './seo.js';
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// SECURITY: escape any user-controlled string before inserting it into
// innerHTML. Customer checkout fields (name, address, city, state) are
// NOT trusted input — without this, a customer could submit
// `<img src=x onerror=...>` as their name and run JavaScript in the
// browser of anyone who later views that order (customer service,
// admin panel, invoice page) — a stored XSS attack. Use this on every
// piece of dynamic data rendered via innerHTML/template literals.
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------- Field-name mapping (Postgres snake_case → app camelCase) ---
// Keeps every other file's field names (gstRate, hsnCode, createdAt, ...)
// unchanged, so only this file needed to know about the DB schema.
function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, price: Number(row.price), image: row.image,
    stock: Number(row.stock || 0), gstRate: Number(row.gst_rate || 0),
    hsnCode: row.hsn_code || '', category: row.category || null,
    minStock: Number(row.min_stock ?? 5), sku: row.sku || '',
    mrp: row.mrp === null || row.mrp === undefined ? null : Number(row.mrp),
    description: row.description || '',
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    items: (row.order_items || []).map(i => ({ id: i.product_id, name: i.name, price: Number(i.price), qty: i.qty })),
    customer: {
      name: row.customer_name, phone: row.customer_phone, email: row.customer_email,
      address: row.customer_address, city: row.customer_city, pincode: row.customer_pincode,
      state: row.customer_state
    },
    subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee), amount: Number(row.amount),
    paymentMethod: row.payment_method, paymentId: row.payment_id, status: row.status,
    gstBreakup: row.gst_breakup, createdAt: row.created_at
  };
}
function mapMovement(row) {
  if (!row) return null;
  return {
    id: row.id, productId: row.product_id, productName: row.product_name, type: row.type,
    qty: row.qty, rate: row.rate === null ? null : Number(row.rate),
    costPriceAtSale: row.cost_price_at_sale === null ? null : Number(row.cost_price_at_sale),
    profit: row.profit === null ? null : Number(row.profit),
    orderId: row.order_id, supplier: row.supplier || '', supplierGSTIN: row.supplier_gstin || '',
    invoiceNumber: row.invoice_number || '', purchaseDate: row.purchase_date, note: row.note || '',
    billUrl: row.bill_url || '', billFileName: row.bill_file_name || '', createdAt: row.created_at
  };
}
function throwIfError(error) { if (error) throw new Error(error.message); }

// Generic file uploader — used for product images and purchase bill
// photos/PDFs. Returns the public download URL once upload finishes.
// `folder` should be 'product-images' or 'purchase-bills' (must match
// the storage buckets created in Supabase). `id` is used as a sub-folder
// so files don't collide.
export async function uploadFile(folder, id, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${id}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(folder).upload(path, file, { upsert: false });
  throwIfError(error);
  const { data } = supabase.storage.from(folder).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------- Cart (persisted in localStorage — per device) -------
const CART_KEY = 'sih_cart_v1';

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartBadge();
}
export function addToCart(product, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.qty += qty;
  else cart.push({ id: product.id, name: product.name, price: product.price, image: product.image, qty, stock: product.stock ?? 999, gstRate: product.gstRate ?? 0, hsnCode: product.hsnCode || '' });
  saveCart(cart);
  showToast(`${product.name} cart mein add ho gaya`);
  trackEvent('add_to_cart', {
    currency: 'INR',
    value: product.price * qty,
    items: [{ item_id: product.id, item_name: product.name, price: product.price, quantity: qty }]
  });
}
export function updateQty(id, qty) {
  let cart = getCart();
  if (qty <= 0) cart = cart.filter(i => i.id !== id);
  else cart = cart.map(i => i.id === id ? { ...i, qty } : i);
  saveCart(cart);
  renderDrawer();
}
export function removeFromCart(id) {
  saveCart(getCart().filter(i => i.id !== id));
  renderDrawer();
}
export function clearCart() { saveCart([]); }
export function cartTotal(cart = getCart()) {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}
export function cartCount(cart = getCart()) {
  return cart.reduce((sum, i) => sum + i.qty, 0);
}
export function deliveryFee(subtotal) {
  if (subtotal === 0) return 0;
  return subtotal >= STORE_SETTINGS.freeDeliveryAbove ? 0 : STORE_SETTINGS.deliveryFee;
}

// ---------------- Products ----------------
export async function fetchProducts({ category = null } = {}) {
  let q = supabase.from('products').select('*');
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  throwIfError(error);
  return (data || []).map(mapProduct);
}
export async function fetchProduct(id) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  throwIfError(error);
  return mapProduct(data);
}
export async function fetchCategories() {
  const products = await fetchProducts();
  return [...new Set(products.map(p => p.category).filter(Boolean))];
}

// ---------------- Admin: product CRUD (used by admin/products.html) ---
// Postgres needs an id supplied up front (Firestore used to auto-generate
// one) — callers can pass data.id, or leave it out and we'll generate one.
export function newProductId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`);
}
export async function addProduct(data) {
  const { data: row, error } = await supabase.from('products').insert({
    id: data.id || newProductId(), name: data.name, price: data.price, image: data.image || null,
    stock: data.stock ?? 0, gst_rate: data.gstRate ?? 0, hsn_code: data.hsnCode || '',
    category: data.category || null, min_stock: data.minStock ?? 5,
    sku: data.sku || '', mrp: data.mrp ?? null, description: data.description || ''
  }).select().single();
  throwIfError(error);
  return mapProduct(row);
}
export async function updateProduct(id, data) {
  const patch = {};
  if ('name' in data) patch.name = data.name;
  if ('price' in data) patch.price = data.price;
  if ('image' in data) patch.image = data.image;
  if ('stock' in data) patch.stock = data.stock;
  if ('gstRate' in data) patch.gst_rate = data.gstRate;
  if ('hsnCode' in data) patch.hsn_code = data.hsnCode;
  if ('category' in data) patch.category = data.category;
  if ('minStock' in data) patch.min_stock = data.minStock;
  if ('sku' in data) patch.sku = data.sku;
  if ('mrp' in data) patch.mrp = data.mrp;
  if ('description' in data) patch.description = data.description;
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('products').update(patch).eq('id', id);
  throwIfError(error);
}
export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  throwIfError(error);
}

// ---------------- Orders ----------------
// SECURITY: order creation is NOT done by writing to the DB directly
// from the browser (RLS blocks that — only `select` is allowed on
// `products`, nothing else is public). Instead, everything goes through
// the `/api/place-order` serverless function (Vercel), which re-fetches
// real prices/stock and verifies any online payment server-side using
// the service_role key. The browser only ever says WHAT to buy (product
// id + qty) and WHO the customer is — never the price or total amount.
async function callApi(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function createRazorpayOrderSecure(items) {
  return callApi('/api/create-razorpay-order', { items });
}

export async function placeOrder({ items, customer, paymentMethod, razorpay }) {
  const data = await callApi('/api/place-order', { items, customer, paymentMethod, razorpay });
  trackEvent('purchase', {
    transaction_id: data.orderId,
    currency: 'INR',
    items: items.map(i => ({ item_id: i.id, quantity: i.qty }))
  });
  return data.orderId;
}
export async function fetchOrderById(id) {
  const { data, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
  throwIfError(error);
  return mapOrder(data);
}
export async function fetchOrdersByPhone(phone) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false });
  throwIfError(error);
  return (data || []).map(mapOrder);
}

// ---------------- Admin: orders (used by admin/index.html, admin/orders.html) ---
export async function fetchAllOrders({ limitTo = null } = {}) {
  let q = supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
  if (limitTo) q = q.limit(limitTo);
  const { data, error } = await q;
  throwIfError(error);
  return (data || []).map(mapOrder);
}
export async function updateOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  throwIfError(error);
}

// ---------------- Inventory ledger (purchases, sales, adjustments) ----
// Every stock change is written here with who/what/when/rate, so stock
// is never just a number that gets typed over — it's built from a
// recorded history, same as a physical warehouse register.

// Record a PURCHASE ENTRY: stock you bought in from a supplier.
// Updates products.stock and recalculates a weighted-average cost price
// via the `record_purchase` Postgres function (atomic — see the schema
// SQL). The cost itself lives in product_costs, which RLS keeps
// unreadable to the public anon key.
export async function recordPurchase({ productId, qty, rate, supplier = '', supplierGSTIN = '', invoiceNumber = '', purchaseDate = null, note = '', billUrl = '', billFileName = '' }) {
  if (qty <= 0) throw new Error('Quantity 0 se zyada honi chahiye');
  const { error } = await supabase.rpc('record_purchase', {
    p_product_id: productId, p_qty: qty, p_rate: rate,
    p_supplier: supplier || '', p_supplier_gstin: supplierGSTIN || '',
    p_invoice_number: invoiceNumber || '', p_purchase_date: purchaseDate || null,
    p_note: note || '', p_bill_url: billUrl || '', p_bill_file_name: billFileName || ''
  });
  throwIfError(error);
}

// Fetch the current (admin-only) cost price for one product.
export async function fetchProductCost(productId) {
  const { data, error } = await supabase.from('product_costs').select('cost_price').eq('product_id', productId).maybeSingle();
  throwIfError(error);
  return data ? Number(data.cost_price || 0) : 0;
}

// Fetch all cost prices at once as a { productId: costPrice } map.
export async function fetchAllProductCosts() {
  const { data, error } = await supabase.from('product_costs').select('product_id, cost_price');
  throwIfError(error);
  const map = {};
  (data || []).forEach(r => { map[r.product_id] = Number(r.cost_price || 0); });
  return map;
}

// Record a manual ADJUSTMENT: damage, loss, miscount, opening stock fix.
export async function recordAdjustment({ productId, delta, note }) {
  if (!delta) throw new Error('Quantity change 0 nahi ho sakti');
  const { error } = await supabase.rpc('record_adjustment', {
    p_product_id: productId, p_delta: delta, p_note: note || ''
  });
  throwIfError(error);
}

export async function fetchStockMovements({ productId = null } = {}) {
  let q = supabase.from('stock_movements').select('*').order('created_at', { ascending: false });
  if (productId) q = q.eq('product_id', productId);
  const { data, error } = await q;
  throwIfError(error);
  return (data || []).map(mapMovement);
}

// ---------------- Formatting ----------------
export function formatINR(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

// ---------------- Toast ----------------
export function showToast(msg) {
  let el = document.getElementById('sih-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sih-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------- Cart badge + drawer (shared header widget) ----------
export function renderCartBadge() {
  const badge = document.querySelector('.cart-badge');
  if (badge) badge.textContent = cartCount();
}

export function renderDrawer() {
  const body = document.querySelector('.drawer-body');
  const foot = document.querySelector('.drawer-foot');
  if (!body) return;
  const cart = getCart();
  if (cart.length === 0) {
    body.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="17" cy="21" r="1"/></svg>
      <p>Aapka cart khaali hai</p></div>`;
    if (foot) foot.innerHTML = '';
    return;
  }
  body.innerHTML = cart.map(i => `
    <div class="cart-row" data-id="${i.id}">
      <img src="${i.image || 'assets/placeholder.svg'}" alt="">
      <div class="info">
        <div class="name">${i.name}</div>
        <div>${formatINR(i.price)}</div>
        <div class="qty-ctrl">
          <button class="qty-dec">−</button>
          <span>${i.qty}</span>
          <button class="qty-inc">+</button>
          <button class="remove-x" style="margin-left:auto">Remove</button>
        </div>
      </div>
    </div>`).join('');
  const subtotal = cartTotal(cart);
  const fee = deliveryFee(subtotal);
  if (foot) {
    foot.innerHTML = `
      <div class="summary-row"><span>Subtotal</span><span>${formatINR(subtotal)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${fee === 0 ? 'FREE' : formatINR(fee)}</span></div>
      <div class="summary-row total"><span>Total</span><span>${formatINR(subtotal + fee)}</span></div>
      <a href="checkout.html" class="btn btn-block" style="margin-top:12px">Checkout karein</a>`;
  }
  body.querySelectorAll('.qty-dec').forEach(btn => btn.addEventListener('click', e => {
    const id = e.target.closest('.cart-row').dataset.id;
    const item = getCart().find(i => i.id === id);
    updateQty(id, item.qty - 1);
  }));
  body.querySelectorAll('.qty-inc').forEach(btn => btn.addEventListener('click', e => {
    const id = e.target.closest('.cart-row').dataset.id;
    const item = getCart().find(i => i.id === id);
    updateQty(id, item.qty + 1);
  }));
  body.querySelectorAll('.remove-x').forEach(btn => btn.addEventListener('click', e => {
    removeFromCart(e.target.closest('.cart-row').dataset.id);
  }));
}

export function initHeaderWidgets() {
  renderCartBadge();
  const cartLink = document.querySelector('.cart-link');
  const drawer = document.querySelector('.drawer');
  const overlay = document.querySelector('.overlay');
  const closeBtn = document.querySelector('.drawer-close');
  function openDrawer(e) { e && e.preventDefault(); renderDrawer(); drawer.classList.add('open'); overlay.classList.add('open'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); }
  if (cartLink) cartLink.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);
}
