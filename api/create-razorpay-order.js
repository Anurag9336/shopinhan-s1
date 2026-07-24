const Razorpay = require('razorpay');
const { getAdminClient } = require('./_lib/supabase-admin');
const { sanitizeItems, computeServerTotals, setCors } = require('./_lib/order-logic');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseAdmin = getAdminClient();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const cleanItems = sanitizeItems(body.items);
    const { amount } = await computeServerTotals(supabaseAdmin, cleanItems);
    if (amount <= 0) throw new Error('Invalid order amount');

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    const order = await instance.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    });
    res.status(200).json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};
