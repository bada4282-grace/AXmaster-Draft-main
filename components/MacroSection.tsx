"use client";
import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { MacroItem } from "@/app/api/macro/route";

const FALLBACK: MacroItem[] = [
  { label: "USD/KRW", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "한국 기준금리", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "EBSI", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "산업생산 증감률", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "중국 PMI", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "미국 기준금리", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "브렌트유", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
  { label: "SCFI", value: "—", change: "로딩중", up: true, trend: [], periodLabel: "" },
];

// 미니 차트 툴팁
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.[0]) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #e0e0e0", borderRadius: 4,
      padding: "3px 6px", fontSize: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    }}>
      <div style={{ color: "#666" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{payload[0].value}</div>
    </div>
  );
}

function MacroCard({ item }: { item: MacroItem }) {
  const [hover, setHover] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const loading = item.change === "로딩중";
  const hasTrend = item.trend && item.trend.length > 1;

  // X축 라벨: 첫/중간/끝 3개만 표시
  const tickIndices = hasTrend ? [
    0,
    Math.floor(item.trend.length / 2),
    item.trend.length - 1,
  ] : [];

  return (
    <div
      ref={cardRef}
      className="macro-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative" }}
    >
      <div className="macro-card-label">{item.label}</div>
      <div className="macro-card-value">{item.value}</div>
      {loading ? (
        <div className="macro-card-change" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: "#999" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: "dash-spin 0.8s linear infinite", flexShrink: 0 }}>
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="#999" strokeWidth="1.5"
              strokeDasharray="20 8" strokeLinecap="round" />
          </svg>
          <span>로딩중</span>
        </div>
      ) : (
        <div
          className="macro-card-change"
          style={{
            color: item.change === "—" || /^[-–—]?\s*0(\.0+)?%?$/.test(item.change)
              ? "#999"
              : item.change === "실시간" ? "#16a34a"
              : item.up ? "#E02020" : "#185FA5"
          }}
        >
          {item.change}
        </div>
      )}

      {/* 호버 툴팁 — 선 그래프 */}
      {hover && hasTrend && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: 280,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          padding: "10px 10px 6px",
          zIndex: 100,
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 2 }}>
            {item.label} 추이
          </div>
          <div style={{ fontSize: 9, color: "#999", marginBottom: 6 }}>
            {item.periodLabel}
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={item.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="ym"
                tick={{ fontSize: 8, fill: "#999" }}
                tickLine={false}
                axisLine={{ stroke: "#e0e0e0" }}
                ticks={tickIndices.map(i => item.trend[i]?.ym).filter(Boolean)}
              />
              <YAxis
                tick={{ fontSize: 8, fill: "#999" }}
                tickLine={false}
                axisLine={{ stroke: "#e0e0e0" }}
                width={36}
                domain={["auto", "auto"]}
                tickCount={6}
              />
              <Tooltip content={<MiniTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1A9088"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: "#1A9088" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function MacroSection() {
  const [data, setData] = useState<MacroItem[]>(FALLBACK);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((json: MacroItem[] | { error: string }) => {
        if (Array.isArray(json)) setData(json);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="macro-section">
      <div className="macro-title">거시경제 지표</div>
      <div className="macro-grid">
        {data.map((item) => (
          <MacroCard key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}
