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
}

/** 차트 공통: 흰 카드 + 하단 꼬리, 제목은 국가명 등 강조 */
export function RechartsPayloadTooltip({
  active,
  payload,
  label,
  title,
  subtitle,
}: RechartsPayloadTooltipProps) {
  if (!active || !payload?.length) return null;

  const sub = subtitle ?? (label !== undefined && label !== null && String(label) !== "" ? String(label) : undefined);

  return (
    <div className="tooltip-shell">
      <p className="tooltip-shell-title">{title}</p>
      {sub && <p className="tooltip-shell-sub">{sub}</p>}
      {payload.map((p, i) => (
        <div key={`${String(p.name ?? "")}-${i}`} className="tooltip-shell-row">
          <span style={{ color: p.color ?? "#64748b" }}>{String(p.name ?? "")}</span>
          <span>{p.value as string | number}</span>
        </div>
      ))}
    </div>
  );
}

/** Recharts Tooltip에 넘길 스타일(기본 박스 제거) */
export const rechartsTooltipSurfaceProps = {
  contentStyle: {
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    boxShadow: "none",
  } as const,
  wrapperStyle: { outline: "none", zIndex: 100 } as const,
};

interface BarPayloadRow {
  country?: string;
  value?: number;
}

/** 막대 차트: 행 데이터에 country가 있을 때 볼드 제목 = 국가명 */
export function RechartsBarCountryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as BarPayloadRow | undefined;
  if (!row?.country) return null;
  return (
    <div className="tooltip-shell">
      <p className="tooltip-shell-title">{row.country}</p>
      <div className="tooltip-shell-row">
        <span>수출액</span>
        <span>${row.value}B</span>
      </div>
    </div>
  );
}
