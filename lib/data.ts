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
  MTI_LOOKUP as MTI_LOOKUP_RAW,
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

// ─── MTI 색상 / 명칭 / 룩업 ──────────────────────────────────────────────
export const MTI_COLORS = MTI_COLORS_RAW as Record<number, string>;
export const MTI_NAMES = MTI_NAMES_RAW as Record<number, string>;
export const MTI_LOOKUP = MTI_LOOKUP_RAW as Record<string, string>;

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

// ─── MTI 깊이별 트리맵 집계 ───────────────────────────────────────────────
/**
 * 6단위 트리맵 데이터를 지정된 MTI 깊이(1~6)로 그룹핑하여 반환
 * depth=6이면 원본 그대로, depth=1이면 대분류 10개로 집계
 */
export function aggregateTreemapByDepth(
  data: ProductNode[],
  depth: number
): ProductNode[] {
  if (depth >= 6) return data;

  const grouped = new Map<string, { value: number; topCountries: string[] }>();
  for (const node of data) {
    const prefix = node.code.slice(0, depth);
    const existing = grouped.get(prefix);
    if (existing) {
      existing.value = Math.round((existing.value + node.value) * 10) / 10;
    } else {
      grouped.set(prefix, {
        value: node.value,
        topCountries: node.topCountries ? [...node.topCountries] : [],
      });
    }
  }

  return Array.from(grouped.entries())
    .map(([prefix, { value, topCountries }]) => {
      const mti1 = parseInt(prefix[0]) || 0;
      return {
        code: prefix,
        name: MTI_LOOKUP[prefix] || MTI_NAMES[mti1] || prefix,
        value,
        mti: mti1,
        color: MTI_COLORS[mti1] || "#9CA3AF",
        topCountries,
      };
    })
    .sort((a, b) => b.value - a.value);
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

/** prefix(집계 코드)에 해당하는 모든 6단위 품목의 트렌드를 합산 */
export function getAggregatedProductTrend(codePrefix: string, tradeType: TradeType = "수출"): YearlyTrend[] {
  if (codePrefix.length >= 6) return getProductTrend(codePrefix, tradeType);
  const dict = tradeType === "수입" ? PRODUCT_IMP_TREND_BY_CODE : PRODUCT_EXP_TREND_BY_CODE;
  const allCodes = Object.keys(dict as Record<string, YearlyTrend[]>);
  const matchingCodes = allCodes.filter((c) => c.startsWith(codePrefix));
  if (matchingCodes.length === 0) return [];

  const yearMap = new Map<string, number>();
  for (const code of matchingCodes) {
    const trend = (dict as Record<string, YearlyTrend[]>)[code] ?? [];
    for (const { year, value } of trend) {
      yearMap.set(year, (yearMap.get(year) ?? 0) + value);
    }
  }
  return Array.from(yearMap.entries())
    .map(([year, value]) => ({ year, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

export const SEMICONDUCTOR_TREND: YearlyTrend[] = getProductTrend("831110", "수출");

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

/** prefix(집계 코드)에 해당하는 모든 6단위 품목의 상위 국가를 합산 */
export function getAggregatedTopCountries(
  codePrefix: string,
  year = DEFAULT_YEAR,
  tradeType: TradeType = "수출"
): CountryValue[] {
  if (codePrefix.length >= 6) return getProductTopCountries(codePrefix, year, tradeType);
  const dict = tradeType === "수입"
    ? PRODUCT_IMP_TOP_COUNTRIES_BY_CODE
    : PRODUCT_EXP_TOP_COUNTRIES_BY_CODE;
  const allCodes = Object.keys(dict as Record<string, Record<string, CountryValue[]>>);
  const matchingCodes = allCodes.filter((c) => c.startsWith(codePrefix));
  if (matchingCodes.length === 0) return [];

  const countryMap = new Map<string, number>();
  for (const code of matchingCodes) {
    const countries = (dict as Record<string, Record<string, CountryValue[]>>)[code]?.[year] ?? [];
    for (const { country, value } of countries) {
      countryMap.set(country, (countryMap.get(country) ?? 0) + value);
    }
  }
  return Array.from(countryMap.entries())
    .map(([country, value]) => ({ country, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => b.value - a.value);
}

export const TOP5_COUNTRIES_SEMICONDUCTOR: CountryValue[] =
  getProductTopCountries("831110", DEFAULT_YEAR, "수출");

// ─── 국가별 KPI ───────────────────────────────────────────────────────────
export interface CountryKPI {
  export: string;
  import: string;
  rawExport: number;
  rawImport: number;
  balance: string;
  positive: boolean;
  exportChange: number;
  exportUp: boolean;
  importChange: number;
  importUp: boolean;
}

export function getCountryKpi(year: string, countryName: string): CountryKPI | undefined {
  return (COUNTRY_KPI_BY_YEAR as Record<string, Record<string, CountryKPI>>)
    [year]?.[countryName];
}
