import {
  MTI_NAMES,
  DEFAULT_YEAR,
  KPI_BY_YEAR,
  MTI_LOOKUP,
} from "@/lib/data";
import { supabase } from "@/lib/supabase";
import {
  getProductTrendAsync,
  getProductTopCountriesAsync,
  getCountryRankingAsync,
  getCountryKpiAsync,
  getCountryTimeseriesAsync,
  getTreemapDataAsync,
} from "@/lib/dataSupabase";

interface ExtractedKeywords {
  countries: string[];
  productCodes: string[];
  productNames: string[];
  year: string;
}

// MTI_LOOKUP에서 품목명 → 코드 역조회 맵 구성 (경량, 전체 품목 포함)
function buildProductLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  const mti = MTI_LOOKUP as Record<string, string>;
  for (const [code, name] of Object.entries(mti)) {
    // 6자리 코드 우선, 이미 있으면 덮어쓰지 않음
    if (code.length === 6 && !lookup.has(name)) {
      lookup.set(name, code);
    }
  }
  return lookup;
}

// MTI_LOOKUP의 모든 코드로 접두사 세트 구성
function buildValidCodePrefixes(): Set<string> {
  const prefixes = new Set<string>();
  const mti = MTI_LOOKUP as Record<string, string>;
  for (const code of Object.keys(mti)) {
    for (let len = 1; len <= code.length; len++) {
      prefixes.add(code.slice(0, len));
    }
  }
  return prefixes;
}

const PRODUCT_LOOKUP = buildProductLookup();
const VALID_CODE_PREFIXES = buildValidCodePrefixes();

// 국가명 목록 — 캐시, Supabase에서 비동기 로드
let _countryListCache: string[] | null = null;
async function getCountryList(): Promise<string[]> {
  if (_countryListCache) return _countryListCache;
  try {
    const ranks = await getCountryRankingAsync(DEFAULT_YEAR, "수출");
    _countryListCache = ranks.map(r => r.country);
    return _countryListCache;
  } catch {
    return [];
  }
}

// 대시보드 라우팅 버튼 타입
export interface RouteButton {
  label: string;
  href: string;
  type?: "exact" | "candidate"; // exact: 정확 매칭, candidate: 유사 후보
}

// 한국어 조사 목록 (단어 경계 판별용)
const KR_PARTICLES = ["이", "가", "은", "는", "을", "를", "의", "에", "에서", "로", "으로", "와", "과", "도", "만", "이고", "이며", "인", "까지", "부터", "한테", "에게"];

// 질문에서 품목명이 독립된 단어로 포함되어 있는지 확인 (조사 허용, 공백 포함 이름 지원)
function isExactWordMatch(question: string, name: string): boolean {
  // 공백 포함 이름 (예: "플라스틱 제품") — question 안에 포함되는지 직접 확인
  const idx = question.indexOf(name);
  if (idx === -1) return false;
  // 이름 뒤에 오는 문자가 조사이거나 끝이면 매칭
  const after = question.slice(idx + name.length);
  if (after === "") return true;
  if (KR_PARTICLES.some(p => after.startsWith(p))) return true;
  // 뒤에 공백/구두점이면 OK
  if (/^[\s,?.!·。、]/.test(after)) return true;
  return false;
}

// 질문에서 라우팅 가능한 버튼 목록 반환
export async function resolveRouteButtons(question: string): Promise<RouteButton[]> {
  const { countries, productNames } = await extractKeywords(question);
  const buttons: RouteButton[] = [];

  // 탭 키워드 감지
  const isTimeseriesQuery = /추이|시계열|연도별|트렌드|변화|증감/.test(question);
  const isCountriesQuery = /상위 ?국가|상위국|주요 ?수출국|주요 ?수입국|국가별|나라별|어느 나라|어떤 나라|높은 나라|높은 국가|많은 나라|많은 국가/.test(question);

  // MTI 단위 감지 (1,2,3,4,6단위)
  const mtiDepthMatch = question.match(/MTI\s*([1-6])단위|([1-6])단위\s*MTI/i);
  const detectedMtiDepth = mtiDepthMatch ? (mtiDepthMatch[1] ?? mtiDepthMatch[2]) : null;

  // 연도 감지 (DEFAULT_YEAR와 다를 때만 파라미터 추가)
  const { year } = await extractKeywords(question);
  const detectedYear = year !== DEFAULT_YEAR ? year : null;

  // 국가 버튼 (정확 매칭, 수입/수출 + 탭 + 연도 반영)
  if (countries.length > 0) {
    const tradeType = detectTradeType(question);
    const params = new URLSearchParams();
    if (tradeType === "수입") params.set("mode", "import");
    if (isTimeseriesQuery) params.set("tab", "timeseries");
    if (detectedYear) params.set("year", detectedYear);
    if (detectedMtiDepth) params.set("mtiDepth", detectedMtiDepth);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    buttons.push({
      label: `${countries[0]} ${tradeType} 데이터 확인하기`,
      href: `/country/${encodeURIComponent(countries[0])}${queryString}`,
      type: "exact",
    });
  }

  const mtiLookup = MTI_LOOKUP as Record<string, string>;

  // 1단계: MTI_LOOKUP value에서 정확 매칭 (단어 단위로만 매칭)
  const exactMtiMatches: { code: string; name: string }[] = [];
  for (const [code, name] of Object.entries(mtiLookup)) {
    if (name.length >= 2 && isExactWordMatch(question, name)) {
      exactMtiMatches.push({ code, name });
    }
  }

  if (exactMtiMatches.length > 0) {
    // 가장 짧은 코드(상위 카테고리) 선택
    exactMtiMatches.sort((a, b) => a.code.length - b.code.length);
    const best = exactMtiMatches[0];
    const params = new URLSearchParams();
    if (best.code.length < 6) params.set("code", best.code);
    if (isCountriesQuery) params.set("tab", "countries");
    if (detectedYear) params.set("year", detectedYear);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    buttons.push({
      label: `${best.name} 데이터 확인하기`,
      href: `/product/${encodeURIComponent(best.name)}${queryString}`,
      type: "exact",
    });
  } else if (productNames.length > 0) {
    // TREEMAP 품목명 정확 매칭
    const params = new URLSearchParams();
    if (isCountriesQuery) params.set("tab", "countries");
    if (detectedYear) params.set("year", detectedYear);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    buttons.push({
      label: `${productNames[0]} 데이터 확인하기`,
      href: `/product/${encodeURIComponent(productNames[0])}${queryString}`,
      type: "exact",
    });
  } else {
    // 2단계: 유사 후보 탐색 (질문 단어 안에 MTI값이 포함된 경우)
    const tokens = question.split(/[\s,·.?!、。]+/).filter(t => t.length >= 2);
    const candidateMap = new Map<string, string>(); // code → name

    for (const [code, name] of Object.entries(mtiLookup)) {
      if (name.length < 2) continue;
      for (const token of tokens) {
        if (token.includes(name)) {
          candidateMap.set(code, name);
          break;
        }
      }
    }

    // 찾은 후보의 하위 카테고리도 포함 (코드가 후보코드로 시작하는 것)
    for (const [parentCode] of Array.from(candidateMap.entries())) {
      for (const [code, name] of Object.entries(mtiLookup)) {
        if (code !== parentCode && code.startsWith(parentCode) && code.length <= parentCode.length + 2) {
          candidateMap.set(code, name);
        }
      }
    }

    // 실제 데이터가 있는 코드만 필터링 후 코드 길이 순 정렬, 최대 4개
    const candidates = Array.from(candidateMap.entries())
      .map(([code, name]) => ({ code, name }))
      .filter(({ code }) => VALID_CODE_PREFIXES.has(code))
      .sort((a, b) => a.code.length - b.code.length)
      .slice(0, 4);

    for (const c of candidates) {
      const codeQuery = c.code.length < 6 ? `?code=${c.code}` : "";
      buttons.push({
        label: `${c.name}(${c.code})`,
        href: `/product/${encodeURIComponent(c.name)}${codeQuery}`,
        type: "candidate",
      });
    }
  }

  return buttons;
}

// 질문에서 수출/수입 방향 감지
function detectTradeType(question: string): "수출" | "수입" {
  if (question.includes("수입")) return "수입";
  return "수출";
}

// 분석/원인 질문인지 감지
function isAnalysisQuery(question: string): boolean {
  const keywords = [
    "왜", "이유", "원인", "배경", "영향", "요인", "때문",
    "어떻게", "변화", "증가", "감소", "하락", "상승", "추이",
  ];
  return keywords.some(kw => question.includes(kw));
}

// 거시경제 지표 언급 감지
function detectMacroKeywords(question: string): string[] {
  const MACRO_KEYWORD_MAP: Record<string, string[]> = {
    KR_BASE_RATE: ["금리", "기준금리", "한국은행", "통화정책"],
    KR_BSI_MFG: ["BSI", "bsi", "기업경기", "제조업 경기", "경기실사"],
    KR_BSI_NON_MFG: ["비제조업", "서비스업 경기"],
    KR_EBSI: ["EBSI", "ebsi", "수출기업", "수출 경기"],
    KR_PROD_YOY: ["산업생산", "생산지수", "생산 증감"],
    KR_CPI_YOY: ["물가", "CPI", "cpi", "인플레이션", "소비자물가"],
    US_BASE_RATE: ["미국 금리", "연준", "Fed", "fed", "연방기금"],
    US_PMI_MFG: ["미국 PMI", "미국 제조업", "ISM"],
    CN_BASE_RATE: ["중국 금리", "인민은행", "LPR"],
    CN_PMI_MFG: ["중국 PMI", "중국 제조업"],
    BRENT_OIL: ["유가", "원유", "브렌트", "오일"],
    SCFI: ["SCFI", "scfi", "운임", "컨테이너", "해운", "물류비"],
  };
  const matched: string[] = [];
  for (const [key, keywords] of Object.entries(MACRO_KEYWORD_MAP)) {
    if (keywords.some(kw => question.includes(kw))) {
      matched.push(key);
    }
  }
  return matched;
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

// 품목 개요 관련 질문인지 감지
function isProductOverviewQuery(question: string): boolean {
  const keywords = [
    "MTI", "mti", "품목별", "상품별", "제품별",
    "품목 현황", "품목 통계", "품목 순위", "상품 현황", "상품 통계",
    "어떤 품목", "어떤 상품", "주요 품목", "주요 상품",
    "무슨 제품", "뭘 수출", "뭘 수입", "많이 팔리는", "많이 팔린",
  ];
  return keywords.some(kw => question.includes(kw));
}

// 질문에서 국가명, 품목명, 연도 추출 (부분 일치)
export async function extractKeywords(question: string): Promise<ExtractedKeywords> {
  const yearMatch = question.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : DEFAULT_YEAR;

  const countryList = await getCountryList();
  const countries = countryList.filter(name => question.includes(name));

  const productCodes: string[] = [];
  const productNames: string[] = [];

  // 1단계: TREEMAP 품목명 매칭 (6단위 코드)
  for (const [name, code] of PRODUCT_LOOKUP.entries()) {
    if (question.includes(name) && !productCodes.includes(code)) {
      productCodes.push(code);
      productNames.push(name);
    }
  }
  // 2단계: MTI_LOOKUP 매칭 — TREEMAP에 없는 품목도 인식 (완구, 악기, 플라스틱 제품 등)
  if (productCodes.length === 0) {
    const mtiLookup = MTI_LOOKUP as Record<string, string>;
    const mtiMatches: { code: string; name: string }[] = [];
    for (const [code, name] of Object.entries(mtiLookup)) {
      if (name.length >= 2 && isExactWordMatch(question, name)) {
        mtiMatches.push({ code, name });
      }
    }
    // 4자리 코드 우선 (집계 단위, 하위 6자리 합산 가능), 그 다음 6자리, 그 외
    mtiMatches.sort((a, b) => {
      const aScore = a.code.length === 4 ? 0 : a.code.length === 6 ? 1 : 2;
      const bScore = b.code.length === 4 ? 0 : b.code.length === 6 ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      return b.code.length - a.code.length;
    });
    for (const m of mtiMatches) {
      if (!productCodes.includes(m.code)) {
        productCodes.push(m.code);
        productNames.push(m.name);
        break; // 가장 적합한 1개만
      }
    }
  }

  return { countries, productCodes, productNames, year };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MacroRow = Record<string, any>;

// 거시경제 지표 컨텍스트 조립 — Supabase에서 직접 조회
async function buildMacroContext(question: string, year: string): Promise<string> {
  const { data: allRows, error } = await supabase
    .from("macro_indicators")
    .select("*")
    .order("YYMM", { ascending: false });

  if (error || !allRows || allRows.length === 0) return "";

  const macroKeys = detectMacroKeywords(question);
  const analysis = isAnalysisQuery(question);

  let filtered: MacroRow[];
  if (macroKeys.length > 0) {
    filtered = allRows;
  } else if (analysis) {
    const prevYear = String(parseInt(year) - 1);
    filtered = allRows.filter((r: MacroRow) => {
      const ym = String(r.YYMM);
      return ym.startsWith(year) || ym.startsWith(prevYear);
    });
  } else {
    filtered = allRows.filter((r: MacroRow) => String(r.YYMM).startsWith(year));
  }

  if (filtered.length === 0) return "";

  const fmtPct = (v: number | null) => v == null ? "-" : `${(Number(v) * 100).toFixed(1)}%`;
  const fmtNum = (v: number | null, d = 1) => v == null ? "-" : Number(v).toFixed(d);

  const header = "기준년월 | 한국금리 | 제조업BSI | 비제조BSI | EBSI | 산업생산 | CPI | 미국금리 | 미국PMI | 중국금리 | 중국PMI | 브렌트유 | SCFI";
  const dataRows = filtered.map((d: MacroRow) =>
    `${d.YYMM} | ${fmtPct(d.KR_BASE_RATE)} | ${fmtNum(d.KR_BSI_MFG, 0)} | ${fmtNum(d.KR_BSI_NON_MFG, 0)} | ${fmtNum(d.KR_EBSI, 1)} | ${fmtPct(d.KR_PROD_YOY)} | ${fmtPct(d.KR_CPI_YOY)} | ${fmtPct(d.US_BASE_RATE)} | ${fmtNum(d.US_PMI_MFG, 1)} | ${fmtPct(d.CN_BASE_RATE)} | ${fmtNum(d.CN_PMI_MFG, 1)} | $${fmtNum(d.BRENT_OIL, 1)} | ${fmtNum(d.SCFI, 0)}`
  );

  const guide = `[지표 해석 가이드 — 반드시 준수]
※ 아래 기준을 정확히 적용하세요. 잘못 해석하면 안 됩니다.
- BSI/EBSI: 기준선은 100입니다. 100 이상 = 긍정적(경기 확장 전망), 100 미만 = 부정적(경기 위축 전망).
- PMI: 기준선은 50입니다. 50 이상 = 경기 확장, 50 미만 = 경기 위축.
- 금리: 소수로 표기됩니다 (0.025 = 2.5%). 답변 시 백분율로 변환하세요.
- 산업생산/CPI: 전년 동기 대비 증감률(소수). 0.07 = 7% 증가, -0.003 = 0.3% 감소.
- 브렌트유: 달러/배럴($/bbl) 단위.
- SCFI: 상하이컨테이너운임지수. 숫자가 클수록 해운 운임이 높음.`;

  return `[거시경제 지표]\n${header}\n${dataRows.join("\n")}\n\n${guide}`;
}

// 추출된 키워드 기반으로 무역 데이터 조회 후 컨텍스트 문자열 조립
export async function buildChatContext(question: string): Promise<string> {
  const { countries, productCodes, productNames, year } = await extractKeywords(question);
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

  // 품목 개요 — Supabase에서 조회
  if (isProductOverviewQuery(question) || (productCodes.length === 0 && countries.length === 0)) {
    try {
      const products = await getTreemapDataAsync(year, tradeType);
      const top15 = products.slice(0, 15);
      const mtiNames = MTI_NAMES as Record<number, string>;
      const lines = top15.map((p, i) =>
        `${i + 1}위: ${p.name} (${mtiNames[p.mti] ?? "기타"}) — ${tradeType} ${p.value.toFixed(1)}억달러`
      );
      sections.push(`[${year}년 품목별 ${tradeType} TOP15]\n${lines.join("\n")}`);
    } catch { /* 조회 실패 시 생략 */ }
  }

  // 국가 순위 목록 — Supabase에서 조회
  if (isRankingQuery(question) || countries.length === 0) {
    try {
      const ranks = await getCountryRankingAsync(year, tradeType);
      const top15 = ranks.slice(0, 15);
      const fmt1 = (v: number) => (Math.round(v / 1e8 * 10) / 10).toFixed(1);
      const lines = top15.map((c, i) =>
        `${i + 1}위: ${c.country} — ${tradeType} ${fmt1(tradeType === "수입" ? c.imp_amt : c.exp_amt)}억달러`
      );
      sections.push(`[${year}년 국가별 ${tradeType} 순위 TOP15]\n${lines.join("\n")}`);
    } catch { /* 조회 실패 시 생략 */ }
  }

  // 특정 국가 상세 데이터 — Supabase에서 조회
  for (const country of countries) {
    try {
      const ranks = await getCountryRankingAsync(year, tradeType);
      const countryRank = ranks.find(r => r.country === country);
      const kpiData = await getCountryKpiAsync(year, country);
      const timeseries = await getCountryTimeseriesAsync(year, country);

      let section = `[${country} 교역 데이터 (${year}년)]\n`;
      if (countryRank) {
        const fmt1 = (v: number) => (Math.round(v / 1e8 * 10) / 10).toFixed(1);
        section += `수출순위: ${countryRank.rank_exp}위, 수출액: ${fmt1(countryRank.exp_amt)}억달러, 수입액: ${fmt1(countryRank.imp_amt)}억달러\n`;
      }
      if (kpiData) {
        section += `KPI — 수출: ${kpiData.export}억달러, 수입: ${kpiData.import}억달러, 수지: ${kpiData.balance}억달러\n`;
      }
      if (timeseries.length > 0) {
        const recent = timeseries.slice(-3).map(m => `${m.month} 수출${m.export}억달러`).join(", ");
        section += `최근 월별: ${recent}`;
      }
      sections.push(section);
    } catch { /* 조회 실패 시 생략 */ }
  }

  // 품목별 데이터 — Supabase 집계 테이블에서 조회 (전체 품목, Top N 제한 없음)
  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    const name = productNames[i];

    let trend: { year: string; value: number }[] = [];
    let topCountries: { country: string; value: number }[] = [];
    try {
      [trend, topCountries] = await Promise.all([
        getProductTrendAsync(code, tradeType),
        getProductTopCountriesAsync(code, year, tradeType),
      ]);
    } catch { /* Supabase 조회 실패 시 빈 데이터로 진행 */ }

    let section = `[${name} ${tradeType} 데이터]\n`;
    if (topCountries.length > 0) {
      section += `상위 ${tradeType}국: ${topCountries.slice(0, 5).map(c => `${c.country}(${c.value}억달러)`).join(", ")}\n`;
    }
    if (trend.length > 0) {
      const recent = trend.slice(-3).map(t => {
        const cleanYear = String(t.year).replace(/\(.*\)/, "").trim();
        return `${cleanYear}년 ${t.value}억달러`;
      }).join(", ");
      section += `연도별 추이: ${recent}`;
    }
    if (topCountries.length === 0 && trend.length === 0) {
      section += `해당 품목의 ${tradeType} 데이터가 없습니다.`;
    }
    sections.push(section);
  }

  // 국가 × 품목 교차 데이터 — Supabase에서 조회
  if (countries.length > 0 && productCodes.length > 0) {
    for (const country of countries) {
      try {
        const mtiLookup = MTI_LOOKUP as Record<string, string>;
        const results: string[] = [];
        for (const code of productCodes) {
          const topCountries = await getProductTopCountriesAsync(code, year, tradeType);
          const match = topCountries.find(c => c.country === country);
          if (match && match.value > 0) {
            results.push(`${mtiLookup[code] ?? code}: ${match.value}억달러`);
          }
        }
        if (results.length > 0) {
          sections.push(`[${country} × 품목 교차 데이터]\n${results.join(", ")}`);
        }
      } catch { /* 조회 실패 시 무시 */ }
    }
  }

  // 거시경제 지표 컨텍스트
  const macroCtx = await buildMacroContext(question, year);
  if (macroCtx) {
    sections.push(macroCtx);
  }

  return sections.join("\n\n");
}
