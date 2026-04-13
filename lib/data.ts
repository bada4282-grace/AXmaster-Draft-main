import {
  KPI_BY_YEAR,
  COUNTRY_DATA_BY_YEAR,
  COUNTRY_IMP_DATA_BY_YEAR,
  MTI_COLORS as MTI_COLORS_RAW,
  MTI_NAMES as MTI_NAMES_RAW,
  TREEMAP_EXP_DATA_BY_YEAR,
  TREEMAP_IMP_DATA_BY_YEAR,
  TIMESERIES_BY_YEAR_COUNTRY,
  PRODUCT_EXP_TREND_BY_CODE,
  PRODUCT_IMP_TREND_BY_CODE,
  PRODUCT_EXP_TOP_COUNTRIES_BY_CODE,
  PRODUCT_IMP_TOP_COUNTRIES_BY_CODE,
  COUNTRY_KPI_BY_YEAR,
  COUNTRY_TREEMAP_EXP_BY_YEAR,
  COUNTRY_TREEMAP_IMP_BY_YEAR,
} from "./tradeData.generated";

export type TradeType = "수출" | "수입";

// ─── 기본 연도 ────────────────────────────────────────────────────────────
export const DEFAULT_YEAR = "2026";

// ─── KPI ─────────────────────────────────────────────────────────────────
export { KPI_BY_YEAR };
export const KPI_DEFAULT = (KPI_BY_YEAR as Record<string, unknown>)[DEFAULT_YEAR];

// ─── Country data ─────────────────────────────────────────────────────────
export interface CountryData {
  iso: string;
  name: string;
  nameEn: string;
  rank: number;
  export: string;
  import: string;
  region: string;
  topProducts: string[];
  topImportProducts: string[];
  share: number;
}

type CountryDataRaw = typeof COUNTRY_DATA_BY_YEAR[keyof typeof COUNTRY_DATA_BY_YEAR][number];
const asCountry = (arr: CountryDataRaw[]): CountryData[] => arr as unknown as CountryData[];

export function getCountryData(year: string, tradeType: TradeType = "수출"): CountryData[] {
  if (tradeType === "수입") {
    return asCountry(
      (COUNTRY_IMP_DATA_BY_YEAR as Record<string, CountryDataRaw[]>)[year]
      ?? (COUNTRY_IMP_DATA_BY_YEAR as Record<string, CountryDataRaw[]>)[DEFAULT_YEAR]
    );
  }
  return asCountry(
    (COUNTRY_DATA_BY_YEAR as Record<string, CountryDataRaw[]>)[year]
    ?? (COUNTRY_DATA_BY_YEAR as Record<string, CountryDataRaw[]>)[DEFAULT_YEAR]
  );
}

/** 수출 기준 기본 목록 (하위 호환) */
export const COUNTRY_DATA: CountryData[] = getCountryData(DEFAULT_YEAR, "수출");

export function getCountryByIso(iso: string, year = DEFAULT_YEAR, tradeType: TradeType = "수출"): CountryData | undefined {
  return getCountryData(year, tradeType).find((c) => c.iso === iso);
}

export function getCountryByName(name: string, year = DEFAULT_YEAR, tradeType: TradeType = "수출"): CountryData | undefined {
  return getCountryData(year, tradeType).find((c) => c.name === name || c.nameEn === name);
}

export function getMapColor(rank: number): string {
  if (rank <= 3) return "#0F4C5C";
  if (rank <= 9) return "#1D6F78";
  if (rank <= 15) return "#3E8F92";
  if (rank <= 21) return "#66AFA9";
  if (rank <= 30) return "#95CBC0";
  return "#CDE8DA";
}

// ─── MTI 색상 / 명칭 ─────────────────────────────────────────────────────
export const MTI_COLORS = MTI_COLORS_RAW as Record<number, string>;
export const MTI_NAMES = MTI_NAMES_RAW as Record<number, string>;

// ─── Treemap ──────────────────────────────────────────────────────────────
export interface ProductNode {
  code: string;
  name: string;
  value: number;
  mti: number;
  color: string;
  topCountries?: string[];
}

type ProductNodeRaw = typeof TREEMAP_EXP_DATA_BY_YEAR[keyof typeof TREEMAP_EXP_DATA_BY_YEAR][number];
const asProduct = (arr: ProductNodeRaw[]): ProductNode[] => arr as unknown as ProductNode[];

export function getTreemapData(year: string, tradeType: TradeType = "수출"): ProductNode[] {
  const dict = tradeType === "수입" ? TREEMAP_IMP_DATA_BY_YEAR : TREEMAP_EXP_DATA_BY_YEAR;
  return asProduct(
    (dict as Record<string, ProductNodeRaw[]>)[year]
    ?? (dict as Record<string, ProductNodeRaw[]>)[DEFAULT_YEAR]
  );
}

/** 하위 호환 */
export const TREEMAP_DATA: ProductNode[] = getTreemapData(DEFAULT_YEAR, "수출");

/**
 * 특정 국가와의 교역 품목 트리맵 데이터
 * countryName이 없거나 데이터가 없으면 전체 글로벌 데이터로 폴백
 */
export function getCountryTreemapData(
  year: string,
  countryName: string,
  tradeType: TradeType = "수출"
): ProductNode[] {
  const dict = tradeType === "수입" ? COUNTRY_TREEMAP_IMP_BY_YEAR : COUNTRY_TREEMAP_EXP_BY_YEAR;
  const yearData = (dict as Record<string, Record<string, ProductNode[]>>)[year]
    ?? (dict as Record<string, Record<string, ProductNode[]>>)[DEFAULT_YEAR];
  const countryData = yearData?.[countryName];
  if (countryData && countryData.length > 0) return countryData;
  // 폴백: 전체 글로벌 데이터
  return getTreemapData(year, tradeType);
}

// ─── 국가별 월별 시계열 ───────────────────────────────────────────────────
export interface MonthlyData {
  month: string;   // "N월" 형식
  export: number;
  import: number;
  balance: number;
}

export function getCountryTimeseries(year: string, countryName: string): MonthlyData[] {
  return (TIMESERIES_BY_YEAR_COUNTRY as Record<string, Record<string, MonthlyData[]>>)
    [year]?.[countryName] ?? [];
}

export const CHINA_TIMESERIES: MonthlyData[] =
  getCountryTimeseries(DEFAULT_YEAR, "중국");

// ─── 품목별 연간 추이 ─────────────────────────────────────────────────────
export interface YearlyTrend {
  year: string;
  value: number;
}

export function getProductTrend(productCode: string, tradeType: TradeType = "수출"): YearlyTrend[] {
  const dict = tradeType === "수입" ? PRODUCT_IMP_TREND_BY_CODE : PRODUCT_EXP_TREND_BY_CODE;
  return (dict as Record<string, YearlyTrend[]>)[productCode] ?? [];
}

export const SEMICONDUCTOR_TREND: YearlyTrend[] = getProductTrend("831", "수출");

// ─── 품목별 상위 국가 ─────────────────────────────────────────────────────
export interface CountryValue {
  country: string;
  value: number;
}

export function getProductTopCountries(
  productCode: string,
  year = DEFAULT_YEAR,
  tradeType: TradeType = "수출"
): CountryValue[] {
  const dict = tradeType === "수입"
    ? PRODUCT_IMP_TOP_COUNTRIES_BY_CODE
    : PRODUCT_EXP_TOP_COUNTRIES_BY_CODE;
  return (dict as Record<string, Record<string, CountryValue[]>>)[productCode]?.[year] ?? [];
}

export const TOP5_COUNTRIES_SEMICONDUCTOR: CountryValue[] =
  getProductTopCountries("831", DEFAULT_YEAR, "수출");

// ─── 국가별 KPI ───────────────────────────────────────────────────────────
export interface CountryKPI {
  export: string;
  import: string;
  balance: string;
  positive: boolean;
}

export function getCountryKpi(year: string, countryName: string): CountryKPI | undefined {
  return (COUNTRY_KPI_BY_YEAR as Record<string, Record<string, CountryKPI>>)
    [year]?.[countryName];
}
