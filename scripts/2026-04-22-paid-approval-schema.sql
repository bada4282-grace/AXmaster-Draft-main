-- ============================================================
-- 2026-04-22 유료 회원 신청·관리자 승인 스키마
-- 선행: 2026-04-20-user-tier-schema.sql 이 먼저 실행되어 있어야 함.
-- 실행 위치: Supabase Dashboard → SQL Editor → 일괄 실행.
-- 멱등성: 재실행해도 안전 (if not exists / or replace / drop policy if exists).
-- ============================================================

-- 1. user_profiles 컬럼 추가
alter table public.user_profiles
  add column if not exists tier_request text check (tier_request in ('paid'));

alter table public.user_profiles
  add column if not exists requested_at timestamptz;

alter table public.user_profiles
  add column if not exists is_admin boolean not null default false;

-- 2. RLS 정책: 본인이 tier_request 를 paid 로 신청할 수 있도록 update 허용
-- (tier 및 is_admin 값은 변경 금지 — WITH CHECK 에서 막는다)
drop policy if exists "user_profiles_request_paid" on public.user_profiles;
create policy "user_profiles_request_paid"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and tier = (select up.tier from public.user_profiles up where up.user_id = auth.uid())
    and is_admin = (select up.is_admin from public.user_profiles up where up.user_id = auth.uid())
  );

-- 3. 관리자 판정 헬퍼 (RLS 우회 — 아래 정책/함수에서 재귀·모호성 방지용)
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

-- 4. 관리자 전체 조회 정책 (헬퍼로 재귀 회피)
drop policy if exists "user_profiles_admin_read_all" on public.user_profiles;
create policy "user_profiles_admin_read_all"
  on public.user_profiles for select
  using (public.current_user_is_admin());

-- 5. 승인 처리 RPC
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

revoke all on function public.approve_paid_request(uuid) from public;
grant execute on function public.approve_paid_request(uuid) to authenticated;

-- 6. 거절 처리 RPC
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

revoke all on function public.reject_paid_request(uuid) from public;
grant execute on function public.reject_paid_request(uuid) to authenticated;

-- 7. 대기 목록 조회 RPC — 관리자만 호출 가능, auth.users 의 user_metadata 포함
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

revoke all on function public.list_pending_paid_requests() from public;
grant execute on function public.list_pending_paid_requests() to authenticated;

-- ============================================================
-- 8. 최초 관리자 지정 (수동 수정 후 1회 실행)
--   아래 쿼리의 'username' 을 실제 아이디로 바꾸고 주석을 풀어 실행.
-- ============================================================
-- update public.user_profiles
-- set is_admin = true
-- where user_id = (
--   select id from auth.users
--   where raw_user_meta_data->>'username' = 'username'
-- );
