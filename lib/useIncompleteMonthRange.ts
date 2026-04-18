"use client";
import { useEffect, useState } from "react";
import { getIncompleteMonthRange, getLatestYYMM } from "@/lib/supabase";

/**
 * 주어진 연도가 부분 집계이면 "1~N월" 문자열을 반환, 완전 집계이거나 해당 없음이면 null.
 * UI 컴포넌트에서 "ⓘ 부분 데이터(1~N월)" 배지 렌더링에 사용.
 */
export function useIncompleteMonthRange(year: string | undefined): string | null {
  const [range, setRange] = useState<string | null>(null);
  useEffect(() => {
    if (!year) { setRange(null); return; }
    let cancelled = false;
    getIncompleteMonthRange(year)
      .then((r) => { if (!cancelled) setRange(r); })
      .catch(() => { if (!cancelled) setRange(null); });
    return () => { cancelled = true; };
  }, [year]);
  return range;
}

/**
 * Supabase의 최신 YYMM을 기반으로 현재 진행 중인 연도 정보를 반환.
 * - year: "2026"
 * - monthRange: "1~N월" (N은 최신 YYMM의 월, 12월이면 완전 집계로 간주해 null 반환)
 * 완전 집계이거나 조회 실패면 null.
 */
export function useOngoingYearInfo(): { year: string; monthRange: string } | null {
  const [info, setInfo] = useState<{ year: string; monthRange: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getLatestYYMM()
      .then((latest) => {
        if (cancelled || !latest) return;
        const y = latest.slice(0, 4);
        const m = parseInt(latest.slice(4, 6), 10);
        if (!m || m >= 12) { setInfo(null); return; }
        setInfo({ year: y, monthRange: m === 1 ? "1월" : `1~${m}월` });
      })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, []);
  return info;
}
