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
  // 캐시 유효 시 반환
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "EXCHANGE_RATE_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    // USD 기준 환율 조회 (KRW, EUR, JPY 등 포함)
    const res = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
      { next: { revalidate: 3600 } },
    );

    if (!res.ok) {
      throw new Error(`Exchange Rate API HTTP ${res.status}`);
    }

    const json = await res.json() as ExchangeRateResponse;
    if (json.result !== "success" || !json.conversion_rates) {
      throw new Error("Exchange Rate API returned non-success result");
    }

    const rates = json.conversion_rates;
    const krw = rates["KRW"] ?? 0;

    // USD/KRW: 전날 대비 변동은 API에서 지원하지 않으므로 ±0.0% 표시
    // (pair history는 유료 플랜 필요 — 무료 플랜은 현재 환율만 제공)
    const usdKrw: MacroItem = {
      label: "USD/KRW",
      value: fmt(krw, 1),
      change: "실시간",
      up: true,
    };

    // BDI, 두바이유, WTI는 Exchange Rate API 범위 외 → 더미 유지 + 라벨로 구분
    const fallback: MacroItem[] = [
      { label: "BDI (발틱지수)", value: "N/A", change: "준비중", up: false },
      { label: "두바이유 ($/bbl)", value: "N/A", change: "준비중", up: true },
      { label: "WTI ($/bbl)", value: "N/A", change: "준비중", up: true },
    ];

    const data: MacroItem[] = [usdKrw, ...fallback];
    cache = { data, fetchedAt: Date.now() };

    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/macro] fetch error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "환율 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
