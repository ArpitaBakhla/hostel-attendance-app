-- Fix table-level grants for authenticated and anon roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure is_warden is security definer
create or replace function is_warden()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_profile_role() in ('warden', 'super_admin'), false);
$$;
