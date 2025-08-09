const { getSupabase } = require('../config/supabase');

async function syncFirebaseUser({ uid, email, fullName }) {
  const supabase = getSupabase();

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('firebase_uid', uid)
    .single();

  if (existingUser) return existingUser;

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      firebase_uid: uid,
      email,
      full_name: fullName,
      subscription_status: 'trial',
      subscription_expires_at: new Date(Date.now() + 3 * 86400000)
    })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

module.exports = { syncFirebaseUser };