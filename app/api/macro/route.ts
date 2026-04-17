import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

export interface MacroTrendPoint {
  ym: string;
  value: number;
}

export interface MacroItem {
  label: string;
  value: string;
  change: string;
  up: boolean;
  trend: MacroTrendPoint[];
  periodLabel: string;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function calcChange(cur: number | null, prev: number | null): { change: string; up: boolean } {
  if (cur == null || prev == null || prev === 0) return { change: "—", up: true };
  const rate = (cur - prev) / prev * 100;
  const up = rate >= 0;
  return {
    change: `${up ? "+" : "-"}${Math.abs(rate).toFixed(1)}%`,
    up,
  };
}

// 소수 → % 변환이 필요한 지표 (0.07 = 7%)
const PCT_KEYS = new Set(["KR_BASE_RATE", "KR_PROD_YOY", "KR_CPI_YOY", "US_BASE_RATE", "CN_BASE_RATE"]);

function buildTrend(
  rows: DbRow[], dataKey: string
): { trend: MacroTrendPoint[]; periodLabel: string } {
  const trend: MacroTrendPoint[] = [];
  for (const row of rows) {
    const raw = row[dataKey];
    if (raw == null) continue;
    const value = PCT_KEYS.has(dataKey)
      ? Math.round(Number(raw) * 1000) / 10
      : Math.round(Number(raw) * 10) / 10;
    const ym = String(row.YYMM);
    trend.push({ ym: `${ym.slice(0, 4)}.${ym.slice(4, 6)}`, value });
  }
  const periodLabel = trend.length > 0
    ? `${trend[0].ym} ~ ${trend[trend.length - 1].ym}`
    : "";
  return { trend, periodLabel };
}

export async function GET() {
  // Supabase에서 직접 조회
  const { data: allRows, error } = await supabase
    .from("macro_indicators")
    .select("*")
    .order("YYMM", { ascending: true });

  if (error || !allRows || allRows.length === 0) {
    return NextResponse.json(
      { error: "거시경제 지표 데이터가 없습니다." },
      { status: 404 },
    );
  }

  const rows = allRows as DbRow[];
  const latest = rows[rows.length - 1];
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;

  const cur = latest;
  const prv = prev ?? ({} as DbRow);

  // USD/KRW 환율 (ExchangeRate API)
  let usdKrw: MacroItem = { label: "USD/KRW", value: "—", change: "—", up: true, trend: [], periodLabel: "" };
  try {
    const exchangeKey = process.env.EXCHANGE_RATE_API_KEY;
    if (exchangeKey) {
      const res = await fetch(
        `https://v6.exchangerate-api.com/v6/${exchangeKey}/latest/USD`,
        { next: { revalidate: 3600 } },
      );
      if (res.ok) {
        const json = await res.json();
        if (json.result === "success" && json.conversion_rates) {
          const krw = json.conversion_rates["KRW"] ?? 0;
          usdKrw = { label: "USD/KRW", value: fmtNum(krw, 1), change: "실시간", up: true, trend: [], periodLabel: "" };
        }
      }
    }
  } catch { /* 환율 조회 실패 시 기본값 유지 */ }

  const data: MacroItem[] = [
    usdKrw,
    {
      label: "한국 기준금리",
      value: fmtPct(cur.KR_BASE_RATE),
      ...calcChange(cur.KR_BASE_RATE, prv.KR_BASE_RATE),
      ...buildTrend(rows, "KR_BASE_RATE"),
    },
    {
      label: "EBSI",
      value: fmtNum(cur.KR_EBSI, 1),
      ...calcChange(cur.KR_EBSI, prv.KR_EBSI),
      ...buildTrend(rows, "KR_EBSI"),
    },
    {
      label: "산업생산 증감률",
      value: fmtPct(cur.KR_PROD_YOY),
      ...calcChange(cur.KR_PROD_YOY, prv.KR_PROD_YOY),
      ...buildTrend(rows, "KR_PROD_YOY"),
    },
    {
      label: "중국 PMI",
      value: fmtNum(cur.CN_PMI_MFG, 1),
      ...calcChange(cur.CN_PMI_MFG, prv.CN_PMI_MFG),
      ...buildTrend(rows, "CN_PMI_MFG"),
    },
    {
      label: "미국 기준금리",
      value: fmtPct(cur.US_BASE_RATE),
      ...calcChange(cur.US_BASE_RATE, prv.US_BASE_RATE),
      ...buildTrend(rows, "US_BASE_RATE"),
    },
    {
      label: "브렌트유",
      value: `$${fmtNum(cur.BRENT_OIL, 1)}`,
      ...calcChange(cur.BRENT_OIL, prv.BRENT_OIL),
      ...buildTrend(rows, "BRENT_OIL"),
    },
    {
      label: "SCFI",
      value: fmtNum(cur.SCFI, 0),
      ...calcChange(cur.SCFI, prv.SCFI),
      ...buildTrend(rows, "SCFI"),
    },
  ];

  return NextResponse.json(data);
}
