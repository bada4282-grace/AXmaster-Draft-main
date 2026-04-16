-- ══════════════════════════════════════════════════════════════
-- MTI 6단위 데이터 전환 — Supabase DDL & RPC
-- 실행: Supabase SQL Editor에서 전체 복사·붙여넣기
-- ══════════════════════════════════════════════════════════════

-- 1. MTI 룩업 테이블
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS mti_lookup;
CREATE TABLE mti_lookup (
  "MTI_CD"   TEXT PRIMARY KEY,
  "MTI_NAME" TEXT NOT NULL
);

CREATE INDEX idx_mti_lookup_cd_len ON mti_lookup (length("MTI_CD"));

-- 2. MTI 6단위 무역 데이터 테이블
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS trade_mti6;
CREATE TABLE trade_mti6 (
  id       BIGSERIAL PRIMARY KEY,
  "YYMM"     TEXT NOT NULL,
  "CTR_NAME" TEXT NOT NULL,
  "MTI_CD"   TEXT NOT NULL,
  "EXP_AMT"  NUMERIC DEFAULT 0,
  "EXP_WGT"  NUMERIC DEFAULT 0,
  "EXP_QTY"  NUMERIC DEFAULT 0,
  "IMP_AMT"  NUMERIC DEFAULT 0,
  "IMP_WGT"  NUMERIC DEFAULT 0,
  "IMP_QTY"  NUMERIC DEFAULT 0
);

-- 커버링 인덱스 (RPC 함수별 Index-Only Scan 최적화)
CREATE INDEX idx_trade_mti6_yymm_ctr_amt ON trade_mti6 ("YYMM", "CTR_NAME", "EXP_AMT", "IMP_AMT");
CREATE INDEX idx_trade_mti6_yymm_mti_amt ON trade_mti6 ("YYMM", "MTI_CD", "EXP_AMT", "IMP_AMT");
CREATE INDEX idx_trade_mti6_yymm_ctr_mti_amt ON trade_mti6 ("YYMM", "CTR_NAME", "MTI_CD", "EXP_AMT", "IMP_AMT");

-- 3. RPC: 품목별 집계 (MTI 깊이 지정 가능)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_treemap_mti6(
  p_yymm TEXT,
  p_mode TEXT DEFAULT 'export',
  p_mti_depth INT DEFAULT 6
)
RETURNS TABLE(mti_cd TEXT, mti_name TEXT, total_amt NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    LEFT(t."MTI_CD", p_mti_depth) AS mti_cd,
    COALESCE(m."MTI_NAME", LEFT(t."MTI_CD", p_mti_depth)) AS mti_name,
    SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) AS total_amt
  FROM trade_mti6 t
  LEFT JOIN mti_lookup m ON m."MTI_CD" = LEFT(t."MTI_CD", p_mti_depth)
  WHERE t."YYMM" = p_yymm
  GROUP BY LEFT(t."MTI_CD", p_mti_depth), m."MTI_NAME"
  HAVING SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) > 0
  ORDER BY total_amt DESC;
END;
$$;

-- 4. RPC: 국가별 품목 집계 (MTI 깊이 지정 가능)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_country_treemap_mti6(
  p_yymm TEXT,
  p_ctr_name TEXT,
  p_mode TEXT DEFAULT 'export',
  p_mti_depth INT DEFAULT 6
)
RETURNS TABLE(mti_cd TEXT, mti_name TEXT, total_amt NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    LEFT(t."MTI_CD", p_mti_depth) AS mti_cd,
    COALESCE(m."MTI_NAME", LEFT(t."MTI_CD", p_mti_depth)) AS mti_name,
    SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) AS total_amt
  FROM trade_mti6 t
  LEFT JOIN mti_lookup m ON m."MTI_CD" = LEFT(t."MTI_CD", p_mti_depth)
  WHERE t."YYMM" = p_yymm AND t."CTR_NAME" = p_ctr_name
  GROUP BY LEFT(t."MTI_CD", p_mti_depth), m."MTI_NAME"
  HAVING SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) > 0
  ORDER BY total_amt DESC;
END;
$$;

-- 5. RPC: 국가 순위
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_country_map_mti6(
  p_yymm TEXT,
  p_mode TEXT DEFAULT 'export'
)
RETURNS TABLE(ctr_name TEXT, rank BIGINT, total_amt NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    t."CTR_NAME",
    ROW_NUMBER() OVER (ORDER BY SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) DESC) AS rank,
    SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) AS total_amt
  FROM trade_mti6 t
  WHERE t."YYMM" = p_yymm
  GROUP BY t."CTR_NAME"
  HAVING SUM(CASE WHEN p_mode = 'export' THEN t."EXP_AMT" ELSE t."IMP_AMT" END) > 0
  ORDER BY total_amt DESC;
END;
$$;
