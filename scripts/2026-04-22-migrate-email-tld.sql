-- ============================================================
-- 2026-04-22 기존 회원 이메일 TLD 마이그레이션
-- 문제: Supabase 가 `.local` TLD 를 신규 가입 시 invalid 로 거절.
-- 해결: 기존 auth.users.email 을 `@kstat.local` → `@kstat.app` 으로 일괄 변경.
-- 동반 코드 변경: lib/auth.ts 의 toEmail() 이 이미 `.app` 을 반환하도록 수정됨.
--
-- 주의: 이 스크립트와 lib/auth.ts 변경은 반드시 함께 배포되어야 한다.
--       한쪽만 적용되면 기존 유저 로그인이 깨진다.
-- 멱등성: where 절로 `.local` 로 끝나는 행만 대상. 재실행해도 추가 영향 없음.
-- ============================================================

update auth.users
set email = regexp_replace(email, '@kstat\.local$', '@kstat.app')
where email like '%@kstat.local';

-- 마이그레이션 결과 확인용 (원하면 실행)
-- select email from auth.users order by created_at desc limit 20;
