import { NextResponse } from "next/server";
import { MACRO_INDICATORS } from "@/lib/tradeData.generated";

export interface MacroItem {
  label: string;
  value: string;
  change: string;
  up: boolean;
}

/** 최신 YYMM 찾기 */
function getLatestYymm(): string {
  return Object.keys(MACRO_INDICATORS).sort().reverse()[0] ?? "";
}

/** 전월 YYMM */
function getPrevYymm(yymm: string): string {
  const y = parseInt(yymm.slice(0, 4));
  const m = parseInt(yymm.slice(4, 6));
  if (m === 1) return `${y - 1}12`;
  return `${y}${String(m - 1).padStart(2, "0")}`;
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
  const diff = cur - prev;
  const up = diff >= 0;
  return {
    change: `${up ? "+" : ""}${diff >= 1 || diff <= -1 ? fmtNum(diff, 1) : (diff * 100).toFixed(1) + "%p"}`,
    up,
  };
}

export async function GET() {
  const indicators = MACRO_INDICATORS as Record<string, Record<string, number | null>>;
  const latest = getLatestYymm();
  const prev = getPrevYymm(latest);

  if (!latest || !indicators[latest]) {
    return NextResponse.json(
      { error: "거시경제 지표 데이터가 없습니다." },
      { status: 404 },
    );
  }

  const cur = indicators[latest];
  const prv = indicators[prev] ?? {};

  // USD/KRW 환율 (ExchangeRate API)
  let usdKrw: MacroItem = { label: "USD/KRW", value: "—", change: "—", up: true };
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
          usdKrw = { label: "USD/KRW", value: fmtNum(krw, 1), change: "실시간", up: true };
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
    },
    {
      label: "제조업 BSI",
      value: fmtNum(cur.KR_BSI_MFG, 0),
      ...calcChange(cur.KR_BSI_MFG, prv.KR_BSI_MFG),
    },
    {
      label: "EBSI",
      value: fmtNum(cur.KR_EBSI, 1),
      ...calcChange(cur.KR_EBSI, prv.KR_EBSI),
    },
    {
      label: "산업생산 증감률",
      value: fmtPct(cur.KR_PROD_YOY),
      ...calcChange(cur.KR_PROD_YOY, prv.KR_PROD_YOY),
    },
    {
      label: "CPI 증감률",
      value: fmtPct(cur.KR_CPI_YOY),
      ...calcChange(cur.KR_CPI_YOY, prv.KR_CPI_YOY),
    },
    {
      label: "브렌트유",
      value: `$${fmtNum(cur.BRENT_OIL, 1)}`,
      ...calcChange(cur.BRENT_OIL, prv.BRENT_OIL),
    },
    {
      label: "SCFI",
      value: fmtNum(cur.SCFI, 0),
      ...calcChange(cur.SCFI, prv.SCFI),
    },
  ];

  return NextResponse.json(data);
}
