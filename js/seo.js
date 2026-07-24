// =====================================================================
// SEO + Analytics helper — shared by every customer-facing page.
// Handles: Google Analytics 4 loading + ecommerce events, dynamic
// <title>/meta description/Open Graph/canonical updates, and JSON-LD
// structured data injection. Everything here is genuinely functional —
// GA4 events will start showing up in your Analytics dashboard as soon
// as you paste a real GA_MEASUREMENT_ID in js/supabase-config.js.
// =====================================================================
import { SITE_URL, GA_MEASUREMENT_ID, STORE_SETTINGS } from './supabase-config.js';

// ---------------- Google Analytics 4 ----------------
let gaLoaded = false;

export function initGA() {
  if (gaLoaded || !GA_MEASUREMENT_ID || GA_MEASUREMENT_ID.includes('PASTE_')) return;
  gaLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
}

// Send a GA4 event (view_item, add_to_cart, begin_checkout, purchase, etc).
// Safe to call even if GA isn't configured yet — it just no-ops.
export function trackEvent(name, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

// ---------------- Dynamic <head> meta (title, description, OG, canonical) ----
function setTag(selector, attr, value) {
  let el = document.querySelector(selector);
  if (!el) return;
  el.setAttribute(attr, value);
}

function ensureMeta(propertyAttr, propertyValue, content) {
  let el = document.querySelector(`meta[${propertyAttr}="${propertyValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(propertyAttr, propertyValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function ensureCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Call on any page to keep title/description/OG/canonical/Twitter card
// tags in sync with what's actually being shown (used mainly by
// product.html, since each product needs its own title/image/url).
export function setPageMeta({ title, description, image, path = '' }) {
  const url = `${SITE_URL}${path}`;
  if (title) document.title = title;
  if (description) ensureMeta('name', 'description', description);
  ensureMeta('property', 'og:title', title || document.title);
  if (description) ensureMeta('property', 'og:description', description);
  ensureMeta('property', 'og:type', 'product');
  ensureMeta('property', 'og:url', url);
  ensureMeta('property', 'og:image', image ? `${SITE_URL}/${image.replace(/^\.?\//, '')}` : `${SITE_URL}/assets/logo.jpg`);
  ensureMeta('name', 'twitter:card', 'summary_large_image');
  ensureMeta('name', 'twitter:title', title || document.title);
  if (description) ensureMeta('name', 'twitter:description', description);
  ensureCanonical(url);
}

// Injects Product structured data (JSON-LD) so Google can show price/
// stock/rating rich results. Googlebot executes JS and reads this even
// though it's added after page load — plain link-preview crawlers
// (WhatsApp/Facebook) do NOT run JS, so for those, static OG fallback
// tags already in the HTML <head> are what gets used instead.
export function injectProductSchema(p, path) {
  const existing = document.getElementById('product-jsonld');
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'product-jsonld';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: p.name,
    description: p.description || `${p.name} — ${STORE_SETTINGS.name} par available.`,
    image: p.image ? `${SITE_URL}/${p.image.replace(/^\.?\//, '')}` : `${SITE_URL}/assets/logo.jpg`,
    sku: p.id,
    brand: { '@type': 'Brand', name: STORE_SETTINGS.name },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}${path}`,
      priceCurrency: 'INR',
      price: p.price,
      availability: (p.stock ?? 1) > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock'
    }
  });
  document.head.appendChild(script);
}

// WhatsApp share link for a product (or any page) — works immediately,
// no setup needed.
export function whatsappShareUrl(text, path = '') {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${SITE_URL}${path}`)}`;
}
