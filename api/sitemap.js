const { initAdmin } = require('./_lib/firebase-admin');

module.exports = async (req, res) => {
  try {
    const admin = initAdmin();
    const db = admin.firestore();
    const domain = process.env.SITE_DOMAIN || 'https://PASTE_YOUR_DOMAIN_HERE.com';
    const snap = await db.collection('products').get();
    const staticUrls = [{ loc: domain + '/index.html', priority: '1.0' }];
    const productUrls = snap.docs.map(d => ({ loc: domain + '/product.html?id=' + d.id, priority: '0.8' }));
    const urls = staticUrls.concat(productUrls);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => '  <url><loc>' + u.loc + '</loc><priority>' + u.priority + '</priority></url>').join('\n') +
      '\n</urlset>';
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xml);
  } catch (err) {
    console.error('Sitemap generation failed', err);
    res.status(500).send('Sitemap generation failed');
  }
};
