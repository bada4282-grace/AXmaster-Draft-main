import { createClient } from "@supabase/supabase-js";
import type { ProductNode, TradeType } from "@/lib/data";
import { MTI_COLORS } from "@/lib/data";

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 국가 + 품목 기준 교역 데이터 조회
export async function queryTrade({
  ctrName,
  mtiName,
  yymm,
}: {
  ctrName?: string;
  mtiName?: string;
  yymm?: string;
}) {
  let query = supabase.from("trade_by_country").select("*");

  if (ctrName) query = query.ilike('"CTR_NAME"', `%${ctrName}%`);
  if (mtiName) query = query.ilike('"MTI_NAME"', `%${mtiName}%`);
  if (yymm)   query = query.eq('"YYMM"', yymm);

  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data;
}

// 월별 전체 품목 트리맵 데이터 (get_treemap_monthly RPC)
export async function getMonthlyTreemapData(
  year: string,
  month: string,
  tradeType: TradeType
): Promise<ProductNode[]> {
  const yymm = `${year}${month}`;
  const p_mode = tradeType === "수입" ? "import" : "export";

  const { data, error } = await supabase.rpc("get_treemap_monthly", {
    p_yymm: yymm,
    p_mode,
  });
  if (error) {
    console.error("[getMonthlyTreemapData] RPC error:", error.message ?? error);
    throw error;
  }
  return (data ?? [])
    .map(mapToProductNode)
    .filter((n): n is ProductNode => n !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 30);
}

// 월별 국가별 품목 트리맵 데이터 (get_country_treemap_monthly RPC)
export async function getCountryMonthlyTreemapData(
  year: string,
  month: string,
  countryName: string,
  tradeType: TradeType
): Promise<ProductNode[]> {
  const yymm = `${year}${month}`;
  const p_mode = tradeType === "수입" ? "import" : "export";

  const { data, error } = await supabase.rpc("get_country_treemap_monthly", {
    p_yymm: yymm,
    p_ctr_name: countryName,
    p_mode,
  });
  if (error) {
    console.error("[getCountryMonthlyTreemapData] RPC error:", error.message ?? error);
    throw error;
  }
  return (data ?? [])
    .map(mapToProductNode)
    .filter((n): n is ProductNode => n !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 30);
}
