-- NightCheck core schema.
-- All attendance writes go through edge functions running with the service role;
-- RLS below only grants clients read access plus the request rows they own.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type attendance_status as enum ('success', 'failed', 'manual_override', 'on_leave');
create type request_status as enum ('pending', 'approved', 'rejected');
create type otp_purpose as enum (
  'registration',
  'login',
  'tier1_self_report',
  'tier2_secondary_contact',
  'device_change'
);
create type malfunction_tier as enum ('tier1', 'tier2', 'tier3');

-- ---------------------------------------------------------------- tables

create table hostel_center (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null default 100,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  hostel_id uuid not null references hostel_center (id) on delete cascade,
  role text not null check (role in ('student', 'warden', 'super_admin')),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  hostel_id uuid not null references hostel_center (id) on delete cascade,
  name text not null,
  room_no text not null,
  roll_number text not null,
  phone_number text not null,
  secondary_contact_number text,
  registered_device_id text,
  webauthn_credential_id text,
  webauthn_public_key text,
  webauthn_counter bigint not null default 0,
  phone_verified boolean not null default false,
  override_count integer not null default 0,
  onboarded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (hostel_id, roll_number),
  unique (hostel_id, phone_number)
);

create table attendance_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  hostel_id uuid not null references hostel_center (id) on delete cascade,
  -- the night this log belongs to, in hostel local time
  log_date date not null,
  timestamp timestamptz not null default now(),
  gps_lat double precision,
  gps_lng double precision,
  status attendance_status not null,
  fail_reason text,
  marked_by uuid references profiles (id) on delete set null,
  unique (student_id, log_date)
);

create index attendance_logs_hostel_date_idx on attendance_logs (hostel_id, log_date);

create table device_change_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  hostel_id uuid not null references hostel_center (id) on delete cascade,
  otp_verified boolean not null default false,
  otp_sent_to text,
  old_device_id text,
  new_device_id text,
  reason text not null,
  status request_status not null default 'pending',
  warden_id uuid references profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  hostel_id uuid not null references hostel_center (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null,
  status request_status not null default 'pending',
  is_retroactive boolean not null default false,
  submitted_at timestamptz not null default now(),
  warden_id uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  check (end_date >= start_date)
);

create index leave_requests_student_range_idx on leave_requests (student_id, start_date, end_date);

-- Tier 1/2/3 device malfunction reports awaiting warden action.
create table malfunction_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  hostel_id uuid not null references hostel_center (id) on delete cascade,
  report_date date not null,
  tier malfunction_tier not null,
  reason text not null,
  -- tier 1/2 only: which number the OTP went to, and whether it was verified
  otp_verified boolean not null default false,
  otp_sent_to text,
  -- tier 3 only: the floor-mate who verbally informed the warden
  reported_by_student_id uuid references students (id) on delete set null,
  status request_status not null default 'pending',
  warden_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  -- a third party may only ever raise a tier 3 report, and tier 3 can never
  -- carry an OTP: physical verification by the warden is the only evidence
  check (
    (tier = 'tier3' and otp_verified = false and otp_sent_to is null)
    or (tier <> 'tier3' and reported_by_student_id is null)
  )
);

create index malfunction_reports_queue_idx on malfunction_reports (hostel_id, status, report_date);

create table otp_challenges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  purpose otp_purpose not null,
  sent_to text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index otp_challenges_lookup_idx on otp_challenges (student_id, purpose, created_at desc);

-- Server-issued WebAuthn challenges; consumed exactly once by the verify step.
create table webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  challenge text not null,
  kind text not null check (kind in ('registration', 'authentication')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index webauthn_challenges_lookup_idx on webauthn_challenges (student_id, kind, created_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from students where user_id = auth.uid();
$$;

create or replace function is_warden()
returns boolean
language sql
stable
as $$
  select coalesce(current_profile_role() in ('warden', 'super_admin'), false);
$$;

-- Great-circle distance in metres.
create or replace function haversine_meters(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    )
  );
$$;

-- ---------------------------------------------------------------- RLS

alter table hostel_center enable row level security;
alter table profiles enable row level security;
alter table students enable row level security;
alter table attendance_logs enable row level security;
alter table device_change_requests enable row level security;
alter table leave_requests enable row level security;
alter table malfunction_reports enable row level security;
alter table otp_challenges enable row level security;
alter table webauthn_challenges enable row level security;

create policy "authenticated can read hostel" on hostel_center
  for select to authenticated using (true);

create policy "own profile readable" on profiles
  for select to authenticated using (id = auth.uid() or is_warden());

create policy "students readable by self and wardens" on students
  for select to authenticated using (user_id = auth.uid() or is_warden());

create policy "attendance readable by self and wardens" on attendance_logs
  for select to authenticated using (student_id = current_student_id() or is_warden());

create policy "leave readable by self and wardens" on leave_requests
  for select to authenticated using (student_id = current_student_id() or is_warden());

-- Students may submit their own leave requests; only edge functions (service
-- role) may decide them, so there is no update policy for students.
create policy "students submit own leave" on leave_requests
  for insert to authenticated
  with check (student_id = current_student_id() and status = 'pending');

create policy "device changes readable by self and wardens" on device_change_requests
  for select to authenticated using (student_id = current_student_id() or is_warden());

create policy "malfunction reports readable by self and wardens" on malfunction_reports
  for select to authenticated using (student_id = current_student_id() or is_warden());

-- otp_challenges and webauthn_challenges are service-role only: no policies, so
-- no client can read codes or replay challenges.

-- ---------------------------------------------------------------- seed

insert into hostel_center (name, center_lat, center_lng, radius_meters, timezone)
values ('Block A — Girls Hostel', 28.6139, 77.2090, 100, 'Asia/Kolkata');
