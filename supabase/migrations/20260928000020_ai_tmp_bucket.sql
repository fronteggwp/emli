-- Временные фото для ИИ: функция кладёт снимок сюда и отдаёт модели подписанную ссылку на 10 минут
-- (крупные запросы из Supabase к агрегатору ИИ идут очень медленно, а ссылку провайдер скачивает сам).
-- Бакет приватный, клиенты доступа не имеют; файлы удаляются сразу после ответа модели.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-tmp', 'ai-tmp', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
