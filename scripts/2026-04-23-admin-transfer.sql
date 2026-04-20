-- ============================================================
-- 2026-04-23 관리자 권한 이전
-- ina100425 의 admin 권한을 취소하고 mu4admin 에게 부여.
-- ============================================================

-- 1. ina100425 admin 취소 + tier 를 free 로 되돌림
update public.user_profiles
set is_admin = false,
    tier = 'free',
    tier_request = null,
    requested_at = null
where user_id = (
  select id from auth.users
  where raw_user_meta_data->>'username' = 'ina100425'
);

-- 2. mu4admin admin 부여 + 유료 기능 검증을 위해 tier=paid 도 함께 지정
update public.user_profiles
set is_admin = true,
    tier = 'paid',
    tier_request = null,
    requested_at = null
where user_id = (
  select id from auth.users
  where raw_user_meta_data->>'username' = 'mu4admin'
);

-- 결과 확인 (원하면 실행)
-- select au.raw_user_meta_data->>'username' as username, up.tier, up.is_admin
-- from public.user_profiles up
-- join auth.users au on au.id = up.user_id
-- where au.raw_user_meta_data->>'username' in ('ina100425', 'mu4admin');
