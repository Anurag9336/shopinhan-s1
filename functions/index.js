// =====================================================================
// ⚠️ OPTIONAL / ALTERNATE PATH — not used by default.
//
// This project now uses Vercel serverless functions (see /api folder)
// for order placement, Razorpay verification, and the sitemap — this
// avoids needing Firebase's paid "Blaze" plan (Cloud Functions require
// Blaze; Firestore/Auth/Storage do not).
//
// This file is kept only in case you later prefer to run these on
// Firebase Cloud Functions instead (e.g. if you upgrade to Blaze for
// other reasons). If you're using the /api folder on Vercel, you do
// NOT need to deploy this file at all — leave it un-deployed.
// =====================================================================
// ShopInHand — Cloud Functions
//
// SECURITY MODEL: the browser is never trusted to say what something
// costs, how much stock exists, or whether a payment succeeded. Every
// one of those facts is re-derived here from Firestore / the Razorpay
// API before an order is ever written. The client only ever tells us
// WHAT the customer wants to buy (product IDs + quantities) and WHO
// they are (delivery details) — never prices or amounts.
// =====================================================================
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

function getClient() {
  const cfg = functions.config().razorpay;
  return new Razorpay({ key_id: cfg.key_id, key_secret: cfg.key_secret });
}

function round2(n) { return Math.round(n * 100) / 100; }

// Must match STORE_SETTINGS in js/firebase-config.js — kept as plain
// constants here (not read from the client) so a tampered client can
// never change delivery fee thresholds or the seller's home state.
const FREE_DELIVERY_ABOVE = 499;
const DELIVERY_FEE = 39;
const SELLER_STATE = 'Delhi';

// Validates + normalizes the raw `items` array the client sends
// (only { id, qty } — never trust a client-sent price). Throws
// HttpsError on anything malformed, so bad input never reaches Firestore.
function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'Cart is empty or invalid');
  }
  const seen = new Set();
  return items.map(raw => {
    const id = String(raw && raw.id || '').trim();
    const qty = Number(raw && raw.qty);
    if (!id || !Number.isInteger(qty) || qty <= 0 || qty > 100) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid item or quantity');
    }
    if (seen.has(id)) throw new functions.https.HttpsError('invalid-argument', 'Duplicate item in cart');
    seen.add(id);
    return { id, qty };
  });
}

function sanitizeCustomer(customer) {
  const c = customer || {};
  const name = String(c.name || '').trim().slice(0, 100);
  const phone = String(c.phone || '').trim();
  const email = String(c.email || '').trim().slice(0, 200);
  const address = String(c.address || '').trim().slice(0, 300);
  const city = String(c.city || '').trim().slice(0, 100);
  const pincode = String(c.pincode || '').trim();
  const state = String(c.state || '').trim().slice(0, 50);

  if (!name) throw new functions.https.HttpsError('invalid-argument', 'Name is required');
  if (!/^[0-9]{10}$/.test(phone)) throw new functions.https.HttpsError('invalid-argument', 'Valid 10-digit phone required');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new functions.https.HttpsError('invalid-argument', 'Invalid email');
  if (!address) throw new functions.https.HttpsError('invalid-argument', 'Address is required');
  if (!city) throw new functions.https.HttpsError('invalid-argument', 'City is required');
  if (!/^[0-9]{6}$/.test(pincode)) throw new functions.https.HttpsError('invalid-argument', 'Valid 6-digit pincode required');
  if (!state) throw new functions.https.HttpsError('invalid-argument', 'State is required');
  return { name, phone, email, address, city, pincode, state };
}

// Re-derives subtotal/delivery/amount from CURRENT Firestore prices —
// this is the only place "how much does this cost" is ever decided.
async function computeServerTotals(cleanItems) {
  const snaps = await Promise.all(cleanItems.map(i => db.collection('products').doc(i.id).get()));
  let subtotal = 0;
  const priced = cleanItems.map((item, idx) => {
    const snap = snaps[idx];
    if (!snap.exists) throw new functions.https.HttpsError('failed-precondition', 'Product ' + item.id + ' no longer exists');
    const p = snap.data();
    const price = Number(p.price);
    const stock = Number(p.stock || 0);
    subtotal += price * item.qty;
    return { id: item.id, qty: item.qty, name: p.name, price, stock, gstRate: Number(p.gstRate || 0), hsnCode: p.hsnCode || '' };
  });
  const deliveryFee = subtotal === 0 ? 0 : (subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE);
  const amount = round2(subtotal + deliveryFee);
  return { priced, subtotal: round2(subtotal), deliveryFee, amount };
}

function computeGST(priced, buyerState) {
  const sameState = String(buyerState || '').trim().toLowerCase() === SELLER_STATE.trim().toLowerCase();
  let totalTaxable = 0, totalGST = 0, totalCGST = 0, totalSGST = 0, totalIGST = 0;
  const lineItems = priced.map(item => {
    const lineTotal = item.price * item.qty;
    const rate = item.gstRate;
    const taxableValue = rate > 0 ? lineTotal / (1 + rate / 100) : lineTotal;
    const gstAmount = lineTotal - taxableValue;
    let cgst = 0, sgst = 0, igst = 0;
    if (sameState) { cgst = gstAmount / 2; sgst = gstAmount / 2; } else { igst = gstAmount; }
    totalTaxable += taxableValue; totalGST += gstAmount; totalCGST += cgst; totalSGST += sgst; totalIGST += igst;
    return {
      id: item.id, name: item.name, hsnCode: item.hsnCode, gstRate: rate, qty: item.qty, price: item.price,
      lineTotal: round2(lineTotal), taxableValue: round2(taxableValue), gstAmount: round2(gstAmount),
      cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst), taxType: sameState ? 'CGST + SGST' : 'IGST'
    };
  });
  return {
    lineItems, totalTaxable: round2(totalTaxable), totalGST: round2(totalGST),
    totalCGST: round2(totalCGST), totalSGST: round2(totalSGST), totalIGST: round2(totalIGST),
    taxType: sameState ? 'CGST + SGST' : 'IGST', buyerState: buyerState || ''
  };
}

// ---------------------------------------------------------------------
// Call BEFORE opening Razorpay Checkout. Recomputes the true amount
// server-side (never trusts a client-sent total) and creates a Razorpay
// order bound to that amount, so the Checkout modal can't be tricked
// into charging less than the real cart value.
// ---------------------------------------------------------------------
exports.createRazorpayOrder = functions.https.onCall(async (data) => {
  const cleanItems = sanitizeItems(data.items);
  const { amount } = await computeServerTotals(cleanItems);
  if (amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'Invalid order amount');
  const instance = getClient();
  const order = await instance.orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: 'rcpt_' + Date.now()
  });
  return { orderId: order.id, amount: order.amount, currency: order.currency };
});

// ---------------------------------------------------------------------
// The ONLY way an order gets written to Firestore (client-side direct
// writes are blocked in firestore.rules). Re-verifies everything:
// real prices, real stock, real GST, and — for online payments — a
// genuine, amount-matched Razorpay payment. Runs the stock decrement +
// order write + inventory-ledger sale entry in one atomic transaction.
// ---------------------------------------------------------------------
exports.placeOrder = functions.https.onCall(async (data) => {
  const cleanItems = sanitizeItems(data.items);
  const customer = sanitizeCustomer(data.customer);
  const paymentMethod = data.paymentMethod;
  if (paymentMethod !== 'COD' && paymentMethod !== 'ONLINE') {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payment method');
  }

  const orderRef = db.collection('orders').doc();

  await db.runTransaction(async (tx) => {
    // ---- reads first (Firestore transaction requirement) ----
    const productRefs = cleanItems.map(i => db.collection('products').doc(i.id));
    const costRefs = cleanItems.map(i => db.collection('product_costs').doc(i.id));
    const productSnaps = await Promise.all(productRefs.map(r => tx.get(r)));
    const costSnaps = await Promise.all(costRefs.map(r => tx.get(r)));

    let subtotal = 0;
    const priced = cleanItems.map((item, idx) => {
      const pSnap = productSnaps[idx];
      if (!pSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'Product ' + item.id + ' no longer exists');
      const p = pSnap.data();
      const stock = Number(p.stock || 0);
      if (stock < item.qty) {
        throw new functions.https.HttpsError('failed-precondition', p.name + ': sirf ' + stock + ' stock bacha hai');
      }
      const price = Number(p.price);
      subtotal += price * item.qty;
      const costSnap = costSnaps[idx];
      return {
        id: item.id, qty: item.qty, name: p.name, price, stock,
        gstRate: Number(p.gstRate || 0), hsnCode: p.hsnCode || '',
        costPriceAtSale: Number(costSnap.exists ? (costSnap.data().costPrice || 0) : 0)
      };
    });
    const deliveryFee = subtotal === 0 ? 0 : (subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE);
    const amount = round2(subtotal + deliveryFee);
    const gstBreakup = computeGST(priced, customer.state);

    // ---- payment verification (read-only network calls — safe even
    // if Firestore retries this transaction due to contention) ----
    let paymentId = '';
    if (paymentMethod === 'ONLINE') {
      const rp = data.razorpay || {};
      if (!rp.razorpay_order_id || !rp.razorpay_payment_id || !rp.razorpay_signature) {
        throw new functions.https.HttpsError('invalid-argument', 'Payment details missing');
      }
      const cfg = functions.config().razorpay;
      const expected = crypto.createHmac('sha256', cfg.key_secret)
        .update(rp.razorpay_order_id + '|' + rp.razorpay_payment_id)
        .digest('hex');
      if (expected !== rp.razorpay_signature) {
        throw new functions.https.HttpsError('permission-denied', 'Payment signature invalid');
      }
      const instance = getClient();
      const rzpOrder = await instance.orders.fetch(rp.razorpay_order_id);
      if (rzpOrder.amount !== Math.round(amount * 100)) {
        throw new functions.https.HttpsError('permission-denied', 'Payment amount does not match order total');
      }
      paymentId = rp.razorpay_payment_id;
    }

    // ---- writes: order, stock decrement, sale ledger entries ----
    tx.set(orderRef, {
      items: priced.map(p => ({ id: p.id, name: p.name, price: p.price, qty: p.qty })),
      customer, subtotal, deliveryFee, amount, paymentMethod, paymentId, gstBreakup,
      status: paymentMethod === 'COD' ? 'pending' : 'paid',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    priced.forEach((item, idx) => {
      tx.update(productRefs[idx], { stock: item.stock - item.qty });
      const profit = round2((item.price - item.costPriceAtSale) * item.qty);
      const movementRef = db.collection('stock_movements').doc();
      tx.set(movementRef, {
        productId: item.id, productName: item.name, type: 'sale', qty: -item.qty,
        rate: item.price, costPriceAtSale: item.costPriceAtSale, profit,
        orderId: orderRef.id, note: 'Sold via order #' + orderRef.id.slice(0, 8),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });

  return { orderId: orderRef.id };
});

// =====================================================================
// SITEMAP — real, live sitemap generated on every request from your
// actual Firestore products. Helps Google discover and index every
// product page.
//
// IMPORTANT: change DOMAIN below to your real, live domain (no trailing
// slash) — the same one you put in js/firebase-config.js as SITE_URL.
// The firebase.json hosting rewrite for /sitemap.xml is already set up.
// =====================================================================
const DOMAIN = "https://PASTE_YOUR_DOMAIN_HERE.com";

exports.sitemap = functions.https.onRequest(async (req, res) => {
  try {
    const snap = await db.collection('products').get();
    const staticUrls = [{ loc: DOMAIN + '/index.html', priority: '1.0' }];
    const productUrls = snap.docs.map(d => ({ loc: DOMAIN + '/product.html?id=' + d.id, priority: '0.8' }));
    const urls = staticUrls.concat(productUrls);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => '  <url><loc>' + u.loc + '</loc><priority>' + u.priority + '</priority></url>').join('\n') +
      '\n</urlset>';
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xml);
  } catch (err) {
    console.error('Sitemap generation failed', err);
    res.status(500).send('Sitemap generation failed');
  }
});
