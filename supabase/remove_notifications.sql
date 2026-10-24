-- Remove legacy StudyFlow notification tables.
-- Run manually in Supabase only if these objects exist in your project.
-- The tasks.notify_me preference column is retained for per-task reminder settings.
DROP TABLE IF EXISTS public.push_notifications CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.email_notifications CASCADE;
