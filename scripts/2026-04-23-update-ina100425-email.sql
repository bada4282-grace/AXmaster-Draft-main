-- ============================================================
-- 2026-04-23 ina100425 이메일 개별 수정
-- auth.users.email 과 user_metadata.email 을 ina100425@naver.com 으로 통일.
-- ============================================================

update auth.users
set email = 'ina100425@naver.com',
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{email}',
      to_jsonb('ina100425@naver.com'::text)
    )
where raw_user_meta_data->>'username' = 'ina100425';

-- 결과 확인 (원하면 실행)
-- select email, raw_user_meta_data->>'username' as username, raw_user_meta_data->>'email' as meta_email
-- from auth.users
-- where raw_user_meta_data->>'username' = 'ina100425';
