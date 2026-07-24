// Shared, server-authoritative order logic. Never trust price/amount
// from the client — everything here re-derives it from Firestore.

// Must match STORE_SETTINGS in js/firebase-config.js.
const FREE_DELIVERY_ABOVE = 499;
const DELIVERY_FEE = 39;
const SELLER_STATE = 'Delhi';

function round2(n) { return Math.round(n * 100) / 100; }

function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new Error('Cart is empty or invalid');
  }
  const seen = new Set();
  return items.map(raw => {
    const id = String((raw && raw.id) || '').trim();
    const qty = Number(raw && raw.qty);
    if (!id || !Number.isInteger(qty) || qty <= 0 || qty > 100) {
      throw new Error('Invalid item or quantity');
    }
    if (seen.has(id)) throw new Error('Duplicate item in cart');
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

  if (!name) throw new Error('Name is required');
  if (!/^[0-9]{10}$/.test(phone)) throw new Error('Valid 10-digit phone required');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  if (!address) throw new Error('Address is required');
  if (!city) throw new Error('City is required');
  if (!/^[0-9]{6}$/.test(pincode)) throw new Error('Valid 6-digit pincode required');
  if (!state) throw new Error('State is required');
  return { name, phone, email, address, city, pincode, state };
}

async function computeServerTotals(db, cleanItems) {
  const snaps = await Promise.all(cleanItems.map(i => db.collection('products').doc(i.id).get()));
  let subtotal = 0;
  const priced = cleanItems.map((item, idx) => {
    const snap = snaps[idx];
    if (!snap.exists) throw new Error('Product ' + item.id + ' no longer exists');
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { round2, sanitizeItems, sanitizeCustomer, computeServerTotals, computeGST, setCors, FREE_DELIVERY_ABOVE, DELIVERY_FEE, SELLER_STATE };
