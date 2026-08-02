-- ============================================================================
-- NightCheck Production Hardening — Backup Infrastructure
-- Migration: 20260803000002_backup_infrastructure.sql
-- ============================================================================
-- Creates tables and functions for application-level backup management.
-- Works on any Supabase plan tier (Free, Pro).
-- ============================================================================

-- ---------------------------------------------------------------- BACKUP MANIFESTS
-- Records when backups ran, what was captured, and whether they succeeded.

create table if not exists backup_manifests (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null check (backup_type in ('daily_snapshot', 'manual', 'pre_migration')),
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  row_counts jsonb not null default '{}',   -- { "attendance_logs": 1234, "students": 500 }
  checksum text,                            -- MD5 of the serialised snapshot
  error_message text,
  triggered_by text default 'system',       -- 'system', 'warden:<id>', 'cron'
  metadata jsonb default '{}'
);

create index idx_backup_manifests_type_date
  on backup_manifests (backup_type, started_at desc);


-- ---------------------------------------------------------------- BACKUP SNAPSHOTS
-- Stores JSON snapshots of critical table data, partitioned by date.
-- Each snapshot is a self-contained, verifiable copy of the day's data.

create table if not exists backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references backup_manifests (id) on delete cascade,
  table_name text not null,
  snapshot_date date not null,
  row_count integer not null,
  data jsonb not null,
  checksum text not null,                   -- MD5 of the data column
  created_at timestamptz not null default now()
);

create index idx_backup_snapshots_manifest
  on backup_snapshots (manifest_id);
create index idx_backup_snapshots_table_date
  on backup_snapshots (table_name, snapshot_date desc);


-- ---------------------------------------------------------------- SNAPSHOT FUNCTION
-- Creates a point-in-time backup of today's attendance data + student roster.

create or replace function create_daily_snapshot(p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manifest_id uuid;
  v_att_data jsonb;
  v_student_data jsonb;
  v_att_count integer;
  v_student_count integer;
  v_att_checksum text;
  v_student_checksum text;
begin
  -- Create manifest
  insert into backup_manifests (backup_type, status, triggered_by)
  values ('daily_snapshot', 'running', 'system')
  returning id into v_manifest_id;

  -- Snapshot attendance logs for the given date
  select
    coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb),
    count(*)
  into v_att_data, v_att_count
  from attendance_logs a
  where a.log_date = p_date;

  v_att_checksum := md5(v_att_data::text);

  insert into backup_snapshots (manifest_id, table_name, snapshot_date, row_count, data, checksum)
  values (v_manifest_id, 'attendance_logs', p_date, v_att_count, v_att_data, v_att_checksum);

  -- Snapshot all students (full roster for integrity verification)
  select
    coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb),
    count(*)
  into v_student_data, v_student_count
  from students s;

  v_student_checksum := md5(v_student_data::text);

  insert into backup_snapshots (manifest_id, table_name, snapshot_date, row_count, data, checksum)
  values (v_manifest_id, 'students', p_date, v_student_count, v_student_data, v_student_checksum);

  -- Complete manifest
  update backup_manifests
  set
    status = 'completed',
    completed_at = now(),
    row_counts = jsonb_build_object(
      'attendance_logs', v_att_count,
      'students', v_student_count
    ),
    checksum = md5(v_att_checksum || v_student_checksum)
  where id = v_manifest_id;

  return v_manifest_id;

exception when others then
  -- Record failure
  update backup_manifests
  set status = 'failed', completed_at = now(), error_message = SQLERRM
  where id = v_manifest_id;

  raise;
end;
$$;


-- ---------------------------------------------------------------- VERIFICATION FUNCTION
-- Verifies a backup snapshot's integrity by recomputing checksums.

create or replace function verify_backup(p_manifest_id uuid)
returns table (
  table_name text,
  stored_checksum text,
  computed_checksum text,
  is_valid boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      s.table_name,
      s.checksum as stored_checksum,
      md5(s.data::text) as computed_checksum,
      s.checksum = md5(s.data::text) as is_valid
    from backup_snapshots s
    where s.manifest_id = p_manifest_id;
end;
$$;


-- ---------------------------------------------------------------- CLEANUP FUNCTION
-- Removes backup snapshots older than a retention period (default 90 days).

create or replace function cleanup_old_backups(retention_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with deleted_manifests as (
    delete from backup_manifests
    where started_at < now() - (retention_days || ' days')::interval
      and status in ('completed', 'failed')
    returning id
  )
  select count(*) into v_deleted from deleted_manifests;

  return v_deleted;
end;
$$;


-- ---------------------------------------------------------------- RLS
alter table backup_manifests enable row level security;
alter table backup_snapshots enable row level security;

-- Only wardens can view backup status
create policy "wardens can read backup manifests" on backup_manifests
  for select to authenticated using (is_warden());

create policy "wardens can read backup snapshots" on backup_snapshots
  for select to authenticated using (is_warden());
