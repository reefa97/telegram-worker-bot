-- Migration: Add client call reminders to cleaning_objects
-- Date: 2026-02-08

-- 1. Add columns for reminder settings
ALTER TABLE cleaning_objects 
ADD COLUMN IF NOT EXISTS reminder_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_frequency TEXT DEFAULT 'monthly' CHECK (reminder_frequency IN ('weekly', 'monthly', 'quarterly')),
ADD COLUMN IF NOT EXISTS reminder_assignee_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP WITH TIME ZONE;

-- 2. Update notification_type constraint
ALTER TABLE notifications_log DROP CONSTRAINT IF EXISTS notifications_log_notification_type_check;
ALTER TABLE notifications_log ADD CONSTRAINT notifications_log_notification_type_check 
CHECK (notification_type IN ('shift_reminder', 'forgotten_end', 'geofence_violation', 'client_call_reminder', 'late_alert'));

-- 3. Update RPC Function to Safely Create Objects (Bypassing RLS)
-- We redefine it again to include the reminder fields.
CREATE OR REPLACE FUNCTION create_object_secure(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_record cleaning_objects;
  v_created_by UUID;
BEGIN
  -- Determine creator: payload -> auth.uid() -> null
  v_created_by := (payload->>'created_by')::UUID;
  IF v_created_by IS NULL THEN
    v_created_by := auth.uid();
  END IF;

  INSERT INTO cleaning_objects (
    name, 
    address, 
    latitude, 
    longitude, 
    geofence_radius,
    salary_type, 
    hourly_rate, 
    monthly_rate, 
    expected_cleanings_per_month,
    requires_photos, 
    requires_tasks, 
    schedule_days, 
    schedule_time_start, 
    schedule_time_end,
    created_by,
    client_rate,
    client_phones,
    client_emails,
    reminder_active,
    reminder_frequency,
    reminder_assignee_id
  ) VALUES (
    payload->>'name',
    payload->>'address',
    COALESCE((payload->>'latitude')::FLOAT, 0),
    COALESCE((payload->>'longitude')::FLOAT, 0),
    COALESCE((payload->>'geofence_radius')::FLOAT, 100),
    COALESCE(payload->>'salary_type', 'hourly'),
    COALESCE((payload->>'hourly_rate')::NUMERIC, 0),
    COALESCE((payload->>'monthly_rate')::NUMERIC, 0),
    COALESCE((payload->>'expected_cleanings_per_month')::INTEGER, 20),
    COALESCE((payload->>'requires_photos')::BOOLEAN, false),
    COALESCE((payload->>'requires_tasks')::BOOLEAN, false),
    ARRAY(
      SELECT value::INTEGER 
      FROM jsonb_array_elements_text(COALESCE(payload->'schedule_days', '[]'::jsonb))
    ),
    COALESCE(payload->>'schedule_time_start', '09:00')::TIME,
    COALESCE(payload->>'schedule_time_end', '18:00')::TIME,
    v_created_by,
    COALESCE((payload->>'client_rate')::NUMERIC, 0),
    ARRAY(
      SELECT value::TEXT 
      FROM jsonb_array_elements_text(COALESCE(payload->'client_phones', '[]'::jsonb))
    ),
    ARRAY(
      SELECT value::TEXT 
      FROM jsonb_array_elements_text(COALESCE(payload->'client_emails', '[]'::jsonb))
    ),
    COALESCE((payload->>'reminder_active')::BOOLEAN, false),
    COALESCE(payload->>'reminder_frequency', 'monthly'),
    (payload->>'reminder_assignee_id')::UUID
  ) 
  RETURNING * INTO new_record;
  
  RETURN to_jsonb(new_record);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_object_secure(JSONB) TO authenticated;
