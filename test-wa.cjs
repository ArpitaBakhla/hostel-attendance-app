const { createClient } = require('@supabase/supabase-js');
const URL = 'https://pmzuuzbhfgtoaazqrysc.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtenV1emJoZmd0b2FhenFyeXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NzYzNjksImV4cCI6MjEwMTM1MjM2OX0.iZj2GTpVKc0nMoU3Mbuo_fBEUumdURbo1QAqV0eU43E';
const supabase = createClient(URL, KEY);
async function run() {
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: 'warden123@example.com',
    password: 'password123'
  });
  const token = auth.session.access_token;

  // Let's first make the user a student temporarily if we need to? 
  // No, warden-action can't act as a student. Let's just pass the token to webauthn-register and see the RP ID.
  const res = await fetch(URL + '/functions/v1/webauthn-register', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({ step: 'options' })
  });
  console.log(await res.json());
}
run();
