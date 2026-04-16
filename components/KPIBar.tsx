"use client";
import { useState, useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { KPI_BY_YEAR, DEFAULT_YEAR } from "@/lib/data";
import { getMonthlyCountryMapData, type MonthlyCountryMapItem } from "@/lib/supabase";

type KpiEntry = {
  export: { value: string; change: number; up: boolean };
  import: { value: string; change: number; up: boolean };
  balance: { value: string; positive: boolean };
};
const KPI: Record<string, KpiEntry> = KPI_BY_YEAR as unknown as Record<string, KpiEntry>;

interface KPIBarProps {
  year?: string;
  month?: string;
  tradeType?: "수출" | "수입";
  /** 국가/품목 상세 페이지에서 직접 값 주입 시 */
  exportVal?: string;
  exportChange?: number;
  exportUp?: boolean;
  importVal?: string;
  importChange?: number;
  importUp?: boolean;
  balance?: string;
  balancePositive?: boolean;
}

interface MomState {
  exportVal: string;
  exportChange: number;
  exportUp: boolean;
  importVal: string;
  importChange: number;
  importUp: boolean;
  balanceVal: string;
  balancePositive: boolean;
}

/** 전년 동기: 같은 월의 전년도 */
function sameMonthPrevYear(year: string, month: string): { y: string; m: string } {
  return { y: String(parseInt(year, 10) - 1), m: month };
}

/** 전월 */
function prevMonthInfo(year: string, month: string): { y: string; m: string } {
  const m = parseInt(month, 10);
  if (m === 1) return { y: String(parseInt(year, 10) - 1), m: "12" };
  return { y: year, m: String(m - 1).padStart(2, "0") };
}

function sumAmt(items: MonthlyCountryMapItem[], countryName?: string) {
  if (countryName) {
    return items
      .filter((i) => i.ctr_name === countryName)
      .reduce((s, i) => s + i.total_amt, 0);
  }
  return items.reduce((s, i) => s + i.total_amt, 0);
}

function fmtBillion(v: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function pctChange(cur: number, prev: number): number {
  if (!prev) return 0;
  return parseFloat(Math.abs(((cur - prev) / prev) * 100).toFixed(1));
}

function buildMomState(
  ceAmt: number, peAmt: number, ciAmt: number, piAmt: number,
): MomState {
  const ceBil = ceAmt / 1e8;
  const ciBil = ciAmt / 1e8;
  return {
    exportVal: fmtBillion(ceBil),
    exportChange: pctChange(ceAmt, peAmt),
    exportUp: ceAmt >= peAmt,
    importVal: fmtBillion(ciBil),
    importChange: pctChange(ciAmt, piAmt),
    importUp: ciAmt >= piAmt,
    balanceVal: fmtBillion(Math.abs(ceBil - ciBil)),
    balancePositive: ceBil >= ciBil,
  };
}

export default function KPIBar({
  year = DEFAULT_YEAR,
  month = "",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tradeType = "수출",
  exportVal: pEv,
  exportChange: pEc,
  exportUp: pEu,
  importVal: pIv,
  importChange: pIc,
  importUp: pIu,
  balance: pBv,
  balancePositive: pBp,
}: KPIBarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const effectiveYear = year;
  const effectiveMonth = month || (searchParams.get("month") ?? "");

  const kpi = KPI[effectiveYear] ?? KPI[DEFAULT_YEAR];
  const prevYearKpi = KPI[String(parseInt(effectiveYear, 10) - 1)];

  // 국가 상세 페이지 감지 (/country/{name}) → 해당 국가만 필터링
  const countryMatch = pathname.match(/^\/country\/([^?/]+)/);
  const currentCountry = countryMatch ? decodeURIComponent(countryMatch[1]) : undefined;

  // 불완전 연도 판별: 현재 연도 이상이면 불완전
  const currentYear = new Date().getFullYear();
  const isIncompleteYear = parseInt(year, 10) >= currentYear;
  const hasCustom = pEv !== undefined;

  // 전년도가 없는 경우 (2020 등) — 증감율 표시 불가
  const noPrevYear = !prevYearKpi;

  // ─── 월 선택 시: 전년 동기 대비 (커스텀 값 주입 여부와 무관하게 항상 동작) ───
  const [mom, setMom] = useState<MomState | null>(null);
  useEffect(() => {
    if (!effectiveMonth) {
      setMom(null);
      return;
    }

    let cancelled = false;
    // 전년 동기 (같은 월, 전년도)
    const { y: py, m: pm } = sameMonthPrevYear(effectiveYear, effectiveMonth);

    Promise.all([
      getMonthlyCountryMapData(effectiveYear, effectiveMonth, "수출"),
      getMonthlyCountryMapData(py, pm, "수출"),
      getMonthlyCountryMapData(effectiveYear, effectiveMonth, "수입"),
      getMonthlyCountryMapData(py, pm, "수입"),
    ]).then(([ce, pe, ci, pi]) => {
      if (cancelled) return;

      const ceAmt = sumAmt(ce, currentCountry);
      const peAmt = sumAmt(pe, currentCountry);
      const ciAmt = sumAmt(ci, currentCountry);
      const piAmt = sumAmt(pi, currentCountry);

      // 국가 상세: 현재 월 데이터가 없으면 이전 상태 유지
      if (currentCountry && ceAmt === 0 && ciAmt === 0) return;

      setMom(buildMomState(ceAmt, peAmt, ciAmt, piAmt));
    }).catch(() => { /* 에러 시 이전 상태 유지 */ });

    return () => { cancelled = true; };
  }, [effectiveYear, effectiveMonth, currentCountry]);

  // ─── 불완전 연도 + 월 미선택: 최신 월 자동 탐지 → 전월 대비 ───
  const [incMom, setIncMom] = useState<MomState | null>(null);
  const [incMonthLabel, setIncMonthLabel] = useState("");

  useEffect(() => {
    let mounted = true;
    if (effectiveMonth || hasCustom || !isIncompleteYear) {
      setIncMom(null);
      return () => { mounted = false; };
    }

    const findLastMonth = async () => {
      for (let m = 12; m >= 1; m--) {
        const mm = String(m).padStart(2, "0");
        const expData = await getMonthlyCountryMapData(year, mm, "수출");
        if (expData.length > 0) return mm;
      }
      return null;
    };

    findLastMonth().then(async (lastMonth) => {
      if (!mounted || !lastMonth) return;
      const { y: py, m: pm } = prevMonthInfo(year, lastMonth);

      const [ce, pe, ci, pi] = await Promise.all([
        getMonthlyCountryMapData(year, lastMonth, "수출"),
        getMonthlyCountryMapData(py, pm, "수출"),
        getMonthlyCountryMapData(year, lastMonth, "수입"),
        getMonthlyCountryMapData(py, pm, "수입"),
      ]);
      if (!mounted) return;

      const ceAmt = sumAmt(ce, currentCountry);
      const peAmt = sumAmt(pe, currentCountry);
      const ciAmt = sumAmt(ci, currentCountry);
      const piAmt = sumAmt(pi, currentCountry);

      setIncMonthLabel(`${parseInt(lastMonth, 10)}월`);
      setIncMom(buildMomState(ceAmt, peAmt, ciAmt, piAmt));
    }).catch(() => {
      if (mounted) setIncMom(null);
    });

    return () => { mounted = false; };
  }, [year, effectiveMonth, hasCustom, isIncompleteYear, currentCountry]);

  // ─── 값 결정 ───
  // 월 선택 시: Supabase 월별 데이터 (전년 동기 대비) 우선
  const useMom = !!effectiveMonth && !!mom;
  const useIncMom = !effectiveMonth && !hasCustom && isIncompleteYear && !!incMom;

  const periodLabel = effectiveMonth
    ? "(전년 동기 대비)"
    : useIncMom
      ? `(전월 대비 · ${incMonthLabel})`
      : "(전년 대비)";

  // 월 선택 시 Supabase 데이터가 커스텀 값보다 우선 (월별 KPI + 증감률 정확성)
  const ev = useMom ? mom!.exportVal : (pEv ?? (useIncMom ? incMom!.exportVal : kpi.export.value));
  const ec = useMom ? mom!.exportChange : (pEc ?? (useIncMom ? incMom!.exportChange : kpi.export.change));
  const eu = useMom ? mom!.exportUp : (pEu ?? (useIncMom ? incMom!.exportUp : kpi.export.up));
  const iv = useMom ? mom!.importVal : (pIv ?? (useIncMom ? incMom!.importVal : kpi.import.value));
  const ic = useMom ? mom!.importChange : (pIc ?? (useIncMom ? incMom!.importChange : kpi.import.change));
  const iu = useMom ? mom!.importUp : (pIu ?? (useIncMom ? incMom!.importUp : kpi.import.up));
  const bv = useMom ? mom!.balanceVal : (pBv ?? (useIncMom ? incMom!.balanceVal : kpi.balance.value));
  const bp = useMom ? mom!.balancePositive : (pBp ?? (useIncMom ? incMom!.balancePositive : kpi.balance.positive));

  // 증감율 숨김 조건:
  // 1. 불완전 연도 + 월 미선택 + 자동탐지 미완료
  // 2. 변화율 0% (전년도 데이터 없거나 변화 미미)
  const hideExportChange = (!effectiveMonth && isIncompleteYear && !incMom && !hasCustom)
    || (!useMom && !useIncMom && ec === 0);
  const hideImportChange = (!effectiveMonth && isIncompleteYear && !incMom && !hasCustom)
    || (!useMom && !useIncMom && ic === 0);

  // 상승: 빨간색, 하락: 파란색 (한국 금융 관례)
  const expColor = eu ? "#E02020" : "#185FA5";
  const impColor = iu ? "#E02020" : "#185FA5";

  const exportCard = (
    <div className="kpi-item">
      <div className="kpi-label">수출</div>
      <div className="kpi-value">$ {ev} 억</div>
      {hideExportChange ? (
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
          - <span style={{ fontSize: 10, opacity: 0.55 }}>
            {isIncompleteYear && !effectiveMonth ? "(전월 대비)" : periodLabel}
          </span>
        </div>
      ) : (
        <div className={eu ? "kpi-change-up" : "kpi-change-down"} style={{ color: expColor }}>
          <span className="kpi-change-icon">{eu ? "▲" : "▼"}</span>
          <span>{ec}%</span>
          <span style={{ fontSize: 10, color: expColor, opacity: 0.55, marginLeft: 4, fontWeight: 400 }}>
            {periodLabel}
          </span>
        </div>
      )}
    </div>
  );

  const importCard = (
    <div className="kpi-item">
      <div className="kpi-label">수입</div>
      <div className="kpi-value">$ {iv} 억</div>
      {hideImportChange ? (
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
          - <span style={{ fontSize: 10, opacity: 0.55 }}>
            {isIncompleteYear && !effectiveMonth ? "(전월 대비)" : periodLabel}
          </span>
        </div>
      ) : (
        <div className={iu ? "kpi-change-up" : "kpi-change-down"} style={{ color: impColor }}>
          <span className="kpi-change-icon">{iu ? "▲" : "▼"}</span>
          <span>{ic}%</span>
          <span style={{ fontSize: 10, color: impColor, opacity: 0.55, marginLeft: 4, fontWeight: 400 }}>
            {periodLabel}
          </span>
        </div>
      )}
    </div>
  );

  const balanceCard = (
    <div className="kpi-item">
      <div className="kpi-label">무역수지</div>
      <div className="kpi-value" style={{ color: bp ? "#E02020" : "#185FA5" }}>
        {bp ? "+" : "-"}$ {bv} 억
      </div>
    </div>
  );

  return (
    <div className="kpi-bar">
      {exportCard}
      {importCard}
      {balanceCard}
    </div>
  );
}
