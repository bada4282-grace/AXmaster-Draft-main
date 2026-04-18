"use client";
import { useEffect, useState } from "react";
import { getIncompleteMonthRange } from "@/lib/supabase";

/**
 * 주어진 연도가 부분 집계이면 "1~N월" 문자열을 반환, 완전 집계이거나 해당 없음이면 null.
 * UI 컴포넌트에서 "⚠ 부분 데이터(1~N월)" 배지 렌더링에 사용.
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
