import { KPI_BY_YEAR, DEFAULT_YEAR } from "@/lib/data";

type KpiEntry = { export: { value: string; change: number; up: boolean }; import: { value: string; change: number; up: boolean }; balance: { value: string; positive: boolean } };
const KPI: Record<string, KpiEntry> = KPI_BY_YEAR as unknown as Record<string, KpiEntry>;

interface KPIBarProps {
  year?: string;
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

export default function KPIBar({
  year,
  tradeType = "수출",
  exportVal,
  exportChange,
  exportUp,
  importVal,
  importChange,
  importUp,
  balance,
  balancePositive,
}: KPIBarProps) {
  const kpi = KPI[year ?? DEFAULT_YEAR] ?? KPI[DEFAULT_YEAR];

  const ev = exportVal ?? kpi.export.value;
  const ec = exportChange ?? kpi.export.change;
  const eu = exportUp ?? kpi.export.up;
  const iv = importVal ?? kpi.import.value;
  const ic = importChange ?? kpi.import.change;
  const iu = importUp ?? kpi.import.up;
  const bv = balance ?? kpi.balance.value;
  const bp = balancePositive ?? kpi.balance.positive;

  const exportCard = (
    <div className="kpi-item">
      <div className="kpi-label">수출</div>
      <div className="kpi-value">$ {ev} 억</div>
      <div className={eu ? "kpi-change-up" : "kpi-change-down"}>
        <span className="kpi-change-icon">{eu ? "▲" : "▼"}</span>
        <span>{ec}%</span>
      </div>
    </div>
  );

  const importCard = (
    <div className="kpi-item">
      <div className="kpi-label">수입</div>
      <div className="kpi-value">$ {iv} 억</div>
      <div className={iu ? "kpi-change-up" : "kpi-change-down"}>
        <span className="kpi-change-icon">{iu ? "▲" : "▼"}</span>
        <span>{ic}%</span>
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
      {tradeType === "수입" ? importCard : exportCard}
      {tradeType === "수입" ? exportCard : importCard}
      {balanceCard}
    </div>
  );
}
