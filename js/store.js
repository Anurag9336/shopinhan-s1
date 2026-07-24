// =====================================================================
// ShopInHand — core store engine (shared by every customer-facing page)
// Vanilla JS + Firebase modular SDK (loaded from CDN, no build step).
// =====================================================================
import { firebaseConfig, STORE_SETTINGS } from './firebase-config.js';
import { trackEvent } from './seo.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, query, where, orderBy, addDoc, serverTimestamp, updateDoc, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

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

// Generic file uploader — used for product images and purchase bill
// photos/PDFs. Returns the public download URL once upload finishes.
// `folder` should be 'product-images' or 'purchase-bills' (must match
// storage.rules paths). `id` is the product ID (used as a sub-folder so
// files don't collide).
export async function uploadFile(folder, id, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${folder}/${id}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
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
  const col = collection(db, 'products');
  const q = category ? query(col, where('category', '==', category)) : col;
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function fetchProduct(id) {
  const snap = await getDoc(doc(db, 'products', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function fetchCategories() {
  const products = await fetchProducts();
  return [...new Set(products.map(p => p.category).filter(Boolean))];
}

// ---------------- Orders ----------------
// SECURITY: order creation is NOT done by writing to Firestore directly
// from the browser (firestore.rules blocks that — `allow create: if false`
// on /orders). Instead, everything goes through the `/api/place-order`
// serverless function (Vercel), which re-fetches real prices/stock from
// Firestore and verifies any online payment server-side. The browser
// only ever says WHAT to buy (product id + qty) and WHO the customer
// is — never the price or total amount, which a tampered client could
// otherwise fake.
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

// Call BEFORE opening Razorpay Checkout — gets a real, server-computed
// amount bound to a Razorpay order_id, so the Checkout modal can't be
// tricked into charging less than the actual cart value.
export async function createRazorpayOrderSecure(items) {
  return callApi('/api/create-razorpay-order', { items });
}

// Call after COD confirmation, or after a verified Razorpay payment
// succeeds. Returns the new Firestore order ID.
export async function placeOrder({ items, customer, paymentMethod, razorpay }) {
  const data = await callApi('/api/place-order', { items, customer, paymentMethod, razorpay });
  trackEvent('purchase', {
    transaction_id: data.orderId,
    currency: 'INR',
    items: items.map(i => ({ item_id: i.id, quantity: i.qty }))
  });
  return data.orderId;
}
export async function fetchOrdersByPhone(phone) {
  const q = query(collection(db, 'orders'), where('customer.phone', '==', phone), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------- Inventory ledger (purchases, sales, adjustments) ----
// Every stock change is written here with who/what/when/rate, so stock
// is never just a number that gets typed over — it's built from a
// recorded history, same as a physical warehouse register.

// Record a PURCHASE ENTRY: stock you bought in from a supplier.
// Updates product.stock (public doc) and recalculates a weighted-average
// cost price — but the cost itself is written to /product_costs, an
// admin-only collection, so it's never exposed on the public product doc.
export async function recordPurchase({ productId, qty, rate, supplier = '', supplierGSTIN = '', invoiceNumber = '', purchaseDate = null, note = '', billUrl = '', billFileName = '' }) {
  if (qty <= 0) throw new Error('Quantity 0 se zyada honi chahiye');
  const productRef = doc(db, 'products', productId);
  const costRef = doc(db, 'product_costs', productId);
  let productName = '';
  let newCost = rate;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists()) throw new Error('Product nahi mila');
    const costSnap = await tx.get(costRef);
    const p = snap.data();
    productName = p.name;
    const oldStock = Number(p.stock || 0);
    const oldCost = Number(costSnap.exists() ? costSnap.data().costPrice || 0 : 0);
    const newStock = oldStock + qty;
    newCost = newStock > 0 ? ((oldStock * oldCost) + (qty * rate)) / newStock : rate;
    newCost = Math.round(newCost * 100) / 100;
    tx.update(productRef, { stock: newStock });
    tx.set(costRef, { costPrice: newCost, updatedAt: serverTimestamp() });
  });
  await addDoc(collection(db, 'stock_movements'), {
    productId, productName, type: 'purchase', qty, rate,
    supplier: supplier || '', supplierGSTIN: supplierGSTIN || '', invoiceNumber: invoiceNumber || '',
    purchaseDate: purchaseDate || null, note: note || '',
    billUrl: billUrl || '', billFileName: billFileName || '',
    createdAt: serverTimestamp()
  });
}

// Fetch the current (admin-only) cost price for one product.
export async function fetchProductCost(productId) {
  const snap = await getDoc(doc(db, 'product_costs', productId));
  return snap.exists() ? Number(snap.data().costPrice || 0) : 0;
}

// Fetch all cost prices at once as a { productId: costPrice } map —
// used by the admin dashboard/products/inventory pages so they don't
// need one Firestore read per product.
export async function fetchAllProductCosts() {
  const snap = await getDocs(collection(db, 'product_costs'));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = Number(d.data().costPrice || 0); });
  return map;
}

// Record a manual ADJUSTMENT: damage, loss, miscount, opening stock fix.
// delta can be positive (found extra stock) or negative (damaged/lost).
export async function recordAdjustment({ productId, delta, note }) {
  if (!delta) throw new Error('Quantity change 0 nahi ho sakti');
  const productRef = doc(db, 'products', productId);
  let productName = '';
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists()) throw new Error('Product nahi mila');
    const p = snap.data();
    productName = p.name;
    const newStock = Math.max(0, Number(p.stock || 0) + delta);
    tx.update(productRef, { stock: newStock });
  });
  await addDoc(collection(db, 'stock_movements'), {
    productId, productName, type: 'adjustment', qty: delta, rate: 0, note: note || '',
    createdAt: serverTimestamp()
  });
}

export async function fetchStockMovements({ productId = null } = {}) {
  const col = collection(db, 'stock_movements');
  const q = productId
    ? query(col, where('productId', '==', productId), orderBy('createdAt', 'desc'))
    : query(col, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
