-- 1. Удаление дубликатов (если они есть)
-- Оставляем запись с ролью 'client', удаляем 'sub_admin', если email совпадает.
DELETE FROM public.admin_users a
USING public.admin_users b
WHERE a.email = b.email 
  AND a.id != b.id 
  AND a.role = 'sub_admin' 
  AND b.role = 'client';

-- 2. Обновление триггера создания пользователя
-- Предположим, ваша функция триггера называется handle_new_user.
-- Этот код перезапишет логику так, что она будет читать 'role' из user_metadata.
-- Если роль передана - триггер НЕ БУДЕТ создавать запись (это сделает Edge Function).
-- Если роль НЕ передана - триггер создаст запись по умолчанию.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  assigned_role text;
BEGIN
  -- Пытаемся достать роль из метаданных, куда мы её теперь передаём из Edge Function
  assigned_role := NEW.raw_user_meta_data->>'role';

  -- Если роль не передана (например, ручное создание в админке), задаем sub_admin
  IF assigned_role IS NULL THEN
    INSERT INTO public.admin_users (id, email, role, is_active)
    VALUES (NEW.id, NEW.email, 'sub_admin', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (Тут ничего больше делать не нужно, триггер on_auth_user_created автоматически
-- продолжит вызывать эту обновленную функцию handle_new_user).
