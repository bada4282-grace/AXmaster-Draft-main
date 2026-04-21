import {
  MTI_NAMES,
  DEFAULT_YEAR,
  KPI_BY_YEAR,
  MTI_LOOKUP,
} from "@/lib/data";
import { supabase, getLatestYYMM } from "@/lib/supabase";
import {
  getProductTrendAsync,
  getProductTopCountriesAsync,
  getCountryRankingAsync,
  getCountryKpiAsync,
  getCountryTimeseriesAsync,
  getTreemapDataAsync,
  getCountryTreemapDataAsync,
} from "@/lib/dataSupabase";
import { resolveProductCodesViaLLM } from "@/lib/productResolver";

interface ExtractedKeywords {
  countries: string[];
  productCodes: string[];
  productNames: string[];
  year: string;
}

// 사용자가 현재 보고 있는 대시보드 페이지의 상태
// (URL에서 추출 — 국가 페이지, 품목 페이지 등)
export interface PageContext {
  country?: string;
  productName?: string;
  productCode?: string;
  year?: string;
  /** "01" ~ "12" 형식. 홈 필터에서 특정 월이 선택된 경우. */
  month?: string;
  tradeType?: "수출" | "수입";
  view?: "timeseries" | "products" | "countries" | "trend";
  /** 품목별 트리맵의 그룹핑 깊이 (1~6). */
  mtiDepth?: number;
}

// MTI_LOOKUP에서 품목명 → 코드 역조회 맵 구성 (1~6자리 전체 포함)
// 길이 내림차순으로 채워 더 구체적인 6자리 품목이 먼저 이름 선점 —
// 동명이인(예: "나일론섬유" 4113 vs 411300)은 6자리가 이겨 기존 동작 보존.
// 이후 4·3·2·1자리 상위 카테고리명이 추가로 등록되어
// "섬유류"(4) / "직물"(43) / "인조섬유"(411) 같은 자연어 질의를 정확 매칭 가능.
function buildProductLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  const mti = MTI_LOOKUP as Record<string, string>;
  const entries = Object.entries(mti).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [code, name] of entries) {
    if (name.length >= 2 && !lookup.has(name)) {
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

  // 국가 버튼 — 언급된 모든 국가에 대해 개별 생성, 국가별 수출/수입 판단
  for (const country of countries) {
    const tradeType = detectTradeTypeForCountry(question, country);
    const params = new URLSearchParams();
    if (tradeType === "수입") params.set("mode", "import");
    if (isTimeseriesQuery) params.set("tab", "timeseries");
    if (detectedYear) params.set("year", detectedYear);
    if (detectedMtiDepth) params.set("mtiDepth", detectedMtiDepth);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    buttons.push({
      label: `${country} ${tradeType} 데이터 확인하기`,
      href: `/country/${encodeURIComponent(country)}${queryString}`,
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
    // 무역 일반 용어는 제외 (품목이 아닌 단어가 매칭되는 것 방지)
    const EXCLUDE_TOKENS = new Set(["무역", "무역수지", "수지", "수출", "수입", "수출입", "증감", "증감률", "현황", "추이", "데이터"]);
    const tokens = question.split(/[\s,·.?!、。]+/).filter(t => t.length >= 2 && !EXCLUDE_TOKENS.has(t));
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

  // 무역수지/전체 현황 질문 시 메인 대시보드 버튼
  if (/무역수지|무역 현황|전체 현황|총 수출|총 수입/.test(question) && buttons.length === 0) {
    buttons.push({
      label: "전체 무역 현황 대시보드",
      href: "/",
      type: "exact",
    });
  }

  return buttons;
}

// 질문에서 수출/수입 방향 감지
// pageContext.tradeType은 질문이 화면을 참조할 때만 폴백으로 사용
function detectTradeType(question: string, pageContext?: PageContext): "수출" | "수입" {
  if (question.includes("수입")) return "수입";
  if (question.includes("수출")) return "수출";
  if (questionReferencesScreen(question) && pageContext?.tradeType) return pageContext.tradeType;
  return "수출";
}

// 특정 국가명 주변 맥락에서 수출/수입 감지 (국가별 개별 판단)
function detectTradeTypeForCountry(question: string, country: string): "수출" | "수입" {
  // 국가명 근처(10글자 이내)에서 수출/수입 감지
  const idx = question.indexOf(country);
  if (idx >= 0) {
    // 국가명 앞 10글자 + 뒤 10글자 범위에서 탐색
    const before = question.slice(Math.max(0, idx - 10), idx);
    const after = question.slice(idx, idx + country.length + 10);
    const context = before + after;
    if (/수출/.test(context)) return "수출";
    if (/수입/.test(context)) return "수입";
  }
  // "대{국가}" 패턴
  if (question.includes(`대${country}`)) {
    const afterDae = question.slice(question.indexOf(`대${country}`) + country.length + 1, question.indexOf(`대${country}`) + country.length + 5);
    if (afterDae.includes("수출")) return "수출";
    if (afterDae.includes("수입")) return "수입";
  }
  return detectTradeType(question);
}

// 분석/원인 질문인지 감지
function isAnalysisQuery(question: string): boolean {
  const keywords = [
    "왜", "이유", "원인", "배경", "영향", "요인", "때문",
    "어떻게", "변화", "증가", "감소", "하락", "상승", "추이",
  ];
  return keywords.some(kw => question.includes(kw));
}

// 거시경제 지표를 포괄적으로 지칭하는 일반 표현
const MACRO_GENERAL_KEYWORDS = [
  "거시경제", "거시 경제", "거시지표", "거시 지표",
  "경제지표", "경제 지표", "경기지표", "경기 지표",
  "경제환경", "경제 환경", "경기환경", "경기 환경",
  "경제상황", "경제 상황", "경기상황", "경기 상황",
  "거시환경", "거시 환경",
  "한국 경제", "글로벌 경제", "세계 경제",
];

// 거시경제 지표 언급 감지
function detectMacroKeywords(question: string): string[] {
  if (MACRO_GENERAL_KEYWORDS.some(kw => question.includes(kw))) {
    return ["__GENERAL__"];
  }
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

// ─── 데이터 커버리지 판정 ────────────────────────────────────────────────
// trade_mti6의 최신 YYMM을 기준으로 "해당 연도가 부분 집계인지"를 판별
// (LLM이 2026년 1~2월 누적치를 연간 합계로 오해하는 문제를 방지)
// getLatestYYMM은 lib/supabase.ts에서 공용 import (UI 배지와 단일 소스 공유)

// 특정 연도에 대한 커버리지 주석 반환 — null이면 완전 집계
async function getYearCoverageNote(year: string): Promise<string | null> {
  const latest = await getLatestYYMM();
  if (!latest) return null;
  const latestYear = latest.slice(0, 4);
  const latestMonth = parseInt(latest.slice(4, 6), 10);
  if (year > latestYear) return `${year}년 데이터 없음`;
  if (year < latestYear) return null;
  if (!latestMonth || latestMonth >= 12) return null;
  return `${year}년은 1~${latestMonth}월까지만 집계되어 있으며 연간 합계가 아닌 부분 누적치입니다`;
}

// 부분 집계 연도에 대해 "같은 기간 전년 누적"을 계산해 반환
// (LLM이 월평균 환산 같은 잘못된 비교를 시도하지 않도록, 유효 비교치를 미리 만들어 컨텍스트에 박아넣는 용도)
interface SamePeriodYoY {
  monthRange: string;
  currAmt: number;
  prevAmt: number;
  yoyPct: number | null;
}

// 단일 월·direction의 해당 product code prefix 합계 조회 — 프로세스 레벨 캐시
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _monthlyProductSumCache = new Map<string, Promise<Array<{ code: string; amt: number }>>>();
async function getMonthlyTreemapRows(
  yymm: string,
  mode: "export" | "import",
): Promise<Array<{ code: string; amt: number }>> {
  const key = `${yymm}_${mode}`;
  const cached = _monthlyProductSumCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const { data, error } = await supabase.rpc("get_treemap_mti6", {
      p_yymm: yymm,
      p_mode: mode,
      p_mti_depth: 6,
    });
    if (error || !data) return [];
    return (data as Array<{ mti_cd: string; total_amt: number }>).map((r) => ({
      code: String(r.mti_cd),
      amt: Number(r.total_amt) || 0,
    }));
  })();
  _monthlyProductSumCache.set(key, promise);
  return promise;
}

async function getProductSamePeriodYoY(
  code: string,
  year: string,
  tradeType: "수출" | "수입",
): Promise<SamePeriodYoY | null> {
  const latest = await getLatestYYMM();
  if (!latest) return null;
  const latestYear = latest.slice(0, 4);
  const latestMonth = parseInt(latest.slice(4, 6), 10);
  // 부분 집계 연도가 아니면 유효 비교 불필요(전체 연도 trend로 충분)
  if (year !== latestYear || !latestMonth || latestMonth >= 12) return null;

  const prevYear = String(parseInt(year, 10) - 1);
  const mode = tradeType === "수입" ? "import" : "export";
  const months = Array.from({ length: latestMonth }, (_, i) => i + 1);

  const sumForYear = async (yr: string) => {
    const results = await Promise.all(
      months.map((m) => getMonthlyTreemapRows(`${yr}${String(m).padStart(2, "0")}`, mode)),
    );
    let total = 0;
    for (const rows of results) {
      for (const row of rows) {
        if (row.code.startsWith(code)) total += row.amt;
      }
    }
    return total / 1e8; // 원단위 달러 → 억달러
  };

  const [currAmt, prevAmt] = await Promise.all([sumForYear(year), sumForYear(prevYear)]);
  const yoyPct = prevAmt > 0 ? ((currAmt - prevAmt) / prevAmt) * 100 : null;
  const monthRange = latestMonth === 1 ? "1월" : `1~${latestMonth}월`;
  return { monthRange, currAmt, prevAmt, yoyPct };
}

// 질문이 "지금 보고 있는 화면"을 참조하는지 감지
// 화면 참조가 있을 때만 pageContext(연도/국가/방향/뷰)를 기본값으로 사용하여,
// 일반 질문이 페이지 상태에 이끌리지 않도록 한다.
export function questionReferencesScreen(question: string): boolean {
  const markers = [
    // 화면·페이지·위치 표현
    "화면", "이 페이지", "이 화면", "이 곳", "여기",
    "대시보드", "이 대시보드", "현재 대시보드",
    // 대시보드 구성 요소(사용자가 보고 있는 것을 지칭)
    "트리맵", "차트", "그래프", "지도", "시각화",
    // 관찰/표시 표현
    "지금 보", "지금 보이", "현재 보", "보고 있", "보이는",
    "나와 있", "나온 내용", "나온 것", "표시된", "표시되어",
  ];
  return markers.some(m => question.includes(m));
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
// pageContext는 질문이 화면을 명시적으로 참조할 때만 폴백으로 사용
// (일반 질문이 페이지 상태에 이끌리지 않도록 엄격 분리)
// 부분 집계 연도를 회피하는 기본 분석 연도 결정.
// - DEFAULT_YEAR (예: 2026) 이 부분 집계라면 전년(2025) 을 기본값으로 사용.
// - "일반 추천/분석" 질문이 부분 데이터로 답해지는 것을 방지하기 위함.
async function getDefaultAnalysisYear(): Promise<string> {
  const partialNote = await getYearCoverageNote(DEFAULT_YEAR);
  if (partialNote) return String(parseInt(DEFAULT_YEAR, 10) - 1);
  return DEFAULT_YEAR;
}

export async function extractKeywords(
  question: string,
  pageContext?: PageContext,
): Promise<ExtractedKeywords> {
  const yearMatch = question.match(/\b(20\d{2})\b/);
  const usePageFallback = questionReferencesScreen(question);
  const mentionsCurrentYear = /올해|현재|이번\s*년|이번\s*연도/.test(question);
  const mentionsLastYear = /작년|지난해|전년/.test(question);

  // Year 결정 우선순위:
  // 1. 질문 내 명시 연도(예: "2025년") → 그대로 사용
  // 2. 사용자가 화면을 참조하고 pageContext.year 있음 → pageContext.year 사용
  // 3. "올해·현재" 표현 → DEFAULT_YEAR (부분집계라도 사용자 의도에 부합)
  // 4. "작년·지난해" 표현 → DEFAULT_YEAR − 1
  // 5. 일반 질문 → 최신 완전 연도(getDefaultAnalysisYear) — 부분 집계 연도 회피
  let year: string;
  if (yearMatch) {
    year = yearMatch[1];
  } else if (usePageFallback && pageContext?.year) {
    year = pageContext.year;
  } else if (mentionsCurrentYear) {
    year = DEFAULT_YEAR;
  } else if (mentionsLastYear) {
    year = String(parseInt(DEFAULT_YEAR, 10) - 1);
  } else {
    year = await getDefaultAnalysisYear();
  }

  const countryList = await getCountryList();
  const countries = countryList.filter(name => question.includes(name));
  if (countries.length === 0 && usePageFallback && pageContext?.country) {
    countries.push(pageContext.country);
  }

  const productCodes: string[] = [];
  const productNames: string[] = [];

  // 복합 질의("섬유류 + 커튼 + 합성섬유") 및 카테고리성 세부 분해("합성섬유" → 폴리에스터·나일론·아크릴…)
  // 대응을 위해 최대 8개까지 추출. 1·2단위 상위 코드부터 6자리 구체 품목까지 자유롭게 혼재 가능.
  // 상위·하위 카테고리 공존 허용(예: "4" 섬유류와 "411" 합성섬유를 동시에 추출) —
  // dataSupabase는 코드별로 별도 쿼리를 돌리므로 이중 집계가 아닌 독립 섹션으로 주입된다.
  // 동일 코드 중복만 productCodes.includes()로 방지.
  const MAX_PRODUCTS = 8;

  // 1단계: PRODUCT_LOOKUP 매칭 (1~6자리 전체, 단어 경계 확인)
  for (const [name, code] of PRODUCT_LOOKUP.entries()) {
    if (productCodes.length >= MAX_PRODUCTS) break;
    if (!isExactWordMatch(question, name)) continue;
    if (productCodes.includes(code)) continue;
    productCodes.push(code);
    productNames.push(name);
  }
  // 2단계: MTI_LOOKUP 보완 매칭 — PRODUCT_LOOKUP에서 선점당한 동명 상위명 회수
  // (예: "나일론섬유"가 6자리에 이름을 양보받은 4자리 코드 등)
  if (productCodes.length < MAX_PRODUCTS) {
    const mtiLookup = MTI_LOOKUP as Record<string, string>;
    const mtiMatches: { code: string; name: string }[] = [];
    for (const [code, name] of Object.entries(mtiLookup)) {
      if (name.length >= 2 && isExactWordMatch(question, name)) {
        mtiMatches.push({ code, name });
      }
    }
    // 4자리 코드 우선(집계 단위), 그 다음 3자리·6자리·그 외
    mtiMatches.sort((a, b) => {
      const score = (len: number) =>
        len === 4 ? 0 : len === 3 ? 1 : len === 6 ? 2 : 3;
      const aScore = score(a.code.length);
      const bScore = score(b.code.length);
      if (aScore !== bScore) return aScore - bScore;
      return b.code.length - a.code.length;
    });
    for (const m of mtiMatches) {
      if (productCodes.length >= MAX_PRODUCTS) break;
      if (productCodes.includes(m.code)) continue;
      productCodes.push(m.code);
      productNames.push(m.name);
    }
  }

  // LLM 폴백: 아직 MAX_PRODUCTS에 못 미치면 LLM이 오타 교정·의미 유사(≥90%) 매핑으로 보완
  // "섬유류" "커튼"이 규칙 기반으로 잡혔어도 "합성섬유"는 LLM(또는 COMMON_SYNONYMS)이 추가 해소.
  if (productCodes.length < MAX_PRODUCTS && hasProductIntent(question)) {
    try {
      const resolved = await resolveProductCodesViaLLM(question);
      for (const r of resolved) {
        if (productCodes.length >= MAX_PRODUCTS) break;
        if (productCodes.includes(r.code)) continue;
        productCodes.push(r.code);
        productNames.push(r.name);
      }
    } catch {
      /* LLM 폴백 실패 시 무시 */
    }
  }

  // 페이지 컨텍스트 폴백: 품목 상세 페이지에서 질문이 품목명을 생략한 경우
  // 단, 화면을 명시적으로 참조할 때만 적용
  if (
    productCodes.length === 0 &&
    usePageFallback &&
    pageContext?.productCode &&
    pageContext?.productName
  ) {
    productCodes.push(pageContext.productCode);
    productNames.push(pageContext.productName);
  }

  return { countries, productCodes, productNames, year };
}

// 질문이 "품목"에 대한 의도를 담고 있는지 간단 판별
// 단순 인사/국가·거시 질문에서 불필요한 LLM 호출을 방지
function hasProductIntent(question: string): boolean {
  if (question.trim().length < 3) return false;
  const markers = [
    "수출", "수입", "교역", "무역",
    "품목", "품", "제품", "상품", "분야", "산업",
    "추이", "순위", "점유율", "비중", "시장",
  ];
  return markers.some((m) => question.includes(m));
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
// pageContext가 있으면 사용자가 현재 보고 있는 화면 상태를 기준으로 답변
export async function buildChatContext(
  question: string,
  pageContext?: PageContext,
): Promise<string> {
  const { countries, productCodes, productNames, year } = await extractKeywords(question, pageContext);
  const tradeType = detectTradeType(question, pageContext);
  // 질문에 수출·수입이 함께 등장하면 양방향 데이터를 모두 제공
  const mentionsExport = question.includes("수출");
  const mentionsImport = question.includes("수입");
  const productTradeTypes: ("수출" | "수입")[] = mentionsExport && mentionsImport
    ? ["수출", "수입"]
    : [tradeType];

  // 현재(입력) 연도가 부분 집계인지 — 전년 동기 유효 비교 계산 여부 판단에 사용
  const annualCoverageNote = await getYearCoverageNote(year);
  const isAnnualIncomplete = annualCoverageNote !== null;
  const sections: string[] = [];

  // 현재 보고 있는 화면 상태 — 사용자가 **화면을 명시적으로 참조할 때만** 주입.
  // 일반 질문(예: "베트남 제약 수출 월별 변동 이유") 에는 절대 주입하지 않아,
  // LLM 답변 본문에 pageContext 가 누수되는 것을 방지한다.
  const referencesScreen = questionReferencesScreen(question);
  const hasAnyPageSignal =
    !!pageContext &&
    (pageContext.country ||
      pageContext.productName ||
      pageContext.view ||
      pageContext.month ||
      pageContext.mtiDepth);
  if (referencesScreen && pageContext && hasAnyPageSignal) {
    const parts: string[] = [];
    // 화면 종류 분류 — LLM 이 "홈 전체 집계" vs "국가 상세" vs "품목 상세" 를 혼동하지 않도록 명시
    const isCountryPage = !!pageContext.country && !pageContext.productName;
    const isProductPage = !!pageContext.productName;
    const isHome = !isCountryPage && !isProductPage;

    if (isHome) {
      parts.push("페이지: 홈 대시보드 (한국 전체 집계)");
    } else if (isCountryPage) {
      parts.push(`페이지: 국가 상세 — ${pageContext.country}`);
    } else if (isProductPage) {
      parts.push(`페이지: 품목 상세 — ${pageContext.productName}${pageContext.productCode ? ` (MTI ${pageContext.productCode})` : ""}`);
    }

    parts.push(`연도: ${year}년`);
    if (pageContext.month) {
      const mm = parseInt(pageContext.month, 10);
      if (mm >= 1 && mm <= 12) parts.push(`월 필터: ${mm}월`);
    }
    parts.push(`방향: ${tradeType}`);

    // 활성 뷰 의미는 페이지 종류에 따라 완전히 다름 — 명확하게 풀어서 기술
    let viewLabel = "";
    if (isHome) {
      if (pageContext.view === "products") viewLabel = "활성 뷰: 전체 품목별 트리맵 (한국의 모든 수출·수입 품목을 금액 순으로 시각화한 화면. 국가 정보 없음)";
      else if (pageContext.view === "countries") viewLabel = "활성 뷰: 세계 지도 (한국과 교역하는 전체 국가를 수출·수입 금액 순으로 시각화한 지도. 품목 정보 없음)";
    } else if (isCountryPage) {
      if (pageContext.view === "timeseries") viewLabel = "활성 뷰: 월별 시계열 (해당 국가의 월별 수출·수입·수지 라인 차트)";
      else if (pageContext.view === "products") viewLabel = "활성 뷰: 품목별 트리맵 (해당 국가에 대한 한국의 상위 교역 품목)";
    } else if (isProductPage) {
      if (pageContext.view === "trend") viewLabel = "활성 뷰: 연도별 금액 추이 (해당 품목의 연도별 수출·수입 금액 바/라인 차트)";
      else if (pageContext.view === "countries") viewLabel = "활성 뷰: 상위 국가 (해당 품목의 상위 수출국·수입국 막대 차트)";
    }
    if (viewLabel) parts.push(viewLabel);

    if (pageContext.mtiDepth && pageContext.mtiDepth >= 1 && pageContext.mtiDepth <= 6) {
      parts.push(`MTI 분류 깊이: ${pageContext.mtiDepth}단위`);
    }

    const coverageNote = await getYearCoverageNote(year);
    const coverageLine = coverageNote ? `\n※ ${coverageNote}` : "";
    sections.push(
      `[현재 화면 상태]\n${parts.join(" | ")}${coverageLine}\n\n사용자가 "화면", "여기", "지금 보고 있는", "현재 대시보드" 같은 표현을 쓰면 **위에 명시된 활성 뷰의 데이터만으로** 답변하세요. 다른 뷰·다른 페이지의 데이터로 이탈하지 마세요. "어떤 화면인지 알려주세요" 같은 되묻기 절대 금지.`,
    );
  }

  // 전체 KPI 요약 (항상 포함)
  const kpi = (KPI_BY_YEAR as Record<string, {
    export: { value: string };
    import: { value: string };
    balance: { value: string; positive: boolean };
  }>)[year];
  if (kpi) {
    const overallCoverage = await getYearCoverageNote(year);
    const overallLine = overallCoverage ? `\n※ ${overallCoverage}` : "";
    const balSign = kpi.balance.positive ? "" : "-";
    const balLabel = kpi.balance.positive ? "흑자" : "적자";
    sections.push(
      `[${year}년 전체 무역 요약]\n수출: ${kpi.export.value}억달러, 수입: ${kpi.import.value}억달러, 무역수지: ${balSign}${kpi.balance.value}억달러 (${balLabel})${overallLine}`
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
      // 소수점 2자리 정밀도 + trailing 0 제거 — "104.6" / "0.24" / "10" 처럼 필요 자릿수만 표시
      const fmt1 = (v: number) => (Math.round(v / 1e8 * 100) / 100).toString();
      const lines = top15.map((c, i) =>
        `${i + 1}위: ${c.country} — ${tradeType} ${fmt1(tradeType === "수입" ? c.imp_amt : c.exp_amt)}억달러`
      );
      sections.push(`[${year}년 국가별 ${tradeType} 순위 TOP15]\n${lines.join("\n")}`);
    } catch { /* 조회 실패 시 생략 */ }
  }

  // 특정 국가 상세 데이터 — Supabase에서 조회
  // 현재 화면 뷰(view)에 따라 컨텍스트 범위를 제한 — 화면에 없는 데이터로 답변이 이탈하는 것을 방지
  for (const country of countries) {
    try {
      const ranks = await getCountryRankingAsync(year, tradeType);
      const countryRank = ranks.find(r => r.country === country);
      const kpiData = await getCountryKpiAsync(year, country);
      const timeseries = await getCountryTimeseriesAsync(year, country);

      // 화면을 참조하는 질문이고, 이 국가가 현재 페이지 국가일 때만 view narrowing 적용
      const isPageCountry = referencesScreen && pageContext?.country === country;
      const view = isPageCountry ? pageContext?.view : undefined;
      const inTimeseriesView = view === "timeseries";
      const inProductsView = view === "products";

      const countryCoverage = await getYearCoverageNote(year);
      const yearLabel = countryCoverage ? `${year}년, 부분 집계` : `${year}년`;
      let section = `[${country} 교역 데이터 (${yearLabel})]\n`;
      if (countryCoverage) {
        section += `※ ${countryCoverage}\n`;
      }
      if (countryRank) {
        // 소수점 2자리 정밀도 + trailing 0 제거 — "104.6" / "0.24" / "10" 처럼 필요 자릿수만 표시
      const fmt1 = (v: number) => (Math.round(v / 1e8 * 100) / 100).toString();
        const rank = tradeType === "수입" ? countryRank.rank_imp : countryRank.rank_exp;
        const rankLabel = tradeType === "수입" ? "수입순위" : "수출순위";
        section += `${rankLabel}: ${rank}위, 수출액: ${fmt1(countryRank.exp_amt)}억달러, 수입액: ${fmt1(countryRank.imp_amt)}억달러\n`;
      }
      if (kpiData) {
        const kpiBalSign = kpiData.positive ? "" : "-";
        const kpiBalLabel = kpiData.positive ? "흑자" : "적자";
        section += `KPI — 수출: ${kpiData.export}억달러, 수입: ${kpiData.import}억달러, 수지: ${kpiBalSign}${kpiData.balance}억달러(${kpiBalLabel})\n`;
      }

      // 시계열 뷰: 화면에 월별 차트가 보이므로 12개월 전체를 제공
      // 그 외: 요약 3개월만 제공
      if (timeseries.length > 0) {
        if (inTimeseriesView) {
          const lines = timeseries.map(
            m => `${m.month}: 수출 ${m.export}억달러, 수입 ${m.import}억달러, 수지 ${m.balance}억달러`,
          );
          section += `\n[${country} 월별 시계열 (${year}년)]\n${lines.join("\n")}`;
        } else {
          const recentLabel = tradeType === "수입" ? "수입" : "수출";
          const recent = timeseries.slice(-3).map(m => {
            const val = tradeType === "수입" ? m.import : m.export;
            return `${m.month} ${recentLabel}${val}억달러`;
          }).join(", ");
          section += `월별 요약(최근 3개월): ${recent}`;
        }
      }

      // 국가별 상위 수출/수입 품목 — 시계열 뷰에서는 화면에 보이지 않으므로 제외
      if (!inTimeseriesView) {
        const countryProducts = await getCountryTreemapDataAsync(year, country, tradeType);
        if (countryProducts.length > 0) {
          const topN = inProductsView ? 10 : 5;
          const lines = countryProducts
            .slice(0, topN)
            .map((p, i) => `${i + 1}위: ${p.name} — ${p.value.toFixed(1)}억달러`);
          section += `\n[${country} ${tradeType} 상위 품목]\n${lines.join("\n")}`;
        }
      }

      sections.push(section);
    } catch { /* 조회 실패 시 생략 */ }
  }

  // 품목별 데이터 — Supabase 집계 테이블에서 조회 (전체 품목, Top N 제한 없음)
  // 질문이 수출·수입을 함께 언급한 경우 양방향 모두 제공
  // 품목 페이지 뷰(trend/countries) narrowing은 화면 참조 시에만 적용
  const isPageProduct = referencesScreen && pageContext?.productCode;
  const productView = isPageProduct ? pageContext?.view : undefined;
  const inTrendView = productView === "trend";
  const inCountriesView = productView === "countries";

  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    const name = productNames[i];

    for (const direction of productTradeTypes) {
      let trend: { year: string; value: number }[] = [];
      let topCountries: { country: string; value: number }[] = [];
      let topCountriesYear = year; // 실제로 상위국가 데이터를 확보한 연도 (폴백 시 전년이 됨)
      try {
        [trend, topCountries] = await Promise.all([
          getProductTrendAsync(code, direction),
          getProductTopCountriesAsync(code, year, direction),
        ]);
      } catch { /* Supabase 조회 실패 시 빈 데이터로 진행 */ }

      // 폴백: 현재 연도(부분 집계) 의 품목×국가 데이터가 없으면 전년 데이터로 대체
      // — 대시보드 /product/[name] 페이지가 이미 current+prev 이중 조회하는 것과 동작 통일
      if (topCountries.length === 0) {
        try {
          const prevYearTry = String(parseInt(year, 10) - 1);
          const prevTop = await getProductTopCountriesAsync(code, prevYearTry, direction);
          if (prevTop.length > 0) {
            topCountries = prevTop;
            topCountriesYear = prevYearTry;
          }
        } catch { /* 무시 */ }
      }

      let section = `[${name} ${direction} 데이터]\n`;

      // 금액 추이 뷰에서는 상위 국가를 화면에 보이지 않음 → 제외
      if (topCountries.length > 0 && !inTrendView) {
        const topN = inCountriesView ? 10 : 5;
        const yearBadge = topCountriesYear !== year ? ` (${topCountriesYear}년 기준)` : "";
        section += `상위 ${direction}국${yearBadge}: ${topCountries.slice(0, topN).map(c => `${c.country}(${c.value}억달러)`).join(", ")}\n`;
      }
      // 상위 국가 뷰에서는 연도별 추이가 화면에 없음 → 제외
      if (trend.length > 0 && !inCountriesView) {
        const slice = inTrendView ? trend : trend.slice(-3);
        const recent = slice.map(t => {
          const cleanYear = String(t.year).replace(/\(.*\)/, "").trim();
          return `${cleanYear}년 ${t.value}억달러`;
        }).join(", ");
        section += `연도별 추이: ${recent}`;

        // 각 연도의 커버리지 주석 수집 — 부분 집계 연도가 있으면 경고 추가
        const coverageNotes = new Set<string>();
        for (const t of slice) {
          const y = String(t.year).replace(/\(.*\)/, "").trim();
          const note = await getYearCoverageNote(y);
          if (note) coverageNotes.add(note);
        }
        if (coverageNotes.size > 0) {
          section += `\n※ ${Array.from(coverageNotes).join(" / ")}`;
        }

        // 부분 집계 연도면 "전년 동기 누적" 유효 비교치를 미리 계산해 주입
        // (LLM이 월평균 환산 같은 잘못된 비교를 시도할 여지를 없애기 위함)
        if (isAnnualIncomplete) {
          try {
            const sp = await getProductSamePeriodYoY(code, year, direction);
            if (sp && sp.prevAmt > 0) {
              const prevYear = String(parseInt(year, 10) - 1);
              const pctStr =
                sp.yoyPct === null
                  ? "-"
                  : `${sp.yoyPct >= 0 ? "+" : ""}${sp.yoyPct.toFixed(1)}%`;
              section +=
                `\n※ 유효 비교(전년 동기 누적): ${year}년 ${sp.monthRange} ${sp.currAmt.toFixed(1)}억달러 vs ${prevYear}년 ${sp.monthRange} ${sp.prevAmt.toFixed(1)}억달러 (${pctStr})` +
                `\n※ 위 유효 비교 수치만 인용해서 추세를 말하세요. 다른 기간끼리(월평균 환산 포함)는 비교하지 마세요.`;
            }
          } catch { /* 집계 실패 시 무시 — 추세 주장을 하지 않도록 LLM에 맡김 */ }
        }
      }
      if (topCountries.length === 0 && trend.length === 0) {
        section += `해당 품목의 ${direction} 데이터가 없습니다.`;
      }

      // 상위 국가 × 연도별 추이 — "연도별 비교", "상위 국가별 추이" 같은 질문에 답할 수 있도록 항상 포함
      // (agg_product_countries: code, country, year, exp_amt, imp_amt)
      try {
        const amtCol = direction === "수입" ? "imp_amt" : "exp_amt";
        const { data: perCountryRows } = await supabase
          .from("agg_product_countries")
          .select(`country, year, ${amtCol}`)
          .like("code", `${code}%`);

        if (perCountryRows && perCountryRows.length > 0) {
          const byCountry = new Map<string, Map<string, number>>();
          for (const r of perCountryRows as Record<string, unknown>[]) {
            const c = String(r.country);
            const y = String(r.year);
            const amt = Number(r[amtCol]) || 0;
            if (amt <= 0) continue;
            if (!byCountry.has(c)) byCountry.set(c, new Map());
            const ym = byCountry.get(c)!;
            ym.set(y, (ym.get(y) ?? 0) + amt);
          }

          if (byCountry.size > 0) {
            const allYears = new Set<string>();
            for (const ym of byCountry.values()) {
              for (const y of ym.keys()) allYears.add(y);
            }
            const sortedYears = Array.from(allYears).sort();
            const latestDataYear = sortedYears[sortedYears.length - 1] ?? year;

            // 최신 데이터 연도 기준 상위 5개국 선정 (요청 연도에 데이터 없으면 최신 연도 사용)
            const ranking = Array.from(byCountry.entries())
              .map(([c, ym]) => ({
                country: c,
                recentAmt: ym.get(year) ?? ym.get(latestDataYear) ?? 0,
                ym,
              }))
              .filter(r => r.recentAmt > 0)
              .sort((a, b) => b.recentAmt - a.recentAmt)
              .slice(0, 5);

            if (ranking.length > 0) {
              // 표시 연도: 최근 5년
              const displayYears = sortedYears.slice(-5);
              const lines = ranking.map((r, i) => {
                const yearParts = displayYears.map(y => {
                  const amt = r.ym.get(y) ?? 0;
                  const val = Math.round(amt / 1e8 * 10) / 10;
                  return val > 0 ? `${y}년 ${val.toFixed(1)}억달러` : `${y}년 -`;
                });
                return `${i + 1}위 ${r.country}: ${yearParts.join(" · ")}`;
              });
              section += `\n\n[${name} 상위 5개국 연도별 ${direction} 추이 (단위: 억달러)]\n${lines.join("\n")}`;
              section += `\n※ 위 데이터로 국가 간 연도별 비교·성장 분석이 가능합니다. 질문에 언급된 국가가 이 목록에 없더라도 추이 경향을 설명할 수 있습니다.`;
            }
          }
        }
      } catch { /* agg_product_countries 조회 실패 시 무시 */ }

      // 하위 분류 데이터 (6자리 미만 코드일 때)
      // 요청 연도 데이터가 비면 전년 데이터로 폴백 (부분 집계 연도 대응)
      if (code.length < 6) {
        try {
          const mtiLookup = MTI_LOOKUP as Record<string, string>;
          const subDepth = code.length + 1;
          const amtCol = direction === "수입" ? "imp_amt" : "exp_amt";
          let subYearUsed = year;
          let subRowsData: Record<string, unknown>[] | null = null;
          {
            const { data } = await supabase
              .from("agg_product_trend")
              .select(`code, name, ${amtCol}`)
              .like("code", `${code}%`)
              .eq("year", year);
            subRowsData = (data ?? null) as Record<string, unknown>[] | null;
          }
          if (!subRowsData || subRowsData.length === 0) {
            const prevYearTry = String(parseInt(year, 10) - 1);
            const { data: prevData } = await supabase
              .from("agg_product_trend")
              .select(`code, name, ${amtCol}`)
              .like("code", `${code}%`)
              .eq("year", prevYearTry);
            if (prevData && prevData.length > 0) {
              subRowsData = prevData as Record<string, unknown>[];
              subYearUsed = prevYearTry;
            }
          }
          const subRows = subRowsData;

          if (subRows && subRows.length > 0) {
            const subMap = new Map<string, { name: string; amt: number }>();
            for (const r of subRows) {
              const subCode = String(r.code).slice(0, subDepth <= 6 ? subDepth : 6);
              const existing = subMap.get(subCode);
              const amt = Number(r[amtCol]) || 0;
              if (existing) {
                existing.amt += amt;
              } else {
                subMap.set(subCode, { name: mtiLookup[subCode] ?? String(r.name), amt });
              }
            }
            const sorted = Array.from(subMap.entries())
              .map(([c, { name: n, amt }]) => ({ code: c, name: n, value: Math.round(amt / 1e8 * 10) / 10 }))
              .filter(s => s.value > 0)
              .sort((a, b) => b.value - a.value)
              .slice(0, 10);

            if (sorted.length > 0) {
              const yearBadge = subYearUsed !== year ? ` (${subYearUsed}년 기준, ${year}년 부분 집계)` : ` (${year}년)`;
              section += `\n[${name} 하위 분류${yearBadge} ${direction}]\n`;
              section += sorted.map((s, idx) => `${idx + 1}. ${s.name}(${s.code}) — ${s.value}억달러`).join("\n");
            }
          }
        } catch { /* 하위 분류 조회 실패 시 무시 */ }
      }

      sections.push(section);
    }
  }

  // 국가 × 품목 교차 데이터 — 연간 집계
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
          sections.push(`[${country} × 품목 교차 데이터 (${year}년 ${tradeType})]\n${results.join(", ")}`);
        }
      } catch { /* 조회 실패 시 무시 */ }
    }
  }

  // 국가 × 품목 × 월별 데이터 — "월별 변동", "계절성", "월 패턴" 등 월별 관심 질문에만 조회
  // (12회 RPC 병렬 호출 → 비용 있으므로 질문 의도가 명확할 때만)
  const monthlyPatternRe = /월별|월간|월\s*패턴|계절|seasonal|monthly/i;
  const trendRe = /변동|추이|패턴|trend|흐름/;
  if (
    countries.length > 0 &&
    productCodes.length > 0 &&
    monthlyPatternRe.test(question) &&
    trendRe.test(question)
  ) {
    const mtiLookup = MTI_LOOKUP as Record<string, string>;
    for (const country of countries) {
      for (const code of productCodes) {
        const name = mtiLookup[code] ?? code;
        for (const direction of productTradeTypes) {
          const p_mode = direction === "수입" ? "import" : "export";
          const monthList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
          const perMonth: Array<{ month: string; amt: number }> = [];

          await Promise.all(
            monthList.map(async (mm) => {
              const yymm = `${year}${mm}`;
              try {
                const { data } = await supabase.rpc("get_country_treemap_mti6", {
                  p_yymm: yymm,
                  p_ctr_name: country,
                  p_mode,
                  p_mti_depth: 6,
                });
                const rows = (data ?? []) as Array<{ mti_cd?: string; total_amt?: number }>;
                let total = 0;
                for (const r of rows) {
                  if (String(r.mti_cd ?? "").startsWith(code)) {
                    total += Number(r.total_amt) || 0;
                  }
                }
                if (total > 0) perMonth.push({ month: mm, amt: total });
              } catch { /* skip this month */ }
            }),
          );

          perMonth.sort((a, b) => a.month.localeCompare(b.month));

          // 요청 연도가 부분 집계이거나 월별 데이터가 충분하지 않으면 전년도 시도
          let usedYear = year;
          let finalPerMonth = perMonth;
          if (perMonth.length < 6) {
            const prevYear = String(parseInt(year, 10) - 1);
            const prevPerMonth: Array<{ month: string; amt: number }> = [];
            await Promise.all(
              monthList.map(async (mm) => {
                const yymm = `${prevYear}${mm}`;
                try {
                  const { data } = await supabase.rpc("get_country_treemap_mti6", {
                    p_yymm: yymm,
                    p_ctr_name: country,
                    p_mode,
                    p_mti_depth: 6,
                  });
                  const rows = (data ?? []) as Array<{ mti_cd?: string; total_amt?: number }>;
                  let total = 0;
                  for (const r of rows) {
                    if (String(r.mti_cd ?? "").startsWith(code)) {
                      total += Number(r.total_amt) || 0;
                    }
                  }
                  if (total > 0) prevPerMonth.push({ month: mm, amt: total });
                } catch { /* skip */ }
              }),
            );
            if (prevPerMonth.length > perMonth.length) {
              finalPerMonth = prevPerMonth.sort((a, b) => a.month.localeCompare(b.month));
              usedYear = prevYear;
            }
          }

          if (finalPerMonth.length > 0) {
            const lines = finalPerMonth.map(m => {
              const val = (Math.round(m.amt / 1e8 * 10) / 10).toFixed(1);
              return `${parseInt(m.month, 10)}월 ${val}억달러`;
            });
            sections.push(
              `[${country} × ${name} 월별 ${direction} 추이 (${usedYear}년, 단위: 억달러)]\n${lines.join(" · ")}\n※ 이 데이터는 한국의 대${country} ${name} ${direction}을 월별로 집계한 것입니다. 월별 변동 패턴·계절성·피크월을 분석할 수 있습니다.`,
            );
          }
        }
      }
    }
  }

  // 거시경제 지표 컨텍스트 — 아래 조건 중 하나라도 만족 시 포함:
  //   (1) 매크로 키워드 직접 언급 ("거시경제", "경제환경", "한국 경제" 등)
  //   (2) 분석형 질문 ("왜/원인/이유/배경/영향/요인/때문/변화/증가/감소/하락/상승/추이")
  // 단순 팩트형 질문(예: "한국 수출 1위는?")에는 포함하지 않아 답변 오염 방지.
  if (detectMacroKeywords(question).length > 0 || isAnalysisQuery(question)) {
    const macroCtx = await buildMacroContext(question, year);
    if (macroCtx) {
      sections.push(macroCtx);
    }
  }

  return sections.join("\n\n");
}
