import { createClient } from "@supabase/supabase-js";

// 서버 전용 — secret key 사용, 클라이언트 번들에 절대 포함 금지
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase 서버 환경변수(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)가 설정되지 않았습니다.");
  }
  return createClient(url, key);
}

// ─── RPC 응답 타입 ──────────────────────────────────────────────────────────
interface RpcTreemapRow {
  mti_cd?: string;
  mti_name?: string;
  total_amt?: number;
}

interface RpcCountryMapRow {
  ctr_name?: string;
  rank?: number;
  total_amt?: number;
}

// ─── 공개 타입 ──────────────────────────────────────────────────────────────
export interface TradeProductRow {
  mti_name: string;
  total_amt_usd: number;   // 달러 원단위
  total_amt_100m: string;  // "X.X억$" 포맷
}

export interface TradeCountryRow {
  ctr_name: string;
  rank: number;
  total_amt_100m: string;
}

/** 억달러 포맷 */
function to100m(raw: number): string {
  return (raw / 1e8).toFixed(1) + "억$";
}

/**
 * 특정 국가의 월별 품목별 수출/수입 집계 (get_country_treemap_monthly RPC)
 * year만 있으면 1월~12월 중 가장 데이터 많은 월을 자동 탐색
 */
export async function fetchCountryProducts({
  country,
  year,
  mode = "export",
  limit = 10,
  mtiDepth = 6,
}: {
  country: string;
  year?: string;
  mode?: "export" | "import";
  limit?: number;
  mtiDepth?: number;
}): Promise<TradeProductRow[]> {
  const sb = getServerClient();

  // 조회할 YYMM 목록: 연도가 있으면 해당 연도 12월~1월 역순으로 시도
  const yymmList: string[] = [];
  if (year && year.length === 4) {
    for (let m = 12; m >= 1; m--) {
      yymmList.push(`${year}${String(m).padStart(2, "0")}`);
    }
  } else {
    // 연도 없으면 최근 6개월 시도
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      yymmList.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
  }

  // 유효한 데이터가 있는 첫 번째 YYMM 사용
  for (const yymm of yymmList) {
    const { data, error } = await sb.rpc("get_country_treemap_mti6", {
      p_yymm: yymm,
      p_ctr_name: country,
      p_mode: mode,
      p_mti_depth: mtiDepth,
    });
    if (error) {
      console.error(`[fetchCountryProducts] RPC error yymm=${yymm}:`, error.message);
      continue;
    }
    const rows = (data ?? []) as RpcTreemapRow[];
    const nonZero = rows.filter((r) => (r.total_amt ?? 0) > 0);
    if (nonZero.length === 0) continue;

    return nonZero
      .sort((a, b) => (b.total_amt ?? 0) - (a.total_amt ?? 0))
      .slice(0, limit)
      .map((r) => ({
        mti_name: r.mti_name ?? "",
        total_amt_usd: r.total_amt ?? 0,
        total_amt_100m: to100m(r.total_amt ?? 0),
      }));
  }

  return [];
}

/**
 * 전체 품목별 수출/수입 집계 (get_treemap_monthly RPC)
 */
export async function fetchAllProducts({
  year,
  mode = "export",
  limit = 15,
  mtiDepth = 6,
}: {
  year?: string;
  mode?: "export" | "import";
  limit?: number;
  mtiDepth?: number;
}): Promise<TradeProductRow[]> {
  const sb = getServerClient();

  const yymmList: string[] = [];
  if (year && year.length === 4) {
    for (let m = 12; m >= 1; m--) {
      yymmList.push(`${year}${String(m).padStart(2, "0")}`);
    }
  } else {
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      yymmList.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
  }

  for (const yymm of yymmList) {
    const { data, error } = await sb.rpc("get_treemap_mti6", {
      p_yymm: yymm,
      p_mode: mode,
      p_mti_depth: mtiDepth,
    });
    if (error) {
      console.error(`[fetchAllProducts] RPC error yymm=${yymm}:`, error.message);
      continue;
    }
    const rows = (data ?? []) as RpcTreemapRow[];
    const nonZero = rows.filter((r) => (r.total_amt ?? 0) > 0);
    if (nonZero.length === 0) continue;

    return nonZero
      .sort((a, b) => (b.total_amt ?? 0) - (a.total_amt ?? 0))
      .slice(0, limit)
      .map((r) => ({
        mti_name: r.mti_name ?? "",
        total_amt_usd: r.total_amt ?? 0,
        total_amt_100m: to100m(r.total_amt ?? 0),
      }));
  }

  return [];
}

/**
 * 국가 순위 목록 (get_country_map_monthly RPC)
 */
export async function fetchCountryRanking({
  year,
  mode = "export",
  limit = 20,
}: {
  year?: string;
  mode?: "export" | "import";
  limit?: number;
}): Promise<TradeCountryRow[]> {
  const sb = getServerClient();

  const yymmList: string[] = [];
  if (year && year.length === 4) {
    for (let m = 12; m >= 1; m--) {
      yymmList.push(`${year}${String(m).padStart(2, "0")}`);
    }
  } else {
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      yymmList.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
  }

  for (const yymm of yymmList) {
    const { data, error } = await sb.rpc("get_country_map_mti6", {
      p_yymm: yymm,
      p_mode: mode,
    });
    if (error) {
      console.error(`[fetchCountryRanking] RPC error yymm=${yymm}:`, error.message);
      continue;
    }
    const rows = (data ?? []) as RpcCountryMapRow[];
    if (rows.length === 0) continue;

    return rows
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .slice(0, limit)
      .map((r) => ({
        ctr_name: r.ctr_name ?? "",
        rank: r.rank ?? 0,
        total_amt_100m: to100m(r.total_amt ?? 0),
      }));
  }

  return [];
}

/** 결과를 LLM용 텍스트로 포맷 */
export function formatProductRows(rows: TradeProductRow[], label = ""): string {
  if (rows.length === 0) return "";
  const header = label ? `[${label} 주요 품목]\n` : "";
  return header + rows.map((r, i) => `${i + 1}위 ${r.mti_name}: ${r.total_amt_100m}`).join("\n");
}

export function formatCountryRows(rows: TradeCountryRow[], label = ""): string {
  if (rows.length === 0) return "";
  const header = label ? `[${label} 국가 순위]\n` : "";
  return header + rows.map((r) => `${r.rank}위 ${r.ctr_name}: ${r.total_amt_100m}`).join("\n");
}
