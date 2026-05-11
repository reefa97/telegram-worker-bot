-- ========================================
-- Procedures (Procedury) — internal SOP library for the admin panel.
--
-- Goal: capture the recurring "how we actually do this" recipes that today
-- live in the founder's head — finding workers, handling missed shifts,
-- onboarding clients, etc. — so any admin can read them without asking.
--
-- Editable by super_admin via the panel UI; readable by any admin who has
-- the `procedures_view` permission flag (defaults to true, can be hidden
-- per sub-admin in the SubAdminsPanel).
-- ========================================

-- ── Procedures table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  -- One-line lead, shown on the card before the user opens the procedure.
  short_description TEXT,
  -- Steps stored as a JSONB array. Each item is:
  --   { type: 'step' | 'note' | 'warning' | 'tip', title?: string, body: string }
  -- This lets us evolve the schema (add new block types) without migrations.
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Slugs of other procedures this one references (rendered as inline links).
  related_procedure_slugs TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Manual ordering inside a category (lower = earlier).
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedures_category_order
  ON public.procedures(category, display_order);

-- Auto-bump updated_at on any row change.
CREATE OR REPLACE FUNCTION public.procedures_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procedures_touch ON public.procedures;
CREATE TRIGGER trg_procedures_touch
  BEFORE UPDATE ON public.procedures
  FOR EACH ROW EXECUTE FUNCTION public.procedures_touch_updated_at();

-- ── Attachments table ─────────────────────────────────────────────
-- Files (typically images) bound to a procedure. The actual binary lives
-- in the `procedures` storage bucket; this table tracks metadata + caption.
CREATE TABLE IF NOT EXISTS public.procedure_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  caption TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedure_attachments_proc
  ON public.procedure_attachments(procedure_id, display_order);

-- ── Storage bucket ────────────────────────────────────────────────
-- Public bucket so panel <img> tags work without signed URLs. Only super_admin
-- writes here (enforced in app code, not RLS, to match the rest of the panel).
INSERT INTO storage.buckets (id, name, public)
VALUES ('procedures', 'procedures', true)
ON CONFLICT (id) DO NOTHING;

-- ── Row-Level Security ────────────────────────────────────────────
-- Read: any authenticated admin user. App-level filtering by
--       `permissions.procedures_view` controls visibility in the UI.
-- Write: super_admin only (matches BlogPanel pattern).
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_select_authenticated ON public.procedures;
CREATE POLICY proc_select_authenticated ON public.procedures
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS proc_write_super_admin ON public.procedures;
CREATE POLICY proc_write_super_admin ON public.procedures
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS proc_attach_select_authenticated ON public.procedure_attachments;
CREATE POLICY proc_attach_select_authenticated ON public.procedure_attachments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS proc_attach_write_super_admin ON public.procedure_attachments;
CREATE POLICY proc_attach_write_super_admin ON public.procedure_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'));

-- ── Seed: 2 initial procedures ────────────────────────────────────
-- Founder's recipes: finding a worker (Facebook groups) and handling a
-- missed shift (penalty + client compensation + worker rotation).

INSERT INTO public.procedures (slug, title, category, short_description, steps, related_procedure_slugs, display_order)
VALUES
(
  'poisk-novogo-sotrudnika',
  'Поиск нового сотрудника',
  'hr',
  'Через группы «Работа [город]» в Facebook. От публикации объявления до первого контакта.',
  $$[
    {
      "type": "step",
      "title": "1. Найти группы поиска работы в Facebook",
      "body": "Заходишь в Facebook, в строке поиска вбиваешь «работа [город]» (например: «работа Краков», «praca Kraków», «работа Катовице»). Нужны польско- и русскоязычные группы — обычно это 5–15 активных групп на город. Вступаешь во все подряд."
    },
    {
      "type": "tip",
      "body": "Запросы во вступление в группы часто требуют ответить на вопросы или подождать одобрения админа. Подавай заявки во все сразу — пусть одобряют параллельно."
    },
    {
      "type": "step",
      "title": "2. Подготовить картинку для объявления",
      "body": "В этой процедуре есть прикреплённые картинки — скачай одну из них (вкладка «Файлы» внизу страницы). Если картинок нет или нужны новые — напиши super-admin, он загрузит. Картинка повышает охват поста в 2–3 раза против текста без визуала."
    },
    {
      "type": "step",
      "title": "3. Опубликовать объявление в каждой группе",
      "body": "Текст объявления (шаблон):\n\n«Работа [город], уборка [тип объекта], [адрес без номера дома], [частота: 3 раза в неделю / ежедневно], время с [HH:MM] до [HH:MM], оплата [сумма] zł в месяц. Заинтересованных прошу писать в личные сообщения.»\n\nПример: «Работа Краков, уборка офиса, ul. Pawia, 3 раза в неделю с 18:00 до 21:00, оплата 1 800 zł в месяц. Заинтересованных прошу писать в личные сообщения.»"
    },
    {
      "type": "warning",
      "body": "НЕ публикуй точный адрес с номером дома — это privacy для клиента и притягивает спам. Только улица + район/станция метро."
    },
    {
      "type": "step",
      "title": "4. Откликнувшимся — короткий скрининг в личке",
      "body": "Спрашиваешь: возраст, наличие документов на легальную работу в Польше, опыт уборки, ближайшая дата старта, готовность приехать на собеседование на объект. Если хотя бы по одному пункту «нет» — вежливо отказываешь и переходишь к следующему."
    },
    {
      "type": "step",
      "title": "5. Подтверждённых — на объект на пробную смену",
      "body": "Назначаешь встречу на объекте, показываешь фронт работ, делаешь первую совместную смену. По её итогам решаешь: брать или нет."
    },
    {
      "type": "note",
      "body": "Среднее время от первого поста до первой пробной смены — 2–4 дня. Если за неделю никто не откликнулся — обнови пост (удали и опубликуй заново) и расширь радиус (соседние города/районы)."
    }
  ]$$::jsonb,
  ARRAY[]::TEXT[],
  10
),
(
  'rabotnik-propustil-smenu',
  'Работник пропустил смену',
  'operations',
  'Что делаем когда работник не вышел: штраф, компенсация клиенту, отработка дня, ротация работника.',
  $$[
    {
      "type": "step",
      "title": "1. Штрафовать работника — 25% от месячной ставки на этом объекте",
      "body": "Сразу в день пропуска фиксируем штраф в его карточке: 25% от его месячной оплаты по этому объекту. Если объект на 1 800 zł в месяц — штраф 450 zł. Это вычет из ближайшей выплаты."
    },
    {
      "type": "step",
      "title": "2. Проверить, заметил ли клиент",
      "body": "Если клиент НЕ заметил (нет жалобы, нет сообщения в чате, нет звонка) — переходи к шагу 3. Если ЗАМЕТИЛ — нужно компенсировать."
    },
    {
      "type": "step",
      "title": "3. Компенсация клиенту — две опции на выбор",
      "body": "Опция A (по умолчанию): из ближайшей месячной фактуры вычитаем стоимость одной пропущенной уборки. Опция B (если клиент в плохом настроении или ценный): даём скидку до 10% от месячной фактуры. Скидка >10% требует согласования с super-admin."
    },
    {
      "type": "warning",
      "body": "НЕ предлагай клиенту выбор между опциями. Сначала молча применяем опцию A. Если клиент пишет «маловато» — тогда опция B."
    },
    {
      "type": "step",
      "title": "4. Отработать пропущенный день — другим днём",
      "body": "Договариваемся с клиентом о замещающей уборке в другой день этой же недели (предпочтительно) или ближайшей следующей. Назначаем туда другого работника или сами/координатора. Это убирает у клиента ощущение что он «потерял» уборку."
    },
    {
      "type": "step",
      "title": "5. Снять работника с этого объекта",
      "body": "Пропуск без уважительной причины = доверие к этому работнику на этом объекте утрачено. Снимаем его с объекта в системе (объекты → этот объект → работники → удалить). На другие объекты можно оставить, если репутация была чистая до этого."
    },
    {
      "type": "step",
      "title": "6. Запустить процедуру поиска нового работника",
      "body": "Следующая смена должна быть закрыта. Открываем процедуру «Поиск нового сотрудника» (см. ссылку ниже) и стартуем поиск немедленно — заодно потому что найти нового занимает 2–4 дня."
    },
    {
      "type": "note",
      "body": "Документируй каждый пропуск в карточке работника (дата + комментарий). Три пропуска за полгода = разговор о расставании."
    }
  ]$$::jsonb,
  ARRAY['poisk-novogo-sotrudnika']::TEXT[],
  20
)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.procedures IS
  'SOP library for the admin panel. Editable by super_admin, readable by all admins with procedures_view permission.';
