import { app } from './store.js';
import { ADMIN_EMAILS, STORE_SETTINGS } from './firebase-config.js';
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const auth = getAuth(app);

// Resolves with the admin user, or redirects to login.html
export function requireAdmin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email)) {
        location.href = 'login.html';
        return;
      }
      resolve(user);
    });
  });
}

export function renderAdminNav(active) {
  const el = document.getElementById('admin-nav-slot');
  if (!el) return;
  el.innerHTML = `
    <a href="index.html" class="logo-link" style="padding:0 24px 20px"><img src="../assets/logo.jpg" alt="${STORE_SETTINGS.name}"></a>
    <a href="index.html" class="${active === 'dashboard' ? 'active' : ''}">📊 Dashboard</a>
    <a href="products.html" class="${active === 'products' ? 'active' : ''}">🛍️ Products</a>
    <a href="inventory.html" class="${active === 'inventory' ? 'active' : ''}">📋 Inventory</a>
    <a href="orders.html" class="${active === 'orders' ? 'active' : ''}">📦 Orders</a>
    <a href="#" id="logout-link">🚪 Logout</a>
    <a href="../index.html" style="margin-top:20px;opacity:.7">← Back to Store</a>
  `;
  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    location.href = 'login.html';
  });
}
