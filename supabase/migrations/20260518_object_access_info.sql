-- ========================================
-- Object access info: instructions + codes
-- ========================================
-- Free-form instructions on how to enter the building (e.g. "Звонок
-- «Управляющий», лифт направо, 3 этаж") plus a structured list of
-- codes (entrance / floor / specific door / KeyBox) so the office can
-- update them once and the worker / client always sees the latest.
--
-- access_codes is a JSONB array of:
--   { label: string, value: string, note?: string }
-- Example:
--   [
--     { "label": "Подъезд 1", "value": "1234" },
--     { "label": "3 этаж — дверь B",  "value": "0000A", "note": "только до 22:00" }
--   ]
-- ========================================

ALTER TABLE cleaning_objects
  ADD COLUMN IF NOT EXISTS access_instructions TEXT,
  ADD COLUMN IF NOT EXISTS access_codes JSONB NOT NULL DEFAULT '[]'::jsonb;
