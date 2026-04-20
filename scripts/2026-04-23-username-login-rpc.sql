-- ============================================================
-- 2026-04-23 아이디(username) 로그인용 이메일 조회 RPC
-- lib/auth.ts 의 signIn 이 "@" 없는 입력(=아이디) 을 받으면 이 RPC 로 이메일을 조회한다.
-- SECURITY DEFINER 로 auth.users 를 직접 읽는다.
-- 멱등성: create or replace 사용.
-- ============================================================

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
