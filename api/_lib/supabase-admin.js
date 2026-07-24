// Shared Supabase Admin (service_role) client for all /api serverless
// functions. The service_role key bypasses Row Level Security entirely —
// it must NEVER be sent to the browser, only used here on the server.
const { createClient } = require('@supabase/supabase-js');

let client = null;
function getAdminClient() {
  if (client) return client;
  client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  return client;
}

module.exports = { getAdminClient };
