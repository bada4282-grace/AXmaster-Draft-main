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
          ⚠ 데이터 불충분
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
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: unknown;
  title: string;
  allData: TimeseriesPoint[];
  rows: TimeseriesRowSpec[];
}) {
  if (!active || !payload?.length) return null;
  const monthLabel = label !== undefined && label !== null ? String(label) : "";
  const current = payload[0]?.payload as TimeseriesPoint | undefined;
  if (!current) return null;
  const idx = allData.findIndex((d) => d.month === monthLabel);
  const prev = idx > 0 ? allData[idx - 1] : null;

  const fmtAmt = (v: number) => {
    const sign = v < 0 ? "-" : "";
    return `${sign}$${Math.abs(v).toFixed(1)}억`;
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

interface BarPayloadRow {
  country?: string;
  value?: number;
}

/** 막대 차트: 행 데이터에 country가 있을 때 볼드 제목 = 국가명 */
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
