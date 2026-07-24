// =====================================================================
// GST (India tax) calculation helpers.
// Selling prices are treated as GST-INCLUSIVE (like an MRP) — see
// STORE_SETTINGS.pricesIncludeGST in firebase-config.js. So we back-
// calculate the taxable value and tax amount from the price the
// customer actually pays; the total never changes because of tax.
// =====================================================================
import { STORE_SETTINGS } from './firebase-config.js';

// Split one GST-inclusive amount into { taxableValue, gstAmount }.
export function splitInclusiveAmount(amountIncl, gstRatePercent) {
  const rate = Number(gstRatePercent || 0);
  const taxableValue = rate > 0 ? amountIncl / (1 + rate / 100) : amountIncl;
  const gstAmount = amountIncl - taxableValue;
  return {
    taxableValue: Math.round(taxableValue * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100
  };
}

// Decide CGST+SGST (buyer & seller in the same state) vs IGST (different
// states), per GST law.
export function splitTax(gstAmount, buyerState) {
  const sameState = (buyerState || '').trim().toLowerCase() === STORE_SETTINGS.sellerState.trim().toLowerCase();
  if (sameState) {
    const half = Math.round((gstAmount / 2) * 100) / 100;
    return { cgst: half, sgst: half, igst: 0, taxType: 'CGST + SGST' };
  }
  return { cgst: 0, sgst: 0, igst: Math.round(gstAmount * 100) / 100, taxType: 'IGST' };
}

// Group an order's line items by HSN/SAC code — used to render the
// "HSN/SAC | Taxable Value | CGST | SGST | Total Tax" summary table
// that appears on a standard GST tax invoice, below the item table.
export function groupByHSN(lineItems) {
  const map = new Map();
  for (const li of lineItems) {
    const key = li.hsnCode || '-';
    if (!map.has(key)) {
      map.set(key, { hsnCode: key, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, gstRate: li.gstRate });
    }
    const g = map.get(key);
    g.taxableValue += li.taxableValue;
    g.cgst += li.cgst;
    g.sgst += li.sgst;
    g.igst += li.igst;
  }
  return Array.from(map.values()).map(g => ({
    ...g,
    taxableValue: Math.round(g.taxableValue * 100) / 100,
    cgst: Math.round(g.cgst * 100) / 100,
    sgst: Math.round(g.sgst * 100) / 100,
    igst: Math.round(g.igst * 100) / 100,
    totalTax: Math.round((g.cgst + g.sgst + g.igst) * 100) / 100
  }));
}

// Convert a rupee amount (number) into Indian-format words, e.g.
// 2948 -> "Two Thousand Nine Hundred Forty Eight Rupees Only".
// Standard requirement on a printed tax invoice.
export function amountToWordsINR(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }
  function threeDigits(n) {
    if (n >= 100) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
    return twoDigits(n);
  }

  let rupees = Math.floor(Math.round(Number(amount || 0) * 100) / 100);
  const paise = Math.round((Number(amount || 0) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  const hundred = rupees;

  let words = '';
  if (crore) words += threeDigits(crore) + ' Crore ';
  if (lakh) words += threeDigits(lakh) + ' Lakh ';
  if (thousand) words += threeDigits(thousand) + ' Thousand ';
  if (hundred) words += threeDigits(hundred) + ' ';
  words = words.trim() + ' Rupees';
  if (paise) words += ' and ' + twoDigits(paise) + ' Paise';
  return words + ' Only';
}

// Compute a full line-by-line + totals GST breakup for an order.
// `items` should be cart/order line items: { id, name, price, qty, gstRate, hsnCode }.
// `price` is the GST-inclusive selling price per unit.
export function computeOrderGST(items, buyerState) {
  let totalTaxable = 0, totalGST = 0, totalCGST = 0, totalSGST = 0, totalIGST = 0;
  const lineItems = items.map(item => {
    const lineTotal = Number(item.price) * Number(item.qty);
    const { taxableValue, gstAmount } = splitInclusiveAmount(lineTotal, item.gstRate);
    const { cgst, sgst, igst, taxType } = splitTax(gstAmount, buyerState);
    totalTaxable += taxableValue; totalGST += gstAmount;
    totalCGST += cgst; totalSGST += sgst; totalIGST += igst;
    return {
      id: item.id, name: item.name, hsnCode: item.hsnCode || '', gstRate: Number(item.gstRate || 0),
      qty: item.qty, price: item.price, lineTotal,
      taxableValue, gstAmount, cgst, sgst, igst, taxType
    };
  });
  return {
    lineItems,
    totalTaxable: Math.round(totalTaxable * 100) / 100,
    totalGST: Math.round(totalGST * 100) / 100,
    totalCGST: Math.round(totalCGST * 100) / 100,
    totalSGST: Math.round(totalSGST * 100) / 100,
    totalIGST: Math.round(totalIGST * 100) / 100,
    taxType: lineItems[0]?.taxType || 'CGST + SGST',
    buyerState: buyerState || ''
  };
}
