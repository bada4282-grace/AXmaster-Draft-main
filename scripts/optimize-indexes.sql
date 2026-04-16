-- ══════════════════════════════════════════════════════════════
-- trade_mti6 인덱스 최적화
-- 목적: RPC 함수의 Index-Only Scan 활성화로 대시보드 렌더링 속도 개선
-- 실행: Supabase SQL Editor에서 전체 복사·붙여넣기
-- ══════════════════════════════════════════════════════════════

-- 1. 커버링 인덱스 추가
-- ══════════════════════════════════════════════════════════════

-- get_country_map_mti6 최적화
-- (YYMM 필터 → CTR_NAME GROUP BY → EXP_AMT/IMP_AMT SUM)
CREATE INDEX IF NOT EXISTS idx_trade_mti6_yymm_ctr_amt
ON trade_mti6 ("YYMM", "CTR_NAME", "EXP_AMT", "IMP_AMT");

-- get_treemap_mti6 최적화
-- (YYMM 필터 → MTI_CD GROUP BY → EXP_AMT/IMP_AMT SUM)
CREATE INDEX IF NOT EXISTS idx_trade_mti6_yymm_mti_amt
ON trade_mti6 ("YYMM", "MTI_CD", "EXP_AMT", "IMP_AMT");

-- get_country_treemap_mti6 최적화
-- (YYMM + CTR_NAME 필터 → MTI_CD GROUP BY → EXP_AMT/IMP_AMT SUM)
CREATE INDEX IF NOT EXISTS idx_trade_mti6_yymm_ctr_mti_amt
ON trade_mti6 ("YYMM", "CTR_NAME", "MTI_CD", "EXP_AMT", "IMP_AMT");

-- 2. 중복 인덱스 정리
-- 새 커버링 인덱스가 기존 단일/복합 인덱스의 역할을 포함합니다
-- ══════════════════════════════════════════════════════════════

-- idx_trade_mti6_yymm → idx_trade_mti6_yymm_ctr_amt의 선행 컬럼에 포함
DROP INDEX IF EXISTS idx_trade_mti6_yymm;

-- idx_trade_mti6_ctr → idx_trade_mti6_yymm_ctr_amt에서 YYMM+CTR_NAME으로 커버
DROP INDEX IF EXISTS idx_trade_mti6_ctr;

-- idx_trade_mti6_mti → idx_trade_mti6_yymm_mti_amt에서 YYMM+MTI_CD로 커버
DROP INDEX IF EXISTS idx_trade_mti6_mti;

-- idx_trade_mti6_yymm_mti → idx_trade_mti6_yymm_mti_amt가 완전 대체
DROP INDEX IF EXISTS idx_trade_mti6_yymm_mti;

-- 3. 인덱스 확인
-- ══════════════════════════════════════════════════════════════
-- 실행 후 아래 쿼리로 현재 인덱스 목록 확인:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'trade_mti6';
