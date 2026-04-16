import { NextResponse } from "next/server";

export interface MacroItem {
  label: string;
  value: string;
  change: string;
  up: boolean;
}

interface ExchangeRateResponse {
  result: string;
  conversion_rates?: Record<string, number>;
}

/** 캐시: 1시간마다 재요청 */
let cache: { data: MacroItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

/** 숫자를 천 단위 콤마 포맷 */
function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const exchangeKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!exchangeKey) {
    return NextResponse.json(
      { error: "EXCHANGE_RATE_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    // 1) USD/KRW 환율 — ExchangeRate API
    let usdKrw: MacroItem = { label: "USD/KRW", value: "—", change: "N/A", up: true };
    const res = await fetch(
      `https://v6.exchangerate-api.com/v6/${exchangeKey}/latest/USD`,
      { next: { revalidate: 3600 } },
    );
    if (res.ok) {
      const json = (await res.json()) as ExchangeRateResponse;
      if (json.result === "success" && json.conversion_rates) {
        const krw = json.conversion_rates["KRW"] ?? 0;
        usdKrw = { label: "USD/KRW", value: fmt(krw, 1), change: "실시간", up: true };
      }
    }

    // 2) 나머지 지표 — 추후 Supabase에서 조회 예정
    const placeholder: MacroItem[] = [
      { label: "한국 기준금리", value: "—", change: "—", up: true },
      { label: "산업생산증감률", value: "—", change: "—", up: true },
      { label: "CPI 증감률", value: "—", change: "—", up: true },
      { label: "EBSI", value: "—", change: "—", up: true },
      { label: "제조업 BSI", value: "—", change: "—", up: true },
      { label: "비제조업 BSI", value: "—", change: "—", up: true },
    ];

    const data: MacroItem[] = [usdKrw, ...placeholder];
    cache = { data, fetchedAt: Date.now() };

    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/macro] fetch error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "거시경제 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
