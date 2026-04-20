-- ============================================================
-- 2026-04-22 RLS 무한 재귀 수정
-- 문제: user_profiles_admin_read_all 정책이 본인 테이블을 재조회 → 무한 재귀
-- 해결: SECURITY DEFINER 함수로 is_admin 판정을 RLS 우회하여 수행
-- ============================================================

-- 1. 관리자 여부 판정 헬퍼 (RLS 우회)
create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $fn_is_admin$
  select coalesce(
    (select is_admin from public.user_profiles where user_id = auth.uid()),
    false
  );
$fn_is_admin$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

-- 2. 관리자 전체 조회 정책 재작성 (재귀 제거)
drop policy if exists "user_profiles_admin_read_all" on public.user_profiles;
create policy "user_profiles_admin_read_all"
  on public.user_profiles for select
  using (public.current_user_is_admin());
