const { getSupabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');

async function registerUser({ email, password, fullName }) {
  const supabase = getSupabase();

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new Error('user already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      email,
      password: hashedPassword,
      full_name: fullName,
      subscription_status: 'trial',
      subscription_expires_at: new Date(Date.now() + 3 * 86400000),
    })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

async function loginUser({ email, password }) {
  const supabase = getSupabase();

  const { data: user, error } = await supabase
    .from('users')
    .select('email, password')
    .eq('email', email)
    .single();

  if (error || !user) throw new Error('invalid credentials');

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('invalid credentials');

  return user;
}

module.exports = {
  registerUser,
  loginUser,
};