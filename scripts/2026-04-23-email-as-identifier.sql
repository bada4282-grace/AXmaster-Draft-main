-- ============================================================
-- 2026-04-23 실제 이메일을 Supabase 인증 식별자로 전환
-- 기존: auth.users.email = `{username}@kstat.app` (내부용 가짜 이메일)
-- 이후: auth.users.email = 사용자가 회원가입 시 입력한 실제 이메일
--
-- 동반 코드 변경: lib/auth.ts 의 signUp/signIn 재작성
-- (반드시 함께 배포. SQL 먼저 → 코드 반영 순서)
-- ============================================================

-- 1. 기존 유저의 auth.users.email 을 user_metadata.email (실제 이메일) 로 교체
--    - 실제 이메일이 비어있거나 null 인 행은 건드리지 않음 (기존 가짜 이메일 유지)
update auth.users
set email = (raw_user_meta_data->>'email')::text,
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email like '%@kstat.app'
  and nullif(raw_user_meta_data->>'email', '') is not null;

-- 2. username 으로 email 을 조회하는 RPC
--    로그인 시 아이디 → 이메일 변환에 사용. SECURITY DEFINER 로 auth.users 직접 읽기.
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $fn_email$
  select email::text from auth.users
  where raw_user_meta_data->>'username' = p_username
  limit 1;
$fn_email$;

revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- 결과 확인 (원하면 실행)
-- select email, raw_user_meta_data->>'username' as username
-- from auth.users
-- order by created_at desc;
