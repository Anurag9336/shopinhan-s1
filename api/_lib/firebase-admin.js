// Shared Firebase Admin init for all /api serverless functions.
// Vercel reuses warm lambda instances, so we guard against re-initializing
// on every request (admin.apps.length check).
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars store the key with literal "\n" — convert back to
      // real newlines, otherwise the private key won't parse.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
  return admin;
}

module.exports = { initAdmin };
