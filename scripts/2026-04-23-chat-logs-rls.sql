-- ============================================================
-- 2026-04-23 chat_logs 테이블 RLS 정책 확인·보강
-- 증상: saveChatLog() 가 silent 실패 → chat_logs 에 row 0건 → FAQ 가 LOGGED_IN_DEFAULT_FAQ 로 고정
-- 원인: INSERT 정책 누락 (RLS 켜져있지만 INSERT 허용 정책이 없음 → 기본 거부)
-- 멱등성: if not exists / drop policy if exists 로 재실행 안전.
-- ============================================================

-- 1. 테이블 존재 보장 (이미 있으면 무시)
create table if not exists public.chat_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'bot')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_logs_user_id_created_idx
  on public.chat_logs (user_id, created_at desc);

-- 2. RLS 활성화
alter table public.chat_logs enable row level security;

-- 3. 본인 로그 SELECT 정책
drop policy if exists "chat_logs_user_own_select" on public.chat_logs;
create policy "chat_logs_user_own_select"
  on public.chat_logs for select
  using (auth.uid() = user_id);

-- 4. 본인 로그 INSERT 정책 (saveChatLog 가 동작하려면 필수)
drop policy if exists "chat_logs_user_own_insert" on public.chat_logs;
create policy "chat_logs_user_own_insert"
  on public.chat_logs for insert
  with check (auth.uid() = user_id);

-- 결과 확인 (원하면 실행)
-- select policyname, cmd from pg_policies where tablename = 'chat_logs';
