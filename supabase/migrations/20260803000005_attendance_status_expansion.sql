-- Add new attendance statuses
ALTER TYPE attendance_status ADD VALUE 'absent';
ALTER TYPE attendance_status ADD VALUE 'late';
ALTER TYPE attendance_status ADD VALUE 'excused';

-- Add setting for students to hide their history locally on their device
ALTER TABLE students ADD COLUMN hide_history_local boolean NOT NULL DEFAULT false;
