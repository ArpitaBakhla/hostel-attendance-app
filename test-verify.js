require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: '40d20554a12fa098f665873b6881ec13a70015af15859c1fba4ccb7b', type: 'email' });
  console.log('Data:', data);
  console.log('Error:', error);
}
run();
