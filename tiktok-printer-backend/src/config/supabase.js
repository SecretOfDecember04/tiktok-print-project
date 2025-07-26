const { createClient } = require('@supabase/supabase-js');

let supabase;

function initializeSupabase() {
  if (supabase) return supabase;

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  return supabase;
}

function getSupabase() {
  if (!supabase) initializeSupabase();
  return supabase;
}

module.exports = {
  initializeSupabase,
  getSupabase
};