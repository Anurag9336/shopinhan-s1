// Shared header + footer markup, injected into every customer-facing page.
// Edit this ONE file to change the header/footer site-wide.
import { STORE_SETTINGS } from './supabase-config.js';

export function renderHeader(activeCategory = '') {
  document.getElementById('site-header-slot').innerHTML = `
  <div class="topbar"><div class="container">
    <span>📦 ${STORE_SETTINGS.freeDeliveryAbove} se upar FREE delivery</span>
    <span>📞 ${STORE_SETTINGS.phone}</span>
  </div></div>
  <header class="site-header">
    <div class="container header-inner">
      <a href="index.html" class="logo-link">
        <img src="assets/logo.jpg" alt="${STORE_SETTINGS.name}">
      </a>
      <form class="search-form" action="index.html" method="get">
        <input type="text" name="q" placeholder="Pen, notebook, file, art supplies dhoondein...">
        <button type="submit">Search</button>
      </form>
      <div class="header-actions">
        <a href="my-orders.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7"/><path d="M2 7h20l-2-4H4z"/><path d="M12 7v14"/></svg>
          Orders
        </a>
        <a href="#" class="cart-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="17" cy="21" r="1"/></svg>
          Cart
          <span class="cart-badge">0</span>
        </a>
      </div>
    </div>
    <nav class="cat-strip"><div class="container" id="cat-strip-inner">
      <a href="index.html" class="${activeCategory==='' ? 'active':''}">All</a>
    </div></nav>
  </header>
  <div class="overlay"></div>
  <aside class="drawer">
    <div class="drawer-head"><h3>Your Cart</h3><button class="drawer-close icon-btn">Close ✕</button></div>
    <div class="drawer-body"></div>
    <div class="drawer-foot"></div>
  </aside>
  `;
}

export function renderFooter() {
  document.getElementById('site-footer-slot').innerHTML = `
  <footer class="site-footer">
    <div class="container">
      <div>
        <h4>${STORE_SETTINGS.name}</h4>
        <p style="font-size:13px">${STORE_SETTINGS.tagline}</p>
      </div>
      <div>
        <h4>Help</h4>
        <a href="my-orders.html">Track Order</a>
        <a href="mailto:${STORE_SETTINGS.email}">Contact Us</a>
        <a href="https://wa.me/${STORE_SETTINGS.whatsapp}" target="_blank">WhatsApp Support</a>
      </div>
      <div>
        <h4>Policies</h4>
        <a href="#">Returns &amp; Refunds</a>
        <a href="#">Shipping Info</a>
        <a href="#">Terms of Service</a>
      </div>
      <div>
        <h4>Reach Us</h4>
        <p style="font-size:13px;margin:0">${STORE_SETTINGS.address}<br>${STORE_SETTINGS.phone}</p>
      </div>
    </div>
    <div class="footer-bottom">© ${new Date().getFullYear()} ${STORE_SETTINGS.name}. Poora Bazaar, In Your Hand.</div>
  </footer>`;
}

export async function renderCategoryStrip(categories, activeCategory = '') {
  const wrap = document.getElementById('cat-strip-inner');
  if (!wrap) return;
  wrap.innerHTML = `<a href="index.html" class="${activeCategory==='' ? 'active':''}">All</a>` +
    categories.map(c => `<a href="index.html?category=${encodeURIComponent(c)}" class="${activeCategory===c ? 'active':''}">${c}</a>`).join('');
}
