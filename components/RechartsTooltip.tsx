"use client";

import type { TooltipPayload } from "recharts";

export interface RechartsPayloadTooltipProps {
  active?: boolean;
  payload?: TooltipPayload;
  label?: unknown;
  /** 볼드 제목: 국가명(또는 국가 축이 없을 때 품목명 등) */
  title: string;
  /** 제목 아래 보조 줄(기간·축 라벨 등) */
  subtitle?: string;
  /** label 값이 이 Set에 포함되면 경고 메시지 표시 */
  incompleteLabels?: Set<string>;
  /** 불완전 연도별 월 범위 문자열 (예: { "2026": "1~2월" }) — 12개월 완전 시 해당 키 없음 */
  incompleteMonthRanges?: Record<string, string>;
}

/** 차트 공통: 흰 카드 + 하단 꼬리, 제목은 국가명 등 강조 */
export function RechartsPayloadTooltip({
  active,
  payload,
  label,
  title,
  subtitle,
  incompleteLabels,
  incompleteMonthRanges,
}: RechartsPayloadTooltipProps) {
  if (!active || !payload?.length) return null;

  const sub = subtitle ?? (label !== undefined && label !== null && String(label) !== "" ? String(label) : undefined);
  const labelStr = label !== undefined && label !== null ? String(label) : "";
  const isIncomplete = incompleteLabels && labelStr !== "" && incompleteLabels.has(labelStr);
  const monthRange = incompleteMonthRanges?.[labelStr];

  return (
    <div className="tooltip-shell">
      <p className="tooltip-shell-title">{title}</p>
      {sub && <p className="tooltip-shell-sub">{sub}</p>}
      {isIncomplete && monthRange && (
        <p style={{ margin: "4px 0", padding: "2px 6px", background: "#FEF3C7", color: "#92400E", fontSize: 12, fontWeight: 600, borderRadius: 3, textAlign: "center" }}>
          ⓘ 부분 데이터({monthRange})
        </p>
      )}
      {payload.map((p, i) => (
        <div key={`${String(p.name ?? "")}-${i}`} className="tooltip-shell-row">
          <span style={{ color: p.color ?? "#64748b" }}>{String(p.name ?? "")}</span>
          <span>{p.value as string | number}</span>
        </div>
      ))}
    </div>
  );
}

/** Recharts Tooltip에 넘길 스타일(기본 박스 제거 + 애니메이션 비활성화) */
export const rechartsTooltipSurfaceProps = {
  contentStyle: {
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    boxShadow: "none",
  } as const,
  wrapperStyle: { outline: "none", zIndex: 100 } as const,
  isAnimationActive: false,
};

/**
 * 표준 툴팁 위치 정책 — 커서 오른쪽 8px, 차트 경계에서 자동 flip.
 * 모든 차트(시계열/금액 추이/상위 국가)에 공통 적용.
 */
export const rechartsTooltipFollowProps = {
  ...rechartsTooltipSurfaceProps,
  offset: 8,
  allowEscapeViewBox: { x: false, y: false } as const,
};

interface TimeseriesPoint { month: string; export: number; import: number; balance: number }
interface TimeseriesRowSpec { key: "export" | "import" | "balance"; name: string; color: string }

/**
 * 시계열 차트용 툴팁 — $단위 + 전월 대비 증감(▲/▼/–) 동반 표기.
 * 색상은 KPIBar 관례(#E02020 상승 · #185FA5 하락)와 동일.
 */
export function TimeseriesTooltip({
  active,
  payload,
  label,
  title,
  allData,
  rows,
  prevYearLastMonth,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: unknown;
  title: string;
  allData: TimeseriesPoint[];
  rows: TimeseriesRowSpec[];
  /** 1월 데이터의 "전월" 대응 값 — 전년도 12월 시계열 포인트 (없으면 undefined) */
  prevYearLastMonth?: TimeseriesPoint | null;
}) {
  if (!active || !payload?.length) return null;
  const monthLabel = label !== undefined && label !== null ? String(label) : "";
  const current = payload[0]?.payload as TimeseriesPoint | undefined;
  if (!current) return null;
  const idx = allData.findIndex((d) => d.month === monthLabel);
  // 1월의 전월은 당해 데이터 배열 밖(=전년 12월). 전년 12월 데이터가 주어지면 사용.
  const prev = idx > 0
    ? allData[idx - 1]
    : (idx === 0 && prevYearLastMonth ? prevYearLastMonth : null);

  const fmtAmt = (v: number) => {
    const sign = v < 0 ? "-" : "";
    return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}억`;
  };

  const momNode = (cur: number, prevVal: number | undefined): React.ReactNode => {
    if (prevVal === undefined || prevVal === 0) return <span style={{ color: "#A5A39A", fontSize: 11 }}>–</span>;
    const diff = cur - prevVal;
    const pct = (diff / Math.abs(prevVal)) * 100;
    const abs = Math.abs(pct);
    const noChange = abs < 0.05;
    const up = diff >= 0;
    const color = noChange ? "#999" : up ? "#E02020" : "#185FA5";
    const arrow = noChange ? "–" : up ? "▲" : "▼";
    const sign = noChange ? "" : up ? "+" : "-";
    return (
      <span style={{ color, fontSize: 11, whiteSpace: "nowrap", fontWeight: 600 }}>
        {arrow} {sign}{abs.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="tooltip-shell">
      <p className="tooltip-shell-title">{title}</p>
      <p className="tooltip-shell-sub">
        {monthLabel}{" "}
        <span style={{ opacity: 0.7, fontSize: 10 }}>(전월 대비)</span>
      </p>
      {rows.map((r) => {
        const val = current[r.key];
        return (
          <div key={r.key} className="tooltip-shell-row">
            <span style={{ color: r.color }}>{r.name}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span>{fmtAmt(val)}</span>
              {momNode(val, prev?.[r.key])}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 품목 금액 추이(연간) 전용 툴팁 ────────────────────────────────────────
// 3가지 케이스 분기:
//  · 확정 연도 호버     → 수출액 + 전년 대비 ▲/▼ % (+절대값)
//  · 첫 지점 호버        → "- 데이터 없음" (전년 자체 없음)
//  · 진행 중 연도 호버  → "ⓘ YYYY년 1~N월 누적" + "전년 대비 - 비교 불가" + 하단 ⓘ 연말 확정 전 안내
function formatBillion(v: number): string {
  const rounded = Math.round(Math.abs(v) * 10) / 10;
  const withComma = rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sign = v < 0 ? "-" : "";
  return `${sign}$${withComma}억`;
}

interface ProductTrendPoint { year: string; value: number }

export function ProductTrendTooltip({
  active,
  payload,
  label,
  title,
  trend,
  tradeLabel,
  ongoingYear,
  ongoingMonthRange,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: unknown;
  title: string;
  trend: ProductTrendPoint[];
  tradeLabel: string; // "수출" | "수입"
  ongoingYear: string | null;
  ongoingMonthRange: string | null;
}) {
  if (!active || !payload?.length) return null;
  const hoveredYear = label != null ? String(label) : "";
  const current = trend.find((t) => t.year === hoveredYear);
  if (!current) return null;
  const prev = trend.find((t) => t.year === String(parseInt(hoveredYear, 10) - 1));
  const isOngoing = hoveredYear === ongoingYear;

  // 전년 대비 라인
  let yoyNode: React.ReactNode;
  if (isOngoing) {
    yoyNode = <span style={{ color: "#999" }}>- 비교 불가</span>;
  } else if (!prev || prev.value === 0) {
    yoyNode = <span style={{ color: "#999" }}>- 데이터 없음</span>;
  } else {
    const diff = current.value - prev.value;
    const pct = (diff / prev.value) * 100;
    const up = diff >= 0;
    const noChange = Math.abs(pct) < 0.05;
    const color = noChange ? "#999" : up ? "#E02020" : "#185FA5";
    const arrow = noChange ? "–" : up ? "▲" : "▼";
    const sign = noChange ? "" : up ? "+" : "-";
    yoyNode = (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {arrow} {sign}{Math.abs(pct).toFixed(1)}%
        </span>
        <span style={{ fontSize: 11 }}>
          ({sign}{formatBillion(Math.abs(diff))})
        </span>
      </span>
    );
  }

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 6 }}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#1f2937" }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      background: "#fff",
      border: "0.5px solid #e5e7eb",
      borderRadius: 8,
      padding: "12px 14px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      minWidth: 200,
      maxWidth: 240,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#1f2937" }}>{title}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{hoveredYear}년</div>
      {isOngoing && ongoingMonthRange && (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
          ⓘ {hoveredYear}년 {ongoingMonthRange} 누적
        </div>
      )}
      <div style={{ height: 0.5, background: "#e5e7eb", marginTop: 8 }} />
      <Row label={`${tradeLabel}액`} value={formatBillion(current.value)} />
      <Row label="전년 대비" value={yoyNode} />
      {isOngoing && (
        <>
          <div style={{ height: 0.5, background: "#e5e7eb", marginTop: 8 }} />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            ⓘ 연말 확정 전 부분 데이터
          </div>
        </>
      )}
    </div>
  );
}

interface BarPayloadRow {
  country?: string;
  value?: number;
}

/** 막대 차트: 행 데이터에 country가 있을 때 볼드 제목 = 국가명 (레거시 간단 버전) */
export function RechartsBarCountryTooltip({
  active,
  payload,
  tradeLabel = "수출",
}: {
  active?: boolean;
  payload?: TooltipPayload;
  tradeLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as BarPayloadRow | undefined;
  if (!row?.country) return null;
  return (
    <div className="tooltip-shell">
      <p className="tooltip-shell-title">{row.country}</p>
      <div className="tooltip-shell-row">
        <span>{tradeLabel}액</span>
        <span>${row.value}억</span>
      </div>
    </div>
  );
}

// ─── 상위 국가 차트 전용 툴팁 ───────────────────────────────────────────────
// 제공 정보: 국가명+연도, 수출액, 비중(전체 국가 합계 대비), 순위(N/전체), 전년 대비 %+절대값.
// 3-case 분기: 확정 연도 / 신규 진입국(전년 없음) / 진행 중 연도(비교 불가).
interface CountryValue { country: string; value: number }

export function TopCountriesTooltip({
  active,
  payload,
  year,
  tradeLabel,
  currentData,
  prevData,
  ongoingYear,
  ongoingMonthRange,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  year: string;
  tradeLabel: string; // "수출" | "수입"
  currentData: CountryValue[];
  prevData: CountryValue[];
  ongoingYear: string | null;
  ongoingMonthRange: string | null;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as BarPayloadRow | undefined;
  if (!row?.country) return null;
  const hovered = row.country;

  // 현재 연도 기준 비중·순위 계산 (분모 = 전체 국가 합계, 표시 막대 합계 아님)
  const curItem = currentData.find((c) => c.country === hovered);
  if (!curItem) return null;
  const total = currentData.reduce((s, c) => s + c.value, 0);
  const share = total > 0 ? (curItem.value / total) * 100 : 0;
  const sorted = [...currentData].sort((a, b) => b.value - a.value);
  const rankIdx = sorted.findIndex((c) => c.country === hovered);
  const rank = rankIdx >= 0 ? rankIdx + 1 : 0;
  const totalCountries = currentData.length;

  const isOngoing = year === ongoingYear;

  // 전년 대비 라인
  let yoyNode: React.ReactNode;
  if (isOngoing) {
    yoyNode = <span style={{ color: "#999" }}>- 비교 불가</span>;
  } else {
    const prev = prevData.find((c) => c.country === hovered);
    if (!prev || prev.value === 0) {
      yoyNode = <span style={{ color: "#999" }}>- 데이터 없음</span>;
    } else {
      const diff = curItem.value - prev.value;
      const pct = (diff / prev.value) * 100;
      const up = diff >= 0;
      const noChange = Math.abs(pct) < 0.05;
      const color = noChange ? "#999" : up ? "#E02020" : "#185FA5";
      const arrow = noChange ? "–" : up ? "▲" : "▼";
      const sign = noChange ? "" : up ? "+" : "-";
      yoyNode = (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {arrow} {sign}{Math.abs(pct).toFixed(1)}%
          </span>
          <span style={{ fontSize: 11 }}>
            ({sign}{formatBillion(Math.abs(diff))})
          </span>
        </span>
      );
    }
  }

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 6 }}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#1f2937" }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      background: "#fff",
      border: "0.5px solid #e5e7eb",
      borderRadius: 8,
      padding: "12px 14px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      minWidth: 200,
      maxWidth: 240,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#1f2937" }}>{hovered}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{year}년</div>
      {isOngoing && ongoingMonthRange && (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
          ⓘ {year}년 {ongoingMonthRange} 누적
        </div>
      )}
      <div style={{ height: 0.5, background: "#e5e7eb", marginTop: 8 }} />
      <Row label={`${tradeLabel}액`} value={formatBillion(curItem.value)} />
      <Row label="비중" value={`${share.toFixed(1)}%`} />
      <Row label="순위" value={rank > 0 ? `${rank}위 / ${totalCountries}` : "-"} />
      <div style={{ height: 0.5, background: "#e5e7eb", marginTop: 8 }} />
      <Row label="전년 대비" value={yoyNode} />
      {isOngoing && (
        <>
          <div style={{ height: 0.5, background: "#e5e7eb", marginTop: 8 }} />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            ⓘ 연말 확정 전 부분 데이터
          </div>
        </>
      )}
    </div>
  );
}
