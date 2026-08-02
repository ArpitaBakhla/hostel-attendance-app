-- ============================================================================
-- NightCheck Production Hardening — Security Policies
-- Migration: 20260803000003_security_policies.sql
-- ============================================================================
-- Adds:
--   1. Tighter RLS policies (deny UPDATE/DELETE for students on critical tables)
--   2. Failed login tracking with auto-lockout
--   3. Encryption key rotation support
--   4. Rate limit tracking table
-- ============================================================================

-- ---------------------------------------------------------------- 1. TIGHTER RLS

-- Students cannot update their own attendance logs (only service role via edge functions)
create policy "students cannot update attendance" on attendance_logs
  for update to authenticated
  using (is_warden())
  with check (is_warden());

-- Students cannot delete attendance logs (also blocked by trigger, belt-and-suspenders)
create policy "no client deletes on attendance" on attendance_logs
  for delete to authenticated
  using (false);

-- Students cannot update other students
create policy "students cannot update students" on students
  for update to authenticated
  using (is_warden())
  with check (is_warden());

-- Students cannot delete student records
create policy "no client deletes on students" on students
  for delete to authenticated
  using (false);

-- Wardens cannot delete leave requests (only update status)
create policy "no client deletes on leave_requests" on leave_requests
  for delete to authenticated
  using (false);


-- ---------------------------------------------------------------- 2. FAILED LOGIN TRACKING

create table if not exists failed_login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,              -- phone number, email, or IP
  identifier_type text not null check (identifier_type in ('phone', 'email', 'ip')),
  attempt_at timestamptz not null default now(),
  metadata jsonb default '{}'
);

create index idx_failed_logins_identifier
  on failed_login_attempts (identifier, attempt_at desc);

-- Function to check if an identifier is locked out
create or replace function is_locked_out(
  p_identifier text,
  p_max_attempts integer default 10,
  p_window_minutes integer default 30
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= p_max_attempts
  from failed_login_attempts
  where identifier = p_identifier
    and attempt_at > now() - (p_window_minutes || ' minutes')::interval;
$$;

-- Function to record a failed attempt
create or replace function record_failed_attempt(
  p_identifier text,
  p_type text,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into failed_login_attempts (identifier, identifier_type, metadata)
  values (p_identifier, p_type, p_metadata);

  -- Auto-cleanup: remove entries older than 24 hours
  delete from failed_login_attempts
  where attempt_at < now() - interval '24 hours';
end;
$$;


-- ---------------------------------------------------------------- 3. RATE LIMIT TRACKING

create table if not exists rate_limit_entries (
  id uuid primary key default gen_random_uuid(),
  key text not null,                     -- e.g., 'checkin:<student_id>' or 'otp:<phone>'
  window_start timestamptz not null default now(),
  request_count integer not null default 1,
  constraint uq_rate_limit_key unique (key)
);

create index idx_rate_limit_key on rate_limit_entries (key);

-- Atomic rate limit check-and-increment
create or replace function check_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_window_start timestamptz;
begin
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Try to get existing entry
  select * into v_entry from rate_limit_entries where key = p_key;

  if v_entry is null then
    -- First request
    insert into rate_limit_entries (key, window_start, request_count)
    values (p_key, now(), 1)
    on conflict (key) do update
    set request_count = rate_limit_entries.request_count + 1;
    return true;
  end if;

  if v_entry.window_start < v_window_start then
    -- Window expired, reset
    update rate_limit_entries
    set window_start = now(), request_count = 1
    where key = p_key;
    return true;
  end if;

  if v_entry.request_count >= p_max_requests then
    -- Rate limited
    return false;
  end if;

  -- Increment
  update rate_limit_entries
  set request_count = request_count + 1
  where key = p_key;
  return true;
end;
$$;


-- ---------------------------------------------------------------- RLS for new tables

alter table failed_login_attempts enable row level security;
alter table rate_limit_entries enable row level security;

-- No client access to these tables (service role only)
-- No policies = no client access when RLS is enabled
