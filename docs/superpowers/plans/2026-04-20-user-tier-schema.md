# 회원 등급 분리 DB 스키마 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase에 `user_profiles` 테이블과 자동 생성 트리거, RLS 정책, 기존 사용자 백필을 적용하고, 프론트에서 등급을 읽는 헬퍼 `getUserTier()`를 추가한다. 기존 기능은 영향 없이 그대로 유지한다.

**Architecture:** `auth.users`와 1:1로 매핑되는 `public.user_profiles(user_id, tier, ...)`를 새로 만든다. 가입 트리거가 자동으로 `tier='free'` row를 생성하고, RLS는 본인 조회만 허용한다. 앱 레이어 `lib/auth.ts`에 `getUserTier()`를 추가해 `"guest" | "free" | "paid"`를 반환한다.

**Tech Stack:** Supabase (Postgres + Auth + RLS), TypeScript, Next.js 16 App Router, `@supabase/supabase-js` v2

**Spec:** `docs/superpowers/specs/2026-04-20-user-tier-schema-design.md`

**테스트 방식:** 이 저장소에는 자동 테스트 프레임워크가 없다. Task별 검증은 (1) Supabase Dashboard SQL 쿼리로 상태 확인, (2) `npx tsc --noEmit` 타입체크, (3) `npm run dev`로 실행해 브라우저 콘솔에서 헬퍼 함수 수동 호출로 수행한다.

---

## 파일 구조

| 파일 | 작업 | 역할 |
|------|------|------|
| `scripts/2026-04-20-user-tier-schema.sql` | 신규 | 테이블 + 트리거 + RLS + 백필 SQL 묶음 (Supabase Dashboard 실행용) |
| `lib/auth.ts` | 수정 | `UserTier` 타입 + `getUserTier()` 함수 추가 |

**변경 없음 (영향 확인만):** `lib/chat.ts`, `app/login/page.tsx`, `app/signup/page.tsx`, `components/ChatBot.tsx`, `components/Header.tsx`

---

## Task 1: 마이그레이션 SQL 파일 작성

**Files:**
- Create: `scripts/2026-04-20-user-tier-schema.sql`

- [ ] **Step 1: SQL 파일 생성**

`scripts/2026-04-20-user-tier-schema.sql` 전체 내용:

```sql
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
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/2026-04-20-user-tier-schema.sql
git commit -m "feat: add user_profiles schema migration SQL"
```

---

## Task 2: Supabase Dashboard에서 SQL 실행 및 검증

**Files:** 없음 (Supabase Dashboard에서 직접 실행)

- [ ] **Step 1: Supabase Dashboard 접속**

https://supabase.com → 프로젝트 선택 → 좌측 메뉴 **SQL Editor** 열기.

- [ ] **Step 2: 마이그레이션 SQL 실행**

`scripts/2026-04-20-user-tier-schema.sql` 전체 내용을 복사해 SQL Editor에 붙여넣고 **Run** 클릭.

Expected: `Success. No rows returned` 또는 백필된 row 개수 메시지. 에러 없음.

- [ ] **Step 3: 테이블 존재 확인**

SQL Editor에서 아래 쿼리 실행:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'user_profiles'
order by ordinal_position;
```

Expected: 4개 컬럼 (`user_id` uuid NOT NULL, `tier` text NOT NULL default `'free'::text`, `created_at` timestamptz NOT NULL, `updated_at` timestamptz NOT NULL).

- [ ] **Step 4: 트리거 존재 확인**

```sql
select trigger_name, event_manipulation, event_object_schema, event_object_table
from information_schema.triggers
where trigger_name = 'on_auth_user_created';
```

Expected: 1개 row — `on_auth_user_created / INSERT / auth / users`.

- [ ] **Step 5: RLS 정책 확인**

```sql
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'user_profiles';
```

Expected: 1개 row — `user_profiles_select_own / SELECT / (auth.uid() = user_id)`.

- [ ] **Step 6: 백필 결과 확인**

```sql
select
  (select count(*) from auth.users) as auth_users_count,
  (select count(*) from public.user_profiles) as profiles_count,
  (select count(*) from public.user_profiles where tier = 'free') as free_count,
  (select count(*) from public.user_profiles where tier = 'paid') as paid_count;
```

Expected: `auth_users_count == profiles_count`, `paid_count == 0`, `free_count == auth_users_count`.

- [ ] **Step 7: 트리거 동작 스모크 테스트 (신규 가입 시뮬레이션)**

테스트용 이메일로 회원가입을 1회 수행해 트리거가 작동하는지 확인한다.

브라우저에서 `npm run dev`로 띄운 앱 → `/signup` → 이름 `테스트`, 아이디 `tier_test_20260420`, 비밀번호 8자 이상 입력 → 가입.

그 후 Supabase SQL Editor에서:

```sql
select up.user_id, up.tier, up.created_at, u.raw_user_meta_data->>'username' as username
from public.user_profiles up
join auth.users u on u.id = up.user_id
where u.raw_user_meta_data->>'username' = 'tier_test_20260420';
```

Expected: 1개 row, `tier = 'free'`, `created_at`은 현재 시각에 가까움.

- [ ] **Step 8: 테스트 사용자 정리 (선택)**

```sql
delete from auth.users where raw_user_meta_data->>'username' = 'tier_test_20260420';
```

Expected: `user_profiles` row도 `on delete cascade`로 함께 삭제됨. 아래로 확인:

```sql
select count(*) from public.user_profiles
where user_id in (
  select id from auth.users where raw_user_meta_data->>'username' = 'tier_test_20260420'
);
```

Expected: `0`.

- [ ] **Step 9: 검증 결과를 커밋 메시지 본문으로 기록할 수 있도록 메모**

Task 4 커밋 시 참조. 별도 파일로 저장하지 않고 진행자가 채팅/노트에 Step 3~6 결과를 기록해 두면 충분하다.

---

## Task 3: `lib/auth.ts`에 `getUserTier()` 헬퍼 추가

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: `lib/auth.ts` 파일 끝에 타입과 함수 추가**

기존 파일 끝(마지막 `}` 뒤)에 아래를 append:

```typescript

// ─────────────────────────────────────────────────────────────
// 회원 등급
// ─────────────────────────────────────────────────────────────

export type UserTier = "guest" | "free" | "paid";

// 현재 사용자의 등급 반환. 비로그인은 'guest'.
export async function getUserTier(): Promise<UserTier> {
  const user = await getUser();
  if (!user) return "guest";

  const { data, error } = await supabase
    .from("user_profiles")
    .select("tier")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return "free"; // 프로필 조회 실패 시 free로 간주
  return data.tier as UserTier;
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음. (기존 에러가 있다면 이 변경으로 신규 에러가 추가되지 않았는지 확인.)

- [ ] **Step 3: 런타임 스모크 테스트**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 후 개발자도구 Console에서:

**(a) 비로그인 상태**

```javascript
const { getUserTier } = await import('/lib/auth.ts');
await getUserTier();
```

Expected: `"guest"`

> 브라우저가 `.ts` import를 직접 지원하지 않는 경우엔 다음 방법으로 대체: `/signup`, `/login`, `/` 중 한 페이지에서 React DevTools를 열고 임시로 ChatBot 컴포넌트에서 `import { getUserTier } from "@/lib/auth"`를 추가해 `console.log(await getUserTier())`를 호출한 뒤 결과 확인. 확인 후 임시 코드 제거.

**(b) 로그인 상태**

Task 2 Step 7에서 만든 계정이 있다면 재사용, 없으면 `/signup`으로 새 계정 생성 후 `/login`으로 로그인. 로그인 상태에서 위와 동일한 방법으로 호출.

Expected: `"free"`

**(c) (선택) 유료 회원 테스트**

Supabase SQL Editor에서 현재 로그인된 사용자의 tier를 수동으로 업그레이드:

```sql
update public.user_profiles
set tier = 'paid', updated_at = now()
where user_id in (
  select id from auth.users where raw_user_meta_data->>'username' = '<내 아이디>'
);
```

브라우저 새로고침 후 다시 `getUserTier()` 호출.

Expected: `"paid"`

완료 후 원복:

```sql
update public.user_profiles set tier = 'free', updated_at = now()
where user_id in (
  select id from auth.users where raw_user_meta_data->>'username' = '<내 아이디>'
);
```

- [ ] **Step 4: `npm run dev` 종료 및 커밋**

```bash
git add lib/auth.ts
git commit -m "feat: add getUserTier helper to read user_profiles.tier"
```

---

## Task 4: 기존 기능 회귀 검증 + 빌드 확인

**Files:** 없음 (검증만 수행)

- [ ] **Step 1: 기존 기능이 그대로 작동하는지 수동 확인**

`npm run dev` 실행 후 브라우저에서 아래 흐름을 순서대로 수행:

1. `/signup`에서 새 계정 생성 → `/login`으로 리다이렉트.
2. `/login`에서 해당 계정으로 로그인 → `/`로 리다이렉트.
3. Header에서 "로그아웃" 버튼이 표시되는지 확인 → 클릭 후 로그아웃.
4. 챗봇 열기 → 메시지 전송 → 응답 확인.
5. 로그아웃 상태에서도 챗봇이 여는지 확인 (로그 저장은 안 됨, 이는 기존 동작).
6. 다시 로그인 → 챗봇 열기 → 이전 로그 기반 welcome message가 정상 표시되는지 확인.

Expected: 모든 흐름이 스펙에 맞게 동작. 에러 없음. 콘솔 경고 없음.

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: `Compiled successfully` 또는 기존 대비 새로운 에러 없이 완료. 기존부터 있던 경고는 무시.

- [ ] **Step 3: lint 확인**

```bash
npm run lint
```

Expected: 변경 파일(`lib/auth.ts`)에 새 린트 에러 없음.

- [ ] **Step 4: 최종 상태 확인 및 완료 메모**

`git log --oneline -5`로 커밋 3개 확인:
- `feat: add user_profiles schema migration SQL`
- `feat: add getUserTier helper to read user_profiles.tier`

(Task 2는 DB 작업으로 커밋 없음)

완료 후 다음 작업(승급 플로우, 보고서 게이팅)은 별도 spec/plan에서 다룬다.

---

## 자가 점검

- [x] Spec 섹션 커버리지
  - §1 회원 등급 정의 → Task 1 (스키마) + Task 3 (UserTier 타입)
  - §2 테이블 스키마 → Task 1 Step 1
  - §3 트리거 → Task 1 Step 1 + Task 2 Step 4, 7
  - §4 RLS → Task 1 Step 1 + Task 2 Step 5
  - §5 백필 → Task 1 Step 1 + Task 2 Step 6
  - §6 헬퍼 → Task 3 전체
  - §7 마이그레이션 파일 → Task 1
  - §8 현재 기능 영향 → Task 4
- [x] 플레이스홀더 없음 (TBD/TODO/handle edge cases 등 미사용)
- [x] 타입 일관성: `UserTier` 값(`guest/free/paid`)이 spec §1·§6 및 plan Task 3에서 동일
