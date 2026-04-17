/**
 * Supabase 집계 테이블 기반 데이터 조회 레이어
 * - RPC 대신 직접 테이블 쿼리 (안정성 + 에러 추적)
 * - 메모리 캐시 5분 TTL
 */
import { supabase } from "@/lib/supabase";
import { MTI_COLORS, MTI_LOOKUP, MTI_NAMES } from "@/lib/data";
import type { ProductNode, CountryValue, YearlyTrend, MonthlyData, TradeType } from "@/lib/data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

// ─── 캐시 ────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  return null;
}

function setCache<T>(key: string, data: T): T {
  cache.set(key, { data, ts: Date.now() });
  return data;
}

const fmt1 = (v: number) => Math.round(v / 1e8 * 10) / 10;

function toProductNode(row: DbRow, amtCol: string): ProductNode | null {
  const value = fmt1(Number(row[amtCol]) || 0);
  if (value <= 0) return null;
  const mti = Number(row.mti) || 0;
  return {
    code: row.code,
    name: row.name,
    value,
    mti,
    color: (MTI_COLORS as Record<number, string>)[mti] ?? "#9CA3AF",
  };
}

// ─── 품목 트리맵 (연간) ─────────────────────────────────────────────────
export async function getTreemapDataAsync(
  year: string, tradeType: TradeType = "수출"
): Promise<ProductNode[]> {
  const key = `treemap_${year}_${tradeType}`;
  const cached = getCached<ProductNode[]>(key);
  if (cached) return cached;

  const amtCol = tradeType === "수입" ? "imp_amt" : "exp_amt";
  const { data, error } = await supabase
    .from("agg_treemap")
    .select("code, name, mti, " + amtCol)
    .eq("year", year)
    .gt(amtCol, 0)
    .order(amtCol, { ascending: false })
    .limit(5000);

  if (error) { console.error("[getTreemapDataAsync]", error.message); return []; }
  if (!data) return [];

  const result = (data as DbRow[])
    .map(row => toProductNode(row, amtCol))
    .filter((n): n is ProductNode => n !== null);

  return setCache(key, result);
}

// ─── 국가별 품목 트리맵 (연간) ──────────────────────────────────────────
export async function getCountryTreemapDataAsync(
  year: string, countryName: string, tradeType: TradeType = "수출"
): Promise<ProductNode[]> {
  const key = `ctreemap_${year}_${countryName}_${tradeType}`;
  const cached = getCached<ProductNode[]>(key);
  if (cached) return cached;

  const amtCol = tradeType === "수입" ? "imp_amt" : "exp_amt";
  const { data, error } = await supabase
    .from("agg_country_treemap")
    .select("code, name, mti, " + amtCol)
    .eq("year", year)
    .eq("country", countryName)
    .gt(amtCol, 0)
    .order(amtCol, { ascending: false })
    .limit(5000);

  if (error) { console.error("[getCountryTreemapDataAsync]", error.message); }
  if (error || !data || data.length === 0) return setCache(key, []);

  const result = (data as DbRow[])
    .map(row => toProductNode(row, amtCol))
    .filter((n): n is ProductNode => n !== null);

  return setCache(key, result);
}

// ─── 품목별 연간 추이 ───────────────────────────────────────────────────
export async function getProductTrendAsync(
  codePrefix: string, tradeType: TradeType = "수출"
): Promise<YearlyTrend[]> {
  const key = `ptrend_${codePrefix}_${tradeType}`;
  const cached = getCached<YearlyTrend[]>(key);
  if (cached) return cached;

  const amtCol = tradeType === "수입" ? "imp_amt" : "exp_amt";

  const { data, error } = await supabase
    .from("agg_product_trend")
    .select(`year, ${amtCol}`)
    .like("code", `${codePrefix}%`)
    .order("year", { ascending: true });

  if (error) { console.error("[getProductTrendAsync]", error.message); return []; }
  if (!data) return [];

  // 접두사 집계: 하위 코드 합산
  const yearMap = new Map<string, number>();
  for (const row of data as DbRow[]) {
    yearMap.set(row.year, (yearMap.get(row.year) ?? 0) + (Number(row[amtCol]) || 0));
  }
  const result = Array.from(yearMap.entries())
    .map(([year, amt]) => ({ year, value: fmt1(amt) }))
    .filter(t => t.value > 0)
    .sort((a, b) => a.year.localeCompare(b.year));

  return setCache(key, result);
}

// ─── 품목별 상위 국가 ───────────────────────────────────────────────────
export async function getProductTopCountriesAsync(
  codePrefix: string, year: string, tradeType: TradeType = "수출"
): Promise<CountryValue[]> {
  const key = `pctry_${codePrefix}_${year}_${tradeType}`;
  const cached = getCached<CountryValue[]>(key);
  if (cached) return cached;

  const amtCol = tradeType === "수입" ? "imp_amt" : "exp_amt";

  const { data, error } = await supabase
    .from("agg_product_countries")
    .select(`country, ${amtCol}`)
    .like("code", `${codePrefix}%`)
    .eq("year", year);

  if (error) { console.error("[getProductTopCountriesAsync]", error.message); return []; }
  if (!data) return [];

  const countryMap = new Map<string, number>();
  for (const row of data as DbRow[]) {
    const amt = Number(row[amtCol]) || 0;
    if (amt > 0) countryMap.set(row.country, (countryMap.get(row.country) ?? 0) + amt);
  }
  const result = Array.from(countryMap.entries())
    .map(([country, amt]) => ({ country, value: fmt1(amt) }))
    .sort((a, b) => b.value - a.value);

  return setCache(key, result);
}

// ─── 국가별 순위/금액 ───────────────────────────────────────────────────
export interface CountryRanking {
  country: string;
  exp_amt: number;
  imp_amt: number;
  rank_exp: number;
  rank_imp: number;
  share_exp: number;
  share_imp: number;
}

export async function getCountryRankingAsync(
  year: string, tradeType: TradeType = "수출"
): Promise<CountryRanking[]> {
  const key = `crank_${year}_${tradeType}`;
  const cached = getCached<CountryRanking[]>(key);
  if (cached) return cached;

  const orderCol = tradeType === "수입" ? "rank_imp" : "rank_exp";
  const { data, error } = await supabase
    .from("agg_country_ranking")
    .select("*")
    .eq("year", year)
    .order(orderCol, { ascending: true })
    .limit(500);

  if (error) { console.error("[getCountryRankingAsync]", error.message); return []; }
  if (!data) return [];

  const result = (data as DbRow[]).map(row => ({
    country: row.country,
    exp_amt: Number(row.exp_amt) || 0,
    imp_amt: Number(row.imp_amt) || 0,
    rank_exp: Number(row.rank_exp) || 0,
    rank_imp: Number(row.rank_imp) || 0,
    share_exp: Number(row.share_exp) || 0,
    share_imp: Number(row.share_imp) || 0,
  }));
  return setCache(key, result);
}

// ─── 국가별 월별 시계열 ─────────────────────────────────────────────────
export async function getCountryTimeseriesAsync(
  year: string, countryName: string
): Promise<MonthlyData[]> {
  const key = `cts_${year}_${countryName}`;
  const cached = getCached<MonthlyData[]>(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("agg_country_timeseries")
    .select("*")
    .eq("year", year)
    .eq("country", countryName)
    .order("month", { ascending: true });

  if (error) { console.error("[getCountryTimeseriesAsync]", error.message); return []; }
  if (!data) return [];

  const result = (data as DbRow[]).map(row => {
    const expB = fmt1(Number(row.exp_amt) || 0);
    const impB = fmt1(Number(row.imp_amt) || 0);
    return {
      month: `${parseInt(row.month)}월`,
      export: expB,
      import: impB,
      balance: Math.round((expB - impB) * 10) / 10,
    };
  });
  return setCache(key, result);
}

// ─── 국가별 KPI ─────────────────────────────────────────────────────────
export interface CountryKPIAsync {
  export: string;
  import: string;
  rawExport: number;
  rawImport: number;
  balance: string;
  positive: boolean;
}

export async function getCountryKpiAsync(
  year: string, countryName: string
): Promise<CountryKPIAsync | undefined> {
  const key = `ckpi_${year}_${countryName}`;
  const cached = getCached<CountryKPIAsync>(key);
  if (cached) return cached;

  // agg_country_ranking에서 KPI 데이터를 추출 (별도 테이블 대신)
  const { data, error } = await supabase
    .from("agg_country_ranking")
    .select("exp_amt, imp_amt")
    .eq("year", year)
    .eq("country", countryName)
    .single();

  if (error || !data) return undefined;

  const row = data as DbRow;
  const expAmt = Number(row.exp_amt) || 0;
  const impAmt = Number(row.imp_amt) || 0;
  const result: CountryKPIAsync = {
    export: String(fmt1(expAmt)),
    import: String(fmt1(impAmt)),
    rawExport: expAmt,
    rawImport: impAmt,
    balance: String(fmt1(Math.abs(expAmt - impAmt))),
    positive: expAmt >= impAmt,
  };
  return setCache(key, result);
}

// ─── 캐시 관리 ──────────────────────────────────────────────────────────
export function clearDataCache() {
  cache.clear();
}
