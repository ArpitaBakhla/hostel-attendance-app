const URL = 'https://pmzuuzbhfgtoaazqrysc.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtenV1emJoZmd0b2FhenFyeXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NzYzNjksImV4cCI6MjEwMTM1MjM2OX0.iZj2GTpVKc0nMoU3Mbuo_fBEUumdURbo1QAqV0eU43E';
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(URL, KEY);
async function run() {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: 'eb6d7e8cd9cb521ad9a9fe58e7dfdaec0d0aec9c75895640a7b63eec', type: 'email' });
  if (error) {
    console.error('Verify error:', error);
    return;
  }
  const token = data.session.access_token;
  console.log('JWT:', token);

  // Now test querying profiles
  const p = await supabase.from('profiles').select('*').eq('id', data.user.id);
  console.log('Profiles:', p);
  
  // Test querying students
  const s = await supabase.from('students').select('*').eq('user_id', data.user.id);
  console.log('Students:', s);
}
run();
