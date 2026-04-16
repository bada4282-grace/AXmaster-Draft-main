"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Treemap, ResponsiveContainer } from "recharts";
import { getTreemapData, getCountryTreemapData, aggregateTreemapByDepth, MTI_COLORS, MTI_NAMES, ProductNode, DEFAULT_YEAR, type TradeType } from "@/lib/data";
import { getMonthlyTreemapData, getCountryMonthlyTreemapData } from "@/lib/supabase";
import { useRouter } from "next/navigation";

/** MTI 대분류별 SVG 아이콘 path */
const MTI_ICON_PATHS: Record<number, React.ReactNode> = {
  // 0 농림수산물 — 벼 이삭 (줄기 + 늘어진 낟알 + 잎)
  0: <><path d="M9 2c0 0-1 2-2 3.5S4.5 8 5 9s2 0.5 3-0.5S10 5.5 9 2z" /><path d="M8 6c0 0-2 1.5-3 3S3 13 3.5 13.5s2-0.5 2.5-2S10 8 8 6z" /><path d="M7 10.5c0 0-2 2-2.5 3.5S4 17.5 4.5 18s1.5-0.5 2-2S9 12.5 7 10.5z" /><path d="M9 2c1 3 2 8 3 12s2 6 3 8" /><path d="M15 13c2-3 5-4 6-3s-1 3-3 4-3 0.5-3-1z" /><path d="M14 17c1.5-2 4-3 5-2s-0.5 2.5-2 3-3 0-3-1z" /><path d="M15 21h-6" /></>,
  // 1 광산물 — 다이아몬드
  1: <><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20" /></>,
  // 2 화학공업제품 — 플라스크
  2: <><path d="M9 3h6v5l4 8a2 2 0 0 1-1.8 3H6.8A2 2 0 0 1 5 16l4-8V3" /><path d="M9 3h6" /></>,
  // 3 플라스틱·고무·가죽 — 육각형(분자)
  3: <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" />,
  // 4 섬유류 — 실타래
  4: <><circle cx="12" cy="12" r="7" /><path d="M5 12c0-3 3-5.5 7-5.5s7 2.5 7 5.5" /><path d="M5 12c0 3 3 5.5 7 5.5s7-2.5 7-5.5" /></>,
  // 5 생활용품 — 집
  5: <><path d="M3 10l9-7 9 7" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /></>,
  // 6 철강·금속 — 너트/볼트
  6: <><path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" /><circle cx="12" cy="12" r="3" /></>,
  // 7 기계·운송장비 — 기어
  7: <><circle cx="12" cy="12" r="3" /><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-4.2-6.8l-1.4 1.4M5.6 18.4l-1.4 1.4m0-15.6l1.4 1.4m12.8 12.8l1.4 1.4" /></>,
  // 8 전자·전기 — 번개
  8: <path d="M13 2L4 14h7l-2 8 10-12h-7z" fill="currentColor" />,
  // 9 잡제품 — 그리드
  9: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
};

// 금액을 적절한 단위로 포맷 (value는 억 단위 기준)
// 예: 986.3 → "$986.3억" / 0.00634 → "$63.4만" / 82 → "$82억"
function formatAmount(v: number): string {
  if (v >= 1) {
    const rounded = Math.floor(v * 10) / 10;
    return `$${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}억`;
  }
  const man = Math.floor(v * 10000 * 10) / 10; // 만 단위, 소수 1자리
  if (man >= 0.1) return `$${man}만`;
  return `$${Math.round(v * 1e8).toLocaleString()}`;
}

interface CustomContentProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; value?: number;
  data: ProductNode[];
  animKey?: number;
}

function CustomContent({ x = 0, y = 0, width = 0, height = 0, name, value = 0, data, animKey = 0 }: CustomContentProps) {
  if (width < 10 || height < 10) return null;
  if (!name || name === "root") return null;

  const item = data.find((d) => d.name === name);
  const color = item?.color ?? "#3B82F6";
  const fontSize = width > 120 ? 14 : width > 60 ? 11 : 9;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const pad = 4;

  return (
    <g
      style={{
        cursor: "pointer",
        transformOrigin: `${cx}px ${cy}px`,
        animation: `tcell-${animKey} 0.5s cubic-bezier(0.22, 1, 0.36, 1) both`,
      }}
    >
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={1} />
      {width > 36 && height > 22 && (
        <foreignObject x={x + pad} y={y} width={width - pad * 2} height={height}>
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              pointerEvents: "none",
              padding: `${pad}px 0`,
            }}
          >
            <span style={{
              color: "#fff",
              fontSize,
              fontWeight: 600,
              lineHeight: 1.2,
              textAlign: "center",
              wordBreak: "break-all",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: height > 50 ? 3 : 2,
              WebkitBoxOrient: "vertical",
            }}>
              {name}
            </span>
            {height > 38 && (
              <span style={{
                color: "rgba(255,255,255,0.85)",
                fontSize: Math.max(fontSize - 2, 8),
                marginTop: 2,
                whiteSpace: "nowrap",
              }}>
                {formatAmount(value)}
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

interface TooltipState {
  x: number;
  y: number;
  item: ProductNode;
}

interface TreemapChartProps {
  forCountry?: boolean;
  countryName?: string;
  year?: string;
  month?: string;
  tradeType?: TradeType;
  mtiDepth?: number;
  onLoadingChange?: (loading: boolean) => void;
  onCategoryChange?: (mti: number | null) => void;
}

export default function TreemapChart({
  forCountry = false,
  countryName,
  year = DEFAULT_YEAR,
  month = "",
  tradeType = "수출",
  mtiDepth = 3,
  onLoadingChange,
  onCategoryChange,
}: TreemapChartProps) {
  const router = useRouter();

  const annualData = forCountry && countryName
    ? getCountryTreemapData(year, countryName, tradeType)
    : getTreemapData(year, tradeType);

  const [treemapData, setTreemapData] = useState<ProductNode[]>(annualData);
  const [noData, setNoData] = useState(false);
  const [zoomedMti, setZoomedMti] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [animating, setAnimating] = useState(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const startTreemapAnimation = () => {
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
    }
    setAnimKey((k) => k + 1);
    setAnimating(true);
    animTimeoutRef.current = setTimeout(() => {
      setAnimating(false);
    }, 520);
  };

  useEffect(() => {
    if (!month) {
      setNoData(false);
      setTreemapData(annualData);
      startTreemapAnimation();
      return;
    }
    onLoadingChange?.(true);
    const fetch = forCountry && countryName
      ? getCountryMonthlyTreemapData(year, month, countryName, tradeType)
      : getMonthlyTreemapData(year, month, tradeType);

    fetch
      .then((data) => {
        if (data.length === 0) {
          setNoData(true);
          setTreemapData([]);
        } else {
          setNoData(false);
          setTreemapData(data);
        }
      })
      .catch(() => {
        setNoData(false);
        setTreemapData(annualData);
      })
      .finally(() => { startTreemapAnimation(); onLoadingChange?.(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tradeType, countryName, forCountry]);

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) {
        clearTimeout(animTimeoutRef.current);
      }
    };
  }, []);

  const aggregatedData = aggregateTreemapByDepth(treemapData, mtiDepth);
  // 카테고리 버튼 클릭 시: 전체 데이터에서 해당 카테고리 Top 30 표시
  // 단위 셀렉터 변경 시: Top 100 기반 집계 데이터 표시
  const displayData = zoomedMti !== null
    ? treemapData
        .filter((d) => d.mti === zoomedMti)
        .sort((a, b) => b.value - a.value)
        .slice(0, 30)
    : aggregatedData;

  const onTreemapMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    const g = target.closest?.("g");
    const rect = g?.querySelector?.("rect");
    if (!rect) { setTooltip(null); return; }
    const fill = rect.getAttribute("fill");
    if (!fill || fill === "#fff" || fill === "transparent") { setTooltip(null); return; }
    const fo = g?.querySelector?.("foreignObject");
    const nameSpan = fo?.querySelector?.("span");
    const cellName = nameSpan?.textContent;
    if (!cellName) { setTooltip(null); return; }
    const item = displayData.find((d) => d.name === cellName);
    if (!item) { setTooltip(null); return; }
    setTooltip({ x: e.clientX, y: e.clientY, item });
  }, [displayData]);

  const onTreemapMouseLeave = useCallback(() => { setTooltip(null); }, []);

  const chartData = [{
    name: "root",
    children: displayData.filter((d) => d.value > 0).map((d) => ({ name: d.name, size: d.value })),
  }];

  const handleClick = (data: { name?: string } | null) => {
    if (!data?.name) return;
    const item = displayData.find((d) => d.name === data.name);
    if (!item) return;
    const params = new URLSearchParams({ code: item.code });
    router.push(`/product/${encodeURIComponent(item.name)}?${params.toString()}`);
  };

  return (
    <div className="w-full h-full flex flex-col relative" onMouseLeave={onTreemapMouseLeave}>
      <style>{`
        @keyframes tcell-${animKey} {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        .mti-icon-btn {
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 6px;
          border: 2px solid transparent;
          background: #f1f5f9;
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
        }
        .mti-icon-btn:hover {
          background: var(--mti-color);
          transform: translateY(-1px);
          border-color: var(--mti-color);
        }
        .mti-icon-btn:hover svg {
          stroke: #fff;
        }
        .mti-icon-btn:hover span {
          color: #fff !important;
        }
        .mti-icon-btn--active {
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }
        .mti-icon-btn--active svg {
          stroke: #fff;
        }
        .mti-icon-btn[data-tooltip] {
          position: relative;
        }
        .mti-icon-btn[data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          padding: 4px 8px;
          background: #1e293b;
          color: #fff;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.3;
          white-space: nowrap;
          border-radius: 4px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .mti-icon-btn[data-tooltip]:hover::after {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }
      `}</style>

      <div className="flex-1 min-h-0">
        {noData || displayData.filter((d) => d.value > 0).length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "#94a3b8", fontSize: 13,
            border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc",
          }}>
            데이터가 없습니다.
          </div>
        ) : (
          <div onMouseMove={onTreemapMouseMove} onMouseLeave={onTreemapMouseLeave} style={{ width: "100%", height: "100%" }}>
            <ResponsiveContainer width="100%" height="100%" style={{ cursor: "pointer" }}>
              <Treemap
                data={chartData}
                dataKey="size"
                aspectRatio={4 / 3}
                isAnimationActive={false}
                onClick={handleClick}
                content={<CustomContent data={displayData} animKey={animating ? animKey : -1} />}
              />
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* MTI 대분류 아이콘 필터 */}
      <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
        {Object.entries(MTI_COLORS).map(([mti, color]) => {
          const n = Number(mti);
          const isActive = zoomedMti === n;
          return (
            <button
              key={mti}
              data-tooltip={MTI_NAMES[n]}
              onClick={() => { const next = isActive ? null : n; setZoomedMti(next); onCategoryChange?.(next); startTreemapAnimation(); }}
              className={`mti-icon-btn${isActive ? " mti-icon-btn--active" : ""}`}
              style={{
                "--mti-color": color as string,
                background: isActive ? (color as string) : undefined,
                borderColor: isActive ? (color as string) : "transparent",
              } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={isActive ? "#fff" : (color as string)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {MTI_ICON_PATHS[n]}
              </svg>
            </button>
          );
        })}
        <button
          data-tooltip="전체 보기"
          onClick={() => { setZoomedMti(null); onCategoryChange?.(null); startTreemapAnimation(); }}
          className={`mti-icon-btn${zoomedMti === null ? " mti-icon-btn--active" : ""}`}
          style={{
            "--mti-color": "#475569",
            background: zoomedMti === null ? "#475569" : undefined,
            borderColor: zoomedMti === null ? "#475569" : "transparent",
          } as React.CSSProperties}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: zoomedMti === null ? "#fff" : "#64748b", lineHeight: 1 }}>ALL</span>
        </button>
      </div>

      {/* 마우스 추적 툴팁 */}
      {tooltip && typeof document !== "undefined" && createPortal(
        <div
          className="tooltip-shell tooltip-shell--fixed"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          <p className="tooltip-shell-title">{tooltip.item.name}</p>
          <p className="tooltip-shell-line">
            {tradeType === "수입" ? "수입액" : "수출액"}:{" "}
            <strong>{formatAmount(tooltip.item.value)}</strong>
          </p>
          {tooltip.item.topCountries && tooltip.item.topCountries.length > 0 && (
            <>
              <p className="tooltip-shell-line" style={{ marginTop: 8, fontWeight: 600, color: "#64748b" }}>
                {tradeType === "수입" ? "상위 수입국" : "상위 수출국"}:
              </p>
              <ul className="tooltip-shell-list">
                {tooltip.item.topCountries.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </>
          )}
          {!forCountry && (
            <p className="tooltip-shell-hint">클릭 → 상세페이지</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
