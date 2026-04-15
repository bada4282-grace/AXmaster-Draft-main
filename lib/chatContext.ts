import {
  getCountryData,
  getCountryKpi,
  getCountryTimeseries,
  getProductTopCountries,
  getProductTrend,
  getCountryTreemapData,
  DEFAULT_YEAR,
  KPI_BY_YEAR,
} from "@/lib/data";
import {
  TREEMAP_EXP_DATA_BY_YEAR,
  COUNTRY_DATA_BY_YEAR,
} from "@/lib/tradeData.generated";

interface ExtractedKeywords {
  countries: string[];
  productCodes: string[];
  productNames: string[];
  year: string;
}

// TREEMAP 데이터에서 품목명 → 코드 역조회 맵 구성
function buildProductLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const yearData of Object.values(TREEMAP_EXP_DATA_BY_YEAR)) {
    for (const item of yearData) {
      if (!lookup.has(item.name)) {
        lookup.set(item.name, item.code);
      }
    }
  }
  return lookup;
}

// COUNTRY_DATA_BY_YEAR에서 국가명 목록 구성
function buildCountryList(): string[] {
  const names = new Set<string>();
  for (const yearData of Object.values(COUNTRY_DATA_BY_YEAR)) {
    for (const c of yearData) names.add(c.name);
  }
  return Array.from(names);
}

const PRODUCT_LOOKUP = buildProductLookup();
const COUNTRY_LIST = buildCountryList();

// 질문에서 수출/수입 방향 감지
function detectTradeType(question: string): "수출" | "수입" {
  if (question.includes("수입")) return "수입";
  return "수출";
}

// 국가 순위/개요 관련 질문인지 감지
function isRankingQuery(question: string): boolean {
  const keywords = [
    "순위", "1위", "2위", "3위", "4위", "5위", "1등", "2등", "3등",
    "상위", "랭킹", "국가별", "나라별", "어느 나라", "어떤 나라",
    "가장 많이", "가장 큰", "많은 나라", "주요 국가", "top", "TOP",
  ];
  return keywords.some(kw => question.includes(kw));
}

// 질문에서 국가명, 품목명, 연도 추출 (부분 일치)
export function extractKeywords(question: string): ExtractedKeywords {
  const yearMatch = question.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : DEFAULT_YEAR;

  const countries = COUNTRY_LIST.filter(name => question.includes(name));

  const productCodes: string[] = [];
  const productNames: string[] = [];
  for (const [name, code] of PRODUCT_LOOKUP.entries()) {
    if (question.includes(name) && !productCodes.includes(code)) {
      productCodes.push(code);
      productNames.push(name);
    }
  }

  return { countries, productCodes, productNames, year };
}

// 추출된 키워드 기반으로 무역 데이터 조회 후 컨텍스트 문자열 조립
export function buildChatContext(question: string): string {
  const { countries, productCodes, productNames, year } = extractKeywords(question);
  const tradeType = detectTradeType(question);
  const sections: string[] = [];

  // 전체 KPI 요약 (항상 포함)
  const kpi = (KPI_BY_YEAR as Record<string, {
    export: { value: string };
    import: { value: string };
    balance: { value: string };
  }>)[year];
  if (kpi) {
    sections.push(
      `[${year}년 전체 무역 요약]\n수출: ${kpi.export.value}억달러, 수입: ${kpi.import.value}억달러, 무역수지: ${kpi.balance.value}억달러`
    );
  }

  // 국가 순위 목록 — 순위 관련 질문이거나 특정 국가가 지정되지 않은 경우 포함
  if (isRankingQuery(question) || countries.length === 0) {
    const ranked = getCountryData(year, tradeType)
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 15);
    const lines = ranked.map(c =>
      `${c.rank}위: ${c.name} — ${tradeType === "수입" ? "수입" : "수출"} ${tradeType === "수입" ? c.import : c.export}억달러`
    );
    sections.push(`[${year}년 국가별 ${tradeType} 순위 TOP15]\n${lines.join("\n")}`);
  }

  // 특정 국가 상세 데이터
  for (const country of countries) {
    const countryData = getCountryData(year, tradeType).find(c => c.name === country);
    const kpiData = getCountryKpi(year, country);
    const timeseries = getCountryTimeseries(year, country);

    let section = `[${country} 교역 데이터 (${year}년)]\n`;
    if (countryData) {
      section += `수출순위: ${countryData.rank}위, 수출액: ${countryData.export}억달러, 수입액: ${countryData.import}억달러\n`;
      section += `주요수출품: ${countryData.topProducts.join(", ")}\n`;
      if (countryData.topImportProducts?.length) {
        section += `주요수입품: ${countryData.topImportProducts.join(", ")}\n`;
      }
    }
    if (kpiData) {
      section += `KPI — 수출: ${kpiData.export}, 수입: ${kpiData.import}, 수지: ${kpiData.balance}\n`;
    }
    if (timeseries.length > 0) {
      const recent = timeseries.slice(-3).map(m => `${m.month} 수출${m.export}억달러`).join(", ");
      section += `최근 월별: ${recent}`;
    }
    sections.push(section);
  }

  // 품목별 데이터
  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    const name = productNames[i];
    const topCountries = getProductTopCountries(code, year, tradeType);
    const trend = getProductTrend(code, tradeType);

    let section = `[${name} ${tradeType} 데이터]\n`;
    if (topCountries.length > 0) {
      section += `상위 ${tradeType}국: ${topCountries.slice(0, 5).map(c => `${c.country}(${c.value}억달러)`).join(", ")}\n`;
    }
    if (trend.length > 0) {
      const recent = trend.slice(-3).map(t => `${t.year}년 ${t.value}억달러`).join(", ");
      section += `연도별 추이: ${recent}`;
    }
    sections.push(section);
  }

  // 국가 × 품목 교차 데이터
  if (countries.length > 0 && productCodes.length > 0) {
    for (const country of countries) {
      const treemap = getCountryTreemapData(year, country, tradeType);
      const relevant = treemap.filter(p => productCodes.includes(p.code)).slice(0, 5);
      if (relevant.length > 0) {
        sections.push(
          `[${country} × 품목 교차 데이터]\n` +
          relevant.map(p => `${p.name}: ${p.value}억달러`).join(", ")
        );
      }
    }
  }

  return sections.join("\n\n");
}
