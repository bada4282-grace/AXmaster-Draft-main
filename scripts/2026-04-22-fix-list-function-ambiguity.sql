-- ============================================================
-- 2026-04-22 list_pending_paid_requests 모호성 수정
-- 문제: RETURNS TABLE(user_id uuid, ...) 의 출력 파라미터와
--       IF 체크 내 컬럼 user_id 가 충돌 → "column reference user_id is ambiguous"
-- 해결: admin 판정을 public.current_user_is_admin() 헬퍼로 분리
--       (선행: 2026-04-22-fix-admin-rls-recursion.sql 실행되어 헬퍼 존재)
-- 함께 정리: approve/reject 함수도 동일 헬퍼를 쓰도록 통일
-- ============================================================

create or replace function public.approve_paid_request(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_approve$
begin
  if not public.current_user_is_admin() then
    raise exception 'only admins can approve paid requests';
  end if;

  update public.user_profiles
  set tier = 'paid',
      tier_request = null,
      requested_at = null,
      updated_at = now()
  where user_id = target_user_id;
end;
$fn_approve$;

create or replace function public.reject_paid_request(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_reject$
begin
  if not public.current_user_is_admin() then
    raise exception 'only admins can reject paid requests';
  end if;

  update public.user_profiles
  set tier_request = null,
      requested_at = null,
      updated_at = now()
  where user_id = target_user_id;
end;
$fn_reject$;

create or replace function public.list_pending_paid_requests()
returns table (
  user_id uuid,
  requested_at timestamptz,
  name text,
  username text,
  email text
)
language plpgsql
security definer
set search_path = public
as $fn_list$
begin
  if not public.current_user_is_admin() then
    raise exception 'only admins can list paid requests';
  end if;

  return query
  select
    up.user_id,
    up.requested_at,
    (au.raw_user_meta_data->>'name')::text as name,
    (au.raw_user_meta_data->>'username')::text as username,
    (au.raw_user_meta_data->>'email')::text as email
  from public.user_profiles up
  join auth.users au on au.id = up.user_id
  where up.tier_request = 'paid'
  order by up.requested_at asc nulls last;
end;
$fn_list$;
