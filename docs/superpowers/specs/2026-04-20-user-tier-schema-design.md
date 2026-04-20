# 회원 등급 분리 — DB 스키마 설계

**날짜:** 2026-04-20
**범위:** Supabase `auth.users` 하나로만 구분되던 회원/비회원 구조를, 비회원 / 무료 회원 / 유료 회원(KITA 회원사) 3단계로 분리하는 DB 스키마 및 최소 헬퍼.

본 설계는 **DB 스키마 분리**에 집중한다. 유료 회원 승급 방식(수동/인증코드/별도 페이지)과 보고서 기능 게이팅은 별도 설계에서 다룬다.

---

## 1. 회원 등급 정의

| 등급 | DB 표현 | 판별 방법 | 권한 |
|------|---------|-----------|------|
| 비회원 | `auth.users`에 없음 | 로그인 세션 없음 (앱 레이어) | 채팅 로그 저장 ❌, 보고서 ❌ |
| 무료 회원 | `user_profiles.tier = 'free'` | 가입 시 자동 부여 (기본값) | 채팅 로그 저장 ✅, 보고서 ❌ |
| 유료 회원 | `user_profiles.tier = 'paid'` | 관리자가 수동 변경 (승급 플로우는 이후 단계) | 채팅 로그 저장 ✅, 보고서 ✅ |

- 비회원은 DB에 row가 없음. 앱 레이어(`lib/auth.ts`)에서 `"guest"`로 표현.
- 로그인된 사용자는 반드시 `user_profiles`에 대응 row가 존재하도록 트리거로 보장.

---

## 2. `user_profiles` 테이블 스키마

```sql
create table public.user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tier       text not null default 'free' check (tier in ('free', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**설계 결정:**
- `user_id`를 PK이자 FK로 사용 → `auth.users`와 1:1 관계 보장, 중복 row 방지.
- `on delete cascade` → `auth.users` 삭제 시 프로필도 함께 제거.
- `tier`는 `text + check` 제약으로 `'free'` / `'paid'`만 허용. enum 타입 대신 text를 쓰는 이유는 향후 값 추가(예: `'trial'`) 시 ALTER가 더 쉽기 때문.
- `company_name`, `kita_member_no` 등 추가 필드는 **본 단계에서 넣지 않음** (YAGNI — 승급 플로우 설계 시 함께 결정).

---

## 3. 가입 시 자동 프로필 생성 (Postgres Trigger)

`auth.users`에 새 row가 insert될 때 `user_profiles`에 자동으로 대응 row를 생성한다. 애플리케이션 코드에서 별도 insert 호출을 하지 않아도 되도록 DB 레벨에서 보장한다.

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, tier)
  values (new.id, 'free');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**왜 트리거로 처리하나:**
- 클라이언트에서 `signUp()` 후 별도 insert를 호출하면 실패 시 고아 auth 계정이 생길 수 있음.
- 트리거는 `auth.users` insert와 동일 트랜잭션 → 원자성 보장.
- `security definer`로 RLS 우회 (public 스키마에만 한정).

---

## 4. RLS 정책

```sql
alter table public.user_profiles enable row level security;

-- 본인 프로필 조회만 허용
create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = user_id);

-- insert/update/delete 정책은 생성하지 않음 → 기본 거부.
-- 트리거는 security definer로 RLS 우회, 승급은 service_role로만 수행.
```

**핵심:**
- 사용자는 자기 tier를 **읽을 수만** 있고 수정 불가 → `tier='paid'`로 자가 승급 차단.
- 승급은 Supabase Dashboard SQL Editor 또는 서버 사이드 API(service key)에서만 가능.

---

## 5. 기존 사용자 백필

트리거는 앞으로 가입할 사용자에게만 적용되므로, 이미 가입된 사용자에게는 1회성 백필을 실행한다.

```sql
insert into public.user_profiles (user_id, tier)
select id, 'free'
from auth.users
where id not in (select user_id from public.user_profiles)
on conflict (user_id) do nothing;
```

- 멱등(`on conflict do nothing`) → 중복 실행 안전.
- 기존 사용자는 모두 `free`로 시작. 유료 회원사는 승급 플로우 결정 후 개별 변경.
- 실행 순서: **트리거 생성 → 백필 쿼리 실행** (반대면 트리거가 이미 만든 row와 충돌하지 않지만 순서를 명시).

---

## 6. 애플리케이션 헬퍼

`lib/auth.ts`에 현재 사용자의 등급을 반환하는 함수를 추가한다. 이번 단계에서는 **읽기 전용**이며, 보고서 게이팅은 이후 단계에서 이 함수를 사용한다.

```typescript
// lib/auth.ts에 추가
export type UserTier = "guest" | "free" | "paid";

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

- `"guest"`는 DB에 저장되지 않는 앱 레이어 전용 값.
- 기존 `getUser()`, `signIn()`, `signUp()`, `signOut()`, `saveChatLog()`, `getChatLogs()`는 **변경 없음**.

---

## 7. 마이그레이션 실행 파일

위 SQL은 단일 파일로 묶어 `scripts/` 하위에 저장한다.

**파일:** `scripts/2026-04-20-user-tier-schema.sql`

구성(순서대로):
1. `create table public.user_profiles ...`
2. `create or replace function public.handle_new_user() ...`
3. `create trigger on_auth_user_created ...`
4. `alter table ... enable row level security;` + select 정책
5. 기존 사용자 백필 쿼리

Supabase Dashboard SQL Editor에서 수동 실행을 가정한다.

---

## 8. 현재 기능 영향

| 현재 기능 | 유지 여부 | 변경점 |
|-----------|-----------|--------|
| 회원가입 (`signUp`) | 유지 | 가입 시 `user_profiles` row가 `tier='free'`로 자동 생성됨 (DB 트리거) |
| 로그인/로그아웃 (`signIn`, `signOut`) | 유지 | 변경 없음 |
| 채팅 로그 저장 (`saveChatLog`) | 유지 | 변경 없음 |
| 채팅 로그 조회 (`getChatLogs`) | 유지 | 변경 없음 |
| Welcome message | 유지 | 변경 없음 |

UI/사용자 동작은 이 단계에서 아무것도 바뀌지 않는다. DB에 등급 구분을 위한 토대만 생긴다.

---

## 9. 다음 단계 (별도 설계)

- **승급 플로우**: 관리자 수동 / 회원가입 시 인증코드 / 로그인 후 별도 인증 페이지 중 선택.
- **보고서 기능 게이팅**: `getUserTier()`로 `'paid'` 확인 후 기능 노출.
- **채팅봇 레이어 비회원 처리**: 현재 `saveChatLog`는 비로그인 시 no-op이므로 이미 안전. 필요 시 UI에 "로그인하면 이전 대화가 저장됩니다" 안내 추가 검토.
