-- ========================================
-- DIAGNOSE & FIX: Guardian Reassignment
-- Previous guardian: maryna.yermak@reefa.pl
-- New guardian: ilya.fridman@reefa.pl
-- ========================================
-- Run each section separately in Supabase SQL Editor

-- ============ STEP 1: DIAGNOSIS ============

-- 1a. Show both admin records
SELECT '=== ADMIN RECORDS ===' as info;
SELECT id, email, name, telegram_chat_id, role
FROM admin_users
WHERE email IN ('ilya.fridman@reefa.pl', 'maryna.yermak@reefa.pl');

-- 1b. Show ALL object_owners for objects named Złota
SELECT '=== OBJECT OWNERS FOR ZŁOTA ===' as info;
SELECT oo.id as owner_record_id, co.name as object_name, au.email, au.name, au.telegram_chat_id
FROM object_owners oo
JOIN cleaning_objects co ON oo.object_id = co.id
JOIN admin_users au ON oo.admin_id = au.id
WHERE co.name ILIKE '%Złota%';

-- 1c. Show ALL objects where Maryna is still owner
SELECT '=== ALL OBJECTS WHERE MARYNA IS OWNER ===' as info;
SELECT oo.id as owner_record_id, co.id as object_id, co.name as object_name, au.email
FROM object_owners oo
JOIN cleaning_objects co ON oo.object_id = co.id
JOIN admin_users au ON oo.admin_id = au.id
WHERE au.email = 'maryna.yermak@reefa.pl';

-- 1d. Show ALL objects where Maryna is created_by (legacy field)
SELECT '=== OBJECTS WHERE created_by = MARYNA ===' as info;
SELECT co.id, co.name, co.created_by, au.email as creator_email
FROM cleaning_objects co
LEFT JOIN admin_users au ON co.created_by = au.id
WHERE au.email = 'maryna.yermak@reefa.pl';

-- 1e. Show workers where created_by = Maryna (including Ольга)
SELECT '=== WORKERS WHERE created_by = MARYNA ===' as info;
SELECT w.id, w.first_name, w.last_name, w.created_by, au.email as creator_email
FROM workers w
LEFT JOIN admin_users au ON w.created_by = au.id
WHERE au.email = 'maryna.yermak@reefa.pl';

-- 1f. Test RPC for Złota
SELECT '=== RPC RESULT FOR ZŁOTA ===' as info;
SELECT * FROM get_object_owners_with_chat_ids(
  (SELECT id FROM cleaning_objects WHERE name ILIKE '%Złota%' LIMIT 1)
);


-- ============ STEP 2: FIX (run AFTER reviewing Step 1) ============
-- Uncomment lines below after confirming the diagnosis

-- 2a. Replace Maryna with Ilya in object_owners for ALL affected objects
/*
DO $$
DECLARE
  ilya_id UUID;
  maryna_id UUID;
BEGIN
  SELECT id INTO ilya_id FROM admin_users WHERE email = 'ilya.fridman@reefa.pl';
  SELECT id INTO maryna_id FROM admin_users WHERE email = 'maryna.yermak@reefa.pl';

  IF ilya_id IS NULL THEN
    RAISE EXCEPTION 'Ilya not found in admin_users!';
  END IF;

  IF maryna_id IS NULL THEN
    RAISE NOTICE 'Maryna not found in admin_users, skipping object_owners cleanup';
    RETURN;
  END IF;

  -- Add Ilya as owner where Maryna was (skip if Ilya already exists)
  INSERT INTO object_owners (object_id, admin_id)
  SELECT oo.object_id, ilya_id
  FROM object_owners oo
  WHERE oo.admin_id = maryna_id
  ON CONFLICT (object_id, admin_id) DO NOTHING;

  -- Remove Maryna from all object_owners
  DELETE FROM object_owners WHERE admin_id = maryna_id;

  RAISE NOTICE 'object_owners migrated: Maryna -> Ilya';
END $$;
*/

-- 2b. Update workers where created_by = Maryna -> Ilya
/*
UPDATE workers
SET created_by = (SELECT id FROM admin_users WHERE email = 'ilya.fridman@reefa.pl')
WHERE created_by = (SELECT id FROM admin_users WHERE email = 'maryna.yermak@reefa.pl');
*/

-- 2c. Update cleaning_objects where created_by = Maryna -> Ilya (legacy field)
/*
UPDATE cleaning_objects
SET created_by = (SELECT id FROM admin_users WHERE email = 'ilya.fridman@reefa.pl')
WHERE created_by = (SELECT id FROM admin_users WHERE email = 'maryna.yermak@reefa.pl');
*/

-- ============ STEP 3: VERIFY FIX ============
-- Run after Step 2

-- 3a. Verify no Maryna leftovers
/*
SELECT 'Maryna in object_owners:' as check, COUNT(*) as count
FROM object_owners oo
JOIN admin_users au ON oo.admin_id = au.id
WHERE au.email = 'maryna.yermak@reefa.pl'
UNION ALL
SELECT 'Maryna in workers.created_by:', COUNT(*)
FROM workers w
JOIN admin_users au ON w.created_by = au.id
WHERE au.email = 'maryna.yermak@reefa.pl'
UNION ALL
SELECT 'Maryna in objects.created_by:', COUNT(*)
FROM cleaning_objects co
JOIN admin_users au ON co.created_by = au.id
WHERE au.email = 'maryna.yermak@reefa.pl';
*/

-- 3b. Verify RPC now returns Ilya for Złota
/*
SELECT * FROM get_object_owners_with_chat_ids(
  (SELECT id FROM cleaning_objects WHERE name ILIKE '%Złota%' LIMIT 1)
);
*/
