-- ============================================================
-- 2026-04-20 회원 등급 분리 (비회원 / 무료 / 유료)
-- 실행 순서: 위에서 아래로. Supabase Dashboard SQL Editor에서 일괄 실행.
-- 멱등성: 재실행해도 안전하도록 if not exists / or replace / on conflict 사용.
-- ============================================================

-- 1. user_profiles 테이블
create table if not exists public.user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tier       text not null default 'free' check (tier in ('free', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 가입 시 자동 프로필 생성 함수
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3. 트리거: auth.users insert 후 실행
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. RLS 활성화 + 본인 조회 정책
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = user_id);
-- insert/update/delete 정책은 생성하지 않음 → 기본 거부.

-- 5. 기존 사용자 백필
insert into public.user_profiles (user_id, tier)
select id, 'free'
from auth.users
where id not in (select user_id from public.user_profiles)
on conflict (user_id) do nothing;
