/**
 * 경량 데이터 레이어 — 클라이언트 번들에 포함되는 최소 데이터
 *
 * Heavy 데이터(트리맵, 국가별, 품목별)는 Supabase agg 테이블에서 조회:
 *   → lib/dataSupabase.ts (대시보드 컴포넌트용)
 *   → lib/chatContext.ts  (챗봇용, tradeData.generated에서 직접 import)
 */
import {
  KPI_BY_YEAR,
  MTI_COLORS as MTI_COLORS_RAW,
  MTI_NAMES as MTI_NAMES_RAW,
  MTI_LOOKUP as MTI_LOOKUP_RAW,
} from "./tradeData.generated";

export type TradeType = "수출" | "수입";

// ─── 기본 연도 ────────────────────────────────────────────────────────────
export const DEFAULT_YEAR = "2026";

// ─── KPI (전체 연도 요약, ~2KB) ─────────────────────────────────────────
export { KPI_BY_YEAR };
export const KPI_DEFAULT = (KPI_BY_YEAR as Record<string, unknown>)[DEFAULT_YEAR];

// ─── MTI 색상 / 명칭 / 룩업 (~50KB) ────────────────────────────────────
export const MTI_COLORS = MTI_COLORS_RAW as Record<number, string>;
export const MTI_NAMES = MTI_NAMES_RAW as Record<number, string>;
export const MTI_LOOKUP = MTI_LOOKUP_RAW as Record<string, string>;

// ─── Types ──────────────────────────────────────────────────────────────
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

export interface ProductNode {
  code: string;
  name: string;
  value: number;
  mti: number;
  color: string;
  topCountries?: string[];
}

export interface MonthlyData {
  month: string;
  export: number;
  import: number;
  balance: number;
}

export interface YearlyTrend {
  year: string;
  value: number;
}

export interface CountryValue {
  country: string;
  value: number;
}

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

// ─── 유틸리티 함수 (데이터 미의존) ───────────────────────────────────────

export function getMapColor(rank: number): string {
  if (rank <= 3) return "#0F4C5C";
  if (rank <= 9) return "#1D6F78";
  if (rank <= 15) return "#3E8F92";
  if (rank <= 21) return "#66AFA9";
  if (rank <= 30) return "#95CBC0";
  return "#CDE8DA";
}

/**
 * 6단위 트리맵 데이터를 지정된 MTI 깊이(1~6)로 그룹핑하여 반환
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
