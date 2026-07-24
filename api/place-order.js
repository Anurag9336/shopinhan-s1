const Razorpay = require('razorpay');
const crypto = require('crypto');
const { getAdminClient } = require('./_lib/supabase-admin');
const {
  sanitizeItems, sanitizeCustomer, computeServerTotals, computeGST, setCors, round2
} = require('./_lib/order-logic');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseAdmin = getAdminClient();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const cleanItems = sanitizeItems(body.items);
    const customer = sanitizeCustomer(body.customer);
    const paymentMethod = body.paymentMethod;
    if (paymentMethod !== 'COD' && paymentMethod !== 'ONLINE') {
      throw new Error('Invalid payment method');
    }

    // ---- Re-derive real prices/stock/GST from the DB — never trust
    // the browser's numbers (server-authoritative pricing). ----
    const { priced, subtotal, deliveryFee, amount } = await computeServerTotals(supabaseAdmin, cleanItems);
    for (const item of priced) {
      if (item.stock < item.qty) throw new Error(item.name + ': sirf ' + item.stock + ' stock bacha hai');
    }

    // Look up current cost price per item (needed for profit tracking on the sale).
    const ids = priced.map(p => p.id);
    const { data: costRows, error: costErr } = await supabaseAdmin.from('product_costs').select('product_id, cost_price').in('product_id', ids);
    if (costErr) throw new Error(costErr.message);
    const costMap = {};
    (costRows || []).forEach(r => { costMap[r.product_id] = Number(r.cost_price || 0); });
    const pricedWithCost = priced.map(p => ({ ...p, costPriceAtSale: costMap[p.id] || 0 }));

    const gstBreakup = computeGST(pricedWithCost, customer.state);

    // ---- Payment verification (read-only network calls) ----
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

    // ---- Single atomic write: order + stock decrement + ledger, done
    // inside one Postgres function call (see place_order_atomic in the
    // schema SQL) so it can never be left half-done. ----
    const payload = {
      customer,
      items: pricedWithCost.map(p => ({ id: p.id, name: p.name, price: p.price, qty: p.qty, costPriceAtSale: p.costPriceAtSale })),
      subtotal, deliveryFee, amount, paymentMethod, paymentId,
      status: paymentMethod === 'COD' ? 'pending' : 'paid',
      gstBreakup
    };
    const { data: orderId, error: rpcErr } = await supabaseAdmin.rpc('place_order_atomic', { payload });
    if (rpcErr) throw new Error(rpcErr.message);

    res.status(200).json({ orderId });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};
