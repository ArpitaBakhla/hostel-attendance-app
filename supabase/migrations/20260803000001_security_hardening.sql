-- ============================================================================
-- NightCheck Production Hardening — Security & Integrity
-- Migration: 20260803000001_security_hardening.sql
-- ============================================================================
-- Adds:
--   1. Row-level integrity checksums on attendance_logs and students
--   2. Optimistic concurrency control (version columns)
--   3. Full audit trail with triggers
--   4. Immutable attendance log protection
--   5. Constraint tightening (GPS, NOT NULL, CHECK)
--   6. Performance indexes
--   7. PII encryption columns
-- ============================================================================

-- ---------------------------------------------------------------- 1. CHECKSUMS
-- Trigger-based checksums that compute an MD5 over critical fields on every
-- INSERT and UPDATE. Using triggers instead of generated columns because
-- PostgreSQL requires generated-column expressions to be IMMUTABLE, but
-- uuid::text and timestamptz::text casts are only STABLE.

alter table attendance_logs
  add column if not exists row_checksum text;

alter table students
  add column if not exists row_checksum text;

-- Trigger function: compute checksum for attendance_logs
create or replace function compute_attendance_checksum()
returns trigger
language plpgsql
as $$
begin
  NEW.row_checksum := md5(
    coalesce(NEW.student_id::text, '') || '|' ||
    coalesce(NEW.hostel_id::text, '') || '|' ||
    coalesce(NEW.log_date::text, '') || '|' ||
    coalesce(NEW.status::text, '') || '|' ||
    coalesce(NEW.fail_reason, '') || '|' ||
    coalesce(NEW.timestamp::text, '')
  );
  return NEW;
end;
$$;

create trigger trg_attendance_checksum
  before insert or update on attendance_logs
  for each row execute function compute_attendance_checksum();

-- Trigger function: compute checksum for students
create or replace function compute_student_checksum()
returns trigger
language plpgsql
as $$
begin
  NEW.row_checksum := md5(
    coalesce(NEW.id::text, '') || '|' ||
    coalesce(NEW.name, '') || '|' ||
    coalesce(NEW.roll_number, '') || '|' ||
    coalesce(NEW.phone_number, '') || '|' ||
    coalesce(NEW.registered_device_id, '') || '|' ||
    coalesce(NEW.webauthn_credential_id, '')
  );
  return NEW;
end;
$$;

create trigger trg_student_checksum
  before insert or update on students
  for each row execute function compute_student_checksum();


-- ---------------------------------------------------------------- 2. OPTIMISTIC CONCURRENCY
-- Every update MUST supply `WHERE version = <expected>` to prevent lost updates
-- during concurrent operations (e.g., two wardens acting on the same student).

alter table students
  add column if not exists version integer not null default 1;

alter table attendance_logs
  add column if not exists version integer not null default 1;

alter table leave_requests
  add column if not exists version integer not null default 1;

alter table device_change_requests
  add column if not exists version integer not null default 1;

alter table malfunction_reports
  add column if not exists version integer not null default 1;

-- Auto-increment version on every update via trigger
create or replace function increment_version()
returns trigger
language plpgsql
as $$
begin
  NEW.version := OLD.version + 1;
  return NEW;
end;
$$;

create trigger trg_students_version
  before update on students
  for each row execute function increment_version();

create trigger trg_attendance_logs_version
  before update on attendance_logs
  for each row execute function increment_version();

create trigger trg_leave_requests_version
  before update on leave_requests
  for each row execute function increment_version();

create trigger trg_device_change_requests_version
  before update on device_change_requests
  for each row execute function increment_version();

create trigger trg_malfunction_reports_version
  before update on malfunction_reports
  for each row execute function increment_version();


-- ---------------------------------------------------------------- 3. AUDIT TRAIL
-- Captures every mutation on critical tables. The audit_log is append-only;
-- application code should never UPDATE or DELETE from it.

create table if not exists audit_log (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_value jsonb,
  new_value jsonb,
  changed_by text,   -- auth.uid() or 'service_role'
  changed_at timestamptz not null default now(),
  ip_address text,
  metadata jsonb
);

create index audit_log_table_row_idx on audit_log (table_name, row_id);
create index audit_log_changed_at_idx on audit_log (changed_at desc);

-- Generic audit trigger function
create or replace function audit_trigger_func()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _old jsonb := null;
  _new jsonb := null;
  _row_id text;
  _user text;
begin
  _user := coalesce(current_setting('request.jwt.claim.sub', true), 'service_role');

  if TG_OP = 'DELETE' then
    _old := to_jsonb(OLD);
    _row_id := OLD.id::text;
  elsif TG_OP = 'INSERT' then
    _new := to_jsonb(NEW);
    _row_id := NEW.id::text;
  else -- UPDATE
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _row_id := NEW.id::text;
  end if;

  insert into audit_log (table_name, row_id, action, old_value, new_value, changed_by)
  values (TG_TABLE_NAME, _row_id, TG_OP, _old, _new, _user);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- Attach audit triggers to critical tables
create trigger audit_students
  after insert or update or delete on students
  for each row execute function audit_trigger_func();

create trigger audit_attendance_logs
  after insert or update or delete on attendance_logs
  for each row execute function audit_trigger_func();

create trigger audit_leave_requests
  after insert or update or delete on leave_requests
  for each row execute function audit_trigger_func();

create trigger audit_device_change_requests
  after insert or update or delete on device_change_requests
  for each row execute function audit_trigger_func();

create trigger audit_malfunction_reports
  after insert or update or delete on malfunction_reports
  for each row execute function audit_trigger_func();


-- ---------------------------------------------------------------- 4. IMMUTABLE ATTENDANCE LOGS
-- Prevent hard DELETE on attendance_logs. Records can only be overwritten via
-- UPSERT (which is an UPDATE under the hood), preserving the full audit trail.

create or replace function prevent_attendance_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Attendance logs cannot be deleted. Use upsert to overwrite.';
end;
$$;

create trigger trg_attendance_no_delete
  before delete on attendance_logs
  for each row execute function prevent_attendance_delete();


-- ---------------------------------------------------------------- 5. CONSTRAINT TIGHTENING

-- GPS coordinate validation
alter table attendance_logs
  add constraint chk_gps_lat check (gps_lat is null or (gps_lat between -90 and 90)),
  add constraint chk_gps_lng check (gps_lng is null or (gps_lng between -180 and 180));

alter table hostel_center
  add constraint chk_center_lat check (center_lat between -90 and 90),
  add constraint chk_center_lng check (center_lng between -180 and 180),
  add constraint chk_radius check (radius_meters > 0 and radius_meters <= 10000);

-- Phone number format (basic: at least 10 chars)
alter table students
  add constraint chk_phone_length check (length(phone_number) >= 10);

-- Roll number non-empty
alter table students
  add constraint chk_roll_number_nonempty check (length(trim(roll_number)) > 0);


-- ---------------------------------------------------------------- 6. PERFORMANCE INDEXES

-- Dashboard aggregation: status counts for a hostel on a given date
create index if not exists idx_attendance_hostel_date_status
  on attendance_logs (hostel_id, log_date, status);

-- Audit log: lookup by table + time range
create index if not exists idx_audit_log_table_time
  on audit_log (table_name, changed_at desc);

-- Students: lookup by phone for dedup
create index if not exists idx_students_phone
  on students (phone_number);

-- Leave requests: warden pending queue
create index if not exists idx_leave_pending
  on leave_requests (hostel_id, status) where status = 'pending';


-- ---------------------------------------------------------------- 7. PII ENCRYPTION COLUMNS
-- These will store AES-256-GCM encrypted versions of sensitive fields.
-- The plaintext columns remain for backward compatibility during migration.

alter table students
  add column if not exists encrypted_phone text,
  add column if not exists encrypted_name text,
  add column if not exists encryption_key_id text default 'v1';

alter table profiles
  add column if not exists encrypted_email text,
  add column if not exists encrypted_phone text,
  add column if not exists encryption_key_id text default 'v1';


-- ---------------------------------------------------------------- RLS for audit_log
-- Audit logs are read-only for wardens, no client writes
alter table audit_log enable row level security;

create policy "wardens can read audit log" on audit_log
  for select to authenticated using (is_warden());
