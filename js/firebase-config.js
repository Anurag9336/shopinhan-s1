// =====================================================================
// FIREBASE CONFIG — fill this in with YOUR Firebase project's keys.
// Where to get these: Firebase Console → Project Settings → General
// → "Your apps" → Web app → SDK setup and configuration.
// This file is safe to be public (these are not secret keys).
// See README.md, Step 1, for the full walkthrough.
// =====================================================================
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// Razorpay public key ("Key Id" — starts with rzp_test_ or rzp_live_)
// Dashboard → Settings → API Keys. Only the Key ID goes here, NEVER the Key Secret.
export const RAZORPAY_KEY_ID = "PASTE_RAZORPAY_KEY_ID_HERE";

// Email address(es) allowed to log in to /admin
export const ADMIN_EMAILS = ["owner@example.com"];

// =====================================================================
// SITE URL — your real, live domain (no trailing slash). Used for
// SEO canonical links, Open Graph/WhatsApp share previews, structured
// data, and the sitemap. Update this the day you know your final domain
// (Firebase default like https://your-project.web.app works too, or
// your custom domain once connected — see README "Website deploy karna").
// =====================================================================
export const SITE_URL = "https://PASTE_YOUR_DOMAIN_HERE.com";

// =====================================================================
// GOOGLE ANALYTICS 4 — free, tells you visitors/pageviews/add-to-cart/
// purchases. Get a Measurement ID (starts with "G-"):
// https://analytics.google.com → Admin → Create Property → Data Streams
// → Web → paste your SITE_URL → copy the "Measurement ID".
// Leave as-is to keep analytics OFF (no script loads, nothing breaks).
// =====================================================================
export const GA_MEASUREMENT_ID = "G-PASTE_YOUR_ID_HERE";

// Store display settings — edit any time, no code changes needed elsewhere
export const STORE_SETTINGS = {
  name: "ShopInHand",
  tagline: "Poora Bazaar, In Your Hand",
  phone: "+91 90000 00000",
  whatsapp: "919000000000",
  email: "support@shopinhand.in",
  address: "Your City, India",
  freeDeliveryAbove: 499,
  deliveryFee: 39,
  codAvailable: true,

  // ---------------- GST (India tax) settings ----------------
  // Your dukaan's GST registration number. Shown on every customer
  // tax invoice — required if you're GST-registered.
  gstin: "PASTE_YOUR_GSTIN_HERE",
  // The state your business is registered in. Used to decide whether an
  // order gets CGST+SGST (same state as buyer) or IGST (different state).
  sellerState: "Delhi",
  // Selling prices entered in the Admin Panel are treated as GST-INCLUSIVE
  // (like an MRP) — the tax amount is back-calculated from this price,
  // it is never added on top at checkout. Change to false only if you
  // want prices to be GST-exclusive (tax added on top at checkout).
  pricesIncludeGST: true,

  // ---------------- Bank details (shown on tax invoice) ----------------
  // Optional — leave blank ("") to hide the Bank Details box on invoices.
  bank: {
    accountName: "PASTE_ACCOUNT_HOLDER_NAME",
    accountNo: "PASTE_ACCOUNT_NUMBER",
    ifsc: "PASTE_IFSC_CODE",
    bankName: "PASTE_BANK_NAME_AND_BRANCH"
  },
  // Name printed under the "Authorised Signatory" line on the invoice.
  authorisedSignatory: ""
};
