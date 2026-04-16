import { createClient } from "@supabase/supabase-js";
import type { ProductNode, TradeType } from "@/lib/data";
import { MTI_COLORS } from "@/lib/data";

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
  return {
    code: row.mti_cd,
    name: row.mti_name,
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
