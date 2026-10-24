-- Run only if accounts were created while plaintext password storage was enabled.
-- Existing bcrypt hashes are left unchanged.
UPDATE public.users
SET password_hash = extensions.crypt(password_hash, extensions.gen_salt('bf', 10))
WHERE password_hash IS NOT NULL
  AND password_hash NOT LIKE '$2%';
