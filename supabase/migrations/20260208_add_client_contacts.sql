-- Migration: Add client contact fields to cleaning_objects
-- Date: 2026-02-08

-- 1. Add columns for multiple phones and emails
ALTER TABLE cleaning_objects 
ADD COLUMN IF NOT EXISTS client_phones TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS client_emails TEXT[] DEFAULT '{}';

-- 2. Update RPC Function to Safely Create Objects (Bypassing RLS)
-- We redefine it to include client_phones, client_emails, and client_rate.
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
    client_emails
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
    )
  ) 
  RETURNING * INTO new_record;
  
  RETURN to_jsonb(new_record);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_object_secure(JSONB) TO authenticated;
