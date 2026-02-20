-- ========================================
-- Quality Control Module Migration
-- ========================================

-- 1. quality_check_schedules — расписание проверок по объектам
CREATE TABLE IF NOT EXISTS quality_check_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Mon, 7=Sun
  frequency_weeks INT NOT NULL DEFAULT 1 CHECK (frequency_weeks IN (1, 2, 3, 4)),
  last_check_date DATE,
  manager_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. quality_checks — результаты проверок
CREATE TABLE IF NOT EXISTS quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  check_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  score_percentage INT NOT NULL CHECK (score_percentage BETWEEN 0 AND 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. quality_check_items — пункты чек-листа проверки
CREATE TABLE IF NOT EXISTS quality_check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES quality_checks(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  is_passed BOOLEAN NOT NULL DEFAULT false
);

-- 4. worker_points_log — лог начисления/списания баллов
CREATE TABLE IF NOT EXISTS worker_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  check_id UUID REFERENCES quality_checks(id) ON DELETE SET NULL,
  points_change INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Добавить total_points в workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS total_points INT NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workers_total_points_non_negative'
  ) THEN
    ALTER TABLE workers ADD CONSTRAINT workers_total_points_non_negative CHECK (total_points >= 0);
  END IF;
END $$;

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX IF NOT EXISTS idx_quality_checks_object ON quality_checks(object_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_manager ON quality_checks(manager_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_date ON quality_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_quality_check_items_check ON quality_check_items(check_id);
CREATE INDEX IF NOT EXISTS idx_worker_points_log_worker ON worker_points_log(worker_id);
CREATE INDEX IF NOT EXISTS idx_quality_check_schedules_object ON quality_check_schedules(object_id);

-- ========================================
-- RLS POLICIES
-- ========================================

-- quality_check_schedules
ALTER TABLE quality_check_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view schedules" ON quality_check_schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage schedules" ON quality_check_schedules
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

-- quality_checks
ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view checks" ON quality_checks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage checks" ON quality_checks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

-- quality_check_items
ALTER TABLE quality_check_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view check items" ON quality_check_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage check items" ON quality_check_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

-- worker_points_log
ALTER TABLE worker_points_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view points log" ON worker_points_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage points log" ON worker_points_log
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );
