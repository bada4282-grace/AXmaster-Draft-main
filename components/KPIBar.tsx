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

  // page.tsx가 year/month prop을 넘기지 않으므로 URL에서 직접 읽음
  const effectiveYear = searchParams.get("year") ?? year;
  const effectiveMonth = month || (searchParams.get("month") ?? "");

  const kpi = KPI[effectiveYear] ?? KPI[DEFAULT_YEAR];

  // 국가 상세 페이지 감지 (/country/{name}) → 해당 국가만 필터링
  const countryMatch = pathname.match(/^\/country\/([^?/]+)/);
  const currentCountry = countryMatch ? decodeURIComponent(countryMatch[1]) : undefined;

  const [mom, setMom] = useState<MomState | null>(null);

  useEffect(() => {
    if (!effectiveMonth) {
      setMom(null);
      return;
    }

    let cancelled = false;
    const { y: py, m: pm } = prevMonthInfo(effectiveYear, effectiveMonth);

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

      // 국가 상세: 국가 매칭이 안 되면 (데이터 없으면) 이전 상태 유지
      if (currentCountry && ceAmt === 0 && ciAmt === 0) return;

      const pct = (cur: number, prev: number) =>
        prev === 0 ? 0 : parseFloat(Math.abs(((cur - prev) / prev) * 100).toFixed(1));

      const ceBil = ceAmt / 1e8;
      const ciBil = ciAmt / 1e8;

      setMom({
        exportVal: fmtBillion(ceBil),
        exportChange: pct(ceAmt, peAmt),
        exportUp: ceAmt >= peAmt,
        importVal: fmtBillion(ciBil),
        importChange: pct(ciAmt, piAmt),
        importUp: ciAmt >= piAmt,
        balanceVal: fmtBillion(Math.abs(ceBil - ciBil)),
        balancePositive: ceBil >= ciBil,
      });
    }).catch(() => { /* 에러 시 이전 상태 유지 */ });

    return () => { cancelled = true; };
  }, [effectiveYear, effectiveMonth, currentCountry]);

  // 월 선택 시 → 월별 Supabase 데이터 우선, 미선택 시 → 커스텀 props 또는 연간 KPI
  const useMom = !!effectiveMonth && !!mom;

  const periodLabel = effectiveMonth ? "(전월 대비)" : "(전년 대비)";

  const ev = useMom ? mom!.exportVal    : (pEv ?? kpi.export.value);
  const ec = useMom ? mom!.exportChange : (pEc ?? kpi.export.change);
  const eu = useMom ? mom!.exportUp     : (pEu ?? kpi.export.up);
  const iv = useMom ? mom!.importVal    : (pIv ?? kpi.import.value);
  const ic = useMom ? mom!.importChange : (pIc ?? kpi.import.change);
  const iu = useMom ? mom!.importUp     : (pIu ?? kpi.import.up);
  const bv = useMom ? mom!.balanceVal   : (pBv ?? kpi.balance.value);
  const bp = useMom ? mom!.balancePositive : (pBp ?? kpi.balance.positive);

  // 상승: 빨간색, 하락: 파란색 (한국 금융 관례)
  const expColor  = eu ? "#E02020" : "#185FA5";
  const impColor  = iu ? "#E02020" : "#185FA5";

  const exportCard = (
    <div className="kpi-item">
      <div className="kpi-label">수출</div>
      <div className="kpi-value">$ {ev} 억</div>
      <div className={eu ? "kpi-change-up" : "kpi-change-down"} style={{ color: expColor }}>
        <span className="kpi-change-icon">{eu ? "▲" : "▼"}</span>
        <span>{ec}%</span>
        <span style={{ fontSize: 10, color: expColor, opacity: 0.55, marginLeft: 4, fontWeight: 400 }}>
          {periodLabel}
        </span>
      </div>
    </div>
  );

  const importCard = (
    <div className="kpi-item">
      <div className="kpi-label">수입</div>
      <div className="kpi-value">$ {iv} 억</div>
      <div className={iu ? "kpi-change-up" : "kpi-change-down"} style={{ color: impColor }}>
        <span className="kpi-change-icon">{iu ? "▲" : "▼"}</span>
        <span>{ic}%</span>
        <span style={{ fontSize: 10, color: impColor, opacity: 0.55, marginLeft: 4, fontWeight: 400 }}>
          {periodLabel}
        </span>
      </div>
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
