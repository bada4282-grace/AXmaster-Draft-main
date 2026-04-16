-- ══════════════════════════════════════════════════════════════
-- 거시경제 지표 테이블
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS macro_indicators;
CREATE TABLE macro_indicators (
  "YYMM"            TEXT PRIMARY KEY,
  "KR_BASE_RATE"    NUMERIC,
  "KR_BSI_MFG"      NUMERIC,
  "KR_BSI_NON_MFG"  NUMERIC,
  "KR_EBSI"         NUMERIC,
  "KR_PROD_YOY"     NUMERIC,
  "KR_CPI_YOY"      NUMERIC,
  "US_BASE_RATE"    NUMERIC,
  "US_PMI_MFG"      NUMERIC,
  "CN_BASE_RATE"    NUMERIC,
  "CN_PMI_MFG"      NUMERIC,
  "BRENT_OIL"       NUMERIC,
  "SCFI"            NUMERIC
);

CREATE INDEX idx_macro_yymm ON macro_indicators ("YYMM");
