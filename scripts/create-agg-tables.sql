-- ══════════════════════════════════════════════════════════════
-- 사전 집계 테이블 — Supabase SQL Editor에서 실행
-- 목적: tradeData.generated.ts 대체, Top N 제한 없이 전체 데이터 조회
-- 대시보드 + 챗봇 모두 이 테이블에서 데이터를 fetch
-- ══════════════════════════════════════════════════════════════

-- 1. 품목별 연간 추이 (전체 품목)
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_product_trend;
CREATE TABLE agg_product_trend (
  code     TEXT NOT NULL,
  name     TEXT NOT NULL,
  year     TEXT NOT NULL,
  mti      INT  NOT NULL DEFAULT 0,
  exp_amt  NUMERIC DEFAULT 0,  -- 달러 원단위
  imp_amt  NUMERIC DEFAULT 0,
  PRIMARY KEY (code, year)
);
CREATE INDEX idx_apt_code ON agg_product_trend (code);
CREATE INDEX idx_apt_year ON agg_product_trend (year);

-- 2. 품목별 상위 국가 (전체 품목 × 전체 국가)
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_product_countries;
CREATE TABLE agg_product_countries (
  code     TEXT NOT NULL,
  year     TEXT NOT NULL,
  country  TEXT NOT NULL,
  exp_amt  NUMERIC DEFAULT 0,
  imp_amt  NUMERIC DEFAULT 0,
  PRIMARY KEY (code, year, country)
);
CREATE INDEX idx_apc_code_year ON agg_product_countries (code, year);

-- 3. 국가별 연간 순위/금액
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_country_ranking;
CREATE TABLE agg_country_ranking (
  year      TEXT NOT NULL,
  country   TEXT NOT NULL,
  exp_amt   NUMERIC DEFAULT 0,
  imp_amt   NUMERIC DEFAULT 0,
  rank_exp  INT DEFAULT 0,
  rank_imp  INT DEFAULT 0,
  share_exp NUMERIC DEFAULT 0,  -- 수출 비중 (%)
  share_imp NUMERIC DEFAULT 0,
  PRIMARY KEY (year, country)
);
CREATE INDEX idx_acr_year ON agg_country_ranking (year);

-- 4. 국가별 KPI (수출/수입/수지)
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_country_kpi;
CREATE TABLE agg_country_kpi (
  year      TEXT NOT NULL,
  country   TEXT NOT NULL,
  exp_amt   NUMERIC DEFAULT 0,
  imp_amt   NUMERIC DEFAULT 0,
  PRIMARY KEY (year, country)
);

-- 5. 국가별 월별 시계열
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_country_timeseries;
CREATE TABLE agg_country_timeseries (
  year     TEXT NOT NULL,
  country  TEXT NOT NULL,
  month    TEXT NOT NULL,  -- "01", "02", ...
  exp_amt  NUMERIC DEFAULT 0,
  imp_amt  NUMERIC DEFAULT 0,
  PRIMARY KEY (year, country, month)
);
CREATE INDEX idx_acts_year_country ON agg_country_timeseries (year, country);

-- 6. 연간 품목 트리맵 (전체 품목)
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_treemap;
CREATE TABLE agg_treemap (
  year     TEXT NOT NULL,
  code     TEXT NOT NULL,
  name     TEXT NOT NULL,
  mti      INT  NOT NULL DEFAULT 0,
  exp_amt  NUMERIC DEFAULT 0,
  imp_amt  NUMERIC DEFAULT 0,
  PRIMARY KEY (year, code)
);
CREATE INDEX idx_at_year ON agg_treemap (year);

-- 7. 국가별 품목 트리맵 (전체 국가 × 전체 품목)
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS agg_country_treemap;
CREATE TABLE agg_country_treemap (
  year     TEXT NOT NULL,
  country  TEXT NOT NULL,
  code     TEXT NOT NULL,
  name     TEXT NOT NULL,
  mti      INT  NOT NULL DEFAULT 0,
  exp_amt  NUMERIC DEFAULT 0,
  imp_amt  NUMERIC DEFAULT 0,
  PRIMARY KEY (year, country, code)
);
CREATE INDEX idx_act_year_country ON agg_country_treemap (year, country);

-- ══════════════════════════════════════════════════════════════
-- RPC: 대시보드용 조회 함수
-- ══════════════════════════════════════════════════════════════

-- 품목 트리맵 (연간, 수출/수입)
CREATE OR REPLACE FUNCTION get_agg_treemap(p_year TEXT, p_mode TEXT)
RETURNS TABLE(code TEXT, name TEXT, mti INT, total_amt NUMERIC) AS $$
BEGIN
  IF p_mode = 'import' THEN
    RETURN QUERY SELECT t.code, t.name, t.mti, t.imp_amt FROM agg_treemap t WHERE t.year = p_year AND t.imp_amt > 0 ORDER BY t.imp_amt DESC;
  ELSE
    RETURN QUERY SELECT t.code, t.name, t.mti, t.exp_amt FROM agg_treemap t WHERE t.year = p_year AND t.exp_amt > 0 ORDER BY t.exp_amt DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 국가별 품목 트리맵 (연간)
CREATE OR REPLACE FUNCTION get_agg_country_treemap(p_year TEXT, p_country TEXT, p_mode TEXT)
RETURNS TABLE(code TEXT, name TEXT, mti INT, total_amt NUMERIC) AS $$
BEGIN
  IF p_mode = 'import' THEN
    RETURN QUERY SELECT t.code, t.name, t.mti, t.imp_amt FROM agg_country_treemap t WHERE t.year = p_year AND t.country = p_country AND t.imp_amt > 0 ORDER BY t.imp_amt DESC;
  ELSE
    RETURN QUERY SELECT t.code, t.name, t.mti, t.exp_amt FROM agg_country_treemap t WHERE t.year = p_year AND t.country = p_country AND t.exp_amt > 0 ORDER BY t.exp_amt DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 품목 연간 추이
CREATE OR REPLACE FUNCTION get_agg_product_trend(p_code TEXT, p_mode TEXT)
RETURNS TABLE(year TEXT, total_amt NUMERIC) AS $$
BEGIN
  IF p_mode = 'import' THEN
    RETURN QUERY SELECT t.year, t.imp_amt FROM agg_product_trend t WHERE t.code = p_code ORDER BY t.year;
  ELSE
    RETURN QUERY SELECT t.year, t.exp_amt FROM agg_product_trend t WHERE t.code = p_code ORDER BY t.year;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 품목 상위 국가
CREATE OR REPLACE FUNCTION get_agg_product_countries(p_code TEXT, p_year TEXT, p_mode TEXT)
RETURNS TABLE(country TEXT, total_amt NUMERIC) AS $$
BEGIN
  IF p_mode = 'import' THEN
    RETURN QUERY SELECT t.country, t.imp_amt FROM agg_product_countries t WHERE t.code = p_code AND t.year = p_year AND t.imp_amt > 0 ORDER BY t.imp_amt DESC;
  ELSE
    RETURN QUERY SELECT t.country, t.exp_amt FROM agg_product_countries t WHERE t.code = p_code AND t.year = p_year AND t.exp_amt > 0 ORDER BY t.exp_amt DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;
