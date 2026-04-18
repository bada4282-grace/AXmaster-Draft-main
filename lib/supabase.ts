import { createClient } from "@supabase/supabase-js";
import type { ProductNode, TradeType } from "@/lib/data";
import { MTI_COLORS, MTI_LOOKUP } from "@/lib/data";

export interface MonthlyCountryMapItem {
  ctr_name: string;
  rank: number;
  total_amt: number;
}

interface RpcTreemapRow {
  mti_cd: string;
  mti_name: string;
  total_amt: number;
}

// total_amt(달러 원단위)를 억 단위로 변환해 ProductNode로 매핑
// mti는 mti_cd 첫 자리(0~9)로 색상 카테고리 결정
function mapToProductNode(row: RpcTreemapRow): ProductNode | null {
  const rawValue = Number(row.total_amt);
  if (!row.mti_name || !rawValue) return null;
  const value = rawValue / 1e8; // 달러 → 억달러
  const mti = Number(String(row.mti_cd).charAt(0));
  const color = (MTI_COLORS as Record<number, string>)[mti] ?? "#3B82F6";
  // CSV 시드 파싱 버그(콤마 포함 이름이 잘림)로 DB 이름이 불완전한 경우를 MTI_LOOKUP로 교정.
  const canonical = (MTI_LOOKUP as Record<string, string>)[row.mti_cd];
  return {
    code: row.mti_cd,
    name: canonical ?? row.mti_name,
    value,
    mti,
    color,
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았습니다. .env.local 파일을 확인해 주세요."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    persistSession: true,
  },
});


// 월별 전체 품목 트리맵 데이터 (get_treemap_mti6 RPC)
export async function getMonthlyTreemapData(
  year: string,
  month: string,
  tradeType: TradeType
): Promise<ProductNode[]> {
  const yymm = `${year}${month}`;
  const p_mode = tradeType === "수입" ? "import" : "export";

  const { data, error } = await supabase.rpc("get_treemap_mti6", {
    p_yymm: yymm,
    p_mode,
    p_mti_depth: 6,
  });
  if (error) {
    console.error("[getMonthlyTreemapData] RPC error:", error.message ?? error);
    throw error;
  }
  const rows = (data ?? []) as RpcTreemapRow[];
  return rows
    .map(mapToProductNode)
    .filter((n: ProductNode | null): n is ProductNode => n !== null)
    .sort((a: ProductNode, b: ProductNode) => b.value - a.value)
    .slice(0, 30);
}

// 월별 국가 지도 색상용 순위 데이터 (get_country_map_mti6 RPC)
// 동일 파라미터 요청 중복 제거 + 결과 캐싱으로 DB 부하 및 타임아웃 방지
const _countryMapCache = new Map<string, MonthlyCountryMapItem[]>();
const _countryMapInflight = new Map<string, Promise<MonthlyCountryMapItem[]>>();

export async function getMonthlyCountryMapData(
  year: string,
  month: string,
  tradeType: TradeType
): Promise<MonthlyCountryMapItem[]> {
  const yymm = `${year}${month}`;
  const p_mode = tradeType === "수입" ? "import" : "export";
  const cacheKey = `${yymm}_${p_mode}`;

  if (_countryMapCache.has(cacheKey)) {
    return _countryMapCache.get(cacheKey)!;
  }

  if (_countryMapInflight.has(cacheKey)) {
    return _countryMapInflight.get(cacheKey)!;
  }

  const promise = Promise.resolve(
    supabase.rpc("get_country_map_mti6", { p_yymm: yymm, p_mode })
  ).then((response) => {
    _countryMapInflight.delete(cacheKey);
    if (response.error) {
      console.error("[getMonthlyCountryMapData] RPC error:", response.error.message ?? response.error);
      throw response.error;
    }
    const result = (response.data ?? []) as MonthlyCountryMapItem[];
    _countryMapCache.set(cacheKey, result);
    return result;
  }).catch((err) => {
    _countryMapInflight.delete(cacheKey);
    throw err;
  });

  _countryMapInflight.set(cacheKey, promise);
  return promise;
}

// 최신 YYMM 프로세스 캐시 (10분 TTL) — 데이터 커버리지 판정용 공용 헬퍼
let _latestYymmCache: { value: string | null; ts: number } | null = null;
const LATEST_YYMM_TTL = 10 * 60 * 1000;

/** trade_mti6의 MAX(YYMM) 조회. 데이터 커버리지 판정의 단일 원천. */
export async function getLatestYYMM(): Promise<string | null> {
  if (_latestYymmCache && Date.now() - _latestYymmCache.ts < LATEST_YYMM_TTL) {
    return _latestYymmCache.value;
  }
  try {
    const { data } = await supabase
      .from("trade_mti6")
      .select("YYMM")
      .order("YYMM", { ascending: false })
      .limit(1);
    const value = data && data.length > 0 ? String(data[0].YYMM) : null;
    _latestYymmCache = { value, ts: Date.now() };
    return value;
  } catch {
    _latestYymmCache = { value: null, ts: Date.now() };
    return null;
  }
}

/**
 * 해당 연도가 부분 집계이면 "1~N월" 같은 범위 문자열 반환, 그 외 null.
 * UI 배지("⚠ 부분 데이터(1~2월)")의 단일 데이터 소스.
 */
export async function getIncompleteMonthRange(year: string): Promise<string | null> {
  const latest = await getLatestYYMM();
  if (!latest) return null;
  const latestYear = latest.slice(0, 4);
  const latestMonth = parseInt(latest.slice(4, 6), 10);
  if (year !== latestYear || !latestMonth || latestMonth >= 12) return null;
  return latestMonth === 1 ? "1월" : `1~${latestMonth}월`;
}

/**
 * 특정 연도에 Supabase trade_mti6 테이블에 데이터가 존재하는 월 목록 조회
 * 각 월별로 1건만 확인하여 존재 여부를 판단 (효율적 조회)
 * 반환: 정렬된 월 번호 배열 (예: [1, 2, 3])
 */
export async function getAvailableMonths(year: string): Promise<number[]> {
  const checks = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return supabase
      .from("trade_mti6")
      .select("YYMM", { count: "exact", head: true })
      .eq("YYMM", `${year}${mm}`);
  });

  const results = await Promise.all(checks);
  const months: number[] = [];
  for (let i = 0; i < 12; i++) {
    const { count, error } = results[i];
    if (!error && count && count > 0) {
      months.push(i + 1);
    }
  }
  return months;
}

// 월별 국가별 품목 트리맵 데이터 (get_country_treemap_mti6 RPC)
export async function getCountryMonthlyTreemapData(
  year: string,
  month: string,
  countryName: string,
  tradeType: TradeType
): Promise<ProductNode[]> {
  const yymm = `${year}${month}`;
  const p_mode = tradeType === "수입" ? "import" : "export";

  const { data, error } = await supabase.rpc("get_country_treemap_mti6", {
    p_yymm: yymm,
    p_ctr_name: countryName,
    p_mode,
    p_mti_depth: 6,
  });
  if (error) {
    console.error("[getCountryMonthlyTreemapData] RPC error:", error.message ?? error);
    throw error;
  }
  const rows = (data ?? []) as RpcTreemapRow[];
  return rows
    .map(mapToProductNode)
    .filter((n: ProductNode | null): n is ProductNode => n !== null)
    .sort((a: ProductNode, b: ProductNode) => b.value - a.value)
    .slice(0, 30);
}
