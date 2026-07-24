const Razorpay = require('razorpay');
const crypto = require('crypto');
const { initAdmin } = require('./_lib/firebase-admin');
const {
  sanitizeItems, sanitizeCustomer, computeGST, setCors,
  FREE_DELIVERY_ABOVE, DELIVERY_FEE, round2
} = require('./_lib/order-logic');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = initAdmin();
    const db = admin.firestore();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const cleanItems = sanitizeItems(body.items);
    const customer = sanitizeCustomer(body.customer);
    const paymentMethod = body.paymentMethod;
    if (paymentMethod !== 'COD' && paymentMethod !== 'ONLINE') {
      throw new Error('Invalid payment method');
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
        if (!pSnap.exists) throw new Error('Product ' + item.id + ' no longer exists');
        const p = pSnap.data();
        const stock = Number(p.stock || 0);
        if (stock < item.qty) throw new Error(p.name + ': sirf ' + stock + ' stock bacha hai');
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
        const rp = body.razorpay || {};
        if (!rp.razorpay_order_id || !rp.razorpay_payment_id || !rp.razorpay_signature) {
          throw new Error('Payment details missing');
        }
        const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
          .update(rp.razorpay_order_id + '|' + rp.razorpay_payment_id)
          .digest('hex');
        if (expected !== rp.razorpay_signature) throw new Error('Payment signature invalid');

        const instance = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        const rzpOrder = await instance.orders.fetch(rp.razorpay_order_id);
        if (rzpOrder.amount !== Math.round(amount * 100)) {
          throw new Error('Payment amount does not match order total');
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

    res.status(200).json({ orderId: orderRef.id });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};
