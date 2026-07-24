// =====================================================================
// SUPABASE CONFIG — fill this in with YOUR Supabase project's keys.
// Where to get these: Supabase Dashboard → Settings → API Keys.
// SUPABASE_URL = "Project URL", SUPABASE_ANON_KEY = "Publishable key"
// (sb_publishable_... or the older "anon public" key). Both are SAFE
// to be public — never put the "Secret key" (sb_secret_...) here.
// =====================================================================
export const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
export const SUPABASE_ANON_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

// Razorpay public key ("Key Id" — starts with rzp_test_ or rzp_live_)
// Dashboard → Settings → API Keys. Only the Key ID goes here, NEVER the Key Secret.
export const RAZORPAY_KEY_ID = "PASTE_RAZORPAY_KEY_ID_HERE";

// Email address(es) allowed to log in to /admin — these must also be
// created as actual users in Supabase Dashboard → Authentication → Users.
export const ADMIN_EMAILS = ["owner@example.com"];

// =====================================================================
// SITE URL — your real, live domain (no trailing slash). Used for
// SEO canonical links, Open Graph/WhatsApp share previews, structured
// data, and the sitemap. Update this the day you know your final domain.
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
  gstin: "PASTE_YOUR_GSTIN_HERE",
  sellerState: "Delhi",
  pricesIncludeGST: true,

  // ---------------- Bank details (shown on tax invoice) ----------------
  bank: {
    accountName: "PASTE_ACCOUNT_HOLDER_NAME",
    accountNo: "PASTE_ACCOUNT_NUMBER",
    ifsc: "PASTE_IFSC_CODE",
    bankName: "PASTE_BANK_NAME_AND_BRANCH"
  },
  authorisedSignatory: ""
};
